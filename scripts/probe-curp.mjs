// probe-curp.mjs — detalle de las filas de una CURP en el operativo.
// Uso: node scripts/probe-curp.mjs <CURP>
import fs from "node:fs";
import path from "node:path";
const ROOT = path.join(import.meta.dirname, "..");
const curpBuscada = String(process.argv[2] ?? "").trim().toUpperCase();
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
async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}
const filas = await get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at,decision_manual,motivo", `&curp=eq.${encodeURIComponent(curpBuscada)}`);
const grupos = await get("grupos", "id,grado,nombre,carrera_id", "&limit=5000");
const carreras = await get("carreras", "id,clave", "&limit=200");
const claveCarrera = new Map(carreras.map((c) => [c.id, c.clave]));
const nombreGrupo = (id) => {
  const g = grupos.find((x) => x.id === id);
  if (!g) return String(id);
  return `${g.grado} ${g.nombre}${g.carrera_id ? " " + (claveCarrera.get(g.carrera_id) ?? "") : ""}`.trim();
};
console.log(`CURP ${curpBuscada}: ${filas.length} filas\n`);
for (const f of [...filas].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
  console.log(
    `  activo=${f.activo} · manual=${f.decision_manual} · creado=${f.created_at} · grupo=${nombreGrupo(f.grupo_id)}`,
  );
  if (f.motivo) console.log(`    motivo: ${f.motivo}`);
}
