#!/usr/bin/env node
/**
 * diag-peso-cambio.mjs — ¿quién debería hacer este cambio, Claude o Cline?
 *
 * QUÉ MIDE: el PESO de un cambio en cuatro dimensiones, y devuelve una
 *           asignación con su motivo.
 * QUÉ ESCRIBE: nada. Solo lee el repo y git. No toca la base.
 * CÓMO SE EJECUTA:
 *   node scripts/diag-peso-cambio.mjs <rutas...>        (cambio propuesto)
 *   node scripts/diag-peso-cambio.mjs --ref=<sha>       (un commit ya hecho)
 *   node scripts/diag-peso-cambio.mjs --calibrar        (contra los 8 casos reales)
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El reparto «Claude diagnostica, Cline implementa» se rompió en la práctica —64
 * commits contra 3— porque había que decidirlo caso por caso, y decidiéndolo
 * caso por caso siempre gana el atajo. Esto lo convierte en una cuenta.
 *
 * ── Lo que la calibración DESCARTÓ, y es lo interesante ────────────────────
 * El tamaño NO discrimina. Cline entregó commits de 60 archivos y 7 845 líneas
 * sin romper nada; varios de los míos tenían 3. Contar archivos o líneas habría
 * dado la respuesta contraria a la correcta.
 *
 * Y el fallo de producción del 2026-09-20 —reexportar tipos desde un
 * `"use server"`, que dejó TODAS las actions de /oceano en 500— tenía 13
 * archivos, cero esquema y cero permisos. Ninguna métrica de volumen lo
 * predecía. Lo predecía que el patrón NO TENÍA PRECEDENTE en el repo, y de ahí
 * sale la cuarta dimensión.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};

const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

/* ── Las cuatro dimensiones ─────────────────────────────────────────────── */

/**
 * D1 · ESQUEMA — el cambio altera la forma de los datos.
 *
 * Es la más pesada porque no hay staging: lo que se toca, se toca en real, y un
 * `.sql` mal pensado no se deshace con un revert.
 */
function esquema(rutas) {
  const hits = rutas.filter((r) => /^supabase\/.*\.sql$/.test(r) || /lib\/escolar\/tables\.ts$/.test(r));
  return { peso: hits.length ? 3 : 0, hits };
}

/**
 * D2 · IDENTIDAD Y AUTORIZACIÓN — quién es quién, y quién puede qué.
 *
 * Aquí el sistema YA se rompió dos veces: 15 de 21 profesores comparten CLAVE, y
 * dos actions devolvían la tabla de calificaciones a alumnos y tutores. Un error
 * en esta capa es un bug de seguridad sin red debajo, porque RLS no autoriza.
 */
function identidad(rutas) {
  // Calibrar destapó que esta medida era demasiado estrecha: solo miraba
  // `lib/auth/`, y el PROMPT B4 movió TRES PREDICADOS DE PERMISO —puedeVer,
  // puedeSubir, puedeEliminar— a `lib/escolar/documentos-permisos-puro.ts`.
  // Decidir quién ve un botón es autorización, viva donde viva el archivo.
  const AUTORIZACION = /^lib\/auth\/|MATRIZ-PERMISOS|permisos|capacidades|exigir|-acceso/i;
  const hits = rutas.filter((r) => AUTORIZACION.test(r));
  return { peso: hits.length ? 3 : 0, hits };
}

/**
 * D3 · DETECTABILIDAD — ¿hay algo que cace el error?
 *
 * Un cambio sobre código cubierto por suite pesa menos: si se equivoca, se sabe
 * al minuto. Uno sobre código sin cobertura pesa más, porque el error viaja.
 *
 * Se mide al revés: peso ALTO cuando NO hay cobertura.
 */
function detectabilidad(rutas) {
  const suites = fs.readdirSync(path.join(root, "scripts")).filter((f) => /^test-.+\.mjs$/.test(f));
  const textos = suites.map((s) => fs.readFileSync(path.join(root, "scripts", s), "utf8"));
  const codigo = rutas.filter((r) => /^(app|lib)\/.*\.tsx?$/.test(r));
  if (codigo.length === 0) return { peso: 0, hits: [], sinCobertura: [] };
  const sinCobertura = codigo.filter((r) => {
    const base = path.basename(r).replace(/\.tsx?$/, "");
    const carpeta = r.replace(/\.tsx?$/, "").split("/").slice(-2).join("/");
    return !textos.some((t) => t.includes(r) || t.includes(`${carpeta}.js`) || t.includes(`${base}.js`));
  });
  const ratio = sinCobertura.length / codigo.length;
  return { peso: ratio > 0.8 ? 2 : ratio > 0.4 ? 1 : 0, hits: [], sinCobertura };
}

