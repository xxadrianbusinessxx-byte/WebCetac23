// Verificación (solo lectura): confirma que la migración 6L quedó bien.
// Cuenta filas, muestra una muestra y verifica el formato del hash.
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
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function get(pathname) {
  const r = await fetch(`${urlBase}/rest/v1/${pathname}`, { headers });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const filas = await get("tutor_credenciales_iniciales?select=*");
console.log("Total filas en tutor_credenciales_iniciales:", filas.length);

const muestra = await get("tutor_credenciales_iniciales?select=tutor_id,curp_alumno,password_hash&limit=3");
console.log("Muestra:");
for (const f of muestra) {
  const okHash = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(f.password_hash ?? "");
  console.log(`  tutor=${f.tutor_id} curp=${f.curp_alumno} hash_formato_ok=${okHash}`);
}

// Tutores que NO tienen ninguna credencial inicial (deberían ser solo los sin hijos).
const tutoresSinCred = await get(
  "tutores?select=id,clave_tutor,debe_cambiar_credenciales&activo=eq.true&debe_cambiar_credenciales=eq.true",
);
console.log("Tutores activos pendientes de cambiar credenciales:", tutoresSinCred.length);
let sinCred = 0;
for (const t of tutoresSinCred) {
  const creds = await get(
    `tutor_credenciales_iniciales?select=tutor_id&tutor_id=eq.${t.id}`,
  );
  if (creds.length === 0) {
    sinCred++;
    console.log(`  SIN credenciales: ${t.clave_tutor}`);
  }
}
console.log(`Tutores sin ninguna credencial inicial (esperado ~3, los sin hijos): ${sinCred}`);
