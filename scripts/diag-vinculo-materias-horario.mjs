// diag-vinculo-materias-horario.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT AA.
//
// Mide cómo se vincularía hoy cada materia del horario semanal al catálogo si se
// re-importara el archivo:
//   - nombres distintos de `horario_semanal` y filas del periodo;
//   - nombres AMBIGUOS para la equivalencia plana (casan con más de una materia
//     activa contando también el nombre sin romano): es una propiedad de los
//     datos, no del código, y no cambia con PROMPT AA;
//   - nombres y filas que la regla del importador (`resolverMateriaEnIndice`, el
//     módulo puro REAL) deja sin vínculo — antes de PROMPT AA la función no
//     existe y se reporta así;
//   - filas con `materia_id` nulo hoy en la base.
// Solo GET por REST. Imprime CONTEOS y nombres de MATERIAS: ni CURP ni personas.
// Lee .env.local igual que scripts/diag-boletas.mjs.
// Uso: node scripts/diag-vinculo-materias-horario.mjs
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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${select}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const S = await import("../lib/escolar/horario/horario-semanal-puro.ts");
const V = await import("../lib/escolar/horario/horario-importar-validacion-puro.ts");

const [materias, horario] = await Promise.all([
  get("materias", "id,clave,nombre", "&activo=eq.true"),
  get("horario_semanal", "materia_nombre,materia_id"),
]);

// Equivalencia plana: todas las materias que casan con cualquier candidata.
const porTexto = new Map();
for (const m of materias) {
  for (const k of [S.materiaClaveHorario(m.clave), S.materiaClaveHorario(m.nombre ?? "")]) {
    if (!k) continue;
    const s = porTexto.get(k) ?? new Set();
    s.add(m.id);
    porTexto.set(k, s);
  }
}
const filasPorNombre = new Map();
for (const h of horario) filasPorNombre.set(h.materia_nombre, (filasPorNombre.get(h.materia_nombre) ?? 0) + 1);

const ambiguos = [];
for (const nombre of filasPorNombre.keys()) {
  const ids = new Set();
  for (const c of S.clavesEquivalenciaMateria(nombre)) for (const id of porTexto.get(c) ?? []) ids.add(id);
  if (ids.size > 1) ambiguos.push(nombre);
}
const filasDe = (nombres) => nombres.reduce((acc, n) => acc + filasPorNombre.get(n), 0);

console.log(`materias activas: ${materias.length}`);
console.log(`horario_semanal: ${horario.length} filas · ${filasPorNombre.size} nombres distintos`);
console.log(`ambiguos con equivalencia plana: ${ambiguos.length} nombres · ${filasDe(ambiguos)} filas`);

if (typeof V.resolverMateriaEnIndice === "function") {
  const indice = V.indiceMateriasDesdeFilas(materias);
  const sinVinculo = [...filasPorNombre.keys()].filter((n) => !V.resolverMateriaEnIndice(n, indice));
  console.log(`sin vínculo con la regla del importador: ${sinVinculo.length} nombres · ${filasDe(sinVinculo)} filas`);
  for (const n of sinVinculo.sort()) console.log(`  - ${n} (${filasPorNombre.get(n)})`);
} else {
  console.log("sin vínculo con la regla del importador: (resolverMateriaEnIndice aún no existe en el módulo puro)");
  for (const n of ambiguos.sort()) console.log(`  - ${n} (${filasPorNombre.get(n)})`);
}
console.log(`filas con materia_id nulo hoy: ${horario.filter((h) => !h.materia_id).length}`);
