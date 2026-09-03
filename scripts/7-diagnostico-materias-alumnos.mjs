// 7-diagnostico-materias-alumnos.mjs — DIAGNÓSTICO (SOLO LECTURA)
// Verifica por qué a los alumnos no se les muestran materias aunque tengan
// grado/grupo/carrera identificados:
//   1) ADRIAN URIEL TREJO ZARATE (caso especial: muestra materias de 2DO)
//   2) Muestra de alumnos con inscripción activa (subdivisión 7)
//   3) Conteos globales (ALUMNOS / ETIQUETAS / inscripciones / grupo_materias)
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
  if (!r.ok) throw new Error(`${tabla} → ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
const nombreAlumno = (a) => [a.NOMBRE, a.P_APELLIDO, a.S_APELLIDO].filter(Boolean).join(" ").trim();
async function reporteAlumno(curp, label) {
  console.log(`\n=== ${label} (${curp}) ===`);
  const etiquetas = await get("ETIQUETAS PERSONALES", "CURP,GRADO,GRUPO,CARRERA", `&CURP=eq.${encodeURIComponent(curp)}`);
  console.log("ETIQUETAS PERSONALES:", JSON.stringify(etiquetas[0] ?? "(sin fila)"));

  const inscripciones = await get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", `&curp=eq.${encodeURIComponent(curp)}&order=created_at.desc`);
  console.log(`Inscripciones (${inscripciones.length}):`);
  for (const ins of inscripciones) {
    const g = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", `&id=eq.${ins.grupo_id}`).catch(() => []);
    const grupo = g[0] ?? null;
    let carreraClave = "";
    if (grupo?.carrera_id) {
      const c = await get("carreras", "clave", `&id=eq.${grupo.carrera_id}`).catch(() => []);
      carreraClave = c[0]?.clave ?? "";
    }
    let semestreEstado = "n/a";
    if (grupo) {
      const semMap = { "1RO": 1, "2DO": 2, "3RO": 3, "4TO": 4, "5TO": 5, "6TO": 6 };
      const sem = semMap[String(grupo.grado).toUpperCase()];
      if (sem !== undefined) {
        const periodo = await get("periodos", "id,activo", `&id=eq.${grupo.periodo_id}`).catch(() => []);
        const filasSem = await get("academico_semestres", "periodo_id,semestre,activo", "&limit=200").catch(() => []);
        const filaSem = filasSem?.find((s) => s.periodo_id === grupo.periodo_id && s.semestre === sem);
        const estSem = filaSem ? (filaSem.activo ? "activo" : "INACTIVO") : "default(activo)";
        semestreEstado = `semestre ${sem} ${estSem} · periodo activo=${periodo[0]?.activo}`;
      }
    }
    console.log(`  SEMESTRE: ${semestreEstado}`);
    let materiasGrupo = [];
    if (grupo) {
      const gms = await get("grupo_materias", "id,tabla_legacy,activo,materia_id", `&grupo_id=eq.${grupo.id}&activo=eq.true`);
      const mIds = [...new Set(gms.map((gm) => gm.materia_id))];
      const ms = mIds.length ? await get("materias", "id,clave,nombre,activo", `&id=in.(${mIds.join(",")})`).catch(() => []) : [];
      const porId = new Map(ms.map((m) => [m.id, m]));
      materiasGrupo = gms.map((gm) => ({
        gmId: gm.id,
        tablaLegacy: gm.tabla_legacy,
        gmActivo: gm.activo,
        materia: porId.get(gm.materia_id)?.nombre ?? porId.get(gm.materia_id)?.clave ?? gm.materia_id,
      }));
    }
    console.log(
      `  [${ins.activo ? "ACTIVA" : "inactiva"}] grupo=${grupo ? `${grupo.grado} ${grupo.nombre}${carreraClave ? " " + carreraClave : ""}` : ins.grupo_id} (activo=${grupo?.activo}) · grupo_materias activos=${materiasGrupo.length} · con tabla_legacy=${materiasGrupo.filter((m) => m.tablaLegacy).length}`,
    );
    for (const m of materiasGrupo.slice(0, 15)) {
      console.log(`     - ${m.materia}  [tabla_legacy=${m.tablaLegacy ?? "NULL"}]`);
    }
    if (materiasGrupo.length > 15) console.log(`     ... y ${materiasGrupo.length - 15} más`);
  }
}

async function main() {
  // 1) Buscar ADRIAN URIEL TREJO ZARATE
  const todos = await get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO,CLAVE", "&limit=5000");
  const trejo = todos.filter((a) => {
    const n = norm(nombreAlumno(a));
    return n.includes("TREJO ZARATE");
  });
  console.log(`ALUMNOS con apellido TREJO ZARATE: ${trejo.length}`);
  for (const a of trejo) console.log(`  ${nombreAlumno(a)}  CURP=${a.CURP}`);

  const adrian = trejo.find((a) => norm(nombreAlumno(a)).includes("ADRIAN URIEL")) ?? trejo[0];
  if (adrian) await reporteAlumno(adrian.CURP, `ALUMNO ${nombreAlumno(adrian)}`);
  if (!adrian) console.log("\n  !!! ADRIAN URIEL TREJO ZARATE NO encontrado en ALUMNOS");

  const adrianCualquiera = todos.filter((a) => norm(nombreAlumno(a)).includes("ADRIAN"));
  console.log(`\nAlumnos con 'ADRIAN' en el nombre (${adrianCualquiera.length}):`);
  for (const a of adrianCualquiera.slice(0, 20)) console.log(`  ${nombreAlumno(a)}  CURP=${a.CURP}`);

  // 2) Muestra de inscripciones activas actuales
  console.log("\n=== MUESTRA DE INSCRIPCIONES ACTIVAS ===");
  const inscripciones = await get("inscripciones_alumno", "curp,grupo_id,activo,created_at", "&activo=eq.true&order=created_at.desc&limit=20");
  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo", "&limit=500");
  const carreras = await get("carreras", "id,clave", "&limit=100");
  const carreraPorId = new Map(carreras.map((c) => [c.id, c.clave]));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const visto = new Set();
  let revisadas = 0;
  for (const ins of inscripciones) {
    const g = grupoPorId.get(ins.grupo_id);
    if (!g || visto.has(ins.curp)) continue;
    visto.add(ins.curp);
    const gms = await get("grupo_materias", "id,tabla_legacy,activo", `&grupo_id=eq.${g.id}&activo=eq.true`);
    const carrera = g.carrera_id ? (carreraPorId.get(g.carrera_id) ?? "") : "";
    console.log(
      `  ${ins.curp} → ${g.grado} ${g.nombre}${carrera ? " " + carrera : ""} · grupo_materias activos=${gms.length} · con tabla_legacy=${gms.filter((m) => m.tabla_legacy).length}`,
    );
    if (++revisadas >= 8) break;
  }

  // 3) Conteos globales
  console.log("\n=== CONTEO GLOBAL ===");
  const nAlumnos = todos.length;
  const etiquetas = await get("ETIQUETAS PERSONALES", "CURP,GRADO,GRUPO,CARRERA", "&limit=5000");
  const conGrado = etiquetas.filter((e) => (e.GRADO ?? "").trim() && (e.GRUPO ?? "").trim());
  const conTodo = conGrado.filter((e) => (e.CARRERA ?? "").trim());
  console.log(`ALUMNOS total: ${nAlumnos}`);
  console.log(`ETIQUETAS PERSONALES filas: ${etiquetas.length}`);
  console.log(`  con GRADO+GRUPO: ${conGrado.length}`);
  console.log(`  con GRADO+GRUPO+CARRERA: ${conTodo.length}`);

  const inscActivas = await get("inscripciones_alumno", "id,curp,grupo_id", "&activo=eq.true&limit=5000");
  console.log(`Inscripciones activas: ${inscActivas.length}`);
  const gruposConMaterias = await get("grupo_materias", "grupo_id,activo", "&activo=eq.true&limit=5000");
  const gruposConMateriasSet = new Set(gruposConMaterias.map((g) => g.grupo_id));
  console.log(`Grupos con grupo_materias activos: ${gruposConMateriasSet.size}`);

  const sinGm = inscActivas.filter((i) => !gruposConMateriasSet.has(i.grupo_id)).length;
  console.log(`Inscripciones activas cuyo grupo NO tiene grupo_materias activos: ${sinGm}`);


  // 4) Semestres inactivos (podrían vaciar la oferta)
  console.log("\n=== SEMESTRES (academico_semestres) ===");
  const sems = await get("academico_semestres", "periodo_id,semestre,activo", "&limit=200").catch(() => null);
  if (sems) {
    const inactivos = sems.filter((s) => s.activo === false);
    console.log(`Filas en academico_semestres: ${sems.length} · inactivos: ${inactivos.length}`);
    for (const s of inactivos) console.log(`  INACTIVO: periodo=${s.periodo_id} semestre=${s.semestre}`);
  } else {
    console.log("academico_semestres no responde (posiblemente no existe)");
  }

  // 4b) Cruce: inscripciones activas por GRADO vs semestres inactivos
  console.log("\n=== CRUCE INSCRIPCIONES ACTIVAS POR GRADO vs SEMESTRE ===");
  const periodos = await get("periodos", "id,nombre,activo", "&limit=50");
  console.log(`Periodos (${periodos.length}):`);
  for (const p of periodos) console.log(`  ${p.id} ${p.nombre} activo=${p.activo}`);
  const gradoDeGrupo = new Map(grupos.map((g) => [g.id, { grado: g.grado, periodo: g.periodo_id }]));
  const porGradoPeriodo = new Map();
  for (const ins of inscActivas) {
    const info = gradoDeGrupo.get(ins.grupo_id);
    if (!info) continue;
    const key = `${info.grado}|${info.periodo}`;
    porGradoPeriodo.set(key, (porGradoPeriodo.get(key) ?? 0) + 1);
  }
  for (const [key, n] of porGradoPeriodo) {
    const [grado, periodoId] = key.split("|");
    const sem = { "1RO": 1, "2DO": 2, "3RO": 3, "4TO": 4, "5TO": 5, "6TO": 6 }[grado];
    const filaSem = sems?.find((s) => s.periodo_id === periodoId && s.semestre === sem);
    const estadoSem = filaSem ? (filaSem.activo ? "activo" : "INACTIVO") : "default(activo)";
    console.log(`  ${grado} (periodo ${periodoId.slice(0, 8)}) → ${n} inscripciones activas · semestre=${estadoSem}`);
  }

  // 4c) Detalle del grupo de ADRIAN + semestres con fechas
  console.log("\n=== GRUPO ADRIAN + SEMESTRES (fechas) ===");
  const grupoAdrian = await get("grupos", "id,grado,nombre,carrera_id,periodo_id,activo,created_at", "&id=eq.213748f5-160e-47a8-8bb8-301d0f607773");
  console.log("GRUPO ADRIAN:", JSON.stringify(grupoAdrian[0]));
  const semsFull = await get("academico_semestres", "periodo_id,semestre,activo,created_at", "&limit=50");
  for (const s of semsFull) console.log("  SEMESTRE:", JSON.stringify(s));
  const activasPorGrupo = {};
  const gruposPorId = new Map(grupos.map((x) => [x.id, x]));
  for (const i of inscActivas) {
    const gg = gruposPorId.get(i.grupo_id);
    const k = gg ? `${gg.grado} ${gg.nombre}` : i.grupo_id;
    activasPorGrupo[k] = (activasPorGrupo[k] ?? 0) + 1;
  }
  console.log("INSCRIPCIONES ACTIVAS POR GRUPO:");
  for (const k of Object.keys(activasPorGrupo).sort()) console.log(`  ${k} = ${activasPorGrupo[k]}`);

  console.log("\n=== ALUMNOS DEL REPORTE SUBDIVISIÓN (muestra) ===");
  const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
  const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
  let contadas = 0;
  const porCurp = new Map(todos.map((a) => [a.CURP, a]));
  for (let i = 1; i < lineas.length && contadas < 6; i++) {
    const p = lineas[i].split(",");
    const estado = p[8];
    const curp = p[9];
    if (estado === "SIN_MATCH" || !curp) continue;
    const alumno = porCurp.get(curp);
    if (!alumno) continue;
    await reporteAlumno(curp, `REPORTE: ${p[6]} → ${p[1]} ${p[2]}${p[3] ? " " + p[3] : ""}`);
    contadas++;
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

