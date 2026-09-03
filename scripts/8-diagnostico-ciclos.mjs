// 8-diagnostico-ciclos.mjs — DIAGNÓSTICO (SOLO LECTURA)
// Distribución real por periodo/ciclo: grupos, materias, inscripciones,
// horario_semanal y calendario_escolar. También calcula el mapa de grupos
// equivalentes (origen 2026-2027 → destino AGO2026-ENE2027) para saber si una
// reasignación de inscripciones es posible. NO modifica nada.
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

const n = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,created_at,fecha_inicio,fecha_fin", "&limit=50");
  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", "&limit=5000");
  const gms = await get("grupo_materias", "grupo_id,activo", "&limit=10000");
  const carreras = await get("carreras", "id,clave", "&limit=200");
  const ins = await get("inscripciones_alumno", "curp,grupo_id,activo,created_at", "&limit=10000");

  let hor = [];
  try { hor = await get("horario_semanal", "id,periodo_id,dia_semana,materia_id,grupo_id,profesor_clave", "&limit=10000"); } catch { console.log("horario_semanal: (no disponible)"); }
  let cal = [];
  try { cal = await get("calendario_escolar", "ciclo_escolar,tipo", "&limit=20000"); } catch { console.log("calendario_escolar: (no disponible)"); }

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
  const insActivasPorGrupo = new Map();
  let insActivasTotal = 0;
  for (const i of ins) {
    if (!i.activo) continue;
    insActivasTotal++;
    insActivasPorGrupo.set(i.grupo_id, (insActivasPorGrupo.get(i.grupo_id) ?? 0) + 1);
  }

  console.log("\n=== PERIODOS ===");
  for (const p of periodos) {
    const gs = gruposPorPeriodo.get(p.id) ?? [];
    const conGM = gs.filter((g) => (gmsPorGrupo.get(g.id) ?? []).some((gm) => gm.activo)).length;
    const insP = gs.reduce((a, g) => a + (insActivasPorGrupo.get(g.id) ?? 0), 0);
    const horP = hor.filter((h) => h.periodo_id === p.id).length;
    console.log(`\n[${p.id.slice(0, 8)}] ${p.nombre}  activo=${p.activo}  rango=${p.fecha_inicio ?? "?"} → ${p.fecha_fin ?? "?"}`);
    console.log(`   grupos=${gs.length} (con GM activas=${conGM}) · inscripciones ACTIVAS=${insP} · bloques horario=${horP}`);
    for (const g of gs) {
      const carrera = g.carrera_id ? (carreraPorId.get(g.carrera_id) ?? g.carrera_id.slice(0, 8)) : "";
      console.log(`     ${g.grado} ${g.nombre} ${carrera}  activo=${g.activo} · gm=${(gmsPorGrupo.get(g.id) ?? []).filter((m) => m.activo).length} · inscAct=${insActivasPorGrupo.get(g.id) ?? 0}`);
    }
  }

  console.log("\n=== CALENDARIO (calendario_escolar por ciclo) ===");
  const calPorCiclo = new Map();
  for (const c of cal) {
    if (!calPorCiclo.has(c.ciclo_escolar)) calPorCiclo.set(c.ciclo_escolar, {});
    const m = calPorCiclo.get(c.ciclo_escolar);
    m[c.tipo] = (m[c.tipo] ?? 0) + 1;
  }
  for (const [ciclo, m] of calPorCiclo) console.log(`  ${ciclo}: ${JSON.stringify(m)}`);

  console.log("\n=== MAPA ORIGEN → DESTINO (grupos equivalentes por grado/grupo/carrera) ===");
  const porNombre = new Map(periodos.map((p) => [p.nombre.toUpperCase(), p]));
  const origen = porNombre.get("2026-2027");
  const destino = [...periodos].find((p) => p.activo && p.nombre.toUpperCase() !== "2026-2027") ?? porNombre.get("AGO2026-ENE2027");
  console.log(`origen: ${origen?.nombre ?? "(no existe)"} · destinoCandidato: ${destino?.nombre ?? "(ninguno)"}`);
  if (origen && destino && destino.id !== origen.id) {
    const gsO = gruposPorPeriodo.get(origen.id) ?? [];
    const gsD = gruposPorPeriodo.get(destino.id) ?? [];
    const mapaD = new Map();
    for (const g of gsD) {
      const carrera = g.carrera_id ? (carreraPorId.get(g.carrera_id) ?? "") : "";
      mapaD.set(`${n(g.grado)}|${n(g.nombre)}|${n(carrera)}`, g);
    }
    let sinDestino = 0;
    for (const g of gsO) {
      const carrera = g.carrera_id ? (carreraPorId.get(g.carrera_id) ?? "") : "";
      const key = `${n(g.grado)}|${n(g.nombre)}|${n(carrera)}`;
      const d = mapaD.get(key);
      const insc = insActivasPorGrupo.get(g.id) ?? 0;
      if (!d && insc > 0) sinDestino++;
      console.log(`  ${g.grado} ${g.nombre} ${carrera} (inscAct=${insc})  →  ${d ? `DESTINO ${d.id.slice(0, 8)}` : "SIN DESTINO"}`);
    }
    console.log(`grupos origen con inscripciones SIN destino equivalente: ${sinDestino}`);
  }

  console.log(`\nTOTAL inscripciones activas: ${insActivasTotal}`);
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
