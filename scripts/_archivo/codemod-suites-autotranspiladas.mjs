#!/usr/bin/env node
/**
 * codemod-suites-autotranspiladas.mjs — UN SOLO USO (PROMPT H-bis, 2026-09-23). Ya consumido.
 *
 * QUÉ HACE: convierte las 7 suites que se transpilaban SOLAS con `ts.transpileModule`
 *           a CommonJS en su propia `scripts/.tmp-*`, para que importen el `.ts` de
 *           `lib/` directamente. Complementa a `codemod-suites-a-ts.mjs`, que hizo las
 *           13 que dependían de `compilar-suites.mjs`.
 *
 * Por qué rompieron con H-bis: `transpileModule` conserva el especificador, así que
 * el CommonJS emitido hacía `require("../tables.ts")` — y en la carpeta temporal
 * solo existía `tables.js`.
 *
 * ── La regla que evita el error fácil ──────────────────────────────────────
 * Cada suite declara su propia tabla `archivos = [[fuente, salida], …]`. Cada
 * `require(path.join(tmp, SALIDA))` se resuelve CONTRA ESA TABLA a su FUENTE, en
 * vez de suponer un prefijo. No es un detalle: `test-rediseno-oceano` carga seis
 * módulos de `lib/navegacion/`, y con un prefijo fijo `lib/escolar/` las seis
 * habrían apuntado a archivos que no existen.
 *
 * Lo que se retira de cada suite, y nada más:
 *   · `import ts from "typescript"` y `createRequire` / `const require`
 *   · la sección de transpilación: desde `const tmp = …".tmp-…"` hasta el cierre del
 *     bucle `for (const [src, out] of archivos)`, tabla incluida
 *   · la limpieza final `try { fs.rmSync(tmp…) }`, si la tiene
 *   · `fs` / `path` / `fileURLToPath` / `__dirname` / `root`, solo si quedan sin uso
 * Ninguna aserción cambia.
 */
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(import.meta.dirname, "..", "..");
const APLICAR = process.argv.includes("--apply");

const SUITES = [
  "columnas-calificaciones", "mapeo-columnas-materia", "materia-avance", "materia-identidad",
  "etiquetas-dinamicas", "importar-etiquetas", "rediseno-oceano",
];

const problemas = [];
let total = 0;

/** Uso de un identificador en el código, ignorando comentarios y su propia declaración. */
function seUsa(src, nombre, declaracion) {
  const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const sinDecl = sinComentarios.split("\n").filter((l) => !declaracion.test(l)).join("\n");
  return new RegExp(`\\b${nombre}\\b`).test(sinDecl);
}

for (const s of SUITES) {
  const rel = `scripts/test-${s}.mjs`;
  const archivo = path.join(raiz, rel);
  let src = fs.readFileSync(archivo, "utf8");
  const antes = src;

  // 1) La tabla fuente → salida de ESTA suite.
  const tabla = new Map();
  for (const m of src.matchAll(/\[\s*"(lib\/[^"]+\.ts)",\s*"([^"]+\.js)"\s*\]/g)) tabla.set(m[2], m[1]);
  if (tabla.size === 0) { problemas.push(`${rel}: sin tabla \`archivos\``); continue; }

  // 2) Cada carga, a su fuente real.
  let n = 0;
  src = src.replace(/require\(path\.join\(tmp,\s*"([^"]+\.js)"\)\)/g, (todo, salida) => {
    const fuente = tabla.get(salida);
    if (!fuente) { problemas.push(`${rel}: "${salida}" no está en su tabla`); return todo; }
    if (!fs.existsSync(path.join(raiz, fuente))) problemas.push(`${rel}: ${fuente} no existe`);
    n++;
    return `await import("../${fuente}")`;
  });

  // 3) La sección de transpilación entera: de `const tmp` al cierre del bucle.
  //    El cierre es el primer `}` en columna 0 tras la cabecera del bucle: el cuerpo
  //    va indentado, así que sus llaves internas no casan.
  const seccion = /^const tmp = path\.join\(__dirname, "\.tmp-[^"]+"\);\r?\n[\s\S]*?^for \(const \[src, out\] of archivos\) \{\r?\n[\s\S]*?^\}\r?\n/m;
  if (!seccion.test(src)) problemas.push(`${rel}: no se encontró la sección de transpilación`);
  src = src.replace(seccion, "");

  // Su cabecera de sección decía «Transpilar los módulos puros a CommonJS temporal»:
  // ahora mentiría, así que pasa a decir lo que hay.
  src = src.replace(
    /^\/\/ 1\) Transpilar[^\n]*$/m,
    "// 1) Módulos bajo prueba: Node carga los `.ts` de lib/ directamente (PROMPT H-bis)",
  );

  // 4) La limpieza final de la carpeta temporal, con su comentario si lo lleva.
  src = src.replace(
    /^(\/\/ Limpieza[^\n]*\r?\n)?try \{\r?\n\s*fs\.rmSync\(tmp[^\n]*\r?\n\} catch \{[\s\S]*?^\}\r?\n/m,
    "",
  );

  // 5) Andamio de carga.
  src = src.replace(/^import ts from "typescript";\r?\n/m, "");
  src = src.replace(/^import \{ createRequire \} from "node:module";\r?\n/m, "");
  src = src.replace(/^const require = createRequire\(import\.meta\.url\);\r?\n/m, "");

  // 6) Lo que se quedó sin uso, en orden inverso de dependencia.
  if (!seUsa(src, "root", /^const root = /)) src = src.replace(/^const root = [^\n]*\r?\n/m, "");
  if (!seUsa(src, "__dirname", /^const __dirname = /)) src = src.replace(/^const __dirname = [^\n]*\r?\n/m, "");
  if (!seUsa(src, "fileURLToPath", /^import \{ fileURLToPath \}/)) src = src.replace(/^import \{ fileURLToPath \} from "node:url";\r?\n/m, "");
  if (!seUsa(src, "path", /^import path from/)) src = src.replace(/^import path from "node:path";\r?\n/m, "");
  if (!seUsa(src, "fs", /^import fs from/)) src = src.replace(/^import fs from "node:fs";\r?\n/m, "");

  // Nada puede quedar colgando.
  if (/\brequire\(/.test(src)) problemas.push(`${rel}: queda un require()`);
  if (seUsa(src, "tmp", /^$/)) problemas.push(`${rel}: queda una referencia a \`tmp\``);
  if (/transpileModule|\bts\./.test(src)) problemas.push(`${rel}: queda transpilación`);

  total += n;
  console.log(`${String(n).padStart(2)} carga(s)  ${rel}   (tabla: ${tabla.size})`);
  if (APLICAR && src !== antes) fs.writeFileSync(archivo, src);
}

console.log(`\n${APLICAR ? "Aplicado" : "DRY-RUN"}: ${total} cargas en ${SUITES.length} suites.`);
if (problemas.length) {
  console.log(`\nPROBLEMAS (${problemas.length}):`);
  for (const p of problemas) console.log(`  · ${p}`);
  process.exitCode = 1;
}
