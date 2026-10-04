// verificar-estado-actual.mjs — VERIFICACIÓN (SOLO LECTURA, sin red)
//
// ESTADO-ACTUAL.md declara "qué es verdad hoy" y su propia regla dice que se
// actualiza en el mismo cambio que lo vuelve falso. Nada lo verificaba, así que
// se degradó solo: al 2026-09-16 su cabecera apuntaba a un HEAD 31 commits
// atrás, decía 34 suites cuando había 36, y tenía 517 líneas con una regla de
// ~150.
//
// Este script aplica el mismo patrón que `gen:matriz -- --check`, que SÍ evitó
// que la §4 de permisos se desincronizara: comparar el documento contra la
// realidad y fallar si divergen.
//
// Comprueba, sin tocar la red ni la base:
//   1. El archivo no lleva más de 10 commits sin tocarse (`git log -1 -- ESTADO-ACTUAL.md`).
//   2. El número de suites declarado coincide con `scripts/test-*.mjs`.
//   3. El archivo no supera su propio límite de líneas.
//
// Uso:  node scripts/verificar-estado-actual.mjs
//       node scripts/verificar-estado-actual.mjs --check   (igual; explícito)
//       node scripts/verificar-estado-actual.mjs --json    (para gen-estado.mjs)
// Sale con código 1 si algo diverge. Pensado para el CI.
//
// `--json` existe por el mismo motivo que en `test-orden.mjs`: que el panel lea
// estas tres medidas en vez de volver a calcularlas. Si el panel las midiera
// habría dos fuentes para la misma verdad (R6) y divergirían.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const ARCHIVO = "ESTADO-ACTUAL.md";
const LIMITE_LINEAS = 150;

const ruta = path.join(root, ARCHIVO);
if (!fs.existsSync(ruta)) {
  console.error(`ERROR: no existe ${ARCHIVO}.`);
  process.exit(1);
}
const texto = fs.readFileSync(ruta, "utf8");
const lineas = texto.split(/\r?\n/);

const fallos = [];
const avisos = [];

const JSON_OUT = process.argv.includes("--json");
/** Lo que este script mide, en crudo. Se rellena por el camino. */
const datos = {
  headReal: null,
  headDeclarado: null,
  commitsAtras: null,
  suitesReales: 0,
  suitesDeclaradas: null,
  lineas: lineas.length,
  limiteLineas: LIMITE_LINEAS,
  maxCommitsAtras: null,
};

// --- 1) Commits desde la última edición del documento ---------------------
let headReal = null;
try {
  headReal = execSync("git rev-parse --short HEAD", { cwd: root })
    .toString()
    .trim();
} catch {
  avisos.push("No se pudo leer el HEAD de git (¿fuera de un repo?); se omite ese check.");
}

// Cuántos commits puede pasar el documento sin que nadie lo toque antes de
// considerarse podrido. Hasta el PROMPT V (2026-10-04) se medía contra una
// cabecera «HEAD: <sha>» escrita a mano, y esa cabecera era una cifra copiada
// de git: el propio commit que la ponía al día la dejaba vieja. Ahora la
// referencia es el último commit que tocó el archivo
// (`git log -1 --format=%H -- ESTADO-ACTUAL.md`), que no se escribe a mano.
//
// La intención original se conserva entera: lo que hay que impedir es que el
// documento se quede 31 commits atrás, como estaba el 2026-09-16. Misma
// tolerancia que antes: aviso por encima de 1, fallo por encima de 10.
const MAX_COMMITS_ATRAS = 10;
datos.headReal = headReal;
datos.maxCommitsAtras = MAX_COMMITS_ATRAS;

