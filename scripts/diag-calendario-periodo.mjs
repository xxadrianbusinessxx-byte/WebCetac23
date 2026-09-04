// diag-calendario-periodo.mjs - DIAGNOSTICO (SOLO LECTURA) - F5 + PARCIALES.
// Evidencia para el backfill del calendario del periodo operativo:
//   - cada ciclo_escolar (bucket texto) con conteos por tipo y rango;
//   - el periodo OPERATIVO y sus parciales (periodos_evaluacion) con rangos;
//   - para cada bucket, a que parcial(es) caerian sus dias si se asignaran al
//     periodo operativo y que dias quedan fuera de todo parcial;
//   - solapamientos detectados entre buckets (p. ej. SEGUNDO vs TERCER).
// NO escribe nada. Lee .env.local igual que scripts/8-diagnostico-ciclos.mjs.
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
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const enRango = (fecha, a, b) => fecha >= a && fecha <= b;
const ordenarFecha = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

async function main() {
  console.log("=== PERIODOS ===");
  let periodos = [];
  try {
    periodos = await get("periodos", "id,nombre,activo,estado,fecha_inicio,fecha_fin", "&limit=50");
  } catch {
    periodos = await get("periodos", "id,nombre,activo,fecha_inicio,fecha_fin", "&limit=50");
  }
  for (const p of periodos) {
    console.log(`[${String(p.id).slice(0, 8)}] ${p.nombre}  activo=${p.activo}  estado=${p.estado ?? "(n/a)"}  rango=${p.fecha_inicio ?? "?"} -> ${p.fecha_fin ?? "?"}`);
  }

  // Periodo OPERATIVO: estado='operativo' (autoridad) con fallback activo=true.
  const conEstado = periodos.filter((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO");
  const activos = periodos.filter((p) => p.activo);
  const operativo = conEstado.length === 1 ? conEstado[0] : activos.length === 1 ? activos[0] : null;

  console.log("\n=== PERIODO OPERATIVO ===");
  if (!operativo) {
    console.log("(no hay un unico periodo OPERATIVO/activo)");
    return;
  }
  console.log(`[${operativo.id}] ${operativo.nombre}  estado/activo resuelto`);
  let evs = [];
  try {
    evs = await get("periodos_evaluacion", "id,periodo_id,numero,nombre,fecha_inicio,fecha_fin,activo", `&periodo_id=eq.${encodeURIComponent(operativo.id)}&limit=100`);
  } catch (e) {
    console.log("periodos_evaluacion: (no disponible) " + String(e.message).slice(0, 200));
  }
  console.log(`parciales (periodos_evaluacion): ${evs.length}`);
  for (const e of evs) {
    console.log(`   #${e.numero} ${e.nombre}  activo=${e.activo}  rango=${e.fecha_inicio} -> ${e.fecha_fin}`);
  }
  const parcialesActivos = evs.filter((e) => e.activo !== false);

  console.log("\n=== CALENDARIO_ESCOLAR (buckets por ciclo_escolar) ===");
  let cal = [];
  try {
    cal = await get("calendario_escolar", "id,ciclo_escolar,periodo_id,fecha,tipo", "&limit=30000");
  } catch {
    cal = await get("calendario_escolar", "id,ciclo_escolar,fecha,tipo", "&limit=30000");
  }
  const buckets = new Map();
  for (const c of cal) {
    if (!buckets.has(c.ciclo_escolar)) buckets.set(c.ciclo_escolar, []);
    buckets.get(c.ciclo_escolar).push(c);
  }
  const orden = [...buckets.keys()];
  for (const ciclo of orden) {
    const dias = buckets.get(ciclo);
    const porTipo = {};
    const fechas = dias.map((d) => d.fecha).sort(ordenarFecha);
    let conPeriodoId = 0;
    for (const d of dias) {
      porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + 1;
      if (d.periodo_id) conPeriodoId++;
    }
    console.log(`\n[${ciclo}]  filas=${dias.length} (periodo_id ligado=${conPeriodoId})  tipos=${JSON.stringify(porTipo)}  rango=${fechas[0] ?? "?"} -> ${fechas[fechas.length - 1] ?? "?"}`);
    if (parcialesActivos.length) {
      const clase = dias.filter((d) => d.tipo === "clase");
      if (clase.length) {
        const porParcial = new Map();
        let fuera = 0;
        for (const d of clase) {
          const match = parcialesActivos.filter((e) => enRango(d.fecha, e.fecha_inicio, e.fecha_fin));
          if (match.length === 0) fuera++;
          else for (const m of match) {
            const k = `#${m.numero} ${m.nombre} (${m.fecha_inicio}->${m.fecha_fin})`;
            porParcial.set(k, (porParcial.get(k) ?? 0) + 1);
          }
        }
        if (fuera > 0) console.log(`   -> dias de clase fuera de todo parcial del operativo: ${fuera}`);
        for (const [k, v] of porParcial) console.log(`   -> caerian en parcial ${k}: ${v} dia(s)`);
      }
    }
  }

  console.log("\n=== SOLAPAMIENTOS ENTRE BUCKETS (fechas de clase en comun) ===");
  const lista = [];
  for (const ciclo of orden) {
    const fechas = new Set(buckets.get(ciclo).filter((d) => d.tipo === "clase").map((d) => d.fecha));
    if (fechas.size === 0) continue;
    lista.push({ ciclo, fechas });
  }
  if (lista.length < 2) {
    console.log("  (menos de dos buckets con dias de clase)");
  } else {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        let solape = 0;
        for (const f of lista[i].fechas) if (lista[j].fechas.has(f)) solape++;
        if (solape > 0) console.log(`  ${lista[i].ciclo}  <->  ${lista[j].ciclo}  : ${solape} dia(s) en comun`);
      }
    }
  }
  console.log("\n(fin del diagnostico - solo lectura)");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

