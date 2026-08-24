// BLOQUE 6K — Verifica la clave_tutor real de tutores específicos y detecta
// duplicados de usuario. El usuario reporta que la clave_tutor que mostramos
// no coincide con la que ve en Supabase. Este script consulta la tabla real
// vía REST y muestra TODOS los campos relevantes, además de buscar duplicados.
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
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

const BUSQUEDAS = process.argv.slice(2);
const terminos = BUSQUEDAS.length ? BUSQUEDAS : ["CINTHIA YAMILET HERNANDEZ CERON", "BRENDA OLGUIN CASTRO"];

for (const termino of terminos) {
  console.log(`\n=== Búsqueda: "${termino}" ===`);
  const r = await fetch(
    `${urlBase}/rest/v1/tutores?select=id,usuario,clave_tutor,activo,debe_cambiar_credenciales,created_at&usuario=ilike.${encodeURIComponent(`%${termino}%`)}&order=created_at.asc`,
    { headers },
  );
  const json = await r.json();
  console.log(`status: ${r.status}, resultados: ${Array.isArray(json) ? json.length : "?"}`);
  if (Array.isArray(json)) {
    for (const t of json) {
      console.log(`  id=${t.id} | usuario="${t.usuario}" | clave_tutor="${t.clave_tutor}" | activo=${t.activo} | debeCambiar=${t.debe_cambiar_credenciales} | created=${t.created_at}`);
    }
  } else {
    console.log("  respuesta:", JSON.stringify(json));
  }
}

// Detectar duplicados de usuario en toda la tabla
console.log("\n=== Duplicados de usuario (toda la tabla) ===");
const todos = await fetch(
  `${urlBase}/rest/v1/tutores?select=usuario,clave_tutor,activo&order=usuario.asc`,
  { headers },
).then((r) => r.json());
if (Array.isArray(todos)) {
  const mapa = new Map();
  for (const t of todos) {
    const k = (t.usuario ?? "").trim().toLowerCase();
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(t);
  }
  let dups = 0;
  for (const [k, arr] of mapa) {
    if (arr.length > 1) {
      dups++;
      console.log(`  usuario="${k}" (${arr.length} filas):`);
      for (const t of arr) console.log(`    clave_tutor="${t.clave_tutor}" | activo=${t.activo}`);
    }
  }
  if (dups === 0) console.log("  No hay usuarios duplicados.");
  console.log(`  Total tutores: ${todos.length}`);
}
