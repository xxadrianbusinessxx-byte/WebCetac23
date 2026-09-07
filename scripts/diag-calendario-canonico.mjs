// diag-calendario-canonico.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT-1/T2.
// Para cada bucket textual de `calendario_escolar` informa:
//   - días por tipo, rango y con qué periodo_id está ligado hoy;
//   - solapamientos de días de clase entre buckets;
//   - qué pasaría SI ese bucket fuera el CANÓNICO del periodo operativo:
//       días de clase que se asignarían, días fuera del rango del operativo,
//       días de clase fuera de todo parcial, días que se perderían (presentes
//       en otros buckets pero no en este) y filas que quedarían sin periodo_id.
// NO escribe nada. Lee .env.local como los demás scripts de diagnóstico.
//
// Uso:
//   node scripts/diag-calendario-canonico.mjs
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

const ordenarFecha = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const enRango = (fecha, a, b) => fecha >= a && fecha <= b;

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado,fecha_inicio,fecha_fin", "&limit=50");
  const conEstado = periodos.filter((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO");
  const activos = periodos.filter((p) => p.activo);
  const operativo = conEstado.length === 1 ? conEstado[0] : activos.length === 1 ? activos[0] : null;

  console.log("=== PERIODOS ===");
  for (const p of periodos) {
    console.log(`[${String(p.id).slice(0, 8)}] ${p.nombre}  activo=${p.activo}  estado=${p.estado ?? "(n/a)"}  rango=${p.fecha_inicio ?? "?"} -> ${p.fecha_fin ?? "?"}`);
  }
  if (!operativo) {
    console.log("\n(no hay un único periodo OPERATIVO/activo; no se puede evaluar el canónico)");
    return;
  }
  console.log(`\n=== PERIODO OPERATIVO ===`);
  console.log(`[${operativo.id}] ${operativo.nombre}  rango=${operativo.fecha_inicio} -> ${operativo.fecha_fin}`);

  const evs = await get("periodos_evaluacion", "id,periodo_id,numero,nombre,fecha_inicio,fecha_fin,activo", `&periodo_id=eq.${encodeURIComponent(operativo.id)}&limit=100`);
  console.log(`parciales (periodos_evaluacion): ${evs.length}`);
  const parciales = evs.filter((e) => e.activo !== false);
  for (const e of parciales) {
    console.log(`   #${e.numero} ${e.nombre}  rango=${e.fecha_inicio} -> ${e.fecha_fin}`);
  }

  const cal = await get("calendario_escolar", "id,ciclo_escolar,periodo_id,fecha,tipo", "&limit=30000");
  const buckets = new Map();
  for (const c of cal) {
    const b = c.ciclo_escolar ?? "(NULL)";
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(c);
  }
  const nombres = [...buckets.keys()];
  const porBucket = (b) => buckets.get(b);

  console.log("\n=== CALENDARIO_ESCOLAR (buckets por ciclo_escolar) ===");
  for (const b of nombres) {
    const dias = porBucket(b);
    const porTipo = {};
    const fechas = dias.map((d) => d.fecha).sort(ordenarFecha);
    const ligados = new Map();
    for (const d of dias) {
      porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + 1;
      if (d.periodo_id) {
        const k = String(d.periodo_id).slice(0, 8);
        ligados.set(k, (ligados.get(k) ?? 0) + 1);
      }
    }
    const ligadoStr = ligados.size
      ? [...ligados.entries()].map(([id, n]) => `${id}(${n})`).join(", ")
      : "ninguno";
    console.log(`[${b}]  filas=${dias.length}  tipos=${JSON.stringify(porTipo)}  rango=${fechas[0] ?? "?"} -> ${fechas[fechas.length - 1] ?? "?"}`);
    console.log(`   ligado por periodo_id: ${ligadoStr}`);
  }

  // Solapes de días de clase entre buckets.
  const conjuntos = new Map();
  for (const b of nombres) {
    conjuntos.set(b, new Set(porBucket(b).filter((d) => d.tipo === "clase").map((d) => d.fecha)));
  }
  console.log("\n=== SOLAPAMIENTOS ENTRE BUCKETS (días de clase en común) ===");
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const a = nombres[i];
      const b = nombres[j];
      let solape = 0;
      for (const f of conjuntos.get(a)) if (conjuntos.get(b).has(f)) solape++;
      if (solape > 0) console.log(`  ${a}  <->  ${b}  : ${solape} día(s)`);
    }
  }

  // Evaluación de cada bucket como canónico del operativo.
  const rangoInicio = operativo.fecha_inicio ?? "0000-01-01";
  const rangoFin = operativo.fecha_fin ?? "9999-12-31";
  const todosClase = new Set(cal.filter((d) => d.tipo === "clase").map((d) => d.fecha));
  console.log("\n=== SI CADA BUCKET FUERA EL CANÓNICO (asignado al operativo) ===");
  for (const b of nombres) {
    const dias = porBucket(b);
    const clase = dias.filter((d) => d.tipo === "clase");
    const fechasClase = clase.map((d) => d.fecha).sort(ordenarFecha);
    const fueraRango = clase.filter((d) => !enRango(d.fecha, rangoInicio, rangoFin)).length;
    const fueraParcial = clase.filter((d) => !parciales.some((e) => enRango(d.fecha, e.fecha_inicio, e.fecha_fin))).length;
    const setClase = new Set(clase.map((d) => d.fecha));
    const perdidos = [...todosClase].filter((f) => !setClase.has(f)).sort(ordenarFecha);
    const sinPeriodo = dias.filter((d) => !d.periodo_id).length;
    const conOtroPeriodo = dias.filter((d) => d.periodo_id && String(d.periodo_id) !== String(operativo.id)).length;
    console.log(`\nCandidato: ${b}`);
    console.log(`  días de clase a asignar: ${clase.length}  (rango ${fechasClase[0] ?? "?"} -> ${fechasClase[clase.length - 1] ?? "?"})`);
    console.log(`  días de clase FUERA del rango del operativo (${rangoInicio} -> ${rangoFin}): ${fueraRango}`);
    console.log(`  días de clase fuera de todo parcial del operativo: ${fueraParcial}`);
    console.log(`  días que se perderían (en otros buckets pero NO en este): ${perdidos.length}`);
    if (perdidos.length > 0) {
      console.log(`    primeros ${Math.min(10, perdidos.length)}: ${perdidos.slice(0, 10).join(", ")}`);
    }
    console.log(`  filas del bucket sin periodo_id hoy: ${sinPeriodo} · con periodo_id de OTRO periodo: ${conOtroPeriodo}`);
  }

  console.log("\n(fin del diagnóstico - solo lectura)");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

