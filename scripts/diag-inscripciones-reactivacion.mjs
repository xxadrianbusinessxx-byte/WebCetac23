// diag-inscripciones-reactivacion.mjs — PROMPT-4/T1 medición.
// Replica EXACTAMENTE la lógica de `sincronizarInscripcionesOperativo()`
// (lib/escolar/ciclo/ciclo-estado.ts): por CURP dentro del ciclo operativo,
// la fila "elegida" es la más reciente por created_at (desc) y, a igualdad,
// por id (desc). Si esa fila está HOY inactiva, al reactivar el ciclo se
// invertiría la decisión del PROMPT-1/T3 (el alumno volvería al grupo
// equivocado).
//
// Solo lectura. Uso: node scripts/diag-inscripciones-reactivacion.mjs
import fs from "node:fs";
import path from "node:path";
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
const H = { apikey: key, Authorization: `Bearer ${key}` };
async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
const operativo = periodos.find((p) => p.activo === true) ?? periodos[0];
console.log(`Periodo operativo: ${operativo.nombre} (${operativo.id})\n`);

const grupos = await get("grupos", "id,grado,nombre,periodo_id", "&limit=5000");
const grupoIdsOp = new Set(grupos.filter((g) => g.periodo_id === operativo.id).map((g) => String(g.id)));
console.log(`Grupos del operativo: ${grupoIdsOp.size}`);

const inscripciones = await get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at,decision_manual,motivo", "&limit=50000").catch(async () => {
  // Sin la columna aditiva (SQL pendiente) se mide con la lógica antigua.
  return get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&limit=50000");
});
const conColumnaManual = inscripciones.length > 0 && "decision_manual" in (inscripciones[0] ?? {});
const delOperativo = inscripciones.filter((i) => grupoIdsOp.has(String(i.grupo_id)));
console.log(`Filas de inscripción en el operativo: ${delOperativo.length}`);
console.log(`Columna decision_manual presente: ${conColumnaManual}\n`);

const porCurp = new Map();
for (const f of delOperativo) {
  const lista = porCurp.get(f.curp) ?? [];
  lista.push(f);
  porCurp.set(f.curp, lista);
}

const conMasDeUna = [...porCurp.values()].filter((l) => l.length > 1);
console.log(`CURPs con más de una fila en el operativo: ${conMasDeUna.length}`);

function elegidaSegunSync(lista) {
  // Mismo orden que sincronizarInscripcionesOperativo: created_at desc, id desc.
  const ordenadas = [...lista].sort((a, b) => {
    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? 1 : -1;
  });
  return ordenadas[0];
}

// PROMPT-4/T1 (opción A): la fila "elegida" se calcula solo entre las NO
// marcadas con decision_manual (las marcadas quedan intactas por definición).
const invertirian = [];
for (const lista of conMasDeUna) {
  const candidatas = lista.filter((f) => f.decision_manual !== true);
  if (candidatas.length === 0) continue; // todas marcadas → nada cambia
  const elegida = elegidaSegunSync(candidatas);
  if (elegida && !elegida.activo) {
    invertirian.push({ curp: lista[0].curp, elegidaId: elegida.id, grupo: elegida.grupo_id });
  }
}

console.log(`De esos, la fila MÁS RECIENTE (sin marca) está hoy INACTIVA (invertiría al reactivar): ${invertirian.length}`);
for (const inv of invertirian.slice(0, 12)) {
  console.log(`  curp=${inv.curp} · filaElegida=${inv.elegidaId} · grupo=${inv.grupo}`);
}
if (invertirian.length > 12) console.log(`  … y ${invertirian.length - 12} más`);
