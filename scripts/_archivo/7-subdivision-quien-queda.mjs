// 7-subdivision-quien-queda.mjs — Muestra los alumnos activos en grupos que NO
// tienen Excel de origen (2DO A RH) y su nombre.
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

const [inscripciones, alumnos] = await Promise.all([
  get("inscripciones_alumno", "curp,grupo_id,activo", "&limit=2000"),
  get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO", "&limit=1000"),
]);
const nombrePorCurp = new Map(
  alumnos.map((a) => [a.CURP.toUpperCase(), [a.NOMBRE, a.P_APELLIDO, a.S_APELLIDO].filter(Boolean).join(" ").trim()]),
);

const grupoId2doA = "213748f5-160e-47a8-8bb8-301d0f607773"; // 2DO A RH
const activos2do = inscripciones.filter((i) => i.activo && i.grupo_id === grupoId2doA);
console.log("Activos en 2DO A RH (sin Excel de origen):", activos2do.length);
for (const a of activos2do) {
  console.log(`  ${a.curp}  ${nombrePorCurp.get(a.curp.toUpperCase()) ?? "?"}`);
}
