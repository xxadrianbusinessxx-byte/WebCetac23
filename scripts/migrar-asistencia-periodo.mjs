// migrar-asistencia-periodo.mjs — PROMPT-1/T6 (ESCRIBE con --apply).
// Rellena `periodo_id` y `periodo_evaluacion_id` en `asistencia_alumnos`
// derivándolos de la `fecha` de cada fila contra `periodos` (por rango) y
// `periodos_evaluacion` (por rango, del periodo resuelto).
//
// Alcance y respeto al PROMPT-1:
//   - Aplica a `asistencia_alumnos` (3 863 filas, todas NULL hoy).
//   - `clases_impartidas` tiene 81 filas históricas de autoría irrecuperable;
//     T4 ordena NO tocarlas («no cuelgan de ningún ciclo y se conservan como
//     histórico»). Se dejan intactas y se reportan.
//   - Solo se escribe cuando la fecha cae en UN ÚNICO periodo y UN ÚNICO
//     parcial (o ninguno activo para periodo_evaluacion_id). Si es ambiguo o
//     sin match, la fila queda NULL y se reporta (no se inventa).
//
// Por defecto SOLO imprime el plan. Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-asistencia-periodo.mjs
//   node scripts/migrar-asistencia-periodo.mjs --apply
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
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function paginar(tabla, select, extra = "") {
  const filas = [];
  const PAGE = 1000;
  let desde = 0;
  for (;;) {
    const r = await fetch(
      `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}&order=id&offset=${desde}&limit=${PAGE}`,
      { headers: H },
    );
    const data = await r.json();
    if (!r.ok || !Array.isArray(data)) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
    filas.push(...data);
    if (data.length < PAGE) break;
    desde += PAGE;
  }
  return filas;
}

function enRango(fecha, a, b) {
  return fecha >= a && fecha <= b;
}


async function main() {
  const [periodos, evals, asistencias, clases] = await Promise.all([
    get("periodos", "id,nombre,activo,estado,fecha_inicio,fecha_fin", "&limit=50"),
    get("periodos_evaluacion", "id,periodo_id,numero,nombre,fecha_inicio,fecha_fin,activo", "&limit=500"),
    paginar("asistencia_alumnos", "id,curp,fecha,periodo_id,periodo_evaluacion_id"),
    paginar("clases_impartidas", "id,fecha,periodo_id,periodo_evaluacion_id"),
  ]);

  console.log(`Modo: ${APPLY ? "--apply (ESCRIBE)" : "DRY-RUN (no escribe nada)"}\n`);

  const plan = [];
  let sinMatch = 0;
  let ambiguo = 0;
  let yaRelleno = 0;
  for (const f of asistencias) {
    if (f.periodo_id) {
      yaRelleno++;
      continue;
    }
    const match = periodos.filter((p) => p.fecha_inicio && p.fecha_fin && enRango(f.fecha, p.fecha_inicio, p.fecha_fin));
    if (match.length === 0) {
      sinMatch++;
      continue;
    }
    if (match.length > 1) {
      ambiguo++;
      continue;
    }
    const periodo = match[0];
    const pev = evals.filter(
      (e) => e.periodo_id === periodo.id && e.activo !== false && e.fecha_inicio && e.fecha_fin && enRango(f.fecha, e.fecha_inicio, e.fecha_fin),
    );
    let periodoEvaluacionId = null;
    if (pev.length === 1) periodoEvaluacionId = pev[0].id;
    else if (pev.length > 1) {
      ambiguo++;
      continue;
    }
    plan.push({ id: f.id, fecha: f.fecha, periodo_id: periodo.id, periodo_evaluacion_id: periodoEvaluacionId, nombre: periodo.nombre });
  }

  console.log(`asistencia_alumnos: ${asistencias.length} filas leídas`);
  console.log(`  ya con periodo_id: ${yaRelleno} · sin match de periodo: ${sinMatch} · ambiguas: ${ambiguo} · A RELLENAR: ${plan.length}`);
  const fechas = plan.map((p) => p.fecha).sort();
  if (fechas.length) console.log(`  rango de fechas del plan: ${fechas[0]} -> ${fechas[fechas.length - 1]}`);
  const porPeriodo = {};
  for (const p of plan) porPeriodo[p.nombre] = (porPeriodo[p.nombre] ?? 0) + 1;
  for (const [k, v] of Object.entries(porPeriodo)) console.log(`  -> ${k}: ${v} filas`);
  console.log(`\nclases_impartidas: ${clases.length} filas · ${clases.filter((c) => !c.periodo_id).length} sin periodo_id`);
  console.log(`  → NO se tocan (81 históricas; orden T4: se conservan como histórico).\n`);

  if (!APPLY) {
    console.log("DRY-RUN terminado. Revisa antes de --apply.");
    return;
  }
  // Escritura por rango de fecha (evita URLs enormes de in()): un PATCH por
  // segmento (periodo + parcial). Filtro: periodo_id IS NULL (idempotente: las
  // filas ya actualizadas no vuelven a casar con el filtro).
  const operativo = periodos.find((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO") || periodos.find((p) => p.activo);
  if (!operativo || !operativo.fecha_inicio || !operativo.fecha_fin) {
    throw new Error("No hay un periodo operativo con rango de fechas para el backfill.");
  }
  const segmentos = [];
  const pevsOp = evals.filter((e) => e.periodo_id === operativo.id && e.activo !== false && e.fecha_inicio && e.fecha_fin);
  for (const e of pevsOp) {
    segmentos.push({ etiqueta: `${operativo.nombre} · ${e.nombre}`, desde: e.fecha_inicio, hasta: e.fecha_fin, periodoId: operativo.id, pevId: e.id });
  }
  // Segmento genérico del periodo (para fechas dentro del rango sin parcial).
  segmentos.push({ etiqueta: `${operativo.nombre} (sin parcial)`, desde: operativo.fecha_inicio, hasta: operativo.fecha_fin, periodoId: operativo.id, pevId: null });
  const aplicados = [];
  for (const s of segmentos) {
    const filtro = `periodo_id=is.null&fecha=gte.${s.desde}&fecha=lte.${s.hasta}`;
    const r = await fetch(`${urlBase}/rest/v1/asistencia_alumnos?${filtro}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ periodo_id: s.periodoId, periodo_evaluacion_id: s.pevId }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`PATCH asistencia_alumnos (${s.etiqueta}) -> ${r.status} ${txt.slice(0, 300)}`);
    }
    aplicados.push(s.etiqueta);
  }
  console.log(`[escrito] backfill por rango aplicado (segmentos: ${aplicados.join(" | ")}).`);
}

main().catch((e) => {
  console.error("ERROR:", e.message ?? e);
  process.exit(1);
});
