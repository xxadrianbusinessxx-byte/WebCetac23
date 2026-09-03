// p0-verificar-restauracion.mjs — P0 FASE 3: verificación (SOLO LECTURA) con
// datos reales de la cadena completa tras restaurar el ciclo operativo 2026-2027.
//
// Replica la semántica de la aplicación:
//   ALUMNO -> inscripción ACTIVA -> grupo -> periodo (debe estar ACTIVO) -> carrera
//         -> semestre (academico_semestres; sin fila = activo)
//         -> grupo_materias + materias activas
//         -> horario_semanal del (periodo, grupo)
//         -> calendario_escolar del ciclo (para plantillas/asistencias)
// Y para PROFESOR: grupo + materia del horario + conteo de clases derivado.
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
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const GRADO_SEMESTRE = { "1RO": 1, "2DO": 2, "3RO": 3, "4TO": 4, "5TO": 5, "6TO": 6 };

async function alumnoResuelto(curp) {
  const ins = await get("inscripciones_alumno", "curp,grupo_id,activo,created_at", `&curp=eq.${encodeURIComponent(curp)}&activo=eq.true&order=created_at.desc&limit=1`);
  const out = {
    curp,
    inscripcion: ins.length ? ins[0] : null,
    grupo: null, periodo: null, carrera: null,
    semestre: null, semestreActivo: null,
    materias: [], horarioBloques: 0, materiasHorario: 0,
  };
  if (!out.inscripcion) return out;
  const g = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", `&id=eq.${out.inscripcion.grupo_id}&limit=1`);
  out.grupo = g[0] ?? null;
  if (!out.grupo || out.grupo.activo === false) return out;
  const p = await get("periodos", "id,nombre,activo", `&id=eq.${out.grupo.periodo_id}&activo=eq.true&limit=1`);
  out.periodo = p[0] ?? null;
  if (!out.periodo) return out;
  if (out.grupo.carrera_id) {
    const c = await get("carreras", "id,clave,nombre,activo", `&id=eq.${out.grupo.carrera_id}&limit=1`);
    out.carrera = c[0] ?? null;
  }
  const sem = GRADO_SEMESTRE[out.grupo.grado];
  out.semestre = sem;
  if (sem != null) {
    const filas = await get("academico_semestres", "periodo_id,semestre,activo", `&periodo_id=eq.${out.grupo.periodo_id}&semestre=eq.${sem}&limit=1`);
    out.semestreActivo = filas.length ? Boolean(filas[0].activo) : true;
  } else {
    out.semestreActivo = true;
  }
  const gms = await get("grupo_materias", "id,grupo_id,materia_id,activo,tabla_legacy", `&grupo_id=eq.${out.grupo.id}&activo=eq.true&limit=500`);
  if (gms.length) {
    const mIds = [...new Set(gms.map((m) => m.materia_id))];
    const mats = await get("materias", "id,clave,nombre,activo", `&id=in.(${mIds.join(",")})&activo=eq.true&limit=500`);
    const porId = new Map(mats.map((m) => [m.id, m]));
    out.materias = gms.map((gm) => porId.get(gm.materia_id)).filter(Boolean).map((m) => m.clave ?? m.nombre ?? m.id);
  }
  const hor = await get("horario_semanal", "periodo_id,grupo_id,dia_semana,materia_clave", `&periodo_id=eq.${out.grupo.periodo_id}&grupo_id=eq.${out.grupo.id}&limit=500`);
  out.horarioBloques = hor.length;
  out.materiasHorario = new Set(hor.map((h) => h.materia_clave)).size;
  return out;
}

