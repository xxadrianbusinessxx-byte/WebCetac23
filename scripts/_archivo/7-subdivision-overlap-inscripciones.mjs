// 7-subdivision-overlap-inscripciones.mjs — Compara las CURPs del reporte contra
// las inscripciones actuales. Solo lectura.
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return await r.json();
}

// 1) Leer CSV del reporte
const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const filas = [];
for (let i = 1; i < lineas.length; i++) {
  const partes = lineas[i].split(",");
  filas.push({
    archivo: partes[0],
    grado: partes[1],
    grupo: partes[2],
    carrera: partes[3],
    grupoId: partes[4],
    estado: partes[8],
    curp: partes[9],
  });
}
const inscribibles = filas.filter((f) => f.estado !== "SIN_MATCH" && f.curp);
const curpsInscribir = new Set(inscribibles.map((f) => f.curp));
console.log("Filas totales:", filas.length);
console.log("Inscribibles (con CURP):", inscribibles.length);

// 2) Inscripciones actuales + catálogo
const inscripciones = await get("inscripciones_alumno", "curp,grupo_id,activo", "&limit=2000");
const grupos = await get("grupos", "id,grado,nombre,carrera_id", "&limit=500");
const carreras = await get("carreras", "id,clave", "&limit=50");
const carreraPorId = new Map(carreras.map((c) => [c.id, c.clave]));
const grupoPorId = new Map(
  grupos.map((g) => [g.id, `${g.grado} ${g.nombre}${g.carrera_id ? " " + (carreraPorId.get(g.carrera_id) ?? "") : ""}`]),
);
console.log("Inscripciones actuales:", inscripciones.length);

const activas = inscripciones.filter((i) => i.activo);
const porCurpActiva = new Map(activas.map((i) => [i.curp.toUpperCase(), i.grupo_id]));
const curpsActivas = new Set(porCurpActiva.keys());
const solapadas = [...curpsInscribir].filter((c) => curpsActivas.has(c));
console.log("CURP en ambos (ya inscritas activas y en reporte):", solapadas.length);

const nuevas = [...curpsInscribir].filter((c) => !curpsActivas.has(c));
console.log("CURP nuevas (sin inscripción activa):", nuevas.length);

// 3) Para las solapadas: ¿grupo actual == grupo destino?
console.log("\n=== SOLAPADAS: actual vs destino ===");
let mismas = 0;
let diferentes = 0;
for (const curp of solapadas) {
  const fila = inscribibles.find((f) => f.curp === curp);
  const grupoActualId = porCurpActiva.get(curp);
  const grupoActual = grupoPorId.get(grupoActualId) ?? grupoActualId;
  const grupoDestino = fila ? `${fila.grado} ${fila.grupo}${fila.carrera ? " " + fila.carrera : ""}` : "?";
  const coincide = fila && fila.grupoId === grupoActualId;
  if (coincide) mismas++;
  else diferentes++;
  console.log(`  ${curp}  actual=${grupoActual}  destino=${grupoDestino}  ${coincide ? "SIN_CAMBIO" : "**CAMBIO**"}`);
}
console.log(`\nSolapadas con grupo correcto (sin cambio): ${mismas}`);
console.log(`Solapadas con grupo distinto (requieren cambio): ${diferentes}`);
