// 7-subdivision-foto-inscripciones.mjs — Exporta todas las inscripciones a CSV (auditoría).
// Uso: node scripts/7-subdivision-foto-inscripciones.mjs <archivo-salida.csv>
import fs from "node:fs";
import path from "node:path";

const salida = process.argv[2] ?? "7-subdivision-inscripciones-antes.csv";
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

const inscripciones = [];
let desde = 0;
const PAGE = 1000;
// eslint-disable-next-line no-constant-condition
while (true) {
  const r = await fetch(
    `${urlBase}/rest/v1/inscripciones_alumno?select=id,curp,grupo_id,activo,created_at,updated_at&order=curp&offset=${desde}&limit=${PAGE}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!Array.isArray(data) || data.length === 0) break;
  inscripciones.push(...data);
  if (data.length < PAGE) break;
  desde += PAGE;
}

const esc = (v) => {
  const s = String(v ?? "");
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lineas = ["id,curp,grupo_id,activo,created_at,updated_at"].concat(
  inscripciones.map((i) =>
    [i.id, i.curp, i.grupo_id, i.activo, i.created_at, i.updated_at].map(esc).join(","),
  ),
);
fs.writeFileSync(salida, "\uFEFF" + lineas.join("\n"), "utf8");
console.log(`Inscripciones exportadas: ${inscripciones.length} → ${salida}`);