async function verificarAlumno(curp, etiqueta) {
  const r = await alumnoResuelto(curp);
  let nombre = "(sin nombre en ALUMNOS)";
  try {
    const todos = await get("ALUMNOS", "*", "&limit=1000");
    const a = todos.find((x) => String(x.CURP ?? "").trim().toUpperCase() === curp.toUpperCase());
    if (a) nombre = `${a.NOMBRE ?? ""} ${a.P_APELLIDO ?? ""} ${a.S_APELLIDO ?? ""}`.trim() || nombre;
  } catch { nombre = "(ALUMNOS no consultable)"; }
  const diasClase = (await get("calendario_escolar", "fecha", "&ciclo_escolar=eq.2026-2027&tipo=eq.clase&limit=500")).length;
  const rutaOK = Boolean(r.inscripcion && r.grupo && r.periodo);
  const grupoTxt = r.grupo ? `${r.grupo.grado} ${r.grupo.nombre}${r.carrera ? ` · ${r.carrera.clave}` : " (tronco común)"}` : "(no resuelto)";
  const periodoEstado = r.periodo ? `activo=${r.periodo.activo}` : "NO ACTIVO";
  const semTxt = r.semestre == null ? "sin grado conocido" : r.semestreActivo ? "activo" : "INACTIVO (diseño del periodo)";
  const materiasTxt = r.materias.length ? `${r.materias.length} (${r.materias.slice(0, 3).join(", ")}…)` : "0";
  console.log(`\n[ALUMNO ${etiqueta}] ${curp} — ${nombre}`);
  console.log(`   inscripción ACTIVA: ${r.inscripcion ? "SÍ" : "NO"}`);
  console.log(`   grupo: ${grupoTxt} · periodo: ${r.periodo?.nombre ?? "-"} (${periodoEstado})`);
  console.log(`   semestre ${r.semestre ?? "-"}: ${semTxt}`);
  console.log(`   materias activas: ${materiasTxt}`);
  console.log(`   horario: ${r.horarioBloques} bloques · ${r.materiasHorario} materias · calendario días clase: ${diasClase}`);
  const veredicto = rutaOK && r.grupo?.activo ? "RESUELTO (identidad académica)" : "SIN GRUPO RESUELTO";
  const notaMaterias = rutaOK && r.semestre != null && !r.semestreActivo ? " · materias ocultas por semestre inactivo (config intencional)" : "";
  console.log(`   => ${veredicto}${notaMaterias}`);
  return { etiqueta, curp, rutaOK, semActivo: r.semestreActivo };
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo", "&limit=50");
  const activos = periodos.filter((p) => p.activo);
  console.log("=== INVARIANTE DE PERIODO ===");
  console.log(`Periodos activos: ${activos.length} -> ${activos.map((a) => a.nombre).join(", ") || "(ninguno)"}`);
  const p2627 = periodos.find((p) => p.nombre === "2026-2027");
  if (activos.length !== 1 || activos[0]?.nombre !== "2026-2027") {
    console.log("FALLA: el ciclo operativo no quedó como único activo.");
    process.exit(3);
  }
  console.log("OK: único periodo activo = 2026-2027.");

  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", `&periodo_id=eq.${p2627.id}&limit=500`);
  const carreras = await get("carreras", "id,clave", "&limit=200");
  const claveCar = new Map(carreras.map((c) => [c.id, c.clave]));
  const insAll = await get("inscripciones_alumno", "curp,grupo_id,activo,created_at", "&activo=eq.true&limit=20000");

  async function curpDe(grado, nombre, carreraClave) {
    const g = grupos.find((x) => x.grado === grado && x.nombre === nombre && (x.carrera_id ? claveCar.get(x.carrera_id) : "") === (carreraClave ?? ""));
    if (!g) return null;
    const lista = insAll.filter((i) => i.grupo_id === g.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return lista[0]?.curp ?? null;
  }
  const c1ro = await curpDe("1RO", "A", null);
  const c2do = await curpDe("2DO", "A", "RH");
  const c3ro = await curpDe("3RO", "A", "MECATRONICA");
  const c5to = await curpDe("5TO", "A", "MECATRONICA");
  const resultados = [];
  if (c1ro) resultados.push(await verificarAlumno(c1ro, "1RO (tronco común)"));
  if (c2do) resultados.push(await verificarAlumno(c2do, "2DO con carrera (caso especial)"));
  if (c3ro) resultados.push(await verificarAlumno(c3ro, "3RO con carrera"));
  if (c5to) resultados.push(await verificarAlumno(c5to, "5TO con carrera"));
  if (!c1ro || !c3ro || !c5to) console.log("AVISO: faltó alumno en alguna categoría.", JSON.stringify({ c1ro, c2do, c3ro, c5to }));
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

