// diag-agenda-citas.mjs — DIAGNÓSTICO (SOLO LECTURA). 2026-10-01.
//
// QUÉ MIDE: el estado de la agenda de citas de la dirección contra Supabase real.
//   1. ¿Existen `citas_franjas` y `citas_dias_bloqueados`? (¿se ejecutó
//      supabase/crear-agenda-citas.sql?)
//   2. El horario publicado (franjas por día) y los días bloqueados de hoy en adelante.
//   3. `citas` por estado, y si dos citas VIVAS (pendiente/aceptada) comparten
//      instante: eso haría fallar el índice único `ux_citas_hueco_vivo` del .sql,
//      así que se mira ANTES de ejecutarlo.
// QUÉ ESCRIBE: nada. Solo GET por PostgREST.
// CÓMO SE EJECUTA: node scripts/diag-agenda-citas.mjs
//
// Lo que NO puede ver: si el índice único existe (PostgREST no expone pg_indexes).
// El .sql trae la consulta de verificación para el SQL Editor.
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
const H = { apikey: key, Authorization: `Bearer ${key}` };

async function leer(tabla, query) {
  const r = await fetch(`${urlBase}/rest/v1/${tabla}?${query}`, { headers: H });
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    return { existe: cuerpo.code !== "PGRST205", error: cuerpo.message ?? `HTTP ${r.status}`, filas: [] };
  }
  return { existe: true, error: null, filas: await r.json() };
}

const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
console.log(`Agenda de citas — medición de solo lectura (hoy en el plantel: ${hoy})\n`);

const franjas = await leer("citas_franjas", "select=dia_semana,hora_inicio,hora_fin,duracion_min&order=dia_semana,hora_inicio");
const bloqueados = await leer("citas_dias_bloqueados", `select=fecha,motivo&fecha=gte.${hoy}&order=fecha`);
console.log(`citas_franjas          : ${franjas.existe ? `existe · ${franjas.filas.length} franja(s)` : "NO EXISTE — falta ejecutar supabase/crear-agenda-citas.sql"}`);
for (const f of franjas.filas) {
  console.log(`  · ${f.dia_semana.padEnd(9)} ${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)} · citas de ${f.duracion_min} min`);
}
console.log(`citas_dias_bloqueados  : ${bloqueados.existe ? `existe · ${bloqueados.filas.length} día(s) de hoy en adelante` : "NO EXISTE"}`);
for (const d of bloqueados.filas) console.log(`  · ${d.fecha}${d.motivo ? ` · ${d.motivo}` : ""}`);
if (franjas.existe && franjas.filas.length === 0) {
  console.log("  → Sin franjas: alumnos y tutores NO pueden pedir citas (decisión: sin agenda, cerrado).");
}

const citas = await leer("citas", "select=id,estado,propuesta_at");
if (citas.error) {
  console.log(`\ncitas: error al leer — ${citas.error}`);
} else {
  const porEstado = {};
  for (const c of citas.filas) porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1;
  console.log(`\ncitas                  : ${citas.filas.length} fila(s) · ${JSON.stringify(porEstado)}`);
  const vivas = citas.filas.filter((c) => c.estado === "pendiente" || c.estado === "aceptada");
  const porInstante = new Map();
  for (const c of vivas) {
    const k = new Date(c.propuesta_at).toISOString();
    porInstante.set(k, (porInstante.get(k) ?? 0) + 1);
  }
  const choques = [...porInstante].filter(([, n]) => n > 1);
  console.log(`  vivas (pendiente/aceptada): ${vivas.length}`);
  console.log(
    choques.length === 0
      ? "  ninguna comparte instante con otra: el índice ux_citas_hueco_vivo se puede crear."
      : `  ⚠ ${choques.length} instante(s) con más de una cita viva — el índice único FALLARÁ hasta resolverlas: ${choques.map(([k, n]) => `${k}×${n}`).join(", ")}`,
  );
}