/**
 * D4 · NOVEDAD — ¿existe ya un patrón en el repo que haga esto?
 *
 * La dimensión que la calibración destapó. Un cambio que copia un patrón
 * existente es barato aunque toque cien archivos; uno que INVENTA un patrón es
 * caro aunque toque tres, porque nadie ha pagado todavía el coste de
 * descubrir cómo falla.
 *
 * Se aproxima así: un archivo NUEVO cuyo nombre no encaja en ninguna familia
 * conocida, o una carpeta que no existía, es novedad. No es perfecto y no
 * pretende serlo — es una señal para que alguien mire, no un veredicto.
 */
function novedad(rutas, borrados = new Set()) {
  // Calibrar destapó el error: «la ruta no existe» se estaba leyendo como
  // «archivo nuevo», y un archivo BORRADO tampoco existe. El PROMPT F retiró 11
  // archivos y la escala lo puntuó como si hubiera inventado once patrones.
  // Retirar no es inventar: es lo contrario.
  const nuevos = rutas.filter((r) => !fs.existsSync(path.join(root, r)) && !borrados.has(r));
  // `_archivo/` y `_borrador/` son cuarentena y archivo por convención de
  // ORDEN.md §4: crear una carpeta ahí es GUARDAR algo, no abrir un dominio.
  // El PROMPT F creó `scripts/_archivo/borrador/` para archivar, y la escala lo
  // leía como si hubiera inventado un patrón.
  const carpetasNuevas = [
    ...new Set(
      rutas
        .map((r) => path.dirname(r))
        .filter((dir) => !/_archivo|_borrador/.test(dir))
        .filter((dir) => !fs.existsSync(path.join(root, dir))),
    ),
  ];
  // Sufijos y carpetas con precedente: si el cambio encaja en uno, hay patrón
  // que copiar y la novedad baja.
  const CON_PRECEDENTE = /-puro\.ts$|-panel\.tsx$|-admin\.tsx$|^scripts\/test-|^scripts\/diag-|^app\/actions\/|^lib\/escolar\/[a-z]+\//;
  const sinPrecedente = nuevos.filter((r) => !CON_PRECEDENTE.test(r));
  const peso = carpetasNuevas.length ? 3 : sinPrecedente.length ? 2 : nuevos.length ? 1 : 0;
  return { peso, hits: sinPrecedente, carpetasNuevas };
}

/**
 * D5 · GOBIERNO — el cambio define una regla que gobernará al resto.
 *
 * La quinta dimensión también salió de calibrar: `test-orden.mjs` —el primer
 * guardián mecánico— puntuaba 2 y debía ser alto. Escribir la regla que decidirá
 * qué se acepta en el futuro no es implementación: es constitución. Bajar un
 * umbral pesa igual, porque apaga un guardián.
 */
function gobierno(rutas) {
  // Crear un guardián pesa más que actualizarlo: lo primero es escribir la regla
  // que juzgará al resto, lo segundo es contabilidad.
  const GOBIERNA = /^scripts\/(test-orden|gen-contexto|verificar-docs|verificar-estado-actual|gen-estado)\.mjs$|^docs\/normativo\/|^AGENTS\.md$|^CLAUDE\.md$|^RUMBO\.md$/;
  const hits = rutas.filter((r) => GOBIERNA.test(r));
  if (hits.length === 0) return { peso: 0, hits, creados: [] };
  const creados = hits.filter((r) => !fs.existsSync(path.join(root, r)));
  return { peso: creados.length ? 3 : 1, hits, creados };
}

/* ── La cuenta ──────────────────────────────────────────────────────────── */

const UMBRAL_CLAUDE = 4; // de un máximo de 14

