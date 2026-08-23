// Diagnóstico del login de TUTOR (Bloque 6E) — FASE 2: verificación de contraseña.
// Verifica contra Supabase REAL si la contraseña inicial (últimos 8 del CURP del
// alumno vinculado) coincide con el password_hash almacenado.
// Solo lectura. NO modifica nada. NO expone contraseñas.
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

async function rest(pathname, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, v);
  const r = await fetch(`${urlBase}/rest/v1/${pathname}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${pathname} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// Reproduce verificarContraseñaTutor (scrypt, salt:hash base64url).
function verificar(contraseña, hashAlmacenado) {
  if (!hashAlmacenado) return false;
  const [saltB64, hashB64] = hashAlmacenado.split(":");
  if (!saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const esperado = Buffer.from(hashB64, "base64url");
    for (const candidato of [contraseña, contraseña.toUpperCase()]) {
      const calculado = scryptSync(candidato, salt, 64);
      if (esperado.length === calculado.length && timingSafeEqual(esperado, calculado)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Contraseña inicial = últimos 8 del CURP.
function contraseñaInicial(curp) {
  const c = (curp ?? "").trim().toUpperCase();
  return c ? c.slice(-8) : "";
}

// 1) Traer tutores con hash.
const tutores = await rest("tutores", { select: "id,usuario,clave_tutor,password_hash,activo" });

// 2) Traer relaciones tutor_alumnos (activas) para obtener el CURP del alumno.
const relaciones = await rest("tutor_alumnos", { select: "tutor_id,curp_alumno,activo" });
const curpPorTutor = new Map();
for (const r of relaciones) {
  if (!r.activo) continue;
  if (!curpPorTutor.has(r.tutor_id)) curpPorTutor.set(r.tutor_id, r.curp_alumno);
}

let verifican = 0;
let noVerifican = 0;
let sinAlumno = 0;
const fallos = [];

for (const t of tutores) {
  if (!t.activo) continue;
  const curp = curpPorTutor.get(t.id);
  if (!curp) {
    sinAlumno++;
    continue;
  }
  const pw = contraseñaInicial(curp);
  const ok = verificar(pw, t.password_hash);
  if (ok) verifican++;
  else {
    noVerifican++;
    fallos.push({ usuario: t.usuario, clave: t.clave_tutor, curp });
  }
}

console.log(`\nTOTAL TUTORES ACTIVOS: ${tutores.filter((t) => t.activo).length}`);
console.log(`Con alumno vinculado: ${verifican + noVerifican}`);
console.log(`Sin alumno vinculado (no se puede derivar contraseña): ${sinAlumno}`);
console.log(`\n>>> Contraseña inicial VERIFICA correctamente: ${verifican}`);
console.log(`>>> Contraseña inicial NO verifica: ${noVerifican}`);

if (fallos.length > 0) {
  console.log("\n--- EJEMPLOS DE FALLOS (primeros 10) ---");
  for (const f of fallos.slice(0, 10)) {
    console.log(`  usuario="${f.usuario}" | clave=${f.clave} | curpAlumno=${f.curp}`);
  }
}

console.log("\nDIAGNÓSTICO FASE 2 COMPLETO.");
