// 7-subdivision-documento-sin-match.mjs — Genera documento con los alumnos SIN_MATCH
// (no existen en ALUMNOS) para que el directivo los dé de alta después.
import fs from "node:fs";
import path from "node:path";

const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const filas = [];
for (let i = 1; i < lineas.length; i++) {
  const p = lineas[i].split(",");
  filas.push({
    archivo: p[0],
    grado: p[1],
    grupo: p[2],
    carrera: p[3],
    grupoId: p[4],
    excelNombre: p[6],
    grupoCol: p[7],
    estado: p[8],
  });
}
const sinMatch = filas.filter((f) => f.estado === "SIN_MATCH");

const salidaMd = path.join(import.meta.dirname, "7-subdivision-sin-match-pendientes.md");
const salidaCsv = path.join(import.meta.dirname, "7-subdivision-sin-match-pendientes.csv");

const md = [];
md.push("# Alumnos SIN MATCH — no existen en la tabla ALUMNOS");
md.push("");
md.push("Estos 5 alumnos aparecen en los Excel de grupos actuales pero **no tienen CURP en Supabase (tabla ALUMNOS)**. Quedaron **descartados** de la actualización de inscripciones. Para darlos de alta después, se necesitan sus datos (CURP, nombre completo, etc.) en la web.");
md.push("");
md.push("| # | Archivo | Grado | Grupo | Carrera | Nombre (Excel) | Grupo en columna | Estado |");
md.push("|---:|---|---|---|---|---|---|---|");
sinMatch.forEach((f, i) => {
  md.push(`| ${i + 1} | ${f.archivo} | ${f.grado} | ${f.grupo} | ${f.carrera || "—"} | ${f.excelNombre.replace(/[|]/g, "\\|")} | ${f.grupoCol} | SIN_MATCH |`);
});
md.push("");
fs.writeFileSync(salidaMd, md.join("\n"), "utf8");

const csvTxt =
  ["archivo,grado,grupo,carrera,nombre_excel,grupo_columna,estado"]
    .concat(sinMatch.map((f) => [f.archivo, f.grado, f.grupo, f.carrera, `"${f.excelNombre}"`, f.grupoCol, f.estado].join(",")))
    .join("\n");
fs.writeFileSync(salidaCsv, "\uFEFF" + csvTxt, "utf8");

console.log("Pendientes SIN_MATCH:", sinMatch.length);
for (const f of sinMatch) {
  console.log(`  [${f.archivo}] "${f.excelNombre}" [${f.grupoCol}]`);
}
console.log("Documentos generados:");
console.log("  ", salidaMd);
console.log("  ", salidaCsv);