if (headReal) {
  let ultimaEdicion = "";
  let n = null;
  try {
    ultimaEdicion = execSync(`git log -1 --format=%H -- ${ARCHIVO}`, { cwd: root }).toString().trim();
    if (ultimaEdicion) {
      n = Number(execSync(`git rev-list --count ${ultimaEdicion}..HEAD`, { cwd: root }).toString().trim());
    }
  } catch {
    /* git no responde: se informa abajo como «no se sabe» */
  }
  // `headDeclarado` conserva su nombre porque lo lee `gen-estado.mjs`: ahora es
  // el sha de la última edición, no una cabecera escrita a mano.
  datos.headDeclarado = ultimaEdicion || null;
  datos.commitsAtras = Number.isFinite(n) ? n : null;

  if (datos.commitsAtras === null) {
    fallos.push(
      `git no da el último commit que tocó ${ARCHIVO} (\`git log -1 --format=%H -- ${ARCHIVO}\`): ` +
        `no se puede saber cuántos commits lleva sin revisarse.`,
    );
  } else if (n > MAX_COMMITS_ATRAS) {
    fallos.push(
      `${ARCHIVO} no se toca desde \`${ultimaEdicion.slice(0, 7)}\`: ${n} commits por detrás de \`${headReal}\` ` +
        `(máximo ${MAX_COMMITS_ATRAS}). El documento se quedó viejo.`,
    );
  } else if (n > 1) {
    avisos.push(
      `${ARCHIVO} va ${n} commits por detrás (última edición \`${ultimaEdicion.slice(0, 7)}\` → \`${headReal}\`); tolerado hasta ${MAX_COMMITS_ATRAS}.`,
    );
  }
}

// --- 2) Nº de suites declarado vs real ------------------------------------
const suitesReales = fs
  .readdirSync(path.join(root, "scripts"))
  .filter((f) => /^test-.*\.mjs$/.test(f)).length;

const mSuites = texto.match(/\*{0,2}(\d{1,3})\s+suites?\*{0,2}/i);
datos.suitesReales = suitesReales;
datos.suitesDeclaradas = mSuites ? Number(mSuites[1]) : null;
if (!mSuites) {
  avisos.push(`No se encontró un "<N> suites" en ${ARCHIVO}; se omite ese check.`);
} else if (Number(mSuites[1]) !== suitesReales) {
  fallos.push(
    `${ARCHIVO} declara ${mSuites[1]} suites pero hay ${suitesReales} en scripts/test-*.mjs.`,
  );
}

// --- 3) Su propio límite de tamaño ----------------------------------------
// FALLO desde el PROMPT F (2026-09-16): el recorte aterrizó (270 → 148 líneas),
// así que el límite deja de ser un aviso y pasa a sostenerlo el CI, igual que el
// HEAD y el nº de suites. Lo que se pase de ~150 es historial y va a
// `docs/historial/`.
if (lineas.length > LIMITE_LINEAS) {
  fallos.push(
    `${ARCHIVO} tiene ${lineas.length} líneas y su propia regla dice ~${LIMITE_LINEAS}. ` +
      `Lo que sobra es historial y va a docs/historial/.`,
  );
}

// --- Informe ---------------------------------------------------------------
if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({ medido: new Date().toISOString(), ...datos, fallos, avisos }, null, 2) + "\n",
  );
  process.exit(fallos.length === 0 ? 0 : 1);
}

console.log(`Verificación de ${ARCHIVO}`);
console.log(`  HEAD real        : ${headReal ?? "(desconocido)"}`);
console.log(`  suites reales    : ${suitesReales}`);
console.log(`  líneas           : ${lineas.length} (límite ~${LIMITE_LINEAS})`);

for (const a of avisos) console.log(`  aviso: ${a}`);

if (fallos.length === 0) {
  console.log("\nOK: el documento está al día.");
  process.exit(0);
}

console.error(`\nDESINCRONIZADO (${fallos.length}):`);
for (const f of fallos) console.error(`  · ${f}`);
console.error(
  `\nRegla de ${ARCHIVO}: se actualiza en el MISMO cambio que lo vuelve falso.`,
);
process.exit(1);
