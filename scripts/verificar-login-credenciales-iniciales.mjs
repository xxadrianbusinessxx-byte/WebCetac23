// Verificación E2E: comprueba que la contraseña inicial (últimos 8 del CURP
// de cada hijo) valida contra el hash almacenado, replicando la lógica de
// `verificarContraseñaTutor` de lib/escolar/tutores.ts.
import fs from "node:fs";
import path from "node:path";
import { scryptSync, timingSafeEqual } from "node:crypto";

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

const KEYLEN = 64;

function verifica(contraseña, hashAlmacenado) {
  const [saltB64, hashB64] = (hashAlmacenado ?? "").split(":");
  if (!saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const esperado = Buffer.from(hashB64, "base64url");
    for (const candidato of [contraseña, contraseña.toUpperCase()]) {
      const calculado = scryptSync(candidato, salt, KEYLEN);
      if (esperado.length === calculado.length && timingSafeEqual(esperado, calculado)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Muestra representativa: 40 filas aleatorias.
const filas = await (async () => {
  const r = await fetch(
    `${urlBase}/rest/v1/tutor_credenciales_iniciales?select=tutor_id,curp_alumno,password_hash&limit=500`,
    { headers },
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
})();

const probadas = filas.sort(() => Math.random() - 0.5).slice(0, 40);
let ok = 0;
for (const f of probadas) {
  const contraseña = f.curp_alumno.slice(-8);
  const valido = verifica(contraseña, f.password_hash);
  if (valido) ok++;
  console.log(`  ${valido ? "OK " : "FAIL"} curp=${f.curp_alumno} → "${contraseña}"`);
}
console.log(`Resultado: ${ok}/${probadas.length} contraseñas iniciales validan correctamente.`);
process.exit(ok === probadas.length ? 0 : 1);
