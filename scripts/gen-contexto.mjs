#!/usr/bin/env node
/**
 * gen-contexto.mjs — arma el CONTEXTO ACOTADO de un trabajo, para el agente que
 * lo va a hacer.
 *
 * QUÉ MIDE: qué hace falta saber para tocar unos archivos concretos, y qué
 *           reglas, suites, términos y mediciones les aplican.
 * QUÉ ESCRIBE: un Markdown por stdout, o con `--salida` un archivo bajo
 *           `docs/historial/prompts/` (no pisa uno existente sin `--forzar`).
 *           No toca la base ni la red.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-contexto.mjs lib/escolar/materia/facetas-materia.ts
 *   node scripts/gen-contexto.mjs --tarea=crear,permisos app/actions/escolar.ts
 *   node scripts/gen-contexto.mjs --agente=claude lib/escolar/asistencia/
 *   node scripts/gen-contexto.mjs --salida=docs/historial/prompts/X.md <rutas>
 *   node scripts/gen-contexto.mjs --diag=diag-calendario-periodo.mjs <rutas>
 *   node scripts/gen-contexto.mjs --tareas        (lista las tareas válidas)
 * SALE CON 1, en vez de entregar algo incompleto que parece completo, si: una
 *   ruta no existe, una `--tarea` no casa con ninguna fila (palabra completa,
 *   sin tildes), el presupuesto da 0 filas, falta el CONTRATO (rama cline),
 *   `--salida` no es válida, el script de `--diag` no existe o no tiene fila en
 *   `scripts/README.md`, o se pide a Cline una tarea de Claude (auditar,
 *   escribir un prompt) o un `--diag` que escribe, carga producción o tiene
 *   salida sensible (prefijo `migrar-`/`fase10-`, o su fila del README).
 * SU SUITE: `scripts/test-gen-contexto.mjs` (inclusión y exclusión sobre la
 *   estructura del paquete, por tarea representativa).
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
 * `docs/00-INDICE.md` dice que la mayor parte de la documentación es historial y
 * que cargarla entera agota la ventana antes de escribir una línea. Tiene una tabla
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
// CRLF → LF al leer: con `core.autocrlf=true` la copia local lleva `\r\n` y la
// del CI no, y lo que se extrae aquí (el bloque del CONTRATO, la tabla del
// presupuesto) está escrito para `\n`. Con CRLF el CONTRATO no se encontraba y
// el paquete salía sin él, con exit 0.
const leer = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const existe = (rel) => fs.existsSync(path.join(root, rel));

// ── Argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (nombre) => {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
};
// `\` → `/` aquí, una sola vez: todo lo de abajo (capa, suites, sugerencias
// ancladas con `^app\/…`) compara contra rutas con `/`, y una ruta de Windows
// perdía en silencio las sugerencias de permisos, apariencia y scripts.
const rutas = args.filter((a) => !a.startsWith("--")).map((r) => r.replace(/\\/g, "/"));
const tareasPedidas = (opt("tarea") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const salida = opt("salida");
// `--diag=<script>`: el diagnóstico de solo lectura que el prompt manda correr
// antes y después (CONTRATO §1, pasos 1 y 6). Sin el flag no se añade nada.
const diagsPedidos = (opt("diag") ?? "").split(",").map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean);

// `--salida` solo escribe en la carpeta de los prompts, y no pisa uno que ya
// existe sin `--forzar`: el paquete de un prompt archivado es la constancia de
// lo que se le dio a Cline, y regenerarlo encima la borra.
const CARPETA_SALIDA = "docs/historial/prompts/";
let destinoSalida = null;
if (salida !== null) {
  const destino = path.resolve(root, salida.replace(/\\/g, "/"));
  const dentro = path.relative(path.join(root, CARPETA_SALIDA), destino);
  if (!dentro || dentro.startsWith("..") || path.isAbsolute(dentro)) {
    console.error(`--salida=${salida} no está bajo ${CARPETA_SALIDA}: es la única carpeta donde este script escribe.`);
    process.exit(1);
  }
  if (!fs.existsSync(path.dirname(destino))) {
    console.error(`--salida=${salida}: la carpeta ${path.relative(root, path.dirname(destino)).replace(/\\/g, "/")} no existe.`);
    process.exit(1);
  }
  if (fs.existsSync(destino) && (fs.statSync(destino).isDirectory() || !args.includes("--forzar"))) {
    console.error(`--salida=${salida} ya existe. No se sobrescribe sin --forzar (y nunca una carpeta).`);
    process.exit(1);
  }
  destinoSalida = destino;
}

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
  if (!existe("docs/00-INDICE.md")) return [];
  const texto = leer("docs/00-INDICE.md");
  const seccion = texto.split("## Presupuesto de lectura por tipo de tarea")[1] ?? "";
  const tabla = seccion.split("\n---")[0] ?? "";
  const filas = [];
  for (const linea of tabla.split("\n")) {
    const m = linea.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m || /^-+$/.test(m[1]) || m[1] === "Tarea") continue;
    const tarea = m[1].replace(/\*\*/g, "").trim();
    const rutasDoc = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    filas.push({ tarea, claves: tarea.toLowerCase(), palabras: palabras(tarea), docs: rutasDoc, crudo: m[2] });
  }
  return filas;
}

