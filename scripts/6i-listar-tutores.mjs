// BLOQUE 6I — Lista todos los tutores activos (usuario, clave_tutor, activo,
// debe_cambiar_credenciales, si tiene password_hash) para entender el patrón
// de datos. NO imprime contraseñas ni hashes.
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const r = await fetch(`${urlBase}/rest/v1/tutores?select=id,usuario,clave_tutor,activo,debe_cambiar_credenciales,password_hash&order=created_at.asc`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
});
const json = await r.json();
console.log(`status: ${r.status}, tutores: ${Array.isArray(json) ? json.length : "?"}`);
if (Array.isArray(json)) {
  for (const t of json) {
    console.log(`  id=${t.id.slice(0,8)} | usuario="${t.usuario}" | clave="${t.clave_tutor}" | activo=${t.activo} | debeCambiar=${t.debe_cambiar_credenciales} | hash=${t.password_hash ? "SÍ" : "NO"}`);
  }
}
