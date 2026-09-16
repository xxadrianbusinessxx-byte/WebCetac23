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
//   1. La cabecera "HEAD:" coincide con `git rev-parse --short HEAD`.
//   2. El número de suites declarado coincide con `scripts/test-*.mjs`.
//   3. El archivo no supera su propio límite de líneas.
//
// Uso:  node scripts/verificar-estado-actual.mjs
//       node scripts/verificar-estado-actual.mjs --check   (igual; explícito)
// Sale con código 1 si algo diverge. Pensado para el CI.

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

// --- 1) HEAD declarado vs real -------------------------------------------
let headReal = null;
try {
  headReal = execSync("git rev-parse --short HEAD", { cwd: root })
    .toString()
    .trim();
} catch {
  avisos.push("No se pudo leer el HEAD de git (¿fuera de un repo?); se omite ese check.");
}

// Cuántos commits puede quedarse atrás la cabecera antes de considerarse
// podrida. No es 0 y no puede serlo: exigir igualdad EXACTA hacía este check
// imposible de satisfacer. Escribes el sha X, commiteas, y el HEAD pasa a ser
// Y ≠ X — el propio commit que pone el documento al día lo vuelve a
// desincronizar, y el CI (que corre en cada PR) fallaba siempre.
//
// La intención original se conserva entera: lo que hay que impedir es que la
// cabecera se quede 31 commits atrás, como estaba el 2026-09-16. Por eso se
// exige que el sha declarado sea ANCESTRO del HEAD real —no un commit
// cualquiera ni una rama abandonada— y que la distancia sea corta.
const MAX_COMMITS_ATRAS = 10;

if (headReal) {
  // Acepta "**HEAD:** `abc1234`" y variantes con o sin backticks/negritas.
  const m = texto.match(/HEAD:?\*{0,2}\s*`?([0-9a-f]{7,40})`?/i);
  if (!m) {
    fallos.push(
      `No se encontró una línea "HEAD: <sha>" en ${ARCHIVO}. La cabecera debe declarar sobre qué commit se escribió.`,
    );
  } else if (!headReal.startsWith(m[1]) && !m[1].startsWith(headReal)) {
    const declarado = m[1];
    let esAncestro = false;
    let n = null;
    try {
      execSync(`git merge-base --is-ancestor ${declarado} HEAD`, { cwd: root, stdio: "ignore" });
      esAncestro = true;
      n = Number(execSync(`git rev-list --count ${declarado}..HEAD`, { cwd: root }).toString().trim());
    } catch {
      /* no es ancestro, o el sha declarado ya no existe */
    }

    if (!esAncestro) {
      fallos.push(
        `${ARCHIVO} declara HEAD \`${declarado}\`, que NO es ancestro del HEAD real \`${headReal}\`. ` +
          `O el documento viene de otra rama, o el sha ya no existe.`,
      );
    } else if (n > MAX_COMMITS_ATRAS) {
      fallos.push(
        `${ARCHIVO} declara HEAD \`${declarado}\` y el real es \`${headReal}\`: ${n} commits por detrás ` +
          `(máximo ${MAX_COMMITS_ATRAS}). La cabecera se quedó vieja.`,
      );
    } else if (n > 1) {
      avisos.push(
        `la cabecera va ${n} commits por detrás (\`${declarado}\` → \`${headReal}\`); tolerado hasta ${MAX_COMMITS_ATRAS}.`,
      );
    }
  }
}

// --- 2) Nº de suites declarado vs real ------------------------------------
const suitesReales = fs
  .readdirSync(path.join(root, "scripts"))
  .filter((f) => /^test-.*\.mjs$/.test(f)).length;

const mSuites = texto.match(/\*{0,2}(\d{1,3})\s+suites?\*{0,2}/i);
if (!mSuites) {
  avisos.push(`No se encontró un "<N> suites" en ${ARCHIVO}; se omite ese check.`);
} else if (Number(mSuites[1]) !== suitesReales) {
  fallos.push(
    `${ARCHIVO} declara ${mSuites[1]} suites pero hay ${suitesReales} en scripts/test-*.mjs.`,
  );
}

// --- 3) Su propio límite de tamaño ----------------------------------------
// AVISO, no fallo, MIENTRAS el recorte esté pendiente: al 2026-09-16 el archivo
// tiene ~516 líneas y moverlas a docs/historial/ es cirugía documental con
// criterio (qué es presente y qué es pasado), no un corte mecánico. En cuanto
// ese recorte aterrice, cambiar `avisos.push` por `fallos.push` para que el CI
// lo sostenga como sostiene el HEAD y el nº de suites.
if (lineas.length > LIMITE_LINEAS) {
  avisos.push(
    `${ARCHIVO} tiene ${lineas.length} líneas y su propia regla dice ~${LIMITE_LINEAS}. ` +
      `Lo que sobra es historial y va a docs/historial/ (recorte pendiente).`,
  );
}

// --- Informe ---------------------------------------------------------------
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