/**
 * Tres salidas, no dos. Calibrar dejó claro que el veredicto binario era el
 * error: los tres fallos que quedaban eran commits de Cline que ADEMÁS tocaban
 * un guardián o un normativo —actualizar un umbral porque la deuda bajó, añadir
 * a ORDEN.md la lección de un fallo—. Eso no convierte el trabajo en trabajo de
 * Claude; convierte UNA PARTE en algo que hay que revisar.
 *
 * Es la misma distinción que ya rige para las suites: cambiar una RUTA es
 * contabilidad, cambiar el INVARIANTE es gobierno.
 */
function pesar(rutas, borrados = new Set()) {
  const d = {
    esquema: esquema(rutas),
    identidad: identidad(rutas),
    detectabilidad: detectabilidad(rutas),
    novedad: novedad(rutas, borrados),
    gobierno: gobierno(rutas),
  };
  const total = Object.values(d).reduce((s, x) => s + x.peso, 0);

  // ESQUEMA e IDENTIDAD son las dos que no admiten matiz: sin staging, un .sql
  // mal pensado no se deshace, y un error de autorización no tiene red debajo
  // porque RLS no autoriza nada.
  const irreversible = d.esquema.peso > 0 || d.identidad.peso > 0;
  const soloGobierna = !irreversible && d.gobierno.peso > 0;

  let quien;
  if (irreversible || total >= 7) quien = "Claude";
  else if (soloGobierna) quien = "Cline + revisión";
  else quien = "Cline";
  return { d, total, quien, irreversible, soloGobierna };
}

