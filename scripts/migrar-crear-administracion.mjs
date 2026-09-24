#!/usr/bin/env node
// migrar-crear-administracion.mjs — rol Administración escolar (ESCRIBE con --apply).
// 2026-09-24.
//
// Crea la cuenta de Administración escolar como una fila NORMAL de PROFESORES
// (Permisos = 'Administracion'), igual que `migrar-crear-tecnico.mjs` creó la del
// técnico: sin un segundo camino de autenticación (R6). Hereda el login por
// nombre, la identidad estructural (PROFESORES.ID → profesorId en la sesión) y el
// cambio forzado de clave en el primer acceso (debe_cambiar_credenciales = true).
//
// La clave inicial NO se escribe en el repo: se pasa con --clave=… o se genera al
// azar, y se imprime una sola vez. Quien entre la cambia al primer acceso.
//
// Idempotente: si ya hay una fila con ese nombre o con Permisos = 'Administracion',
// no duplica. Por defecto SOLO imprime el plan (dry-run). Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-crear-administracion.mjs
//   node scripts/migrar-crear-administracion.mjs --apply
//   node scripts/migrar-crear-administracion.mjs --apply --nombre="ADMINISTRACION ESCOLAR" --clave=…
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const arg = (nombre) => {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3).trim() : "";
};

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
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function rest(pathRuta, opts = {}) {
  const r = await fetch(`${urlBase}/rest/v1/${pathRuta}`, { headers: H, ...opts });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const NOMBRE = arg("nombre") || "ADMINISTRACION ESCOLAR";
// ≥ 6 caracteres (CLAVE_PROFESOR_MIN). Sin letras ni cifras que se confundan
// al dictarla (0/O, 1/I/l).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAVE = arg("clave") || Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
if (CLAVE.length < 6) {
  console.error("La clave inicial debe tener al menos 6 caracteres.");
  process.exit(1);
}

// 1) ¿Ya existe?
const existentes = await rest(
  'PROFESORES?select="NOMBRE%2FPROFESOR%2FDIRECTIVO",Permisos,ID&Permisos=ilike.*administ*',
);
console.log(`Cuentas de Administración escolar existentes: ${existentes.length}`);
for (const t of existentes) {
  console.log(`  ID=${t.ID} nombre=${JSON.stringify(t["NOMBRE/PROFESOR/DIRECTIVO"])}`);
}
const mismoNombre = await rest(
  `PROFESORES?select=ID&${encodeURIComponent('"NOMBRE/PROFESOR/DIRECTIVO"')}=eq.${encodeURIComponent(NOMBRE)}`,
);
if (existentes.length > 0 || mismoNombre.length > 0) {
  console.log("Ya existe una cuenta con ese nombre o ese rol. Nada que hacer (idempotente).");
  process.exit(0);
}

console.log(`\nPlan: INSERT en PROFESORES`);
console.log(`  NOMBRE/PROFESOR/DIRECTIVO = ${JSON.stringify(NOMBRE)}   ← es el identificador para entrar`);
console.log(`  Permisos                  = "Administracion"`);
console.log(`  debe_cambiar_credenciales = true`);

if (!APPLY) {
  console.log("\nDry-run: no se escribió nada. Pasa --apply para crear la cuenta.");
  process.exit(0);
}

const nuevo = await rest("PROFESORES", {
  method: "POST",
  body: JSON.stringify({
    "NOMBRE/PROFESOR/DIRECTIVO": NOMBRE,
    Permisos: "Administracion",
    CLAVE,
    debe_cambiar_credenciales: true,
  }),
  headers: { ...H, Prefer: "return=representation" },
});
const fila = Array.isArray(nuevo) ? nuevo[0] : nuevo;
console.log(`\nCreado: ID=${fila?.ID} nombre=${JSON.stringify(fila?.["NOMBRE/PROFESOR/DIRECTIVO"])} Permisos=${JSON.stringify(fila?.Permisos)}`);
console.log(`Clave inicial (se muestra SOLO ahora; se cambia en el primer acceso): ${CLAVE}`);
