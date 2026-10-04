#!/usr/bin/env node
// migrar-marcar-claves-compartidas-profesores.mjs — PROMPT-5/A1 paso 2
// (ESCRIBE con --apply).
//
// Marca `debe_cambiar_credenciales = true` en los PROFESORES que comparten
// clave con otro (login por nombre + clave; en 2026-09-07 eran 19, en dos grupos de
// 16 y 3). La cuenta del rol técnico (ID 21) tiene clave única → no se toca.
// Salida sensible, también en el dry-run: la clave no se imprime; cada grupo se
// nombra A, B… con su recuento.
//
// NO inventa claves nuevas: cada profesor define la suya al entrar (flujo A4
// de cambio forzado). La marca se puede revertir poniendo el flag en false.
//
// Por defecto SOLO imprime el plan (dry-run). Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-marcar-claves-compartidas-profesores.mjs
//   node scripts/migrar-marcar-claves-compartidas-profesores.mjs --apply
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

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

const norm = (s) => String(s ?? "").trim().toUpperCase();

const filas = await get(
  "PROFESORES",
  "ID,CLAVE,Permisos,debe_cambiar_credenciales,\"NOMBRE/PROFESOR/DIRECTIVO\"",
);
const nombreProf = (p) => String(p["NOMBRE/PROFESOR/DIRECTIVO"] ?? "").trim();

const porClave = new Map();
for (const p of filas) {
  const k = norm(p.CLAVE);
  if (!k) continue;
  const lista = porClave.get(k) ?? [];
  lista.push(p);
  porClave.set(k, lista);
}

// Profesores con clave COMPARTIDA y que aún no están marcados.
// Cada grupo de clave compartida lleva una etiqueta OPACA por orden de aparición
// (A, B…) y su recuento: la clave no se imprime, ni nada calculado con ella.
const etiqueta = (i) => (i >= 26 ? etiqueta(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const aMarcar = [];
let grupos = 0;
for (const lista of porClave.values()) {
  if (lista.length < 2) continue;
  const grupo = `${etiqueta(grupos++)} (${lista.length})`;
  for (const p of lista) {
    if (p.debe_cambiar_credenciales !== true) {
      aMarcar.push({ id: p.ID, nombre: nombreProf(p), grupo, permisos: p.Permisos });
    }
  }
}

console.log(`Profesores con clave compartida sin marcar: ${aMarcar.length}`);
for (const p of aMarcar) {
  console.log(`  ID ${p.id} · ${p.nombre} · Permisos=${p.permisos} · CLAVE [oculta] · grupo ${p.grupo}`);
}

// La del técnico (ID 21) es única → nunca entra en aMarcar. Se verifica igual.
const tecnico = filas.find((p) => String(p.ID) === "21");
if (tecnico) {
  const comparte = (porClave.get(norm(tecnico.CLAVE)) ?? []).length > 1;
  console.log(`\nCuenta técnica ID 21: clave única = ${!comparte} (no se toca).`);
}

if (!APPLY) {
  console.log("\nDry-run: no se escribió nada. Pasa --apply para marcar.");
  process.exitCode = 0;
} else {
  let okAplicadas = 0;
  for (const p of aMarcar) {
    const r = await fetch(
      `${urlBase}/rest/v1/PROFESORES?ID=eq.${encodeURIComponent(p.id)}`,
      { method: "PATCH", headers: H, body: JSON.stringify({ debe_cambiar_credenciales: true }) },
    );
    if (!r.ok) throw new Error(`PATCH ID ${p.id}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    okAplicadas++;
  }
  console.log(`\nMarcados ${okAplicadas} profesores con debe_cambiar_credenciales=true.`);
  process.exitCode = 0;
}
