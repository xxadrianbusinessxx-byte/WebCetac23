// diag-profesor-alcance.mjs — DIAGNÓSTICO (SOLO LECTURA)
// ¿De dónde puede salir el ALCANCE de un profesor (qué grupos/alumnos ve)?
// Compara las 3 fuentes candidatas para "Asistencia de mis alumnos":
//   1) asignaciones_profesor  (la que usa hoy el buscador → está vacía)
//   2) horario_semanal.profesor_clave (horario oficial del periodo operativo)
//   3) clases_impartidas.profesor_clave (huella real de lo que ya subió)
// Y revisa el modelo de justificaciones para saber si admite "por clase".
// NO modifica nada.
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
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!r.ok) return { __error: `${r.status} ${JSON.stringify(data).slice(0, 200)}` };
  return data;
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const op = periodos.find((p) => p.activo === true);
  console.log(`=== PERIODO OPERATIVO: ${op ? op.nombre : "(ninguno)"} ===`);
  if (!op) return;

  // 1) asignaciones_profesor
  const asig = await get("asignaciones_profesor", "id,profesor_clave,profesor_id,grupo_materia_id,activo", "&limit=1000");
  console.log(`\n=== 1) asignaciones_profesor ===`);
  if (asig.__error) console.log(`  ERROR: ${asig.__error}`);
  else {
    console.log(`  filas totales: ${asig.length} · activas: ${asig.filter((a) => a.activo).length}`);
    if (asig.length === 0) console.log("  >> VACÍA: por eso 'Asistencia de mis alumnos' dice 'No tienes grupos asignados'.");
  }

  // 2) horario_semanal.profesor_clave
  const hor = await get("horario_semanal", "id,grupo_id,dia_semana,materia_clave,profesor_clave", `&periodo_id=eq.${op.id}&limit=2000`);
  console.log(`\n=== 2) horario_semanal (periodo operativo) ===`);
  if (hor.__error) console.log(`  ERROR: ${hor.__error}`);
  else {
    const conProf = hor.filter((h) => (h.profesor_clave ?? "").trim() !== "");
    console.log(`  bloques: ${hor.length} · con profesor_clave: ${conProf.length} · SIN profesor: ${hor.length - conProf.length}`);
    const claves = [...new Set(conProf.map((h) => h.profesor_clave))];
    console.log(`  profesores distintos en el horario: ${claves.length} ${claves.length ? "→ " + claves.slice(0, 10).join(", ") : ""}`);
    if (conProf.length === 0) console.log("  >> El horario NO atribuye profesor: no sirve para acotar por profesor.");
  }

  // 3) clases_impartidas
  const ci = await get("clases_impartidas", "profesor_clave,grado,grupo,carrera,fecha,clases", "&limit=5000");
  console.log(`\n=== 3) clases_impartidas (huella real de subidas) ===`);
  if (ci.__error) console.log(`  ERROR: ${ci.__error}`);
  else {
    const porProf = new Map();
    for (const r of ci) {
      const k = r.profesor_clave ?? "(null)";
      const e = porProf.get(k) ?? new Set();
      e.add(`${r.grado} ${r.grupo}${r.carrera ? " " + r.carrera : ""}`);
      porProf.set(k, e);
    }
    console.log(`  filas: ${ci.length} · profesores distintos: ${porProf.size}`);
    for (const [p, grupos] of porProf) console.log(`    profesor_clave=${p} → grupos: ${[...grupos].join(" · ")}`);
  }

  // PROFESORES (calidad de la clave)
  const profs = await get("PROFESORES", "ID,CLAVE,Permisos", "&limit=200");
  console.log(`\n=== PROFESORES (calidad de CLAVE) ===`);
  if (profs.__error) console.log(`  ERROR: ${profs.__error}`);
  else {
    const porClave = new Map();
    for (const p of profs) {
      const k = String(p.CLAVE ?? "").trim();
      porClave.set(k, (porClave.get(k) ?? 0) + 1);
    }
    console.log(`  filas: ${profs.length} · claves distintas: ${porClave.size}`);
    const dup = [...porClave.entries()].filter(([, n]) => n > 1);
    for (const [k, n] of dup) console.log(`    !! CLAVE="${k}" compartida por ${n} profesores (identidad ambigua)`);
  }

  // 4) justificaciones: ¿admite granularidad por clase?
  const just = await get("justificaciones_asistencia", "*", "&limit=3");
  console.log(`\n=== 4) justificaciones_asistencia (¿por día o por clase?) ===`);
  if (just.__error) console.log(`  ERROR: ${just.__error}`);
  else {
    const cols = just.length ? Object.keys(just[0]) : [];
    console.log(`  filas de muestra: ${just.length}`);
    console.log(`  columnas: ${cols.length ? cols.join(", ") : "(tabla vacía; no se pueden inferir columnas)"}`);
    const tieneMateria = cols.some((c) => /materia|bloque|clase/i.test(c));
    console.log(`  ¿tiene columna de materia/bloque/clase? ${tieneMateria ? "SÍ" : "NO → hoy la justificación es POR DÍA"}`);
  }

  console.log("\nFIN DIAGNÓSTICO");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
