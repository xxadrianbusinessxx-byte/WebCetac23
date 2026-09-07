// diag-asignaciones-profesor.mjs — estado de asignaciones_profesor (PROMPT-3/T3·A2).
// Mide si la atribución profesor→grupo·materia está poblada (asignacionesActivas)
// y si el DDL C4.11 (columna profesor_id) está aplicado.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}` };

// 1) ¿Existe la columna profesor_id (DDL C4.11)?
const esquema = await fetch(`${urlBase}/rest/v1/asignaciones_profesor?select=profesor_id,id&limit=1`, { headers: H });
const esq = await esquema.json();
console.log("columna profesor_id:", Array.isArray(esq) ? "OK (DDL aplicado)" : JSON.stringify(esq).slice(0, 200));

// 2) Conteo de filas y activas.
const todas = await fetch(`${urlBase}/rest/v1/asignaciones_profesor?select=id,activo,profesor_id,profesor_clave,created_at`, { headers: H });
const filas = await todas.json();
if (Array.isArray(filas)) {
  console.log(`filas totales: ${filas.length} · activas: ${filas.filter((f) => f.activo).length}`);
  const muestra = filas.slice(0, 5);
  for (const f of muestra) {
    console.log(`  id=${f.id} activo=${f.activo} profesor_id=${f.profesor_id ?? "-"} creado=${f.created_at ?? "-"}`);
  }
} else {
  console.log("ERROR lectura:", JSON.stringify(filas).slice(0, 200));
}
