#!/usr/bin/env node
/**
 * gen-contexto-cline.mjs — arma el PAQUETE DE CONTEXTO de un prompt para Cline.
 *
 * QUÉ MIDE: qué debe leer Cline para tocar unos archivos concretos, y qué
 *           reglas, suites y términos les aplican.
 * QUÉ ESCRIBE: un Markdown por stdout, o el archivo que se le pase con
 *           `--salida`. No toca la base ni la red.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-contexto-cline.mjs lib/escolar/materia/facetas-materia.ts
 *   node scripts/gen-contexto-cline.mjs --tarea=crear,permisos app/actions/escolar.ts
 *   node scripts/gen-contexto-cline.mjs --salida=docs/historial/prompts/X.md <rutas>
 *   node scripts/gen-contexto-cline.mjs --tareas        (lista las tareas válidas)
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `docs/00-INDICE.md` dice que la documentación pesa ~500 KB y que cargarla
 * entera consume media ventana antes de escribir una línea. Tiene una tabla
 * «Tarea → Leer» que es exactamente el presupuesto correcto… y que hasta ahora
 * había que aplicar A MANO en cada prompt. A mano se olvida, y el prompt acaba
 * diciendo «lee el repo», que es justo lo contrario.
 *
 * Esto lo resuelve mecánicamente: se le dan los archivos que el cambio va a
 * tocar y devuelve el brief acotado.
 *
 * ── Regla de construcción: NADA se reescribe aquí ──────────────────────────
 * El presupuesto se LEE de la tabla de `docs/00-INDICE.md`. El contrato se LEE
 * del bloque de `CONTRATO-DE-CAMBIO.md` §1. Los términos se LEEN del
 * `GLOSARIO.md`. Copiar cualquiera de los tres dentro de este script crearía
 * una segunda fuente que se desincronizaría al primer cambio — que es
 * literalmente la R6 que el repo prohíbe. Si una fuente cambia, el paquete
 * cambia solo.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const leer = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const existe = (rel) => fs.existsSync(path.join(root, rel));

// ── Argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (nombre) => {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
};
const rutas = args.filter((a) => !a.startsWith("--"));
const tareasPedidas = (opt("tarea") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const salida = opt("salida");

// ── 1) El presupuesto de lectura, leído de docs/00-INDICE.md ───────────────
/**
 * Extrae la tabla «Presupuesto de lectura por tipo de tarea». Cada fila es
 * `| Tarea | Leer |`. La primera fila es el mínimo obligatorio.
 */
function presupuesto() {
  const texto = leer("docs/00-INDICE.md");
  const seccion = texto.split("## Presupuesto de lectura por tipo de tarea")[1] ?? "";
  const tabla = seccion.split("\n---")[0] ?? "";
  const filas = [];
  for (const linea of tabla.split("\n")) {
    const m = linea.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m || /^-+$/.test(m[1]) || m[1] === "Tarea") continue;
    const tarea = m[1].replace(/\*\*/g, "").trim();
    const rutasDoc = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    filas.push({ tarea, claves: tarea.toLowerCase(), docs: rutasDoc, crudo: m[2] });
  }
  return filas;
}

const PRESUPUESTO = presupuesto();
if (args.includes("--tareas")) {
  console.log("Tareas reconocidas (de docs/00-INDICE.md):\n");
  PRESUPUESTO.forEach((f, i) => console.log(`  ${i === 0 ? "(siempre)" : "         "} ${f.tarea}`));
  process.exit(0);
}

if (rutas.length === 0) {
  console.error("Uso: node scripts/gen-contexto-cline.mjs [--tarea=a,b] [--salida=X.md] <rutas...>");
  console.error("     node scripts/gen-contexto-cline.mjs --tareas   (qué tareas existen)");
  process.exit(1);
}

const faltan = rutas.filter((r) => !existe(r));
if (faltan.length) {
  console.error(`No existen: ${faltan.join(", ")}`);
  console.error("El paquete describe archivos REALES. Si vas a crear uno nuevo, pasa la carpeta donde irá.");
  process.exit(1);
}

// ── 2) Capa y reglas de cada archivo ───────────────────────────────────────
/**
 * A qué capa de ORDEN.md §2 pertenece una ruta, y qué exige esa capa. Los
 * textos son el resumen operativo de la tabla «Quién puede importar a quién».
 */
