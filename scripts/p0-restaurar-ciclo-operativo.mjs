// p0-restaurar-ciclo-operativo.mjs — P0 FASE 2: restauración del ciclo operativo.
// Vuelve a dejar ACTIVO el periodo con contexto académico real (inscripciones,
// horario, calendario, semestres) y desactiva el ciclo clonado prematuro que no
// tiene inscripciones. NO borra, NO migra alumnos, NO toca semestres.
//
// SEGURIDAD: DRY-RUN por defecto. Aplicar: node scripts/p0-restaurar-ciclo-operativo.mjs --apply
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
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

async function patch(tabla, filtro, body) {
  const r = await fetch(`${urlBase}/rest/v1/${tabla}?${filtro}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`PATCH ${tabla} ${filtro} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}


async function main() {
  const periodos = await get("periodos", "id,nombre,activo,created_at,updated_at", "&limit=50");
  const grupos = await get("grupos", "id,periodo_id", "&limit=5000");
  const ins = await get("inscripciones_alumno", "curp,grupo_id,activo", "&limit=20000");
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const inscActivasPorPeriodo = new Map();
  for (const i of ins) {
    if (!i.activo) continue;
    const pid = grupoPorId.get(i.grupo_id)?.periodo_id ?? "?";
    inscActivasPorPeriodo.set(pid, (inscActivasPorPeriodo.get(pid) ?? 0) + 1);
  }
  const operativo = periodos.find((p) => p.nombre === "2026-2027");
  const prematuro = periodos.find((p) => p.nombre === "AGO2026-ENE2027");
  const activos = periodos.filter((p) => p.activo);

  console.log(`Modo: ${APPLY ? "APLICAR" : "DRY-RUN (sin cambios)"}`);
  console.log(`Periodos activos actuales: ${activos.map((a) => `"${a.nombre}"`).join(", ") || "(ninguno)"}`);
  console.log(`Operativo "2026-2027": activo=${operativo?.activo} · inscripciones activas=${inscActivasPorPeriodo.get(operativo?.id) ?? 0}`);
  console.log(`Prematuro "AGO2026-ENE2027": activo=${prematuro?.activo} · inscripciones activas=${inscActivasPorPeriodo.get(prematuro?.id) ?? 0}`);

  // Precondiciones estrictas: si el estado cambió respecto a la investigación, abortar.
  const errores = [];
  if (!operativo) errores.push("No existe el periodo 2026-2027.");
  if (!prematuro) errores.push("No existe el periodo AGO2026-ENE2027.");
  if (operativo && operativo.activo) errores.push("2026-2027 YA esta activo (nada que hacer).");
  if (prematuro && !prematuro.activo) errores.push("AGO2026-ENE2027 ya esta inactivo (nada que hacer).");
  if (operativo && (inscActivasPorPeriodo.get(operativo.id) ?? 0) === 0) errores.push("2026-2027 no tiene inscripciones activas (revisar antes de activar).");
  if (prematuro && (inscActivasPorPeriodo.get(prematuro.id) ?? 0) > 0) errores.push("AGO2026-ENE2027 SI tiene inscripciones activas (no desactivar sin revisar).");
  if (activos.length > 1) errores.push("Hay mas de un periodo activo; revisar antes de continuar.");
  if (errores.length) {
    console.log("\nABORTA - precondiciones no cumplidas:");
    for (const e of errores) console.log(`  - ${e}`);
    process.exit(2);
  }

  console.log("\nPlan (minimo y reversible):");
  console.log(`  1) PATCH periodos  ${operativo.id}   activo: false -> true   ("${operativo.nombre}")`);
  console.log(`  2) PATCH periodos  ${prematuro.id}   activo: true -> false  ("${prematuro.nombre}")`);

  if (!APPLY) {
    console.log("\nPara aplicar: node scripts/p0-restaurar-ciclo-operativo.mjs --apply");
    return;
  }

  const antesOperativo = operativo.activo;
  const antesPrematuro = prematuro.activo;
  await patch("periodos", `id=eq.${operativo.id}`, { activo: true });
  await patch("periodos", `id=eq.${prematuro.id}`, { activo: false });
  const despues = await get("periodos", "id,nombre,activo,updated_at", "&limit=50");
  const activosAhora = despues.filter((p) => p.activo);
  console.log("\nAPLICADO:");
  console.log(`  Antes   -> 2026-2027 activo=${antesOperativo} · AGO2026-ENE2027 activo=${antesPrematuro}`);
  console.log(`  Despues -> 2026-2027 activo=${despues.find((p) => p.nombre === "2026-2027")?.activo} · AGO2026-ENE2027 activo=${despues.find((p) => p.nombre === "AGO2026-ENE2027")?.activo}`);
  console.log(`  Periodos activos ahora: ${activosAhora.map((a) => `"${a.nombre}"`).join(", ") || "(ninguno)"}`);
  console.log("\nROLLBACK (si se requiere): invertir ambos flags (2026-2027=false, AGO2026-ENE2027=true) validando las mismas precondiciones.");
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