/** Las palabras de un texto, sin tildes (NFD) y en minúsculas: «el síntoma» →
 *  [«el», «sintoma»]. */
function palabras(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Una `--tarea` casa con una fila si sus palabras aparecen ENTERAS y seguidas
 *  en el nombre de la fila. Por subcadena, «ui» casaba con «arquitectura» y con
 *  «cualquier»; y sin quitar tildes, «sintoma» no casaba con «síntoma». */
function casa(fila, tarea) {
  const p = palabras(tarea);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= fila.palabras.length; i++) {
    if (p.every((w, j) => fila.palabras[i + j] === w)) return true;
  }
  return false;
}

const PRESUPUESTO = presupuesto();
// Sin filas, el paquete diría «no cargues documentación fuera de esta lista»
// con la lista vacía. Pasa si cambia el encabezado de la sección en el índice.
if (PRESUPUESTO.length === 0) {
  console.error("No se pudo leer el presupuesto: «## Presupuesto de lectura por tipo de tarea» de");
  console.error("docs/00-INDICE.md da 0 filas. Arregla el índice (o este lector) antes de generar nada.");
  process.exit(1);
}
const listaTareas = () =>
  PRESUPUESTO.map((f, i) => `  ${i === 0 ? "(siempre)" : "         "} ${f.tarea}`).join("\n");
if (args.includes("--tareas")) {
  console.log("Tareas reconocidas (de docs/00-INDICE.md):\n");
  console.log(listaTareas());
  process.exit(0);
}

// Una `--tarea` que no casa con ninguna fila daba la misma salida que no pasar
// ninguna, y parecía completa. Se para y se dice cuáles valen.
const sinFila = tareasPedidas.filter((t) => !PRESUPUESTO.some((f) => casa(f, t)));
if (sinFila.length) {
  console.error(`--tarea=${sinFila.join(",")} no casa con ninguna fila del presupuesto (palabra completa, sin tildes).`);
  console.error("Tareas reconocidas (de docs/00-INDICE.md):\n");
  console.error(listaTareas());
  process.exit(1);
}

// Auditar un cambio y escribir un prompt son de Claude (`AGENTS.md` §Reparto:
// Claude redacta el prompt y revisa lo entregado). Un paquete de Cline para eso
// le encargaría juzgar su propio trabajo, o decidir lo que tiene que llegarle
// decidido. La fila se reconoce por sus palabras, no por la `--tarea` exacta:
// «--tarea=escribir» elige la misma fila que «--tarea=prompt».
const PALABRAS_DE_CLAUDE = ["auditar", "prompt"];
if (agente === "cline") {
  const deClaude = tareasPedidas.filter((t) =>
    PRESUPUESTO.some((f) => casa(f, t) && PALABRAS_DE_CLAUDE.some((w) => casa(f, w))),
  );
  if (deClaude.length) {
    console.error(`--tarea=${deClaude.join(",")} es tarea de Claude (AGENTS.md §Reparto): auditar un cambio`);
    console.error("y escribir un prompt no se delegan a Cline. Usa --agente=claude.");
    process.exit(1);
  }
}