function capaDe(rel) {
  const p = rel.replace(/\\/g, "/");
  if (/^app\/actions\//.test(p))
    return { capa: "action", exige: "empieza por exigir(); valida, delega y devuelve. Sin lógica de negocio, sin .from(), sin importar otra action." };
  if (/-client\.tsx$/.test(p) || /^app\/components\//.test(p))
    return { capa: "cliente", exige: "estado de UI y nada más. Nunca lib/supabase ni server-only. No decide permisos: recibe la respuesta de puede() ya resuelta." };
  if (/^app\/.*\/page\.tsx$/.test(p))
    return { capa: "page", exige: "Server Component: resuelve sesión y renderiza. No importa otra page." };
  if (/-puro\.tsx?$/.test(p))
    return { capa: "puro", exige: "solo tipos. Cero I/O. DEBE tener suite en scripts/test-*.mjs." };
  if (/^lib\/auth\//.test(p))
    return { capa: "auth", exige: "permisos.ts es puro (matriz rol→capacidad); exigir.ts es el ÚNICO sitio con I/O de sesión." };
  if (/^lib\/escolar\//.test(p))
    return { capa: "dominio", exige: "la lógica real. Imports RELATIVOS (nunca «@/»: rompe las suites sin romper el build). Nunca importa app/." };
  if (/^lib\//.test(p)) return { capa: "lib", exige: "nunca importa app/." };
  if (/^scripts\//.test(p)) {
    const b = path.basename(p);
    if (/^(test|diag|probe)-/.test(b)) return { capa: "script solo-lectura", exige: "NO puede escribir en la base. Regla dura de ORDEN.md §4 — existe porque se violó." };
    if (/^(migrar|p0)-/.test(b)) return { capa: "script con escritura", exige: "dry-run por defecto; escribe solo con --apply." };
    if (/^gen-/.test(b)) return { capa: "generador", exige: "produce archivos del repo, nunca escribe en la base." };
    return { capa: "script", exige: "cabecera con qué mide / qué escribe / cómo se ejecuta, y fila en scripts/README.md." };
  }
  if (/^supabase\//.test(p)) return { capa: "sql", exige: "aditivo: columnas nullable, sin DROP, sin NOT NULL retroactivo." };
  return { capa: "—", exige: "revisar la tabla de ORDEN.md §1: si no encaja en ninguna fila, el concepto está mal planteado." };
}

// ── 3) Qué suite cubre cada archivo ────────────────────────────────────────
// Se busca el módulo dentro de las suites: si una lo transpila o lo nombra, es
// la red de seguridad de ese archivo.
//
// El emparejado va CUALIFICADO POR CARPETA a propósito. La primera versión
// buscaba el nombre suelto y `app/actions/escolar.ts` casaba con 35 suites,
// porque la cadena «escolar» está en todas (`lib/escolar/…`). «Corre las 35»
// equivale a «corre todo», que es exactamente lo que este script evita.
const SUITES = fs.readdirSync(path.join(root, "scripts")).filter((f) => /^test-.+\.mjs$/.test(f));
function suitesDe(rel) {
  const p = rel.replace(/\\/g, "/");
  const sinExt = p.replace(/\.(tsx?|mjs)$/, "");
  const carpeta = sinExt.split("/").slice(-2).join("/"); // «materia/facetas-materia»
  const candidatos = [p, `${sinExt}.js`, `${sinExt}.ts`, `${carpeta}.js`, `"${carpeta}"`, `'${carpeta}'`];
  return SUITES.filter((s) => {
    const src = leer(`scripts/${s}`);
    return candidatos.some((c) => src.includes(c));
  });
}

// ── 4) Términos del glosario presentes en los archivos ─────────────────────
// Nombrar los términos tal cual los define el glosario es una regla explícita
// de ORDEN.md §6: «decir periodos.id, no “el ciclo”». Se listan solo los que
// de verdad aparecen, para no volver a pegar los 7 KB del glosario.
function terminosGlosario(textos) {
  const glos = leer("docs/normativo/GLOSARIO.md");
  const terminos = [...glos.matchAll(/\|\s*\*\*`?([^`*|]+?)`?\*\*[^|]*\|\s*([^|]+?)\s*\|/g)]
    .map((m) => ({ termino: m[1].trim(), que: m[2].trim() }));
  const todo = textos.join("\n");
  return terminos.filter((t) => {
    const limpio = t.termino.replace(/[«»()]/g, "").split(/\s|\./)[0];
    return limpio.length > 3 && todo.includes(limpio);
  });
}

// ── 5) El bloque del contrato, leído tal cual ──────────────────────────────
function contrato() {
  const texto = leer("docs/normativo/CONTRATO-DE-CAMBIO.md");
  const m = texto.match(/```\n(CONTRATO \(obligatorio\):[\s\S]*?)```/);
  return m ? m[1].trimEnd() : "(no se pudo leer CONTRATO-DE-CAMBIO.md §1)";
}

// ── Armado ─────────────────────────────────────────────────────────────────
const fichas = rutas.map((rel) => {
  const src = leer(rel);
  const { capa, exige } = capaDe(rel);
  return { rel, capa, exige, lineas: src.split("\n").length, src, suites: suitesDe(rel) };
});

// Presupuesto: la fila obligatoria siempre + las que el usuario pidió.
const filasElegidas = [PRESUPUESTO[0], ...PRESUPUESTO.slice(1).filter((f) =>
  tareasPedidas.some((t) => f.claves.includes(t.toLowerCase())),
)].filter(Boolean);

// Sugerencias automáticas por lo que se está tocando: no reemplazan la
// elección, la completan — es fácil olvidar que tocar una action obliga a leer
// la matriz de permisos.
const auto = [];
const hay = (re) => fichas.some((f) => re.test(f.rel));
if (hay(/^app\/actions\//) || hay(/^lib\/auth\//)) auto.push("permisos");
if (hay(/^app\/components\/|^app\/.*-client\.tsx$/)) auto.push("apariencia");
if (hay(/ciclo|periodo/i)) auto.push("ciclo escolar");
if (hay(/horario/i)) auto.push("horario");
if (hay(/^scripts\//)) auto.push("ejecutar cualquier script");
for (const a of auto) {
  const f = PRESUPUESTO.find((x) => x.claves.includes(a));
  if (f && !filasElegidas.includes(f)) filasElegidas.push(f);
}

const glosario = terminosGlosario(fichas.map((f) => f.src));

const L = [];
L.push("## CONTEXTO (presupuesto acotado — no leer nada más)\n");
L.push("Generado por `scripts/gen-contexto-cline.mjs`. Las rutas salen de la tabla");
L.push("«Presupuesto de lectura» de `docs/00-INDICE.md`; no se pegan aquí, se citan.\n");
for (const f of filasElegidas) L.push(`- **${f.tarea}** → ${f.crudo}`);
L.push("");
L.push("> No cargues documentación fuera de esta lista. Si con esto no alcanza, el");
L.push("> índice está mal y hay que arreglarlo — no leer todo por si acaso.\n");

L.push("## ARCHIVOS EN ALCANCE\n");
L.push("| Archivo | Líneas | Capa | Qué exige esa capa |");
L.push("|---|---|---|---|");
for (const f of fichas) L.push(`| \`${f.rel}\` | ${f.lineas} | ${f.capa} | ${f.exige} |`);
L.push("");

const conSuite = fichas.filter((f) => f.suites.length);
const sinSuite = fichas.filter((f) => !f.suites.length);
L.push("## RED DE SEGURIDAD\n");
if (conSuite.length) {
  L.push("Correr **antes y después**. Si una de estas cambia de resultado, cambiaste");
  L.push("semántica aunque creas que era un refactor:\n");
  for (const f of conSuite) L.push(`- \`${f.rel}\` → ${f.suites.map((s) => `\`node scripts/${s}\``).join(" · ")}`);
} else {
  L.push("Ninguna suite cubre estos archivos hoy.");
}
if (sinSuite.length && conSuite.length) {
  L.push("");
  L.push(`Sin suite: ${sinSuite.map((f) => `\`${f.rel}\``).join(", ")}.`);
}
if (sinSuite.some((f) => f.capa === "puro")) {
  L.push("");
  L.push("⚠️ Hay un módulo `-puro` sin suite. ORDEN.md §3 la exige: un módulo puro");
  L.push("sin prueba es una decisión que nadie verifica.");
}
L.push("");
L.push("Además, siempre: `npx tsc --noEmit` · `npm run test:ci` · `node scripts/test-orden.mjs` · `npm run build`.\n");

if (glosario.length) {
  L.push("## TÉRMINOS — usa estos nombres, no sinónimos\n");
  L.push("Aparecen en los archivos que vas a tocar. `docs/normativo/GLOSARIO.md` es");
  L.push("la fuente; aquí solo los que aplican.\n");
  L.push("| Término | Qué es realmente |");
  L.push("|---|---|");
  for (const t of glosario.slice(0, 14)) L.push(`| \`${t.termino}\` | ${t.que} |`);
  L.push("");
}

L.push("## QUÉ NO TOCAR\n");
L.push("- Nada fuera de la lista de arriba. Un archivo extra hay que justificarlo.");
L.push("- Legacy y fallbacks se quedan en pie (R8): no se borran «de paso».");
L.push("- No crear un módulo paralelo a uno que ya cubre el dominio (R6).");
L.push("- No bajar un umbral de `scripts/test-orden.mjs` para que pase: eso apaga el guardián.\n");

L.push("```");
L.push(contrato());
L.push("```");

const texto = L.join("\n") + "\n";
if (salida) {
  fs.writeFileSync(path.join(root, salida), texto, "utf8");
  console.log(`Paquete escrito en ${salida} (${texto.split("\n").length} líneas).`);
} else {
  process.stdout.write(texto);
}
