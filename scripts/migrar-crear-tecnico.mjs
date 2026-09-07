#!/usr/bin/env node
// migrar-crear-tecnico.mjs — PROMPT-3/T1·T3 (ESCRIBE con --apply).
//
// Crea la cuenta del rol TÉCNICO como una fila NORMAL de PROFESORES
// (Permisos = 'Tecnico'), sin un segundo camino de autenticación (R6).
// Autorizado por el directivo 2026-09-06:
//   - fila nueva con nombre "TECNICO";
//   - clave inicial definida por el agente (se imprime SOLO en el dry-run /
//     primer --apply; el técnico la cambia en el primer acceso porque
//     debe_cambiar_credenciales = true);
//   - hereda la identidad estructural (PROFESORES.ID → profesorId en la
//     sesión), el login por nombre y el cambio forzado de clave (A4).
//
// Idempotente: si ya existe una fila con Permisos = 'Tecnico', no duplica.
// Por defecto SOLO imprime el plan (dry-run). Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-crear-tecnico.mjs
//   node scripts/migrar-crear-tecnico.mjs --apply
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

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

// 1) ¿Ya existe un técnico?
const existentes = await rest(
  'PROFESORES?select="NOMBRE%2FPROFESOR%2FDIRECTIVO",Permisos,ID&Permisos=eq.Tecnico',
);
console.log(`Técnicos existentes: ${existentes.length}`);
for (const t of existentes) {
  console.log(`  ID=${t.ID} nombre=${JSON.stringify(t["NOMBRE/PROFESOR/DIRECTIVO"])}`);
}
if (existentes.length > 0) {
  console.log("Ya hay una cuenta con Permisos='Tecnico'. Nada que hacer (idempotente).");
  process.exit(0);
}

// 2) Clave inicial del técnico (la cambia en el primer acceso).
// ≥ 6 caracteres (CLAVE_PROFESOR_MIN). Se imprime solo aquí.
const CLAVE_TECNICO = "TECNICO26";
console.log(`\nPlan: INSERT en PROFESORES`);
console.log(`  NOMBRE/PROFESOR/DIRECTIVO = "TECNICO"`);
console.log(`  Permisos                  = "Tecnico"`);
console.log(`  CLAVE                     = "${CLAVE_TECNICO}" (inicial; se cambia al primer acceso)`);
console.log(`  debe_cambiar_credenciales = true`);

if (!APPLY) {
  console.log("\nDry-run: no se escribió nada. Pasa --apply para crear la cuenta.");
  process.exit(0);
}

const nuevo = await rest("PROFESORES", {
  method: "POST",
  body: JSON.stringify({
    "NOMBRE/PROFESOR/DIRECTIVO": "TECNICO",
    Permisos: "Tecnico",
    CLAVE: CLAVE_TECNICO,
    debe_cambiar_credenciales: true,
  }),
  headers: { ...H, Prefer: "return=representation" },
});
const fila = Array.isArray(nuevo) ? nuevo[0] : nuevo;
console.log(`\nCreado: ID=${fila?.ID} nombre=${JSON.stringify(fila?.["NOMBRE/PROFESOR/DIRECTIVO"])} Permisos=${JSON.stringify(fila?.Permisos)}`);
