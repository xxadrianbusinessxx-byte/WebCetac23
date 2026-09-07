// 7-subdivision-analizar-fotos.mjs — Compara inscripciones ANTES vs DESPUÉS por grupo.
import fs from "node:fs";
import path from "node:path";

function leer(archivo) {
  const txt = fs.readFileSync(path.join(import.meta.dirname, archivo), "utf8");
  const lineas = txt.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
  const rows = [];
  for (let i = 1; i < lineas.length; i++) {
    const p = lineas[i].split(",");
    rows.push({ id: p[0], curp: p[1], grupo_id: p[2], activo: p[3] === "true", created: p[4] });
  }
  return rows;
}

const antes = leer("7-subdivision-inscripciones-antes.csv");
const despues = leer("7-subdivision-inscripciones-despues.csv");

const resumen = (rows, label) => {
  const activas = rows.filter((r) => r.activo);
  const porGrupo = {};
  for (const r of activas) porGrupo[r.grupo_id] = (porGrupo[r.grupo_id] ?? 0) + 1;
  console.log(`${label}: total=${rows.length} · activas=${activas.length} · inactivas=${rows.length - activas.length}`);
  console.log("  Activas por grupo_id:", JSON.stringify(porGrupo));
};
resumen(antes, "\nANTES");
resumen(despues, "DESPUÉS");

// CURPs en DESPUÉS activas que no estaban en ANTES activas → nuevas
const antesActivas = new Set(antes.filter((r) => r.activo).map((r) => r.curp.toUpperCase()));
const despuesActivas = despues.filter((r) => r.activo);
const nuevas = despuesActivas.filter((r) => !antesActivas.has(r.curp.toUpperCase()));
const conservadas = despuesActivas.filter((r) => antesActivas.has(r.curp.toUpperCase()));
console.log("\nActivas nuevas (antes no activas o no existían):", nuevas.length);
console.log("Activas conservadas de antes:", conservadas.length);

// En ANTES activas pero ya no activas en DESPUÉS (desactivadas) → cambios de grupo
const despuesActivasSet = new Set(despuesActivas.map((r) => r.curp.toUpperCase()));
const desactivadas = antes.filter((r) => r.activo && !despuesActivasSet.has(r.curp.toUpperCase()));
console.log("Antes activas que ya NO están activas en DESPUÉS:", desactivadas.length);
