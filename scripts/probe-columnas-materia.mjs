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
const key =
  env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const r = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await r.json();
const defs = spec.definitions ?? spec;

for (const name of [
  "6TO B MECATRONICA CIENCIAS NATURALES",
  "ALUMNOS",
  "1RO A REGISTRO DE CALIFICACIONES FINALES",
  "ETIQUETAS PERSONALES",
]) {
  const t = defs[name];
  console.log(name, "=>", t?.properties ? Object.keys(t.properties).join(", ") : "N/A");
}

// select * limit 1
const tabla = "6TO B MECATRONICA CIENCIAS NATURALES";
const sel = await fetch(
  `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*&limit=1`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
console.log("\nSELECT * sample:", sel.status, await sel.text());
