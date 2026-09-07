// gen-seccion4.mjs — reescribe la tabla de la §4 del MATRIZ-PERMISOS a partir
// de lib/auth/permisos.ts (la matriz IMPLEMENTADA tras PROMPT-3/T5).
// Decisión PROMPT-3/T5 (directivo 2026-09-06): solo directivo se recorta según
// la §4 destino; maestro/tutor/alumno quedan HOY. Este script deja la §4 del
// documento idéntica al código (el test-permisos compara código ⇄ §4).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const tmp = path.join(__dirname, ".tmp-sec4");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

for (const [src, out] of [
  ["lib/auth/types.ts", "types.js"],
  ["lib/auth/capacidades.ts", "capacidades.js"],
  ["lib/auth/permisos.ts", "permisos.js"],
]) {
  const codigo = fs.readFileSync(path.join(root, src), "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: src,
  });
  fs.writeFileSync(path.join(tmp, out), outputText);
}
const { puede } = require(path.join(tmp, "permisos.js"));

const doc = fs.readFileSync(path.join(root, "docs/sistema/MATRIZ-PERMISOS.md"), "utf8").split("\r\n").join("\n");
const ini = doc.indexOf("| Capacidad | Qué habilita | D | M | Tec | T | A |");
const fin = doc.indexOf("### Capacidades que aún no existen");
if (ini < 0 || fin < 0) {
  console.error("No se encontraron los límites de la §4.");
  process.exit(1);
}
const cabecera = doc.slice(0, ini);
const resto = doc.slice(fin);

const ROLES = ["directivo", "maestro", "tecnico", "tutor", "alumno"];
const re = /^\| `([a-z_]+\.[a-z_]+)` \| (.*?) \| .*$/gm;
const filas = [];
filas.push("| Capacidad | Qué habilita | D | M | Tec | T | A |", "|---|---|---|:-:|:-:|:-:|:-:|:-:|");
let m;
while ((m = re.exec(doc.slice(ini, fin)))) {
  const cap = m[1];
  const desc = m[2];
  if (cap === "chat.participar") {
    filas.push(`| ~~\`chat.participar\`~~ | ${desc} | X | X | X | X | X |`);
    continue;
  }
  if (cap === "portada.ver") {
    filas.push(`| \`portada.ver\` | ${desc} | público | público | público | público | público |`);
    continue;
  }
  const celdas = ROLES.map((r) => (puede(r, cap) ? "✅" : "X")).join(" | ");
  filas.push(`| \`${cap}\` | ${desc} | ${celdas} |`);
}

const tabla = `${cabecera}${filas.join("\n")}\n\n`;
fs.writeFileSync(path.join(root, "docs/sistema/MATRIZ-PERMISOS.md"), tabla + resto);
console.log(`§4 regenerada: ${filas.length} filas desde lib/auth/permisos.ts`);
