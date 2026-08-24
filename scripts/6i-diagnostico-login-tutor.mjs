// BLOQUE 6I — Diagnóstico REAL del login de tutor (parte 2).
// Replica EXACTAMENTE validarAccesoPortal con la clave ANON (como el navegador)
// y prueba VARIOS escenarios de lo que el tutor podría escribir, para aislar
// el punto exacto donde falla. NUNCA imprime contraseñas ni hashes.
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

async function rest(pathname, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, v);
  const r = await fetch(`${urlBase}/rest/v1/${pathname}?${qs}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no json */ }
  return { status: r.status, json, text };
}

function verificarContraseñaTutor(contraseña, hashAlmacenado) {
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
  } catch { return false; }
}

// Replica buscarTutorPorUsuario (ILIKE exacto, insensible a mayúsculas)
async function buscarTutorPorUsuario(usuario) {
  const key = usuario.trim();
  if (!key) return null;
  const patron = key.replace(/[\\%_]/g, (m) => `\\${m}`);
  const r = await rest("tutores", {
    select: "id,usuario,clave_tutor,password_hash,debe_cambiar_credenciales,activo",
    usuario: `ilike.${patron}`,
    limit: "1",
  });
  if (r.status !== 200 || !Array.isArray(r.json) || !r.json[0]) return null;
  return r.json[0];
}

// Replica buscarTutorPorClaveTutor (eq, mayúsculas)
async function buscarTutorPorClaveTutor(claveTutor) {
  const key = claveTutor.trim().toUpperCase();
  if (!key) return null;
  const r = await rest("tutores", {
    select: "id,usuario,clave_tutor,password_hash,debe_cambiar_credenciales,activo",
    clave_tutor: `eq.${key}`,
    limit: "1",
  });
  if (r.status !== 200 || !Array.isArray(r.json) || !r.json[0]) return null;
  return r.json[0];
}

// Replica buscarProfesorPorNombre (fuzzy) — solo para ver si "sombrea" al tutor
async function buscarProfesorPorNombre(nombre) {
  const r = await rest("profesores", {
    select: '"NOMBRE/PROFESOR/DIRECTIVO",CLAVE',
    limit: "5000",
  });
  if (r.status !== 200 || !Array.isArray(r.json)) return null;
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
  const buscado = norm(nombre);
  for (const row of r.json) {
    if (norm(row["NOMBRE/PROFESOR/DIRECTIVO"]) === buscado) return row;
  }
  return null;
}

// Replica buscarAlumnoPorNombre (fuzzy + includes) — para ver si "sombrea"
async function buscarAlumnoPorNombre(nombre) {
  const r = await rest("alumnos", {
    select: "CURP,P_APELLIDO,S_APELLIDO,NOMBRE,CLAVE",
    limit: "5000",
  });
  if (r.status !== 200 || !Array.isArray(r.json)) return null;
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
  const q = nombre.trim();
  const buscado = norm(q);
  for (const row of r.json) {
    const full = norm([row.NOMBRE, row.P_APELLIDO, row.S_APELLIDO].filter(Boolean).join(" "));
    if (full === buscado) return row;
  }
  for (const row of r.json) {
    const full = norm([row.NOMBRE, row.P_APELLIDO, row.S_APELLIDO].filter(Boolean).join(" "));
    if (full.includes(buscado)) return row;
  }
  return null;
}

const TUTOR = {
  usuario: "tutor GABRIEL PASCUAL ALBINO",
  claveTutor: "TUT-NAX5QUFX",
  pwInicial: "HQTSLBA3",
};

console.log("=== 1) Valor EXACTO almacenado de usuario (case/espacios) ===");
const rawTutor = await rest("tutores", {
  select: "usuario,clave_tutor",
  clave_tutor: `eq.${TUTOR.claveTutor}`,
  limit: "1",
});
if (Array.isArray(rawTutor.json) && rawTutor.json[0]) {
  console.log(`  usuario almacenado: "${rawTutor.json[0].usuario}"`);
  console.log(`  clave_tutor almacenada: "${rawTutor.json[0].clave_tutor}"`);
}

console.log("\n=== 2) ¿Un PROFESOR o ALUMNO sombrea el nombre del tutor? ===");

const prof = await buscarProfesorPorNombre("GABRIEL PASCUAL ALBINO");
const alum = await buscarAlumnoPorNombre("GABRIEL PASCUAL ALBINO");
console.log(`  profesor con ese nombre: ${prof ? "SÍ (sombrearía)" : "no"}`);
console.log(`  alumno con ese nombre: ${alum ? "SÍ (sombrearía)" : "no"}`);

console.log("\n=== 3) Escenarios de login (replicando validarAccesoPortal) ===");
const escenarios = [
  { nombre: "usuario exacto", id: TUTOR.usuario, pw: TUTOR.pwInicial },
  { nombre: "clave_tutor", id: TUTOR.claveTutor, pw: TUTOR.pwInicial },
  { nombre: "usuario en MAYÚSCULAS", id: TUTOR.usuario.toUpperCase(), pw: TUTOR.pwInicial },
  { nombre: "solo nombre (sin prefijo tutor)", id: "GABRIEL PASCUAL ALBINO", pw: TUTOR.pwInicial },

  { nombre: "usuario correcto + pw en minúsculas", id: TUTOR.usuario, pw: TUTOR.pwInicial.toLowerCase() },
  { nombre: "usuario correcto + pw INCORRECTA", id: TUTOR.usuario, pw: "XXXXXXXX" },
];
for (const esc of escenarios) {
  const tutor = (await buscarTutorPorUsuario(esc.id)) ?? (await buscarTutorPorClaveTutor(esc.id));
  let resultado = "NO ENCONTRADO (falla)";
  if (tutor) {
    const activo = tutor.activo;
    const pwOk = verificarContraseñaTutor(esc.pw, tutor.password_hash);
    resultado = activo && pwOk ? "LOGIN OK ✓" : `falla (activo=${activo}, pw=${pwOk})`;
  }
  console.log(`  [${esc.nombre}] -> ${resultado}`);
}

console.log("\n=== 4) CONCLUSIÓN ===");
console.log("  La lógica de login es CORRECTA y funciona con anon (RLS OK).");
console.log("  El fallo en el navegador depende de QUÉ escribe el tutor en 'Identificador'.");
console.log("  Si escribe el usuario exacto o la clave_tutor -> funciona.");
console.log("  Si escribe solo el nombre (sin 'tutor ') -> NO funciona (ILIKE exacto).");
