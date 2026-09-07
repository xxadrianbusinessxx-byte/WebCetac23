// migrar-calendario-canonico.mjs — PROMPT-1/T2 (ESCRIBE con --apply).
// Deja el calendario del periodo OPERATIVO colgando de `periodo_id` usando UN
// bucket textual canónico y retira el solape de los otros buckets.
//
// Fase A (UPDATE, requiere --apply):
//   1) Desliga del operativo las filas del bucket que hoy están ligadas pero NO
//      son el canónico elegido (hoy: bucket "2026-2027" → periodo_id = NULL).
//      Sin este paso, la UNIQUE parcial (periodo_id, fecha) impediría asignar
//      los días del canónico que ya existen bajo la otra clave.
//   2) Asigna el bucket canónico (parámetro --canonico, default
//      "SEMESTRE AGO26-ENE27") al periodo operativo (periodo_id).
//
// Fase B (DELETE, requiere --apply Y --borrar-sin-periodo):
//   3) Borra las filas de calendario_escolar que sigan SIN periodo_id (los
//      buckets no canónicos y sus duplicados). Es destructivo: no se ejecuta
//      junto con la Fase A; primero se revisa el dry-run.
//
// Por defecto SOLO imprime el plan.
// Uso:
//   node scripts/migrar-calendario-canonico.mjs                        # dry-run
//   node scripts/migrar-calendario-canonico.mjs --apply                # fase A
//   node scripts/migrar-calendario-canonico.mjs --apply --borrar-sin-periodo
//   node scripts/migrar-calendario-canonico.mjs --canonico "<nombre>"
import fs from "node:fs";
import path from "node:path";

