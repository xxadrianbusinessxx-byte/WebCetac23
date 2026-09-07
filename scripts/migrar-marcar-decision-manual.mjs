#!/usr/bin/env node
// migrar-marcar-decision-manual.mjs — PROMPT-4/T1 (opción A) (ESCRIBE con --apply).
//
// Marca con `decision_manual = true` (+ motivo) las filas de inscripción del
// ciclo operativo que son una DECISIÓN HUMANA del PROMPT-1/T3 (deduplicación
// por roster) y que, si la activación del ciclo corriera hoy, se invertirían:
// para esos CURPs la fila "más reciente por created_at" está HOY inactiva, y
// sincronizarInscripcionesOperativo() la volvería a activar.
//
// Requiere primero aplicar `supabase/agregar-decision-manual-inscripciones.sql`
// en el SQL Editor (columnas `decision_manual` + `motivo`). Si faltan, sale con
// error claro y no escribe.
//
// Por defecto SOLO imprime el plan (dry-run). Escribe con `--apply`.
//
// Uso:
//   node scripts/migrar-marcar-decision-manual.mjs
//   node scripts/migrar-marcar-decision-manual.mjs --apply
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

async function rest(pathRuta, opts = {}) {
  const r = await fetch(`${urlBase}/rest/v1/${pathRuta}`, { headers: H, ...opts });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const MOTIVO =
  "PROMPT-1/T3 deduplicación por roster (2026-09-06): fila descartada por decisión humana; no reactivar por fecha (PROMPT-4/T1 opción A).";

// 1) ¿Existe la columna?
const pruebaCol = await fetch(
  `${urlBase}/rest/v1/inscripciones_alumno?select=decision_manual,id&limit=1`,
  { headers: H },
);
if (!pruebaCol.ok) {
  const body = await pruebaCol.text();
  console.log(`La columna decision_manual NO existe todavía (${pruebaCol.status}).`);
  console.log("Aplica primero en el SQL Editor: supabase/agregar-decision-manual-inscripciones.sql");
  console.log("Texto del error:", JSON.stringify(body).slice(0, 200));
  process.exit(1);
}

// 2) Ciclo operativo.
const periodos = await rest("periodos?select=id,nombre,activo,estado&limit=50");
const operativo = periodos.find((p) => p.activo === true) ?? periodos[0];
console.log(`Ciclo operativo: ${operativo.nombre} (${operativo.id})\n`);

// 3) Filas del operativo.
const grupos = await rest('grupos?select=id,periodo_id&limit=5000');
const grupoIdsOp = new Set(grupos.filter((g) => g.periodo_id === operativo.id).map((g) => String(g.id)));
const inscripciones = await rest('inscripciones_alumno?select=id,curp,grupo_id,activo,created_at,decision_manual&limit=50000');
const delOperativo = inscripciones.filter((i) => grupoIdsOp.has(String(i.grupo_id)));

const porCurp = new Map();
for (const f of delOperativo) {
  const lista = porCurp.get(f.curp) ?? [];
  lista.push(f);
  porCurp.set(f.curp, lista);
}

function elegidaSegunSync(lista) {
  const ordenadas = [...lista].sort((a, b) => {
    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? 1 : -1;
  });
  return ordenadas[0];
}

// 4) Filas a marcar. Regla PROMPT-4/T1 (opción A): la sincronización elige por
//    CURP la fila más reciente (created_at desc, id desc) ENTRE LAS NO MARCADAS.
//    Para congelar el estado actual hay que marcar TODA fila inactiva que quede
//    por encima de la fila activa en ese orden (cascada: si solo se marca la
//    primera, la segunda más reciente inactiva sería la nueva elegida y se
//    invertiría igual). Las filas inactivas MÁS ANTIGUAS que la activa nunca son
//    elegidas → no hace falta marcarlas.
const aMarcar = [];
for (const lista of porCurp.values()) {
  if (lista.length < 2) continue;
  const ordenadas = [...lista].sort((a, b) => {
    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? 1 : -1;
  });
  // Primera fila activa en el orden descendente = la que la sync elegiría
  // (o dejaría) si nada estuviera marcado. Todo lo inactivo por encima de ella
  // es una decisión que hay que congelar.
  const idxActiva = ordenadas.findIndex((f) => f.activo);
  if (idxActiva < 0) continue; // sin fila activa: no es un caso de decisión actual
  for (let i = 0; i < idxActiva; i++) {
    const f = ordenadas[i];
    if (!f.activo && f.decision_manual !== true) {
      aMarcar.push({ id: f.id, curp: lista[0].curp, grupo: f.grupo_id });
    }
  }
}
console.log(`Filas en riesgo a marcar (inactivas por encima de la activa, sin marca previa): ${aMarcar.length}`);
for (const f of aMarcar.slice(0, 15)) {
  console.log(`  id=${f.id} · curp=${f.curp} · grupo=${f.grupo}`);
}
if (aMarcar.length > 15) console.log(`  … y ${aMarcar.length - 15} más`);

if (!APPLY) {
  console.log("\nDry-run: no se escribió nada. Pasa --apply para marcar las filas.");
  process.exit(0);
}

let aplicadas = 0;
for (const f of aMarcar) {
  await rest(`inscripciones_alumno?id=eq.${encodeURIComponent(f.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ decision_manual: true, motivo: MOTIVO }),
  });
  aplicadas++;
}
console.log(`\nMarcadas ${aplicadas} filas con decision_manual=true.`);
