// diag-asistencia-periodo.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT-1/T6.
// Conteo EXACTO de clases_impartidas y asistencia_alumnos (count=exact, sin el
// tope de 1000 de PostgREST) y cuántas filas tienen periodo_id /
// periodo_evaluacion_id NULL. NO escribe nada.
//
// Uso:
//   node scripts/diag-asistencia-periodo.mjs
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

async function conteoExacto(tabla) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  const cr = r.headers.get("content-range") ?? "";
  return Number(cr.split("/")[1] ?? "0");
}

async function paginar(tabla, select, extra = "") {
  const filas = [];
  const PAGE = 1000;
  let desde = 0;
  for (;;) {
    const r = await fetch(
      `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}&order=id&offset=${desde}&limit=${PAGE}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await r.json();
    if (!r.ok || !Array.isArray(data)) throw new Error(`${tabla} -> ${r.status}`);
    filas.push(...data);
    if (data.length < PAGE) break;
    desde += PAGE;
  }
  return filas;
}

async function main() {
  console.log("=== CONTEOS EXACTOS (count=exact) ===");
  const cClases = await conteoExacto("clases_impartidas");
  const cAsist = await conteoExacto("asistencia_alumnos");
  console.log(`clases_impartidas : ${cClases}`);
  console.log(`asistencia_alumnos: ${cAsist}`);

  const nulos = (rows, col) => rows.filter((x) => x[col] === null || x[col] === undefined).length;

  console.log("\n=== RELLENO actual de periodo_id / periodo_evaluacion_id ===");
  const clases = await paginar("clases_impartidas", "id,periodo_id,periodo_evaluacion_id,fecha");
  const asist = await paginar("asistencia_alumnos", "id,periodo_id,periodo_evaluacion_id,fecha");
  console.log(`clases_impartidas: ${clases.length} filas · periodo_id NULL=${nulos(clases, "periodo_id")} · pev NULL=${nulos(clases, "periodo_evaluacion_id")}`);
  console.log(`asistencia_alumnos: ${asist.length} filas · periodo_id NULL=${nulos(asist, "periodo_id")} · pev NULL=${nulos(asist, "periodo_evaluacion_id")}`);

  console.log("\n(fin del diagnóstico - solo lectura)");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
