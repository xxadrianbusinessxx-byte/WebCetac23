// probe-forma-materias.mjs — ¿qué forma tiene HOY el modelo de materias?
//
// QUÉ MIDE: la forma real de `materias`, `grupo_materias`, los dos auxiliares
//           (`materias_mapeo_columnas`, `materias_nombres_visibles`) y una
//           muestra de las tablas físicas por materia.
// QUÉ ESCRIBE: nada. Solo `GET` por PostgREST.
// CÓMO SE EJECUTA: node scripts/probe-forma-materias.mjs
//
// Existe para diseñar la migración a `materias.id` midiendo el punto de
// partida, en vez de fiarse de lo que los documentos dicen que hay.
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function filas(tabla, qs = "select=*&limit=1") {
  const r = await fetch(`${base}/rest/v1/${encodeURIComponent(tabla)}?${qs}`, {
    headers: { ...H, Prefer: "count=exact" },
  });
  const total = (r.headers.get("content-range") ?? "").split("/")[1] ?? "?";
  if (!r.ok) return { error: `${r.status}`, total };
  return { datos: await r.json(), total };
}

const CLAVE = ["materias", "grupo_materias", "materias_mapeo_columnas", "materias_nombres_visibles", "grupos", "inscripciones_alumno"];

console.log("Forma del modelo de materias — medido, no supuesto\n");

for (const t of CLAVE) {
  const { datos, total, error } = await filas(t);
  if (error) {
    console.log(`  ${t.padEnd(28)} ERROR ${error}`);
    continue;
  }
  const cols = datos?.[0] ? Object.keys(datos[0]) : [];
  console.log(`  ${t.padEnd(28)} ${String(total).padStart(6)} filas`);
  if (cols.length) console.log(`  ${" ".repeat(28)} ${cols.join(", ")}`);
}

// ── Una tabla física de muestra ────────────────────────────────────────────
console.log("\nTablas físicas por materia (la deuda nº3)");
const gm = await filas("grupo_materias", "select=tabla_legacy&tabla_legacy=not.is.null&limit=400");
const tablas = [...new Set((gm.datos ?? []).map((r) => r.tabla_legacy).filter(Boolean))];
console.log(`  grupo_materias con tabla_legacy: ${gm.total} filas · ${tablas.length} tablas distintas`);

// Muestra la forma de las dos primeras que respondan
let vistas = 0;
for (const t of tablas) {
  if (vistas >= 2) break;
  const { datos, total, error } = await filas(t, "select=*&limit=1");
  if (error) continue;
  vistas++;
  const cols = datos?.[0] ? Object.keys(datos[0]) : [];
  console.log(`\n  «${t}» — ${total} filas, ${cols.length} columnas`);
  console.log(`     ${cols.slice(0, 14).join(" · ")}${cols.length > 14 ? " …" : ""}`);
}

// ── ¿Cuántas tablas físicas están VACÍAS? ──────────────────────────────────
let vacias = 0;
let conDatos = 0;
let noExisten = 0;
for (const t of tablas) {
  const { total, error } = await filas(t, "select=*&limit=0");
  if (error) noExisten++;
  else if (Number(total) === 0) vacias++;
  else conDatos++;
}
console.log(`\n  De las ${tablas.length} tablas referenciadas:`);
console.log(`     con datos ... ${conDatos}`);
console.log(`     vacías ...... ${vacias}`);
console.log(`     no existen .. ${noExisten}`);
console.log("\n  Esa es la cifra que decide el coste de la migración: solo lo que");
console.log("  tiene datos hay que mover.");
