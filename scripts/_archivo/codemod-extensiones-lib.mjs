#!/usr/bin/env node
/**
 * codemod-extensiones-lib.mjs — UN SOLO USO (PROMPT H-bis, 2026-09-23). Ya consumido.
 *
 * QUÉ HACE: pone la extensión `.ts` a los especificadores relativos de `lib/**` que
 *           no la llevan, para que Node pueda cargar `lib/` sin compilar (el resolver
 *           ESM exige extensión exacta). Cubre `import … from`, `export … from`,
 *           `import type … from` e `import("…")` dinámico.
 * QUÉ ESCRIBE: solo con `--apply`. Sin él, dry-run: lista lo que cambiaría.
 * NO TOCA: nada fuera de `lib/**` · ningún `@/` (lo resuelve el bundler, no Node) ·
 *          nada que ya tenga extensión · nada cuyo `.ts` hermano no exista.
 *
 * Las tres condiciones se comprueban una a una y lo que no las cumpla se REPORTA en
 * vez de tocarse. La medición previa decía 0; cualquier aparición es información.
 *
 * El diff tiene que ser aburrido: solo cambia el texto entre las comillas, que pasa
 * de `../x` a `../x.ts`. Ni comillas, ni orden, ni espaciado.
 *
 * Los `import()` dinámicos no estaban en el recuento del prompt (que contaba
 * `from "…"`) y se incluyen porque el objetivo los necesita: una suite que pase por
 * esa rama fallaría con ERR_MODULE_NOT_FOUND en tiempo de ejecución, no al cargar.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..");
const APLICAR = process.argv.includes("--apply");

function listar(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listar(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// Los dos sitios donde vive un especificador de módulo en este repo: detrás de
// `from` (import/export/import type, en una línea o cerrando un bloque multilínea)
// y dentro de `import(` dinámico. El grupo 2 es el especificador; el 1 y el 3, sus
// comillas, que se conservan tal cual.
const PATRONES = [/(\bfrom\s+)(["'])(\.\.?\/[^"']+)\2/g, /(\bimport\(\s*)(["'])(\.\.?\/[^"']+)\2/g];
const CON_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json)$/;

let cambiados = 0;
let archivos = 0;
const raros = [];

for (const archivo of listar(path.join(root, "lib"))) {
  const src = fs.readFileSync(archivo, "utf8");
  let nuevo = src;
  let n = 0;
  for (const re of PATRONES) {
    nuevo = nuevo.replace(re, (todo, antes, comilla, spec) => {
      if (CON_EXTENSION.test(spec)) return todo;
      const destino = path.resolve(path.dirname(archivo), `${spec}.ts`);
      if (!fs.existsSync(destino)) {
        raros.push(`${path.relative(root, archivo)} → ${spec}`);
        return todo;
      }
      n++;
      return `${antes}${comilla}${spec}.ts${comilla}`;
    });
  }
  if (n > 0) {
    archivos++;
    cambiados += n;
    if (APLICAR) fs.writeFileSync(archivo, nuevo);
  }
}

console.log(`${APLICAR ? "Aplicado" : "DRY-RUN"}: ${cambiados} especificadores en ${archivos} archivos.`);
if (raros.length) {
  console.log(`\nNO se tocaron ${raros.length} (sin extensión y sin .ts hermano) — revisar:`);
  for (const r of raros) console.log(`  · ${r}`);
} else {
  console.log("Ninguno sin resolver: las tres condiciones se cumplen en todos.");
}
if (!APLICAR) console.log("\nPara escribir: node scripts/_archivo/codemod-extensiones-lib.mjs --apply");