// El paquete de Cline termina en el CONTRATO; sin él no se entrega.
const CONTRATO = agente === "cline" ? contrato() : null;
if (agente === "cline" && CONTRATO === null) {
  console.error("No se pudo leer el bloque «CONTRATO (obligatorio):» de docs/normativo/CONTRATO-DE-CAMBIO.md §1.");
  console.error("Un paquete para Cline sin CONTRATO no se entrega: arregla el bloque (o este lector).");
  process.exit(1);
}

if (rutas.length === 0) {
  console.error("Uso: node scripts/gen-contexto.mjs [--agente=cline|claude] [--tarea=a,b] [--diag=script.mjs[,…]] [--salida=docs/historial/prompts/X.md [--forzar]] <rutas...>");
  console.error("     node scripts/gen-contexto.mjs --tareas   (qué tareas existen)");
  process.exit(1);
}

const faltan = rutas.filter((r) => !existe(r));
if (faltan.length) {
  console.error(`No existen: ${faltan.join(", ")}`);
  console.error("El paquete describe archivos REALES. Si vas a crear uno nuevo, pasa la carpeta donde irá.");
  process.exit(1);
}

// `--diag`: el script tiene que existir en la raíz de `scripts/` y tener fila en
// `scripts/README.md`, que es donde dice si solo lee. Un diagnóstico sin fila se
// trata como `ESCRIBE` (cabecera del README): no se le manda correr a nadie.
const README_SCRIPTS = existe("scripts/README.md") ? leer("scripts/README.md").split("\n") : [];
const diags = diagsPedidos.map((d) => {
  const nombre = d.replace(/^scripts\//, "");
  if (nombre.includes("/") || !/\.m?js$/.test(nombre) || !existe(`scripts/${nombre}`)) {
    console.error(`--diag=${d}: no es un script de la raíz de scripts/ (las carpetas _peligrosos/ y _archivo/ no valen).`);
    process.exit(1);
  }
  const i = README_SCRIPTS.findIndex((l) => l.startsWith("|") && (l.split("|")[1] ?? "").includes(`\`${nombre}\``));
  if (i < 0) {
    console.error(`--diag=${d}: no tiene fila en scripts/README.md. Sin fila se trata como ESCRIBE: no se manda correr.`);
    process.exit(1);
  }
  if (agente === "cline") {
    const veto = vetoCline(nombre, README_SCRIPTS[i]);
    if (veto) {
      console.error(`--diag=${d}: ${veto}. No se le manda correr a Cline: usa --agente=claude.`);
      process.exit(1);
    }
  }
  const seccion = README_SCRIPTS.slice(0, i).reverse().find((l) => /^#{2,3} /.test(l));
  return { nombre, fila: README_SCRIPTS[i], seccion: seccion ? seccion.replace(/^#+\s*/, "") : null };
});

/** Por qué un `--diag` no se le puede mandar a Cline, o `null` si se puede. Un
 *  aviso en prosa no basta: el paquete diría «córrelo» y la salvedad iría
 *  después. (1) El prefijo, cuando ORDEN §4 lo define como escritura o carga
 *  real (`migrar-`, `fase10-`); `p0-` no, porque mezcla diagnósticos `LEE`
 *  (`p0-diag-contexto`) con la herramienta que escribe, y esa lleva su
 *  etiqueta en la fila. (2) La fila: una etiqueta de la Clasificación
 *  (`ESCRIBE`, `CARGA`, `DESTRUCTIVO`) o «no ejecutar desde Cline» (Parte B: su
 *  salida lleva CURPs). En una fila de varios scripts, la marca vale para los
 *  que nombra la misma frase; si no nombra a ninguno, para todos. */
function vetoCline(nombre, fila) {
  if (/^migrar-/.test(nombre)) return "es una migración de datos (ORDEN.md §4: escribe con --apply)";
  if (/^fase10-/.test(nombre)) return "es rendimiento contra producción (ORDEN.md §4: fase10-*)";
  const marca = (s) =>
    (s.match(/\b(ESCRIBE|CARGA|DESTRUCTIVO)\b/) ?? [])[1] ?? (/no ejecutar desde Cline/i.test(s) ? "«no ejecutar desde Cline»" : null);
  const celdas = fila.split("|").slice(1, -1);
  const delGrupo = [...(celdas[0] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const resto = celdas.slice(1).join("|");
  if (delGrupo.length <= 1) {
    const m = marca(resto);
    return m ? `su fila de scripts/README.md lo marca ${m}` : null;
  }
  const nombra = (frase, s) => frase.includes(`\`${s}\``) || frase.includes(`\`${s.replace(/\.m?js$/, "")}\``);
  for (const frase of resto.split(/\.\s+/)) {
    const m = marca(frase);
    if (!m) continue;
    const nombrados = delGrupo.filter((s) => nombra(frase, s));
    if (nombrados.length === 0) return `su fila de scripts/README.md agrupa varios scripts y marca ${m} sin decir a cuál`;
    if (nombrados.includes(nombre)) return `su fila de scripts/README.md lo marca ${m}`;
  }
  return null;
}

// ── 2) Capa y reglas de cada archivo ───────────────────────────────────────
/**
 * A qué capa de ORDEN.md §2 pertenece una ruta, y qué exige esa capa. Los
 * textos son el resumen operativo de la tabla «Quién puede importar a quién».
 */
function capaDe(p) {
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

/**
 * Por qué tocar esta ruta requiere revisión de Claude (`AGENTS.md` §Qué nunca se
 * delega sin revisión). Lista vacía si no la requiere. Un archivo con
 * `@deprecated` o un fallback se marca entero: no se distingue si el cambio
 * toca justo esa parte, y retirarla de paso es lo que la marca evita.
 */
function revisionDe(rel, src) {
  const motivos = [];
  if (/^lib\/auth(\/|$)/.test(rel)) motivos.push("tocar `lib/auth/`");
  if (/^supabase(\/|$)/.test(rel)) motivos.push("decidir el esquema (`supabase/`)");
  if (rel === "scripts/test-orden.mjs") motivos.push("los umbrales de `test-orden.mjs`");
  if (rel === "scripts/verificar-docs.mjs") motivos.push("`TECHO_TOKENS` y la lista del arranque");
  if (/@deprecated/.test(src) || /fallback/i.test(src)) motivos.push("tiene `@deprecated` o un fallback: retirarlo no se delega");
  return motivos;
}

// C9 de test-orden mide `app/` y `lib/` (TypeScript, sin `.d.ts`); el aviso de
// tamaño se da sobre los mismos archivos.
const MIDE_C9 = (rel) => /^(app|lib)\//.test(rel) && /\.tsx?$/.test(rel) && !/\.d\.ts$/.test(rel);

// ── 3) Qué suite cubre cada archivo ────────────────────────────────────────
// Se busca el módulo dentro de las suites: si una lo transpila o lo nombra, es
// la red de seguridad de ese archivo.
//
// El emparejado va CUALIFICADO POR CARPETA a propósito. La primera versión
// buscaba el nombre suelto y `app/actions/escolar.ts` casaba con 35 suites,
// porque la cadena «escolar» está en todas (`lib/escolar/…`). «Corre las 35»
// equivale a «corre todo», que es exactamente lo que este script evita.
const SUITES = fs.readdirSync(path.join(root, "scripts")).filter((f) => /^test-.+\.mjs$/.test(f));
// `test-gen-contexto` nombra rutas reales como ENTRADA de sus casos, no como
// módulos que prueba: contarla por eso la pondría en la red de seguridad de cada
// archivo de sus casos. Sí es la red del generador y del índice que lee.
const SUITE_DEL_GENERADOR = "test-gen-contexto.mjs";
const CUBRE_EL_GENERADOR = ["scripts/gen-contexto.mjs", "docs/00-INDICE.md"];
function suitesDe(p) {
  const sinExt = p.replace(/\.(tsx?|mjs)$/, "");
  const carpeta = sinExt.split("/").slice(-2).join("/"); // «materia/facetas-materia»
  const candidatos = [p, `${sinExt}.js`, `${sinExt}.ts`, `${carpeta}.js`, `"${carpeta}"`, `'${carpeta}'`];
  return SUITES.filter((s) => {
    if (s === SUITE_DEL_GENERADOR) return CUBRE_EL_GENERADOR.includes(p);
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
// `null` si no está: un paquete para Cline sin CONTRATO no se entrega (ver el
// arranque, donde se comprueba y se sale con 1).
function contrato() {
  if (!existe("docs/normativo/CONTRATO-DE-CAMBIO.md")) return null;
  const texto = leer("docs/normativo/CONTRATO-DE-CAMBIO.md");
  const m = texto.match(/```\n(CONTRATO \(obligatorio\):[\s\S]*?)```/);
  return m ? m[1].trimEnd() : null;
}

// ── 6) Fuentes que solo necesita el brief de diagnóstico ───────────────────
// Todas se LEEN. Ninguna se recalcula aquí: si este script volviera a contar
// archivos o a medir reglas tendría su propia versión de cifras que ya tienen
// dueño, y divergirían al primer cambio (R6). Lo mismo que hace gen-estado.

/** Las reglas de `test-orden`, tal y como están AHORA. `null` si no se pudieron
 *  leer: una lista vacía se confundiría con «no hay deuda», y el brief lo
 *  afirmaría. */
function reglasOrden() {
  const deJson = (out) => {
    const r = JSON.parse(out.replace(/^﻿/, "")).reglas;
    return Array.isArray(r) && r.length ? r : null;
  };
  try {
    const out = execFileSync(process.execPath, [path.join(root, "scripts/test-orden.mjs"), "--json"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    return deJson(out);
  } catch (e) {
    // test-orden sale con 1 cuando una regla falla, y ese es justo el caso que
    // hay que enseñar: el JSON de stdout sigue siendo válido.
    const out = e?.stdout;
    if (typeof out === "string" && out.trim().startsWith("{")) {
      try { return deJson(out); } catch { /* nada */ }
    }
    return null;
  }
}
// Una sola ejecución por invocación: la usan el brief (tabla de reglas) y los
// dos agentes (límite de C9 para el aviso de tamaño).
let reglasCache;
const reglasDeOrden = () => (reglasCache === undefined ? (reglasCache = reglasOrden()) : reglasCache);

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
}).map((f) => ({ ...f, revision: revisionDe(f.rel.replace(/\/$/, ""), f.src) }));

// Presupuesto: la fila obligatoria siempre + las que el usuario pidió. Cada
// `--tarea` ya casó con alguna fila (se comprobó al leer los argumentos).
const filasElegidas = [PRESUPUESTO[0], ...PRESUPUESTO.slice(1).filter((f) =>
  tareasPedidas.some((t) => casa(f, t)),
)].filter(Boolean);

// Sugerencias automáticas por lo que se está tocando: no reemplazan la
// elección, la completan — es fácil olvidar que tocar una action obliga a leer
// la matriz de permisos.
const auto = [];
const hay = (re) => fichas.some((f) => re.test(f.rel));
if (hay(/^app\/actions\//) || hay(/^lib\/auth\//)) auto.push("permisos");
// Apariencia: tocar un componente no es cambiar su aspecto. Con `--tarea` el
// prompt ya dijo qué se hace; MATRIZ-UX (43 KB) solo entra si lo pide
// (`--tarea=apariencia`). Sin `--tarea`, se sugiere como antes.
const pideApariencia = tareasPedidas.some((t) => palabras(t).includes("apariencia"));
if (hay(/^app\/components\/|^app\/.*-client\.tsx$/) && (tareasPedidas.length === 0 || pideApariencia)) auto.push("apariencia");
// Ciclo: solo el dominio del ciclo y su SQL. Con `/ciclo|periodo/` en cualquier
// ruta, el nombre de un diagnóstico (`diag-calendario-periodo.mjs`) arrastraba
// el módulo del ciclo a una tarea que solo iba a ejecutar un script.
if (hay(/^lib\/escolar\/ciclo\//) || hay(/^supabase\/.*(ciclo|periodo)/i)) auto.push("ciclo escolar");
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
  // El brief de Claude cierra con la regla del historial; el paquete de Cline
  // la necesita en cuanto una fila le cita un documento de `docs/historial/`.
  const historial = [...new Set(filasElegidas.flatMap((f) => f.docs.filter((d) => d.startsWith("docs/historial/"))))];
  if (historial.length) {
    L.push(`> **Aviso de historial:** ${historial.map((d) => `\`${d}\``).join(", ")} ${historial.length > 1 ? "describen" : "describe"} un momento`);
    L.push("> pasado, no el presente. No lo cargues para saber qué es verdad hoy: para eso, el");
    L.push("> código o un diagnóstico de `scripts/`. Si su fila dice que lo consulta Claude, no lo abras.\n");
  }
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
  const reglas = reglasDeOrden();
  const pnl = panel();
  L.push("## YA ESTÁ MEDIDO — no lo cuentes a mano\n");
  if (reglas === null) {
    L.push("**Reglas: no se pudo leer test-orden.** `node scripts/test-orden.mjs --json` falló");
    L.push("o no devolvió reglas: córrelo a mano antes de apoyarte en ninguna cifra.\n");
  } else {
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
  const deudaViva = (reglas ?? []).filter((r) => r.deuda && r.actual > 0 && r.actual <= r.umbral);
  const fallando = (reglas ?? []).filter((r) => r.actual > r.umbral);
  L.push("## DEUDA DECLARADA ≠ BUG\n");
  if (reglas === null) {
    // Sin las reglas no se sabe nada de la deuda. Afirmar «ninguna arrastra
    // deuda viva» con la lista vacía era un resultado incompleto que parecía
    // completo, que es justo lo que este script no puede entregar.
    L.push("No se sabe: no se pudo leer test-orden. Sin sus reglas no hay forma de");
    L.push("distinguir una deuda declarada de un bug.\n");
  } else if (deudaViva.length) {
    L.push("Estas reglas NO están en 0 por descuido: tienen plan escrito y su umbral");
    L.push("es un trinquete que solo falla si el número **sube**.\n");
    for (const r of deudaViva) L.push(`- **${r.id}** (${r.actual}/${r.umbral}) — ${r.deuda}`);
    L.push("");
    L.push("Aflojar uno de estos umbrales (subirlo) para que el CI pase apaga el guardián;");
    L.push("apretarlo cuando baja la deuda es parte del cambio (`AGENTS.md` §Qué nunca se delega).\n");
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

if (diags.length) {
  L.push("## DIAGNÓSTICO (pasos 1 y 6 del CONTRATO)\n");
  L.push("Su fila de `scripts/README.md` va debajo, tal cual. Si dice ESCRIBE, CARGA o «no");
  L.push("ejecutar desde Cline», no lo corras y repórtalo. Si no, córrelo antes de tocar nada");
  L.push("y otra vez al terminar.\n");
  for (const d of diags) {
    L.push(`- \`node scripts/${d.nombre}\`${d.seccion ? ` — sección «${d.seccion}»` : ""}`);
    L.push(`  > ${d.fila}`);
  }
  L.push("");
}

L.push("## ARCHIVOS EN ALCANCE\n");
L.push("| Archivo | Líneas | Capa | Qué exige esa capa |");
L.push("|---|---|---|---|");
for (const f of fichas) L.push(`| \`${f.rel}\` | ${f.carpeta ? "(carpeta destino)" : f.lineas} | ${f.capa} | ${f.exige} |`);
L.push("");

// Tamaño: C9 es DURA, así que un archivo que la cruza rompe el CI en mitad del
// cambio. Se avisa antes, a menos del 5 % del límite, que se lee de
// `test-orden --json` (C9.limite) para no tener aquí una segunda cifra (R6).
const midenC9 = fichas.filter((f) => !f.carpeta && MIDE_C9(f.rel));
if (midenC9.length) {
  const c9 = (reglasDeOrden() ?? []).find((r) => r.id === "C9");
  const limite = Number.isInteger(c9?.limite) ? c9.limite : null;
  if (limite === null) {
    L.push("**Tamaño (C9): no se pudo leer test-orden** (`node scripts/test-orden.mjs --json`, campo");
    L.push("`limite` de C9): el tamaño de estos archivos no se comprobó.\n");
  } else {
    const cerca = midenC9.filter((f) => limite - f.lineas < limite * 0.05);
    for (const f of cerca) {
      const d = limite - f.lineas;
      const dice = d < 0 ? `ya supera el límite de C9 (${limite})` : `a ${d} línea${d === 1 ? "" : "s"} del límite de C9 (${limite})`;
      L.push(`⚠️ **Tamaño (C9):** \`${f.rel}\` tiene ${f.lineas} líneas, ${dice}. C9 es una regla DURA: si el`);
      L.push("cambio lo hace crecer, pártelo por responsabilidad; el límite no se sube.");
    }
    if (cerca.length) L.push("");
  }
}

const conRevision = fichas.filter((f) => f.revision.length);
if (conRevision.length) {
  L.push("## REQUIERE REVISIÓN DE CLAUDE\n");
  L.push("Se puede implementar, pero no se acepta sin que Claude revise el cambio.\n");
  for (const f of conRevision) {
    L.push(`- \`${f.rel}\` — requiere revisión de Claude (AGENTS §Qué nunca se delega): ${f.revision.join("; ")}.`);
  }
  L.push("");
}

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

// Solo el nombre: el GLOSARIO ya está en la lectura obligatoria (fila
// «Cualquier cambio»), y pegar aquí sus filas lo cargaba dos veces (hasta 2,6 KB).
if (glosario.length) {
  L.push("## TÉRMINOS — usa estos nombres, no sinónimos\n");
  L.push("Aparecen en los archivos que vas a tocar; definición en `docs/normativo/GLOSARIO.md`.\n");
  L.push(glosario.map((t) => `\`${t.termino}\``).join(" · "));
  L.push("");
}

// ── Cierre: el paquete termina en el CONTRATO; el brief, en los huecos ─────
if (agente === "cline") {
  L.push("## QUÉ NO TOCAR\n");
  L.push("- Nada fuera de la lista de arriba. Un archivo extra hay que justificarlo.");
  L.push("- Legacy y fallbacks se quedan en pie (R8): no se borran «de paso».");
  L.push("- No crear un módulo paralelo a uno que ya cubre el dominio (R6).");
  L.push("- No **aflojar** un umbral de `scripts/test-orden.mjs` (subirlo o pasar una regla DURA a trinquete):");
  L.push("  aflojarlo para que el CI pase apaga el guardián; apretarlo cuando baja la deuda es parte del cambio.\n");

  L.push("```");
  L.push(CONTRATO);
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
if (destinoSalida) {
  fs.writeFileSync(destinoSalida, texto, "utf8");
  const que = agente === "cline" ? "Paquete" : "Brief";
  console.log(`${que} escrito en ${salida} (${texto.split("\n").length} líneas).`);
} else {
  process.stdout.write(texto);
}
