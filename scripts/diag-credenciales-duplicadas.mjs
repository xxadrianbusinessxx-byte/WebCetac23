#!/usr/bin/env node
// diag-credenciales-duplicadas.mjs — PROMPT-5/A1 (solo lectura).
//
// Cuántas credenciales se repiten y entre quiénes, en las tres poblaciones:
//   - PROFESORES: login por NOMBRE + CLAVE; el flag debe_cambiar_credenciales.
//   - ALUMNOS:    login por NOMBRE + CLAVE (clave = últimos 6 del CURP).
//   - tutores:    login por usuario/clave_tutor + password_hash (scrypt).
//
// Para alumnos además comprueba el caso que nadie miró: ¿hay un PAR que
// comparte NOMBRE y CLAVE a la vez? Ese sí sería un agujero real
// (entrar como el otro sin saberlo).
//
// Solo lectura. Uso: node scripts/diag-credenciales-duplicadas.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

const norm = (s) => String(s ?? "").trim().toUpperCase();

// ---------------------------------------------------------------------------
// PROFESORES
// ---------------------------------------------------------------------------
// La columna de identidad de PROFESORES se llama literalmente
// "NOMBRE/PROFESOR/DIRECTIVO" (una sola columna física con barras en el nombre).
const filasProf = await get("PROFESORES", "ID,CLAVE,Permisos,debe_cambiar_credenciales,\"NOMBRE/PROFESOR/DIRECTIVO\"");
console.log(`=== PROFESORES: ${filasProf.length} cuentas ===`);
const porClaveProf = new Map();
const nombreProf = (p) => String(p["NOMBRE/PROFESOR/DIRECTIVO"] ?? "").trim();
for (const p of filasProf) {
  const k = norm(p.CLAVE);
  const lista = porClaveProf.get(k) ?? [];
  lista.push({ ...p, NOMBRE: nombreProf(p) });
  porClaveProf.set(k, lista);
}
const duplicadasProf = [...porClaveProf.values()].filter((l) => l.length > 1);
console.log(`Claves distintas: ${porClaveProf.size} · claves compartidas: ${duplicadasProf.length}`);
for (const grupo of duplicadasProf) {
  console.log(`  CLAVE "${grupo[0].CLAVE}" → ${grupo.map((p) => `${p.NOMBRE} (ID ${p.ID}, ${p.Permisos})`).join(" · ")}`);
}
const marcados = filasProf.filter((p) => p.debe_cambiar_credenciales === true);
console.log(`debe_cambiar_credenciales=true: ${marcados.length} de ${filasProf.length}\n`);

// ---------------------------------------------------------------------------
// ALUMNOS
// ---------------------------------------------------------------------------
const alumnos = await get("ALUMNOS", "CURP,P_APELLIDO,S_APELLIDO,NOMBRE,CLAVE");
console.log(`=== ALUMNOS: ${alumnos.length} ===`);
const porClaveAl = new Map();
const nombreKey = (a) => norm(`${a.P_APELLIDO} ${a.S_APELLIDO} ${a.NOMBRE}`);
for (const a of alumnos) {
  const k = norm(a.CLAVE);
  const lista = porClaveAl.get(k) ?? [];
  lista.push(a);
  porClaveAl.set(k, lista);
}
const duplicadasAl = [...porClaveAl.values()].filter((l) => l.length > 1);
console.log(`Claves distintas: ${porClaveAl.size} · claves compartidas (pares o más): ${duplicadasAl.length}`);
let totalAlEnPares = 0;
for (const grupo of duplicadasAl) {
  totalAlEnPares += grupo.length;
  console.log(`  CLAVE "${grupo[0].CLAVE}" (${grupo.length} alumnos)`);
}
console.log(`Alumnos implicados en claves compartidas: ${totalAlEnPares}`);

// El caso peligroso: mismo NOMBRE + misma CLAVE.
const porNombreYClave = new Map();
for (const a of alumnos) {
  const k = `${nombreKey(a)}|${norm(a.CLAVE)}`;
  const lista = porNombreYClave.get(k) ?? [];
  lista.push(a);
  porNombreYClave.set(k, lista);
}
const paresNombreClave = [...porNombreYClave.values()].filter((l) => l.length > 1);
console.log(`\nPares que comparten NOMBRE y CLAVE a la vez (agujero real): ${paresNombreClave.length}`);
for (const grupo of paresNombreClave) {
  console.log(`  ${nombreKey(grupo[0])} → ${grupo.map((a) => a.CURP).join(" · ")}`);
}
const curpsDuplicados = alumnos.length - new Set(alumnos.map((a) => norm(a.CURP))).size;
console.log(`CURPs duplicados en ALUMNOS: ${curpsDuplicados}\n`);

// ---------------------------------------------------------------------------
// TUTORES
// ---------------------------------------------------------------------------
const tutores = await get("tutores", "id,usuario,clave_tutor,curp,nombre,apellidos,debe_cambiar_credenciales");
console.log(`=== TUTORES: ${tutores.length} ===`);
const porUsuario = new Map();
for (const t of tutores) {
  const k = norm(t.usuario);
  if (!k) continue;
  const lista = porUsuario.get(k) ?? [];
  lista.push(t);
  porUsuario.set(k, lista);
}
const duplicadosUsuario = [...porUsuario.values()].filter((l) => l.length > 1);
console.log(`Usuarios duplicados: ${duplicadosUsuario.length}`);
for (const grupo of duplicadosUsuario) {
  console.log(`  usuario "${grupo[0].usuario}" → ${grupo.map((t) => t.id).join(" · ")}`);
}
const porClaveTutor = new Map();
for (const t of tutores) {
  const k = norm(t.clave_tutor);
  if (!k) continue;
  const lista = porClaveTutor.get(k) ?? [];
  lista.push(t);
  porClaveTutor.set(k, lista);
}
const duplicadosClaveTutor = [...porClaveTutor.values()].filter((l) => l.length > 1);
console.log(`clave_tutor duplicadas: ${duplicadosClaveTutor.length}`);
for (const grupo of duplicadosClaveTutor) {
  console.log(`  clave_tutor "${grupo[0].clave_tutor}" → ${grupo.map((t) => t.id).join(" · ")}`);
}
const tutoresMarcados = tutores.filter((t) => t.debe_cambiar_credenciales === true);
console.log(`tutores debe_cambiar_credenciales=true: ${tutoresMarcados.length} de ${tutores.length}`);

console.log("\nFIN (solo lectura)");

