#!/usr/bin/env node
/**
 * correr-todas-las-suites.mjs — PROMPT-5/B6 (D2). Ejecuta TODAS las suites
 * `test-*.mjs` de scripts/ en orden alfabético y falla con código 1 si alguna
 * falla. Pensado para CI: NO toca la base (las suites son puras o leen solo
 * el filesystem; los `diag-*`/`probe-*` con Supabase NO están aquí).
 *
 * Uso: node scripts/correr-todas-las-suites.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname);
const archivos = fs
  .readdirSync(dir)
  .filter((f) => /^test-.+\.mjs$/.test(f))
  .sort();

if (archivos.length === 0) {
  console.error("No se encontraron suites test-*.mjs.");
  process.exit(1);
}

console.log(`Corriendo ${archivos.length} suites (orden alfabético):\n`);
let fallidas = 0;
for (const f of archivos) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], {
    stdio: "pipe",
    encoding: "utf8",
  });
  const ultima = (r.stdout ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .pop();
  if (r.status === 0) {
    console.log(`  OK  ${f}${ultima ? `  →  ${ultima.trim()}` : ""}`);
  } else {
    fallidas++;
    console.log(`  FALLA ${f} (exit ${r.status})`);
    const err = (r.stderr || r.stdout || "").trim();
    if (err) console.log(`    ${err.split("\n").slice(0, 8).join("\n    ")}`);
  }
}

console.log(`\nResultado: ${archivos.length - fallidas}/${archivos.length} suites en verde`);
if (fallidas > 0) process.exit(1);
