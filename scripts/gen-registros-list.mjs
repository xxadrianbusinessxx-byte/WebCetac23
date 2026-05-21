import fs from "node:fs";
import path from "node:path";

const src = path.join(import.meta.dirname, "..", "Name_of_archives_excels_CSVs");
const lines = fs.readFileSync(src, "utf8").split("\n");
const registros = [];
let enBoletas = false;

for (const line of lines) {
  const t = line.trim();
  if (t.startsWith("BOLETAS NOMBRES")) {
    enBoletas = true;
    continue;
  }
  if (!enBoletas) continue;
  if (t.startsWith("Name of CSV") || t.startsWith('"CLAVES')) break;
  if (!t) continue;
  const nombre = t.replace(/^["']|["']$/g, "").trim();
  if (nombre.includes("REGISTRO DE CALIFICACIONES")) registros.push(nombre);
}

const out = `/** Generado desde Name_of_archives_excels_CSVs (BOLETAS) — no editar a mano. */
export const REGISTROS_ESCOLAR: readonly string[] = ${JSON.stringify(registros, null, 2)} as const;

export type RegistroEscolar = (typeof REGISTROS_ESCOLAR)[number];
`;

fs.writeFileSync(
  path.join(import.meta.dirname, "..", "lib", "escolar", "registros-list.ts"),
  out,
);
console.log("registros:", registros.length);
