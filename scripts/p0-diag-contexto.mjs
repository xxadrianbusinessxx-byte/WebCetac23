// p0-diag-contexto.mjs — DIAGNÓSTICO P0 (SOLO LECTURA)
// Estado completo del contexto académico: periodos, semestres, evaluaciones,
// grupos/materias, inscripciones, horario, calendario, asignaciones y
// asistencia. NO modifica nada.
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
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} → ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,created_at,updated_at,fecha_inicio,fecha_fin", "&limit=50");
  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo,created_at", "&limit=5000");
  const gms = await get("grupo_materias", "id,grupo_id,activo", "&limit=10000");
  const carreras = await get("carreras", "id,clave,nombre,activo", "&limit=200");
  const ins = await get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&limit=20000");
  const semestres = await get("academico_semestres", "periodo_id,semestre,activo,created_at,updated_at", "&limit=200").catch(() => []);
  const evals = await get("periodos_evaluacion", "periodo_id,nombre,activo,numero,fecha_inicio,fecha_fin", "&limit=500").catch(() => []);
  const hor = await get("horario_semanal", "id,periodo_id,grupo_id,dia_semana,materia_clave,profesor_clave", "&limit=20000").catch(() => []);
  const cal = await get("calendario_escolar", "ciclo_escolar,fecha,tipo", "&limit=30000").catch(() => []);
  const asigs = await get("asignaciones_profesor", "id,grupo_materia_id,profesor_clave,activo,desde", "&limit=10000").catch(() => []);
  let clases = [];
  let asistencias = [];
  try {
    clases = await get("clases_impartidas", "profesor_clave,grado,grupo,fecha,clases", "&limit=30000");
  } catch { console.log("clases_impartidas: (no disponible)"); }
  try {
    asistencias = await get("asistencia_alumnos", "curp,grado,grupo,fecha,clases_asistidas", "&limit=30000");
  } catch { console.log("asistencia_alumnos: (no disponible)"); }

  const carreraPorId = new Map(carreras.map((c) => [c.id, c.clave]));
  const gruposPorPeriodo = new Map();
  for (const g of grupos) {
    if (!gruposPorPeriodo.has(g.periodo_id)) gruposPorPeriodo.set(g.periodo_id, []);
    gruposPorPeriodo.get(g.periodo_id).push(g);
  }
  const gmsPorGrupo = new Map();
  for (const gm of gms) {
    if (!gmsPorGrupo.has(gm.grupo_id)) gmsPorGrupo.set(gm.grupo_id, []);
    gmsPorGrupo.get(gm.grupo_id).push(gm);
  }
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const insActivasPorGrupo = new Map();
  const insActivasPorCiclo = new Map();
  let insActivasTotal = 0;
  const activasPorCurp = new Map();
  const curpsConMultiples = new Set();
  for (const i of ins) {
    if (!i.activo) continue;
    insActivasTotal++;
    insActivasPorGrupo.set(i.grupo_id, (insActivasPorGrupo.get(i.grupo_id) ?? 0) + 1);
    const g = grupoPorId.get(i.grupo_id);
    const pid = g?.periodo_id ?? "?";
    insActivasPorCiclo.set(pid, (insActivasPorCiclo.get(pid) ?? 0) + 1);
    const prev = activasPorCurp.get(i.curp);
    if (prev) curpsConMultiples.add(i.curp);
    else activasPorCurp.set(i.curp, i.grupo_id);
  }
  const gmsActivosPorPeriodo = new Map();
  for (const g of grupos) {
    const gm = (gmsPorGrupo.get(g.id) ?? []).filter((x) => x.activo).length;
    gmsActivosPorPeriodo.set(g.periodo_id, (gmsActivosPorPeriodo.get(g.periodo_id) ?? 0) + gm);
  }

  console.log("\n=== PERIODOS (orden created_at) ===");
  const sorted = [...periodos].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const p of sorted) {
    const gs = gruposPorPeriodo.get(p.id) ?? [];
    const gm = gmsActivosPorPeriodo.get(p.id) ?? 0;
    const horP = hor.filter((h) => h.periodo_id === p.id).length;
    const asigP = asigs.filter((a) => {
      const gmRow = gms.find((x) => x.id === a.grupo_materia_id);
      const g = gmRow ? grupoPorId.get(gmRow.grupo_id) : null;
      return g?.periodo_id === p.id && a.activo;
    }).length;
    const semRows = semestres.filter((s) => s.periodo_id === p.id);
    const evRows = evals.filter((e) => e.periodo_id === p.id);
    console.log(`\n[${p.id.slice(0, 8)}] "${p.nombre}"  activo=${p.activo}  creado=${String(p.created_at).slice(0, 19)}  actualizado=${String(p.updated_at).slice(0, 19)}`);
    console.log(`   rango=${p.fecha_inicio ?? "-"} → ${p.fecha_fin ?? "-"}`);
    console.log(`   grupos=${gs.length} · materiasAct=${gm} · inscActivas=${insActivasPorCiclo.get(p.id) ?? 0} · bloquesHorario=${horP} · asignacionesActivas=${asigP}`);
    const semEstado = semRows.map((s) => `S${s.semestre}=${s.activo ? "act" : "INACT"}(creado ${String(s.created_at).slice(0, 10)})`).join(", ");
    console.log(`   academico_semestres: ${semRows.length ? semEstado : "(sin filas ⇒ todos activos por default)"}`);
    if (evRows.length) console.log(`   periodos_evaluacion: ${evRows.filter((e) => e.activo).length}/${evRows.length} activos · ${evRows.map((e) => e.nombre).join(", ")}`);
    for (const g of gs) {
      const carrera = g.carrera_id ? (carreraPorId.get(g.carrera_id) ?? "") : "";
      const gmG = (gmsPorGrupo.get(g.id) ?? []).filter((m) => m.activo).length;
      const asigG = asigs.filter((a) => a.activo && gms.find((x) => x.id === a.grupo_materia_id)?.grupo_id === g.id).length;
      console.log(`     ${g.grado} ${g.nombre} ${carrera}  activo=${g.activo} · gmAct=${gmG} · inscAct=${insActivasPorGrupo.get(g.id) ?? 0} · asigAct=${asigG}`);
    }
  }

  console.log("\n=== CALENDARIO_ESCOLAR por nombre textual ===");
  const calPorCiclo = new Map();
  for (const c of cal) {
    if (!calPorCiclo.has(c.ciclo_escolar)) calPorCiclo.set(c.ciclo_escolar, { tipos: {}, desde: c.fecha, hasta: c.fecha });
    const m = calPorCiclo.get(c.ciclo_escolar);
    m.tipos[c.tipo] = (m.tipos[c.tipo] ?? 0) + 1;
    if (c.fecha < m.desde) m.desde = c.fecha;
    if (c.fecha > m.hasta) m.hasta = c.fecha;
  }
  for (const [ciclo, m] of calPorCiclo) console.log(`  "${ciclo}": ${JSON.stringify(m.tipos)} · ${m.desde} → ${m.hasta}`);

  console.log("\n=== ASISTENCIA REGISTRADA (fechas; sin periodo_id) ===");
  if (clases.length) {
    const fechas = clases.map((c) => c.fecha).sort();
    const gps = new Set(clases.map((c) => `${c.grado}|${c.grupo}`));
    console.log(`clases_impartidas: ${clases.length} filas · ${fechas[0]} → ${fechas[fechas.length - 1]} · grupos distintos=${gps.size}`);
  }
  if (asistencias.length) {
    const fechas = asistencias.map((c) => c.fecha).sort();
    const gps = new Set(asistencias.map((c) => `${c.grado}|${c.grupo}`));
    console.log(`asistencia_alumnos: ${asistencias.length} filas · ${fechas[0]} → ${fechas[fechas.length - 1]} · grupos distintos=${gps.size}`);
  }

  console.log(`\nTOTAL inscripciones activas: ${insActivasTotal}`);
  console.log(`CURPs con MÁS DE UNA inscripción activa: ${curpsConMultiples.size}`);
  console.log("academico_semestres con activo=false por periodo:");
  for (const s of semestres.filter((x) => x.activo === false)) {
    const p = periodos.find((pp) => pp.id === s.periodo_id);
    console.log(`  ${p?.nombre ?? s.periodo_id} S${s.semestre} (creado ${String(s.created_at).slice(0, 10)})`);
  }
  console.log("\nFIN DIAGNÓSTICO");
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
