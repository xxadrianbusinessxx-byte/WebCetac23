#!/usr/bin/env node
/**
 * gen-contexto.mjs — arma el CONTEXTO ACOTADO de un trabajo, para el agente que
 * lo va a hacer.
 *
 * QUÉ MIDE: qué hace falta saber para tocar unos archivos concretos, y qué
 *           reglas, suites, términos y mediciones les aplican.
 * QUÉ ESCRIBE: un Markdown por stdout, o el archivo que se le pase con
 *           `--salida`. No toca la base ni la red.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-contexto.mjs lib/escolar/materia/facetas-materia.ts
 *   node scripts/gen-contexto.mjs --tarea=crear,permisos app/actions/escolar.ts
 *   node scripts/gen-contexto.mjs --agente=claude lib/escolar/asistencia/
 *   node scripts/gen-contexto.mjs --salida=docs/historial/prompts/X.md <rutas>
 *   node scripts/gen-contexto.mjs --tareas        (lista las tareas válidas)
 *
 * ── Por qué DOS agentes y no uno ───────────────────────────────────────────
 * `AGENTS.md` §Reparto dice que el presupuesto de contexto no es el mismo, y
 * que confundirlos es lo que hace caro el reparto. Este script emite, desde las
 * mismas fuentes, el documento que corresponde a cada uno:
 *
 *   --agente=cline  (por defecto) → un PAQUETE DE INSTRUCCIONES. Presupuesto
 *     cerrado («no leer nada más»), qué no tocar y el CONTRATO. Cline no decide
 *     nada: la decisión ya está tomada, y con 800 KB de docs gastaría la ventana
 *     antes de escribir una línea.
 *
 *   --agente=claude → un BRIEF DE DIAGNÓSTICO. Claude sí investiga —AGENTS.md le
 *     da el repo entero—, así que cerrarle el presupuesto sería contraproducente.
 *     Lo que necesita es lo contrario: qué está YA medido y por qué script (para
 *     no volver a medirlo a mano), qué es deuda DECLARADA y no un bug (para no
 *     «arreglar» un trinquete), qué hay abierto que toque estos archivos, y
 *     sobre todo qué NO mide nadie, que es donde un diagnóstico se equivoca.
 *
 * El error que esto evita es real y es de ida y vuelta: darle a Cline el brief
 * lo deja sin contrato, y darle a Claude el paquete cerrado le prohíbe justo la
 * investigación para la que está.
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
import { execFileSync } from "node:child_process";

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

// Por defecto, «cline»: es el caso que existía antes de que hubiera dos, y
// cambiar el comportamiento por defecto de un script que ya se usa en prompts
// archivados rompería esos prompts sin avisar.
const AGENTES = ["cline", "claude"];
const agente = (opt("agente") ?? "cline").toLowerCase();
if (!AGENTES.includes(agente)) {
  console.error(`--agente=${agente} no existe. Válidos: ${AGENTES.join(", ")}.`);
  console.error("cline → paquete de instrucciones (presupuesto cerrado + CONTRATO).");
  console.error("claude → brief de diagnóstico (qué está medido, qué es deuda, qué no mide nadie).");
  process.exit(1);
}

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
  console.error("Uso: node scripts/gen-contexto.mjs [--agente=cline|claude] [--tarea=a,b] [--salida=X.md] <rutas...>");
  console.error("     node scripts/gen-contexto.mjs --tareas   (qué tareas existen)");
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

// ── 6) Fuentes que solo necesita el brief de diagnóstico ───────────────────
// Todas se LEEN. Ninguna se recalcula aquí: si este script volviera a contar
// archivos o a medir reglas tendría su propia versión de cifras que ya tienen
// dueño, y divergirían al primer cambio (R6). Lo mismo que hace gen-estado.

/** Las reglas de `test-orden`, tal y como están AHORA. */
function reglasOrden() {
  try {
    const out = execFileSync(process.execPath, [path.join(root, "scripts/test-orden.mjs"), "--json"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out.replace(/^﻿/, "")).reglas ?? [];
  } catch (e) {
    // test-orden sale con 1 cuando una regla falla, y ese es justo el caso que
    // hay que enseñar: el JSON de stdout sigue siendo válido.
    const out = e?.stdout;
    if (typeof out === "string" && out.trim().startsWith("{")) {
      try { return JSON.parse(out.replace(/^﻿/, "")).reglas ?? []; } catch { /* nada */ }
    }
    return [];
  }
}

/** El panel, si alguien lo ha generado. Con su edad: es una foto, no un invariante. */
function panel() {
  if (!existe(".panel/estado.json")) return null;
  try {
    const j = JSON.parse(leer(".panel/estado.json"));
    const dias = Math.floor((Date.now() - new Date(j.generado).getTime()) / 86_400_000);
    return { ...j, edadDias: Number.isFinite(dias) ? dias : null };
  } catch {
    return null;
  }
}

/** Pendientes abiertos que hablan de alguno de los archivos en alcance. */
function pendientesDe(rels) {
  if (!existe("docs/sistema/pendientes.json")) return [];
  let lista = [];
  try { lista = JSON.parse(leer("docs/sistema/pendientes.json")).pendientes ?? []; } catch { return []; }
  const claves = rels.flatMap((r) => {
    const limpio = r.replace(/\/+$/, "");
    return [limpio, path.basename(limpio), limpio.split("/").slice(-2).join("/")];
  }).filter((c) => c.length > 3);
  return lista.filter((pend) => {
    if (pend.estado !== "abierto") return false;
    const texto = `${pend.doc ?? ""} ${pend.verificar ?? ""} ${pend.detalle ?? ""} ${pend.titulo ?? ""}`;
    return claves.some((c) => texto.includes(c));
  });
}

/** El «Fuera de alcance ahora» de RUMBO.md: lo que la campaña actual NO toca. */
function fueraDeAlcance() {
  if (!existe("RUMBO.md")) return [];
  const m = leer("RUMBO.md").split("## Fuera de alcance ahora")[1];
  if (!m) return [];
  return m
    .split(/\n##|<!--/)[0]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2));
}

// ── Armado ─────────────────────────────────────────────────────────────────
// Una carpeta es una ruta legítima: cuando el cambio CREA un archivo, lo que se
// conoce es dónde va, no cómo se llamará. El mensaje de «no existen» ya lo
// pedía («pasa la carpeta donde irá») y sin embargo `leer()` reventaba con
// EISDIR. La carpeta aporta lo que aporta: su capa y lo que esa capa exige.
const fichas = rutas.map((rel) => {
  const esCarpeta = existe(rel) && fs.statSync(path.join(root, rel)).isDirectory();
  if (esCarpeta) {
    const { capa, exige } = capaDe(`${rel.replace(/\/$/, "")}/<archivo nuevo>`);
    return { rel: `${rel.replace(/\/$/, "")}/`, capa, exige, lineas: null, src: "", suites: [], carpeta: true };
  }
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

// ── Cabecera: es lo único que cambia de raíz entre los dos agentes ─────────
if (agente === "cline") {
  L.push("## CONTEXTO (presupuesto acotado — no leer nada más)\n");
  L.push("Generado por `node scripts/gen-contexto.mjs --agente=cline`. Las rutas salen");
  L.push("de la tabla «Presupuesto de lectura» de `docs/00-INDICE.md`; no se pegan");
  L.push("aquí, se citan.\n");
  for (const f of filasElegidas) L.push(`- **${f.tarea}** → ${f.crudo}`);
  L.push("");
  L.push("> No cargues documentación fuera de esta lista. Si con esto no alcanza, el");
  L.push("> índice está mal y hay que arreglarlo — no leer todo por si acaso.\n");
} else {
  L.push("## BRIEF DE DIAGNÓSTICO\n");
  L.push("Generado por `node scripts/gen-contexto.mjs --agente=claude`.\n");
  L.push("Esto **no** es un presupuesto cerrado: `AGENTS.md` §Reparto te da el repo");
  L.push("entero porque diagnosticar exige ver relaciones que no están en ningún");
  L.push("archivo. Lo que sigue es el punto de partida, para que no gastes la ventana");
  L.push("redescubriendo lo que ya tiene dueño.\n");
  L.push("Por dónde empezar, según lo que vas a tocar:\n");
  for (const f of filasElegidas) L.push(`- **${f.tarea}** → ${f.crudo}`);
  L.push("");

  // 1) Lo ya medido. El desperdicio característico de un diagnóstico es volver
  //    a contar a mano algo que un script ya cuenta y que además tiene histórico.
  const reglas = reglasOrden();
  const pnl = panel();
  L.push("## YA ESTÁ MEDIDO — no lo cuentes a mano\n");
  if (reglas.length) {
    L.push("`node scripts/test-orden.mjs` (ahora mismo, no cacheado):\n");
    L.push("| Regla | Hoy | Umbral | Modo |");
    L.push("|---|---|---|---|");
    for (const r of reglas) L.push(`| ${r.id} · ${r.regla} | ${r.actual} | ${r.umbral} | ${r.modo} |`);
    L.push("");
    L.push("`--detalle` lista los archivos de cada una.\n");
  }
  if (pnl) {
    const edad = pnl.edadDias === 0 ? "de hoy" : `de hace ${pnl.edadDias} día(s)`;
    const señales = (pnl.zonas ?? []).reduce((a, z) => a + (z.senales?.length ?? 0), 0);
    L.push(`\`.panel/estado.json\` (${edad}, rama \`${pnl.repo?.rama}\`, HEAD \`${pnl.repo?.head}\`)`);
    L.push(`tiene ${señales} señales medidas con su delta contra la medición anterior.`);
    L.push("**Es una foto, no un invariante:** si tiene días, `npm run panel` antes de");
    L.push("apoyarte en una cifra.\n");
  } else {
    L.push("No hay `.panel/estado.json`: corre `npm run panel` y tendrás las señales");
    L.push("medidas con su delta, en vez de contarlas a mano.\n");
  }

  // 2) Trinquetes. «Arreglar» una deuda declarada sin saber que lo es produce
  //    un cambio correcto en el sitio equivocado, y a veces baja un umbral.
  // Una regla con `deuda` declarada pero `actual: 0` es una deuda CERRADA: el
  // texto del plan sigue ahí, pero ya no queda nada que arreglar. Listarla como
  // deuda viva —que es lo que hacía la primera versión de este brief, enseñando
  // «C8 (0/0)»— manda a investigar un sitio donde no hay nada, que es justo el
  // gasto que este documento existe para evitar.
  const deudaViva = reglas.filter((r) => r.deuda && r.actual > 0 && r.actual <= r.umbral);
  const fallando = reglas.filter((r) => r.actual > r.umbral);
  L.push("## DEUDA DECLARADA ≠ BUG\n");
  if (deudaViva.length) {
    L.push("Estas reglas NO están en 0 por descuido: tienen plan escrito y su umbral");
    L.push("es un trinquete que solo falla si el número **sube**.\n");
    for (const r of deudaViva) L.push(`- **${r.id}** (${r.actual}/${r.umbral}) — ${r.deuda}`);
    L.push("");
    L.push("Bajar uno de estos umbrales para que el CI pase apaga el guardián, y es");
    L.push("una decisión de arquitectura disfrazada de arreglo (`AGENTS.md`).\n");
  } else {
    L.push("Ninguna regla de `test-orden` arrastra deuda viva: todas están en 0 o en");
    L.push("su umbral. Si una falla, es un fallo de verdad.\n");
  }
  if (fallando.length) {
    L.push("**Y esto sí está fallando ahora mismo**, antes de que toques nada:\n");
    for (const r of fallando) L.push(`- **${r.id}** ${r.regla} — ${r.actual}, umbral ${r.umbral}`);
    L.push("");
    L.push("Averigua si es tuyo o venía de antes: `git stash` y volver a correr");
    L.push("`node scripts/test-orden.mjs` lo resuelve en diez segundos.\n");
  }

  // 3) Lo que ya está abierto sobre estos archivos.
  const pend = pendientesDe(fichas.map((f) => f.rel));
  if (pend.length) {
    L.push("## YA HAY ALGO ABIERTO SOBRE ESTO\n");
    L.push("De `docs/sistema/pendientes.json`. Antes de apoyarte en uno, corre su");
    L.push("`verificar`: el campo `revisado` dice cuándo se comprobó de verdad.\n");
    for (const x of pend) {
      const v = x.verificar ? `\`${x.verificar}\`` : "sin comando de verificación";
      L.push(`- **${x.id}** (riesgo ${x.riesgo}, revisado ${x.revisado}) — ${x.titulo} · ${v}`);
    }
    L.push("");
  }

  // 4) Los límites de la campaña en curso.
  const fuera = fueraDeAlcance();
  if (fuera.length) {
    L.push("## FUERA DE ALCANCE DE LA CAMPAÑA EN CURSO\n");
    L.push("De `RUMBO.md`. No es que esté prohibido: es que decidirlo de paso, dentro");
    L.push("de otro trabajo, es como se abren los frentes que nadie cierra.\n");
    for (const x of fuera) L.push(`- ${x}`);
    L.push("");
  }
}

L.push("## ARCHIVOS EN ALCANCE\n");
L.push("| Archivo | Líneas | Capa | Qué exige esa capa |");
L.push("|---|---|---|---|");
for (const f of fichas) L.push(`| \`${f.rel}\` | ${f.carpeta ? "(carpeta destino)" : f.lineas} | ${f.capa} | ${f.exige} |`);
L.push("");

const conSuite = fichas.filter((f) => f.suites.length);
const sinSuite = fichas.filter((f) => !f.suites.length);
L.push("## RED DE SEGURIDAD\n");
if (conSuite.length) {
  L.push("Correr **antes y después**. Si una de estas cambia de RESULTADO, cambiaste");
  L.push("semántica aunque creas que era un refactor — para y dilo.\n");
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
// Distinción aprendida en la revisión del PROMPT E (2026-09-16). La regla que
// se dio entonces —«si tienes que tocar una suite, para»— era demasiado roma y
// habría bloqueado trabajo correcto: hay suites de auditoría que nombran
// archivos POR RUTA, y mover un archivo obliga a actualizar esa ruta sin que
// cambie ninguna semántica. Lo que nunca se toca es el INVARIANTE.
L.push("**Tocar una suite: cuándo sí y cuándo no.**");
L.push("- Cambiar una RUTA o un nombre de archivo que la suite nombra, porque lo moviste: **sí**,");
L.push("  y se dice en el informe. No cambia lo que la suite comprueba.");
L.push("- Cambiar el INVARIANTE —el número esperado, la aserción, el umbral— para que pase: **no**.");
L.push("  Eso es apagar el detector. Para y repórtalo.");
L.push("- Si un elemento sale de una lista porque dejó de cumplir el rol que la lista audita,");
L.push("  demuéstralo: dónde vive ahora y qué otra comprobación lo sigue cubriendo.\n");
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

// ── Cierre: el paquete termina en el CONTRATO; el brief, en los huecos ─────
if (agente === "cline") {
  L.push("## QUÉ NO TOCAR\n");
  L.push("- Nada fuera de la lista de arriba. Un archivo extra hay que justificarlo.");
  L.push("- Legacy y fallbacks se quedan en pie (R8): no se borran «de paso».");
  L.push("- No crear un módulo paralelo a uno que ya cubre el dominio (R6).");
  L.push("- No bajar un umbral de `scripts/test-orden.mjs` para que pase: eso apaga el guardián.\n");

  L.push("```");
  L.push(contrato());
  L.push("```");
} else {
  // Lo último que lee el brief, y a propósito: un diagnóstico no se equivoca
  // donde hay instrumento, se equivoca donde no lo hay. Una zona en silencio
  // entrena a creer que está bien — el mismo motivo por el que el panel las
  // pinta abajo del todo en vez de omitirlas.
  const pnl = panel();
  L.push("## LO QUE NO MIDE NADIE\n");
  const ciegos = pnl?.puntosCiegos ?? [];
  if (ciegos.length) {
    L.push("Del panel. Si tu diagnóstico se apoya en algo de esta lista, no lo estás");
    L.push("midiendo: lo estás suponiendo. Dilo como suposición, o ve a medirlo.\n");
    for (const c of ciegos) L.push(`- ${c}`);
  } else {
    L.push("El panel no declara puntos ciegos, o no se ha generado (`npm run panel`).");
    L.push("Dos que no dependen del panel y aplican siempre: **no hay staging** —lo que");
    L.push("toques, lo tocas en producción— y **RLS no autoriza nada**, la autorización");
    L.push("vive entera en TypeScript (`ESTADO-ACTUAL.md` §4).");
  }
  L.push("");
  L.push("Y una regla que no cambia: nada de `docs/historial/` describe el presente.");
  L.push("Fue cierto el día que se escribió. Para saber qué es verdad hoy: el código,");
  L.push("o un diagnóstico de `scripts/`.");
}

const texto = L.join("\n") + "\n";
if (salida) {
  fs.writeFileSync(path.join(root, salida), texto, "utf8");
  const que = agente === "cline" ? "Paquete" : "Brief";
  console.log(`${que} escrito en ${salida} (${texto.split("\n").length} líneas).`);
} else {
  process.stdout.write(texto);
}
