// diag-boletas.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT X.
//
// Mide lo que la boleta generada lee y lo único que escribe, antes y después:
//   - el periodo OPERATIVO y sus parciales (periodos_evaluacion) activos;
//   - activaciones VIGENTES de boletas_activacion, por alcance (si la tabla no
//     existe todavía, lo dice: es la medición previa al SQL);
//   - materias (grupo_materia_id) con al menos una nota de tipo «promedio»;
//   - alumnos sin numero_control (en la boleta salen como «Sin asignar»).
// Solo GET por REST. Imprime CONTEOS: ni CURP, ni nombres, ni notas.
// Lee .env.local igual que scripts/diag-alta-manual-alumno.mjs.
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

/** Total de filas que cumplen el filtro, sin traerlas (Content-Range). */
async function contar(tabla, filtro = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*${filtro}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const rango = r.headers.get("content-range") ?? "";
  return Number(rango.split("/")[1] ?? NaN);
}

/** Filas, o `null` si la tabla no existe (404: el SQL aún no se aplicó). */
async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.status === 404) return null;
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const periodos = (await get("periodos", "id,nombre,activo,estado", "&limit=50")) ?? [];
  const operativos = periodos.filter((p) => String(p.estado ?? "").toLowerCase() === "operativo");
  const operativo = operativos.length === 1 ? operativos[0] : null;
  const parciales = operativo
    ? ((await get("periodos_evaluacion", "numero,activo", `&periodo_id=eq.${operativo.id}&activo=eq.true&order=numero`)) ?? [])
    : [];

  const activaciones = operativo
    ? await get("boletas_activacion", "alcance", `&periodo_id=eq.${operativo.id}&activa=eq.true`)
    : [];
  const porAlcance = { plantel: 0, grado: 0, grupo: 0 };
  for (const a of activaciones ?? []) porAlcance[a.alcance] = (porAlcance[a.alcance] ?? 0) + 1;
  const historicas = activaciones === null ? null : await contar("boletas_activacion", "&activa=eq.false");

  const promedios = (await get("calificaciones", "grupo_materia_id", "&tipo=eq.promedio&limit=100000")) ?? [];
  const materiasConPromedio = new Set(promedios.map((p) => p.grupo_materia_id)).size;

  const alumnos = await contar("ALUMNOS");
  const sinNumero = await contar("ALUMNOS", "&numero_control=is.null");

  console.log("=== BOLETA GENERADA — MEDICIÓN ===");
  console.log(`periodo operativo                 ${operativo ? operativo.nombre : "(ninguno único)"}`);
  console.log(`parciales activos                 ${parciales.length} (${parciales.map((p) => `P${p.numero}`).join(", ")})`);
  if (activaciones === null) {
    console.log("boletas_activacion                (la tabla no existe: SQL sin aplicar)");
  } else {
    const vigentes = activaciones.length;
    console.log(`activaciones vigentes             ${vigentes} (plantel ${porAlcance.plantel} · grado ${porAlcance.grado} · grupo ${porAlcance.grupo})`);
    console.log(`activaciones cerradas             ${historicas}`);
  }
  console.log(`materias con nota «promedio»      ${materiasConPromedio}`);
  console.log(`filas «promedio»                  ${promedios.length}`);
  console.log(`alumnos sin numero_control        ${sinNumero} de ${alumnos}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
