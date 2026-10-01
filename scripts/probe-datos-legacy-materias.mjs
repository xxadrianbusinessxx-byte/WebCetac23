// probe-datos-legacy-materias.mjs — ¿CUÁNTOS datos reales hay que migrar?
//
// QUÉ MIDE: qué tablas físicas por materia tienen filas, su forma, y si los
//           auxiliares (`materias_nombres_visibles`, `materias_mapeo_columnas`)
//           son 1:1 o 1:N por materia.
// QUÉ ESCRIBE: nada. Solo `GET`.
// CÓMO SE EJECUTA: node scripts/probe-datos-legacy-materias.mjs
//
// `probe-forma-materias` descubrió que de 241 tablas referenciadas solo UNA
// tiene datos. Esto confirma cuál y qué contiene: es lo que decide si la
// migración es de datos o solo de código.
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

async function get(tabla, qs) {
  const r = await fetch(`${base}/rest/v1/${encodeURIComponent(tabla)}?${qs}`, {
    headers: { ...H, Prefer: "count=exact" },
  });
  const total = (r.headers.get("content-range") ?? "").split("/")[1] ?? "?";
  if (!r.ok) return { error: String(r.status), total };
  return { datos: await r.json(), total };
}

console.log("Datos reales en el modelo legacy de materias\n");

// ── 1) Qué tabla física tiene datos ────────────────────────────────────────
const gm = await get("grupo_materias", "select=tabla_legacy,materia_id,grupo_id,activo&tabla_legacy=not.is.null&limit=400");
const refs = (gm.datos ?? []).filter((r) => r.tabla_legacy);
const tablas = [...new Set(refs.map((r) => r.tabla_legacy))];

const conDatos = [];
for (const t of tablas) {
  const { total, error } = await get(t, "select=*&limit=0");
  if (!error && Number(total) > 0) conDatos.push({ tabla: t, filas: Number(total) });
}

console.log(`  ${tablas.length} tablas referenciadas · ${conDatos.length} con datos\n`);
for (const { tabla, filas } of conDatos) {
  const { datos } = await get(tabla, "select=*&limit=2");
  const cols = datos?.[0] ? Object.keys(datos[0]) : [];
  console.log(`  «${tabla}» — ${filas} filas, ${cols.length} columnas`);
  console.log(`     ${cols.join(" · ")}`);
  // Una fila de muestra, recortada: interesa la FORMA, no los datos personales.
  if (datos?.[0]) {
    const muestra = Object.fromEntries(
      Object.entries(datos[0]).map(([k, v]) => [k, typeof v === "string" && v.length > 18 ? v.slice(0, 18) + "…" : v]),
    );
    console.log(`     muestra: ${JSON.stringify(muestra).slice(0, 320)}`);
  }
}

// ── 2) ¿Los auxiliares son 1:1 o 1:N por materia? ──────────────────────────
console.log("\nAuxiliares: ¿uno por materia, o varios?");
for (const [tabla, campo] of [
  ["materias_nombres_visibles", "materia_id"],
  ["materias_mapeo_columnas", "materia_id"],
]) {
  const { datos, total } = await get(tabla, `select=${campo}&limit=1000`);
  const ids = (datos ?? []).map((r) => r[campo]);
  const unicos = new Set(ids).size;
  console.log(`  ${tabla.padEnd(28)} ${String(total).padStart(4)} filas · ${unicos} materias distintas → ${ids.length === unicos ? "1:1" : "1:N"}`);
}

// ── 3) Lo que ya existe para calificaciones por actividad ──────────────────
console.log("\nLo que YA existe para calificaciones (creado en las UIs pendientes)");
for (const t of ["actividades", "actividad_entregas"]) {
  const { datos, total, error } = await get(t, "select=*&limit=1");
  if (error) { console.log(`  ${t.padEnd(22)} ERROR ${error}`); continue; }
  const cols = datos?.[0] ? Object.keys(datos[0]) : [];
  console.log(`  ${t.padEnd(22)} ${String(total).padStart(4)} filas${cols.length ? ` · ${cols.join(", ")}` : " · (vacía: sin columnas de muestra)"}`);
}

// ── 4) Cuántas materias hay de verdad, y cuántos alias ─────────────────────
const mats = await get("materias", "select=id,clave,nombre,activo&limit=100");
console.log(`\nCatálogo: ${mats.total} materias`);
for (const m of (mats.datos ?? []).slice(0, 20)) {
  console.log(`  ${String(m.id).slice(0, 8)}  ${String(m.clave ?? "").padEnd(10)} ${m.nombre}  ${m.activo ? "" : "(inactiva)"}`);
}
