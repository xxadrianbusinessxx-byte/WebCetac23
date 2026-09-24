#!/usr/bin/env node
/**
 * codemod-cabeceras-suites.mjs — UN SOLO USO (PROMPT H-bis, 2026-09-23). Ya consumido.
 *
 * Las suites convertidas seguían explicando en su cabecera cómo compilarlas:
 *
 *   Compilar (tras cambios en lib/…):
 *     npx tsc lib/… ^
 *       --outDir scripts/.tmp-… --module commonjs ^
 *     node scripts/test-….mjs
 *
 * Documentación que ahora miente, en el primer sitio que lee quien abre la suite.
 * Se sustituye el bloque «Compilar…» + sus líneas de `npx tsc` por una línea que
 * dice lo que es verdad, y se CONSERVA la línea `node scripts/test-….mjs`.
 * Funciona igual con comentarios `//` que con `/* * … *​/`.
 */
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(import.meta.dirname, "..", "..");
const APLICAR = process.argv.includes("--apply");

// Prefijo de comentario (`//` o ` *`), la línea «Compilar…:», y las líneas de
// continuación del comando hasta —sin incluir— la línea `node scripts/…`.
const BLOQUE = /^([ \t]*(?:\/\/|\*))[ \t]*Compilar[^\n]*:[ \t]*\r?\n(?:\1[ \t]+(?:npx tsc|--)[^\n]*\r?\n)+/gm;

let total = 0;
for (const f of fs.readdirSync(path.join(raiz, "scripts")).filter((x) => /^test-.*\.mjs$/.test(x))) {
  const rel = `scripts/${f}`;
  const src = fs.readFileSync(path.join(raiz, rel), "utf8");
  let n = 0;
  const nuevo = src.replace(BLOQUE, (_, prefijo) => {
    n++;
    return `${prefijo} Ejecutar (Node carga los .ts de lib/ directamente; no hay paso de compilar):\n`;
  });
  if (n) {
    total += n;
    console.log(`  ${rel}`);
    if (APLICAR) fs.writeFileSync(path.join(raiz, rel), nuevo);
  }
}
console.log(`\n${APLICAR ? "Aplicado" : "DRY-RUN"}: ${total} cabeceras.`);
