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
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(pathname, opts = {}) {
  const r = await fetch(`${urlBase}/rest/v1/${pathname}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, json };
}

const FECHA = "2026-08-24";
const GRADO = "1RO";
const GRUPO = "A";

console.log("=== VERIFICACIÓN DE CONSTRAINTS ===\n");

// 1) CHECK: clases >= 0 (debe rechazar negativo)
let res = await api("clases_impartidas", {
  method: "POST",
  body: JSON.stringify({ profesor_clave: "TEST-CHECK", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: -1 }),
});
console.log(`CHECK clases>=0 (insertar -1): status ${res.status} ${res.status === 201 ? "❌ NO rechazó" : "✅ rechazado"}`);
if (res.status !== 201) console.log(`  -> ${JSON.stringify(res.json)}`);

// 2) CHECK: asistencia clases_asistidas >= 0 (debe rechazar negativo)
res = await api("asistencia_alumnos", {
  method: "POST",
  body: JSON.stringify({ curp: "TESTCURP", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases_asistidas: -1 }),
});
console.log(`CHECK clases_asistidas>=0 (insertar -1): status ${res.status} ${res.status === 201 ? "❌ NO rechazó" : "✅ rechazado"}`);
if (res.status !== 201) console.log(`  -> ${JSON.stringify(res.json)}`);

// 3) UNIQUE: calendario_escolar (ciclo_escolar, fecha) — duplicado debe rechazarse
await api("calendario_escolar", {
  method: "POST",
  body: JSON.stringify({ ciclo_escolar: "2026-2027", fecha: FECHA, tipo: "clase" }),
});
res = await api("calendario_escolar", {
  method: "POST",
  body: JSON.stringify({ ciclo_escolar: "2026-2027", fecha: FECHA, tipo: "festivo" }),
});
console.log(`UNIQUE calendario (ciclo,fecha) duplicado: status ${res.status} ${res.status === 201 ? "❌ NO rechazó" : "✅ rechazado"}`);
if (res.status !== 201) console.log(`  -> ${JSON.stringify(res.json)}`);

// 4) UNIQUE: clases_impartidas (profesor_clave,grado,grupo,fecha) — duplicado sin on_conflict
await api("clases_impartidas", {
  method: "POST",
  body: JSON.stringify({ profesor_clave: "TEST-UNIQ", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 2 }),
});
res = await api("clases_impartidas", {
  method: "POST",
  body: JSON.stringify({ profesor_clave: "TEST-UNIQ", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases: 5 }),
});
console.log(`UNIQUE clases (prof,grado,grupo,fecha) duplicado: status ${res.status} ${res.status === 201 ? "❌ NO rechazó" : "✅ rechazado"}`);
if (res.status !== 201) console.log(`  -> ${JSON.stringify(res.json)}`);

// 5) UNIQUE: asistencia_alumnos (curp,grado,grupo,fecha) — duplicado sin on_conflict
await api("asistencia_alumnos", {
  method: "POST",
  body: JSON.stringify({ curp: "TESTCURP2", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases_asistidas: 2 }),
});
res = await api("asistencia_alumnos", {
  method: "POST",
  body: JSON.stringify({ curp: "TESTCURP2", grado: GRADO, grupo: GRUPO, fecha: FECHA, clases_asistidas: 5 }),
});
console.log(`UNIQUE asistencia (curp,grado,grupo,fecha) duplicado: status ${res.status} ${res.status === 201 ? "❌ NO rechazó" : "✅ rechazado"}`);
if (res.status !== 201) console.log(`  -> ${JSON.stringify(res.json)}`);

// LIMPIEZA
console.log("\n=== LIMPIEZA ===\n");
await api("clases_impartidas?profesor_clave=like.TEST*", { method: "DELETE" });
await api("asistencia_alumnos?curp=like.TEST*", { method: "DELETE" });
await api("calendario_escolar?ciclo_escolar=eq.2026-2027", { method: "DELETE" });

for (const tabla of ["calendario_escolar", "clases_impartidas", "asistencia_alumnos"]) {
  const { json } = await api(`${tabla}?select=*&limit=1`);
  console.log(`TABLA ${tabla} => filas restantes: ${Array.isArray(json) ? json.length : "?"}`);
}
console.log("\n=== CONSTRAINTS VERIFICADOS ===");
