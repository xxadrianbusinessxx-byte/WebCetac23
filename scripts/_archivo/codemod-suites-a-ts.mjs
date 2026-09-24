#!/usr/bin/env node
/**
 * codemod-suites-a-ts.mjs — UN SOLO USO (PROMPT H-bis, 2026-09-23). Ya consumido.
 *
 * QUÉ HACE: convierte las 13 suites que cargaban de `scripts/.tmp-*` (JS CommonJS
 *           compilado por `compilar-suites.mjs`) para que importen el `.ts` de `lib/`
 *           directamente. Es la Parte 3 del PROMPT H-bis para el grupo que seguía
 *           el patrón de `compilar-suites`; las que se transpilaban solas se
 *           convierten a mano, porque cada una lo hacía a su manera.
 *
 * La transformación, y NADA más:
 *   require(path.join(dir, "ciclo/x.js"))  →  await import("../lib/escolar/ciclo/x.ts")
 *   · se borran `import { createRequire }`, `const require = createRequire(…)` y
 *     `const dir = path.join(…".tmp-…")` — que solo existían para eso
 *   · se borran los imports de `path` / `fileURLToPath` SOLO si quedan sin uso
 *
 * Ninguna aserción cambia. El criterio de éxito no es que compile: es que la suite
 * pase con `scripts/.tmp-*` borrada y dé el MISMO resultado que antes.
 *
 * Por qué `await import` y no `require`: ahora el destino es ESM (`.ts` cargado por
 * Node), no el CommonJS que emitía tsc. Todas estas suites son `.mjs`, así que el
 * `await` de nivel superior está disponible — incluido el de `test-ciclo-estado`,
 * cuyo `require` estaba dentro de un bloque `{ }`, no de una función.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..");
const APLICAR = process.argv.includes("--apply");

const SUITES = [
  "activacion-ciclo-f8", "asistencia-contexto", "asistencia-parciales", "atribucion-profesor",
  "calendario-periodo-f5", "ciclo-calendario", "ciclo-estado", "evaluaciones", "inscripciones-f3",
  "justificacion-por-clase", "orden-alumnos", "reparar-tabla-legacy", "roster-validacion",
];

const problemas = [];
let total = 0;

for (const s of SUITES) {
  const rel = `scripts/test-${s}.mjs`;
  const archivo = path.join(root, rel);
  let src = fs.readFileSync(archivo, "utf8");
  const antes = src;

  // 1) Cada carga del .tmp pasa a importar el fuente.
  let n = 0;
  src = src.replace(/require\(path\.join\(dir,\s*"([^"]+)\.js"\)\)/g, (_, sub) => {
    const destino = `lib/escolar/${sub}.ts`;
    if (!fs.existsSync(path.join(root, destino))) problemas.push(`${rel}: ${destino} no existe`);
    n++;
    return `await import("../${destino}")`;
  });

  // 2) El andamio que solo servía para eso.
  src = src.replace(/^import \{ createRequire \} from "node:module";\r?\n/m, "");
  src = src.replace(/^const require = createRequire\(import\.meta\.url\);\r?\n/m, "");
  // `const dir = path.join(…".tmp-…"…);` en una línea o en varias.
  src = src.replace(/^const dir = path\.join\([^;]*?\.tmp-[^;]*?\);\r?\n/ms, "");

  // 3) Imports que se quedaron sin uso. Se cuenta el uso FUERA de su propia línea.
  const sinImport = (texto, re) => texto.split("\n").filter((l) => !re.test(l)).join("\n");
  const rePath = /^import path from "node:path";\r?$/m;
  if (rePath.test(src) && !/\bpath\./.test(sinImport(src, /^import path from/))) {
    src = src.replace(/^import path from "node:path";\r?\n/m, "");
  }
  const reUrl = /^import \{ fileURLToPath \} from "node:url";\r?$/m;
  if (reUrl.test(src) && !/\bfileURLToPath\b/.test(sinImport(src, /^import \{ fileURLToPath \}/))) {
    src = src.replace(/^import \{ fileURLToPath \} from "node:url";\r?\n/m, "");
  }

  // Comprobaciones: no puede quedar ni un require ni un `dir` colgando.
  if (/\brequire\(/.test(src)) problemas.push(`${rel}: queda un require()`);
  if (/\bdir\b/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))) problemas.push(`${rel}: queda una referencia a \`dir\``);
  if (n === 0) problemas.push(`${rel}: no se encontró ninguna carga del .tmp`);

  total += n;
  console.log(`${String(n).padStart(2)} carga(s)  ${rel}`);
  if (APLICAR && src !== antes) fs.writeFileSync(archivo, src);
}

console.log(`\n${APLICAR ? "Aplicado" : "DRY-RUN"}: ${total} cargas en ${SUITES.length} suites.`);
if (problemas.length) {
  console.log(`\nPROBLEMAS (${problemas.length}):`);
  for (const p of problemas) console.log(`  · ${p}`);
  process.exitCode = 1;
}
