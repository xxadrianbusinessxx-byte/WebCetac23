// BLOQUE 6J — Verifica la contraseña inicial de un tutor.
// 1) Obtiene el tutor por usuario.
// 2) Obtiene el CURP del alumno de referencia (tutor_alumnos).
// 3) Calcula la contraseña inicial esperada = últimos 8 chars del CURP.
// 4) Verifica el hash almacenado contra esa contraseña (scrypt, mismo criterio
//    que verificarContraseñaTutor: tal cual y en mayúsculas).
// NO imprime el hash completo ni la contraseña en claro salvo confirmación.
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

const USUARIO = process.argv[2] ?? "TUTOR CINTHIA YAMILET HERNANDEZ CERON";

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

// 1) Buscar tutor por usuario
const tutores = await fetch(
  `${urlBase}/rest/v1/tutores?select=id,usuario,clave_tutor,curp,password_hash,debe_cambiar_credenciales,activo&usuario=ilike.${encodeURIComponent(USUARIO)}`,
  { headers },
).then((r) => r.json());

if (!Array.isArray(tutores) || tutores.length === 0) {
  console.log(`No se encontró tutor con usuario="${USUARIO}"`);
  process.exit(1);
}
const tutor = tutores[0];
console.log(`Tutor: id=${tutor.id.slice(0, 8)} | usuario="${tutor.usuario}" | clave="${tutor.clave_tutor}"`);
console.log(`  activo=${tutor.activo} | debe_cambiar=${tutor.debe_cambiar_credenciales} | curp_tutor=${tutor.curp ?? "(null)"}`);
console.log(`  password_hash presente: ${tutor.password_hash ? "SÍ" : "NO"}`);

// 2) Obtener CURP del alumno de referencia (tutor_alumnos)
const rels = await fetch(
  `${urlBase}/rest/v1/tutor_alumnos?select=curp_alumno,tipo_relacion,activo&tutor_id=eq.${tutor.id}&order=created_at.asc`,
  { headers },
).then((r) => r.json());

console.log(`  Relaciones tutor_alumnos: ${Array.isArray(rels) ? rels.length : "?"}`);
const principal = Array.isArray(rels) ? rels.find((r) => r.tipo_relacion === "principal") : null;
const ref = principal ?? (Array.isArray(rels) ? rels[0] : null);
if (!ref) {
  console.log("  No hay alumno de referencia → no se puede derivar la contraseña inicial.");
  process.exit(1);
}
console.log(`  Alumno de referencia: curp="${ref.curp_alumno}" | tipo=${ref.tipo_relacion} | activo=${ref.activo}`);

// 3) Contraseña inicial esperada = últimos 8 chars del CURP
const curp = ref.curp_alumno.trim().toUpperCase();
const inicial = curp.slice(-8);
console.log(`  Contraseña inicial esperada (últimos 8 del CURP): "${inicial}" (${inicial.length} chars)`);

// 4) Verificar hash
const ok = verificar(inicial, tutor.password_hash);
console.log(`  ¿El hash almacenado coincide con la contraseña inicial? ${ok ? "SÍ ✅" : "NO ❌"}`);

// Probar también la clave_tutor y el usuario como posibles contraseñas (diagnóstico)
for (const cand of [tutor.clave_tutor, tutor.usuario]) {
  if (cand && verificar(cand, tutor.password_hash)) {
    console.log(`  ⚠️ El hash coincide con el valor "${cand}" (clave_tutor o usuario).`);
  }
}
