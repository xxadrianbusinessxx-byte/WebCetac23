// p0-verificar-profesor.mjs — P0 FASE 3 rol PROFESOR (SOLO LECTURA).
// Ciclo actual · grupos con horario · grupo/materia · plantilla (fechas+alumnos+CLASES).
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
const DIA = { 0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles", 4: "jueves", 5: "viernes", 6: "sabado" };
function dia(iso) { const [a, m, d] = iso.split("-").map(Number); return DIA[new Date(a, m - 1, d).getDay()]; }

async function main() {
  const activos = await get("periodos", "id,nombre,activo", "&activo=eq.true&order=created_at.desc&limit=5");
  const ciclo = activos[0]?.nombre ?? null;
  const p2627 = activos.find((p) => p.nombre === "2026-2027");
  console.log("=== PROFESOR ===");
  console.log(`actionObtenerCicloActual -> "${ciclo}" ${ciclo === "2026-2027" ? "OK" : "FALLA"}`);

  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", `&periodo_id=eq.${p2627.id}&activo=eq.true&limit=500`);
  const carreras = await get("carreras", "id,clave", "&limit=200");
  const claveCar = new Map(carreras.map((c) => [c.id, c.clave]));
  const horGrupos = await get("horario_semanal", "grupo_id,materia_clave,dia_semana", `&periodo_id=eq.${p2627.id}&limit=20000`);
  const porGrupo = new Map();
  for (const h of horGrupos) {
    if (!porGrupo.has(h.grupo_id)) porGrupo.set(h.grupo_id, new Map());
    const mm = porGrupo.get(h.grupo_id);
    if (!mm.has(h.materia_clave)) mm.set(h.materia_clave, {});
    const p = mm.get(h.materia_clave);
    p[h.dia_semana] = (p[h.dia_semana] ?? 0) + 1;
  }
  const gruposUI = grupos.filter((g) => porGrupo.has(g.id));
  console.log(`Grupos del ciclo activo con horario: ${gruposUI.length} -> ${gruposUI.map((g) => `${g.grado} ${g.nombre}${g.carrera_id ? " " + claveCar.get(g.carrera_id) : ""}`).join(", ")}`);

  const g = grupos.find((x) => x.grado === "3RO" && x.nombre === "A" && claveCar.get(x.carrera_id) === "MECATRONICA");
  if (!g) { console.log("FALLA: grupo 3RO A MECATRONICA no existe en el ciclo activo."); process.exit(3); }
  const mats = porGrupo.get(g.id) ?? new Map();
  console.log(`Escenario ${g.grado} A MECATRONICA (${g.id.slice(0, 8)}): ${mats.size} materias en horario.`);
  const materia = mats.get("INGLES III");
  if (!materia) { console.log(`FALLA: INGLES III no está en horario. Disponibles: ${[...mats.keys()].join(", ")}`); process.exit(3); }
  console.log(`Materia INGLES III: porDia=${JSON.stringify(materia)}`);

  const cal = await get("calendario_escolar", "fecha,tipo", "&ciclo_escolar=eq.2026-2027&limit=500");
  const diasClase = cal.filter((d) => d.tipo === "clase").map((d) => d.fecha).sort();
  const insc = await get("inscripciones_alumno", "curp", `&grupo_id=eq.${g.id}&activo=eq.true&limit=1000`);
  let conClase = 0, total = 0, ej = [];
  for (const f of diasClase) {
    const c = materia[dia(f)] ?? 0;
    if (c > 0) { conClase++; total += c; if (ej.length < 3) ej.push(`${f}:${c}`); }
  }
  console.log(`Plantilla "${ciclo}" / ${g.grado} A MECATRONICA / INGLES III:`);
  console.log(`  días clase=${diasClase.length} · alumnos=${insc.length} · fechas con clase=${conClase} (${ej.join(", ")}) · CLASES totales=${total}`);
  const ok = diasClase.length > 0 && insc.length > 0 && conClase > 0;
  console.log(`=> ${ok ? "OK: grupo + materia + ciclo + horario + plantilla resueltos." : "FALLA"}`);

  const cImpartidas = await get("clases_impartidas", "profesor_clave,grado,grupo", "&limit=2000").catch(() => []);
  const gDist = [...new Set(cImpartidas.map((c) => `${c.grado}|${c.grupo}`))];
  console.log(`\nclases_impartidas (estado real): ${cImpartidas.length} filas · grupos: ${gDist.join(", ") || "(ninguno)"}`);
  if (!ok) process.exit(3);
}
main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