function rutasDe(ref) {
  return git("show", "--name-only", "--format=", ref).split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Los BORRADOS de un commit. Se restan de la novedad: retirar no es inventar.
 *  Sin esto, el PROMPT F —que quitó 11 archivos— puntuaba como si hubiera
 *  creado once patrones nuevos. */
function borradosDe(ref) {
  return new Set(
    git("show", "--name-status", "--format=", ref)
      .split(String.fromCharCode(10))
      .filter((l) => l.startsWith("D" + String.fromCharCode(9)))
      .map((l) => l.slice(2).trim()),
  );
}

/* ── Calibración contra lo que ya pasó ──────────────────────────────────── */

const CASOS = [
  // [sha, quién lo hizo de verdad, qué era]
  ["c12889f", "Cline", "PROMPT E — bajar I/O, partir gigantes (49 archivos)"],
  ["6d4be33", "Cline", "PROMPT F — lint, _borrador, recorte (60 archivos)"],
  ["e212b0c", "Cline", "Panel del repo — recolector y renderer"],
  ["8d17188", "Claude", "UIs pendientes — 7 tablas nuevas + 14 capacidades"],
  ["ec2579d", "Claude", "Recursos por materia — columna nueva"],
  ["d71fd59", "Claude", "test-orden — el primer guardián mecánico"],
  ["4307186", "Claude", "B4 — módulo puro de permisos + suite"],
  // Reetiquetado tras calibrar: `dd3664e` es el ARREGLO del fallo, no su causa.
  // La causa fue `8d17188` —que la escala puntúa 9 y asigna a Claude, correcto—.
  // El arreglo en sí era pequeño y mecánico: trabajo de Cline. Dejarlo etiquetado
  // como «Claude» habría hecho que la escala pareciera fallar cuando acertaba.
  ["dd3664e", "Cline", "arreglo del fallo de producción (la causa fue 8d17188)"],
];

if (args.includes("--calibrar")) {
  console.log("Calibración de la escala contra 8 cambios reales\n");
  console.log("  sha      esq id det nov gob  total  escala           real    ¿coincide?");
  console.log("  " + "─".repeat(78));
  let aciertos = 0;
  for (const [sha, real, que] of CASOS) {
    const rutas = rutasDe(sha);
    if (rutas.length === 0) { console.log(`  ${sha}  (no está en este clon)`); continue; }
    const { d, total, quien } = pesar(rutas, borradosDe(sha));
    // «Cline + revisión» cuenta como acierto si lo hizo Cline: el cambio fue
    // suyo y lo que la escala pide es que alguien mire la parte que gobierna.
    const bien = quien === real || (quien === "Cline + revisión" && real === "Cline");
    if (bien) aciertos++;
    console.log(
      `  ${sha}  ${String(d.esquema.peso).padStart(3)} ${String(d.identidad.peso).padStart(2)} ` +
      `${String(d.detectabilidad.peso).padStart(3)} ${String(d.novedad.peso).padStart(3)} ` +
      `${String(d.gobierno.peso).padStart(3)}  ` +
      `${String(total).padStart(5)}  ${quien.padEnd(16)} ${real.padEnd(7)} ${bien ? "sí" : "NO"}`,
    );
    console.log(`           ${que}`);
  }
  console.log(`\n  ${aciertos}/${CASOS.filter((c) => rutasDe(c[0]).length).length} coinciden con quien lo hizo de verdad.`);
  console.log("\n  Lo que la calibración descarta: contar archivos o líneas daría la");
  console.log("  respuesta CONTRARIA — los dos commits más grandes son de Cline.");
  process.exit(0);
}

const ref = opt("ref");
const rutas = ref ? rutasDe(ref) : args.filter((a) => !a.startsWith("--"));

if (rutas.length === 0) {
  console.error("Uso: node scripts/diag-peso-cambio.mjs <rutas...> | --ref=<sha> | --calibrar");
  process.exit(1);
}

const { d, total, quien, irreversible } = pesar(rutas, ref ? borradosDe(ref) : new Set());

console.log(`Peso del cambio — ${rutas.length} ruta(s)\n`);
const fila = (nombre, x, nota) =>
  console.log(`  ${String(x.peso).padStart(2)}  ${nombre.padEnd(16)} ${nota}`);

fila("ESQUEMA", d.esquema, d.esquema.hits.length ? d.esquema.hits.join(", ") : "no toca la forma de los datos");
fila("IDENTIDAD", d.identidad, d.identidad.hits.length ? d.identidad.hits.join(", ") : "no toca auth ni la matriz");
fila(
  "DETECTABILIDAD",
  d.detectabilidad,
  d.detectabilidad.sinCobertura.length
    ? `${d.detectabilidad.sinCobertura.length} archivo(s) sin suite que los cubra`
    : "cubierto por suites existentes",
);
fila(
  "NOVEDAD",
  d.novedad,
  d.novedad.carpetasNuevas.length
    ? `carpeta(s) nueva(s): ${d.novedad.carpetasNuevas.join(", ")}`
    : d.novedad.hits.length
      ? `sin precedente: ${d.novedad.hits.join(", ")}`
      : "encaja en patrones que ya existen",
);

fila(
  "GOBIERNO",
  d.gobierno,
  d.gobierno.creados && d.gobierno.creados.length
    ? "CREA reglas: " + d.gobierno.creados.join(", ")
    : d.gobierno.hits.length
      ? "actualiza reglas: " + d.gobierno.hits.join(", ")
      : "no cambia ninguna regla que gobierne al resto",
);

console.log(`\n  TOTAL ${total}/14  ·  umbral ${UMBRAL_CLAUDE}  →  **${quien}**\n`);

if (quien === "Cline + revisión") {
  console.log("  Lo implementa Cline. Lo único que Claude tiene que mirar es el cambio");
  console.log(`  de regla: ${d.gobierno.hits.join(", ")}`);
  console.log("  Actualizar un umbral porque la deuda bajó es contabilidad; cambiar el");
  console.log("  invariante para que algo pase es apagar el guardián. Revisar cuál es.");
} else if (quien === "Claude") {
  const motivo = irreversible
    ? (d.esquema.peso ? "toca el ESQUEMA" : "toca la AUTORIZACIÓN") + ", y eso no se deshace con un revert"
    : `suma ${total}, que es mucho peso junto`;
  console.log(`  Claude lo implementa porque ${motivo}.`);
  console.log("  No es desconfianza en Cline: es lo que cuesta equivocarse aquí. Sin");
  console.log("  staging, lo que se toca se toca en producción. Cline puede revisarlo.");
} else {
  console.log("  Va a Cline con un prompt acotado:");
  console.log(`    node scripts/gen-contexto.mjs ${rutas.slice(0, 4).join(" ")}`);
  console.log("  Si crees que NO puede, la respuesta va escrita en el prompt. Sin");
  console.log("  respuesta escrita, va a Cline.");
}

console.log("\n  La escala mide PESO, no volumen. Los dos commits más grandes del");
console.log("  repo son de Cline; el fallo de producción tenía 13 archivos.");
