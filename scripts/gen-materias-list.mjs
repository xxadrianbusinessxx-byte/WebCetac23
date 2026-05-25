import fs from "node:fs";
import path from "node:path";

const src = path.join(import.meta.dirname, "..", "Name_of_archives_excels_CSVs");
const lines = fs.readFileSync(src, "utf8").split("\n");
const materias = [];
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("Name of") || t.startsWith('"CLAVES')) break;
  if (t === "BOLETAS NOMBRES" || t === "Name of CSV of students") break;
  if (t === "Names of everymatery on school with groups") continue;
  if (!/^\d/.test(t)) continue;
  materias.push(t);
}

const out = `/** Generado desde Name_of_archives_excels_CSVs — no editar a mano. */
export const MATERIAS_ESCOLAR: readonly string[] = ${JSON.stringify(materias, null, 2)} as const;

export type MateriaEscolar = (typeof MATERIAS_ESCOLAR)[number];

export function materiaIdDesdeNombre(nombre: string): string {
  return nombre;
}
`;

fs.writeFileSync(
  path.join(import.meta.dirname, "..", "lib", "escolar", "materias-list.ts"),
  out,
);
console.log("materias:", materias.length);
