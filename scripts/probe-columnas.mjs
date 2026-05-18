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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const hdr = { apikey: key, Authorization: `Bearer ${key}` };

async function cols(tabla) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*&limit=1`, { headers: hdr });
  const body = await r.json();
  if (Array.isArray(body) && body[0]) return Object.keys(body[0]);
  if (Array.isArray(body)) return "(vacía, sin inferir columnas)";
  return `ERR ${r.status}: ${JSON.stringify(body)}`;
}

for (const t of [
  "1RO A CONCIENCIA HISTORICA",
  "ETIQUETAS (STATUS)",
  "COMENTARIOS",
  "COMENTARIOS PROFESORES",
]) {
  console.log(t, "=>", await cols(t));
}
