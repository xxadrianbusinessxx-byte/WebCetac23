/**
 * gen-matriz-permisos.mjs — regenera la §5 de docs/sistema/MATRIZ-PERMISOS.md.
 *
 * QUE HACE: escanea `app/actions/**`, extrae cada Server Action con la guardia que
 * aplica hoy, y reescribe SOLO el bloque delimitado por los marcadores
 * <!-- INVENTARIO:INICIO --> / <!-- INVENTARIO:FIN -->.
 *
 * QUE NO TOCA: la §4 (la matriz de roles) ni ninguna otra sección. Esas se editan
 * a mano y son la decisión; esta sección es solo el reflejo del código.
 *
 * Las capacidades ya asignadas se LEEN del propio documento, para no duplicar la
 * fuente de verdad. Una action nueva sale como `SIN ASIGNAR` y hay que decidirla;
 * una action que desapareció del código se reporta al final.
 *
 * QUE ESCRIBE: un archivo del repo. No toca la base de datos.
 *
 * Uso:
 *   npm run gen:matriz
 *   node scripts/gen-matriz-permisos.mjs --check   # no escribe; sale 1 si hay desfase
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = path.join(raiz, "docs", "sistema", "MATRIZ-PERMISOS.md");
const DIR_ACTIONS = path.join(raiz, "app", "actions");
const INICIO = "<!-- INVENTARIO:INICIO -->";
const FIN = "<!-- INVENTARIO:FIN -->";
const soloComprobar = process.argv.includes("--check");

/** Capacidades ya decididas, leídas del propio documento. */
function capacidadesConocidas(doc) {
  const mapa = new Map();
  const re = /^\| `(action\w+)` \| [^|]* \| `?([a-z_]+\.[a-z_]+|SIN ASIGNAR)`? \|/gm;
  for (const m of doc.matchAll(re)) mapa.set(m[1], m[2]);
  return mapa;
}

/** Guardia que aplica hoy una action, leída de su cuerpo. */
function guardiaDe(cuerpo) {
  // PROMPT-2: la guardia ya no es un `rol !==`: es exigir("capacidad"). Si el
  // cuerpo llama a exigir(), la "guardia hoy" ES la capacidad declarada.
  const exig = [...new Set([...cuerpo.matchAll(/exigir\("([a-z_]+\.[a-z_]+)"\)/g)].map((m) => m[1]))].sort();
  if (exig.length) {
    return exig.length === 1 ? `exigir: ${exig[0]}` : `exigir: ${exig.join(" | ")}`;
  }
  const sin = !cuerpo.includes("obtenerSesionPortal");
  const niega = [...new Set([...cuerpo.matchAll(/rol !== "(\w+)"/g)].map((m) => m[1]))].sort();
  const acepta = [...new Set([...cuerpo.matchAll(/rol === "(\w+)"/g)].map((m) => m[1]))].sort();
  const extra = [];
  if (cuerpo.includes("esDirectivo(")) extra.push("esDirectivo");
  if (cuerpo.includes("nivelAccesoProfesor")) extra.push("nivelAccesoProfesor");
  if (cuerpo.includes("resolverAccesoAlumno") || cuerpo.includes("autorizarEscritura")) extra.push("accesoAlumno");

  let g = "";
  if (niega.length) g = "solo " + niega.join("/");
  else if (acepta.length) g = "solo " + acepta.join("/");
  else if (!extra.length) g = sin ? "**SIN SESION**" : "sesion (cualquier rol)";
  if (extra.length) g = (g ? g + " + " : "") + extra.join("+");
  if (sin && !g.includes("SIN SESION")) g += " (delega)";
  return g;
}

const archivos = fs.readdirSync(DIR_ACTIONS).filter((f) => f.endsWith(".ts")).sort();
const encontradas = [];
const porArchivo = new Map();

for (const fn of archivos) {
  const lineas = fs.readFileSync(path.join(DIR_ACTIONS, fn), "utf8").split("\n");
  const filas = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^export async function (action\w+)/.exec(lineas[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lineas.length && !/^export async function action/.test(lineas[j])) j++;
    const cuerpo = lineas.slice(i, j).join("\n");
    filas.push({ nombre: m[1], guardia: guardiaDe(cuerpo), cuerpo });
    encontradas.push(m[1]);
  }
  if (filas.length) porArchivo.set(fn, filas);
}

// Normalizado a LF antes de comparar: el bloque generado se une con saltos LF,
// asi que sobre un archivo con finales CRLF la comparacion nunca coincidiria y
// `--check` daria desfase perpetuo aunque el contenido fuera identico.
const doc = fs.readFileSync(DOC, "utf8").split("\r\n").join("\n");
const conocidas = capacidadesConocidas(doc);

const bloque = [];
bloque.push(`Generado por \`npm run gen:matriz\` — **no editar a mano**. ${encontradas.length} Server Actions.`);
for (const [fn, filas] of porArchivo) {
  bloque.push("", `### \`${fn}\``, "", "| Action | Guardia hoy | Capacidad |", "|---|---|---|");
  for (const { nombre, guardia, cuerpo } of filas) {
    // La capacidad RESULTADO sale de exigir() cuando está presente (PROMPT-2);
    // si no (actions públicas / legacy), se conserva la ya decidida en §5.
    const exigida = [...new Set([...cuerpo.matchAll(/exigir\("([a-z_]+\.[a-z_]+)"\)/g)].map((m) => m[1]))];
    const cap = exigida.length === 1 ? exigida[0] : (conocidas.get(nombre) ?? "SIN ASIGNAR");
    bloque.push(`| \`${nombre}\` | ${guardia} | \`${cap}\` |`);
  }
}

const nuevas = encontradas.filter((a) => !conocidas.has(a));
const desaparecidas = [...conocidas.keys()].filter((a) => !encontradas.includes(a));

if (!doc.includes(INICIO) || !doc.includes(FIN)) {
  console.error(`Faltan los marcadores ${INICIO} / ${FIN} en ${path.relative(raiz, DOC)}.`);
  process.exit(1);
}
const antes = doc.slice(0, doc.indexOf(INICIO) + INICIO.length);
const despues = doc.slice(doc.indexOf(FIN));
const salida = `${antes}\n${bloque.join("\n")}\n\n${despues}`;

const desfasado = salida !== doc;
if (soloComprobar) {
  console.log(desfasado ? "DESFASADO: el inventario no coincide con el código." : "Al día.");
} else if (desfasado) {
  fs.writeFileSync(DOC, salida);
  console.log(`Inventario regenerado: ${encontradas.length} actions en ${porArchivo.size} archivos.`);
} else {
  console.log("Sin cambios.");
}

if (nuevas.length) {
  console.log(`\n⚠ ${nuevas.length} action(es) SIN capacidad asignada — decidirlas en §4:`);
  for (const a of nuevas) console.log("   ", a);
}
if (desaparecidas.length) {
  console.log(`\n⚠ ${desaparecidas.length} action(es) del documento que ya no existen en el código:`);
  for (const a of desaparecidas) console.log("   ", a);
}

process.exit(soloComprobar && desfasado ? 1 : nuevas.length ? 1 : 0);