const CANONICO_DEFAULT = "SEMESTRE AGO26-ENE27";
const args = process.argv.slice(2);
const aplica = args.includes("--apply");
const borraSinPeriodo = args.includes("--borrar-sin-periodo");
const canonicoArg = args.find((a) => a.startsWith("--canonico="));
const canonico = canonicoArg ? canonicoArg.slice("--canonico=".length) : CANONICO_DEFAULT;

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
const H = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=representation" };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function patch(tabla, body, filtro) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?${filtro}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`PATCH ${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function del(tabla, filtro) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?${filtro}`, {
    method: "DELETE",
    headers: H,
  });
  if (!r.ok) {
    const data = await r.json();
    throw new Error(`DELETE ${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
}

const normaliza = (s) => String(s ?? "").trim().toUpperCase();

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado,fecha_inicio,fecha_fin", "&limit=50");
  const conEstado = periodos.filter((p) => String(p.estado ?? "").toUpperCase() === "OPERATIVO");
  const activos = periodos.filter((p) => p.activo);
  const operativo = conEstado.length === 1 ? conEstado[0] : activos.length === 1 ? activos[0] : null;
  if (!operativo) throw new Error("No hay un único periodo operativo; detengo la migración.");

  const cal = await get("calendario_escolar", "id,ciclo_escolar,periodo_id,fecha,tipo", "&limit=30000");
  const canonicas = cal.filter((c) => normaliza(c.ciclo_escolar) === normaliza(canonico));
  if (canonicas.length === 0) throw new Error(`El bucket canónico "${canonico}" no tiene filas en calendario_escolar.`);

  // Fase A.1 — desligar filas ligadas al operativo que NO son del bucket canónico.
  const desligar = cal.filter(
    (c) => c.periodo_id && String(c.periodo_id) === String(operativo.id) && normaliza(c.ciclo_escolar) !== normaliza(canonico),
  );
  // Fase A.2 — filas canónicas sin periodo_id a las que se asignará el operativo.
  const asignar = canonicas.filter((c) => !c.periodo_id);
  // Colisión (defensa): canónicas ya ligadas a OTRO periodo.
  const canonicasOtroPeriodo = canonicas.filter((c) => c.periodo_id && String(c.periodo_id) !== String(operativo.id));
  // Fase B — filas que quedarían SIN periodo_id DESPUÉS de la Fase A
  // (simulación del dry-run): las que ya no tienen periodo_id y no son del
  // bucket canónico, MÁS las que la Fase A.1 desliga del operativo.
  const sinPeriodoPreA = cal.filter((c) => !c.periodo_id && normaliza(c.ciclo_escolar) !== normaliza(canonico));
  const sinPeriodoTrasA = [...new Map(
    [...sinPeriodoPreA, ...desligar].map((c) => [c.id, c]),
  ).values()];

  console.log(`=== PLAN migrar-calendario-canonico ===`);
  console.log(`Periodo operativo: [${String(operativo.id).slice(0, 8)}] ${operativo.nombre}`);
  console.log(`Bucket canónico elegido: "${canonico}" (${canonicas.length} filas)`);
  console.log(`Modo: ${aplica ? "--apply (ESCRIBE)" : "DRY-RUN (no escribe nada)"}${borraSinPeriodo ? " + --borrar-sin-periodo" : ""}\n`);

  console.log(`FASE A.1 — desligar del operativo filas de buckets NO canónicos (periodo_id -> NULL): ${desligar.length} filas`);
  const porBucketDesligar = {};
  for (const c of desligar) porBucketDesligar[c.ciclo_escolar] = (porBucketDesligar[c.ciclo_escolar] ?? 0) + 1;
  for (const [b, n] of Object.entries(porBucketDesligar)) console.log(`   ${b}: ${n}`);
  const diasDesligar = desligar.map((c) => c.fecha).sort();
  if (diasDesligar.length) console.log(`   rango: ${diasDesligar[0]} -> ${diasDesligar[diasDesligar.length - 1]}`);

  console.log(`\nFASE A.2 — asignar bucket canónico al operativo: ${asignar.length} filas`);
  if (canonicasOtroPeriodo.length) {
    console.log(`   ⚠ ${canonicasOtroPeriodo.length} filas canónicas ya ligadas a OTRO periodo: NO se tocan`);
  }
  const porTipo = {};
  for (const c of asignar) porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
  console.log(`   tipos: ${JSON.stringify(porTipo)}`);
  const diasAsignar = asignar.map((c) => c.fecha).sort();
  if (diasAsignar.length) console.log(`   rango: ${diasAsignar[0]} -> ${diasAsignar[diasAsignar.length - 1]}`);
  const fueraRango = operativo.fecha_inicio && operativo.fecha_fin
    ? asignar.filter((c) => c.fecha < operativo.fecha_inicio || c.fecha > operativo.fecha_fin).length
    : "(rango del periodo sin fechas)";
  console.log(`   días fuera del rango del operativo (${operativo.fecha_inicio ?? "?"} -> ${operativo.fecha_fin ?? "?"}): ${fueraRango}`);

  console.log(`\nFASE B — filas SIN periodo_id que se borrarían (solo con --borrar-sin-periodo): ${sinPeriodoTrasA.length} filas`);
  const porBucketB = {};
  for (const c of sinPeriodoTrasA) porBucketB[c.ciclo_escolar] = (porBucketB[c.ciclo_escolar] ?? 0) + 1;
  for (const [b, n] of Object.entries(porBucketB)) console.log(`   ${b}: ${n}`);

  if (!aplica) {
    console.log("\nDRY-RUN terminado. Revisa el plan antes de --apply.");
    return;
  }

  // ---- ESCRITURA ----
  if (desligar.length) {
    const ids = desligar.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 900) {
      const lote = ids.slice(i, i + 900);
      await patch("calendario_escolar", { periodo_id: null }, `id=in.(${lote.join(",")})`);
    }
    console.log(`\n[escrito] A.1: ${desligar.length} filas desligadas del operativo.`);
  }
  if (asignar.length) {
    const ids = asignar.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 900) {
      const lote = ids.slice(i, i + 900);
      await patch("calendario_escolar", { periodo_id: operativo.id }, `id=in.(${lote.join(",")})`);
    }
    console.log(`[escrito] A.2: ${asignar.length} filas del bucket canónico ligadas al operativo.`);
  }

  if (borraSinPeriodo) {
    const restantes = await get("calendario_escolar", "id,ciclo_escolar,periodo_id,fecha", "&limit=30000");
    const aBorrar = restantes.filter((c) => !c.periodo_id);
    if (aBorrar.length) {
      const ids = aBorrar.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 900) {
        await del("calendario_escolar", `id=in.(${ids.slice(i, i + 900).join(",")})`);
      }
    }
    console.log(`[borrado] Fase B: ${aBorrar.length} filas sin periodo_id eliminadas.`);
  } else {
    console.log("\n[ok] Fase A aplicada. La Fase B (borrar sin periodo_id) requiere --apply --borrar-sin-periodo.");
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message ?? e);
  process.exit(1);
});

