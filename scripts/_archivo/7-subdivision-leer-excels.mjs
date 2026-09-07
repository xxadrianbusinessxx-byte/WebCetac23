// 7-subdivision-leer-excels.mjs — Muestra estructura de cada Excel de "Alumnos CETAC".
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const carpeta = "C:\\Users\\URINDOWS\\Desktop\\web\\things\\Alumnos CETAC";

const archivos = fs
  .readdirSync(carpeta)
  .filter((f) => /\.(xlsx|xls|csv)$/i.test(f))
  .sort();

for (const archivo of archivos) {
  const ruta = path.join(carpeta, archivo);
  const wb = XLSX.read(fs.readFileSync(ruta), { type: "buffer" });
  console.log("\n=== ARCHIVO:", archivo, "===");
  console.log("Hojas:", wb.SheetNames.join(" | "));
  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const visibles = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
    console.log(`  Hoja "${hoja}" → ${visibles.length} filas visibles`);
    for (const row of visibles.slice(0, 4)) {
      console.log("    |", row.map((c) => String(c).slice(0, 40)).join(" | "));
    }
    if (visibles.length > 4) {
      console.log("    ... (primeras 4 de", visibles.length, ")");
    }
  }
}
