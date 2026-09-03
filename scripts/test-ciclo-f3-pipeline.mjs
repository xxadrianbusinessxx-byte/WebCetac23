// test-ciclo-f3-pipeline.mjs — Pruebas FUNCIONALES (mock Supabase en memoria +
// parseo real de CSV) del pipeline F3 dirigido por `periodoId`.
//
// Requisitos A–N de F3. Compila el grafo TS (carga-academica + inscripciones-
// borrador + dependencias) a CommonJS con scripts/tsconfig.test-ciclo-f3.json y
// ejecuta el pipeline real contra una base simulada.
//
// Uso: node scripts/test-ciclo-f3-pipeline.mjs   (desde la raíz del repo)
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, "..");

// Compilar el grafo TS (como los demás tests de módulos TS del repo).
const tscBin = path.join(raiz, "node_modules", "typescript", "bin", "tsc");
const cfg = path.join(__dirname, "tsconfig.test-ciclo-f3.json");
const comp = spawnSync(process.execPath, [tscBin, "-p", cfg], { cwd: raiz, encoding: "utf8" });
if (comp.status !== 0) {
  console.error(comp.stdout || "Sin stdout");
  console.error(comp.stderr || "Sin stderr");
  process.exit(2);
}

const require = createRequire(import.meta.url);
const out = path.join(__dirname, ".tmp-cf3");
const CARGA = require(path.join(out, "carga-academica.js"));
const INSC = require(path.join(out, "inscripciones-borrador.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok  ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

// CURP mexicanas (18 caracteres, formato real).
const CURP_X = "GARC850101HDFRRN07";
const CURP_Y = "PERE920305MCLRRN09";
const CURP_NOEXISTE = "ZZZZ990101HDFRRN09";

/* Cliente Supabase simulado (PostgREST mínimo:
 * select/eq/neq/in/limit/range/order/maybeSingle/insert/upsert/update). */
let _id = 1;
const nid = () => `f3p-${_id++}`;
function crearDb() {
  return {
    esquemaEstado: true,
    periodos: [], grupos: [], carreras: [], materias: [], grupo_materias: [],
    inscripciones_alumno: [], ALUMNOS: [],
  };
}
class Q {
  constructor(db, tabla) {
    this.db = db; this.tabla = tabla; this.f = []; this.single = false;
    this.op = "read"; this.patch = null; this.filas = null; this.limite = Infinity;
    this.desde = 0; this.hasta = null; this.orden = null; this.cols = "";
  }
  select(cols) { this.cols = cols || "*"; return this; }
  eq(c, v) { this.f.push(["eq", c, v]); return this; }
  neq(c, v) { this.f.push(["neq", c, v]); return this; }
  in(c, vs) { this.f.push(["in", c, vs]); return this; }
  limit(n) { this.limite = n; return this; }
  range(a, b) { this.desde = a; this.hasta = b; return this; }
  order(col, opts) { this.orden = [col, opts?.ascending !== false]; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(filas) { this.op = "insert"; this.filas = Array.isArray(filas) ? filas : [filas]; return this; }
  upsert(filas) { this.op = "upsert"; this.filas = Array.isArray(filas) ? filas : [filas]; return this; }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  async _ej() {
    const db = this.db;
    if (db.esquemaEstado === false && this.tabla === "periodos" && /\bestado\b/.test(this.cols)) {
      return { data: null, error: { message: "column periodos.estado does not exist (42703)" } };
    }
    let r = db[this.tabla] ?? [];
    for (const [op, c, v] of this.f) {
      r = r.filter((x) => {
        if (op === "eq") return x[c] === v;
        if (op === "neq") return x[c] !== v;
        if (op === "in") return (v ?? []).includes(x[c]);
        return true;
      });
    }
    if (this.op === "update") {
      for (const x of r) Object.assign(x, this.patch);
      return { data: null, error: null };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const creadas = [];
      for (const f of this.filas) {
        const hay = this.op === "upsert" && (db[this.tabla] ?? []).some(
          (x) => x.curp === f.curp && x.grupo_id === f.grupo_id,
        );
        if (hay) {
          const objetivo = (db[this.tabla] ?? []).find(
            (x) => x.curp === f.curp && x.grupo_id === f.grupo_id,
          );
          Object.assign(objetivo, f);
          creadas.push(objetivo);
        } else {
          const fila = { id: nid(), ...f, created_at: new Date().toISOString() };
          db[this.tabla].push(fila);
          creadas.push(fila);
        }
      }
      return { data: this.single ? (creadas[0] ?? null) : creadas, error: null };
    }
    if (this.orden) {
      const [col, asc] = this.orden;
      r = [...r].sort((a, b) => {
        const va = a[col] ?? ""; const vb = b[col] ?? "";
        if (va === vb) return 0;
        const cmp = va < vb ? -1 : 1;
        return asc ? cmp : -cmp;
      });
    }
    if (this.hasta !== null) r = r.slice(this.desde, this.hasta + 1);
    else if (this.desde > 0) r = r.slice(this.desde);
    if (r.length > this.limite) r = r.slice(0, this.limite);
    return { data: this.single ? (r[0] ?? null) : r, error: null };
  }
  then(res, rej) { return this._ej().then(res, rej); }
}
const cliente = (db) => ({ from: (tabla) => new Q(db, tabla) });

/* Helpers de datos y CSV. */
function archivoCsv(lineas) {
  return new File([lineas.join("\n")], "roster.csv", { type: "text/csv" });
}
function csvRosterX() {
  return archivoCsv([
    "CURP,NOMBRE,P_APELLIDO,S_APELLIDO,GRADO,GRUPO,CARRERA",
    `${CURP_X},PRUEBA,F3,F3,3RO,A,RH`,
  ]);
}
function csvRosterCurp(valor) {
  return archivoCsv([
    "CURP,NOMBRE,P_APELLIDO,S_APELLIDO,GRADO,GRUPO,CARRERA",
    `${valor},PRUEBA,F3,F3,3RO,A,RH`,
  ]);
}
function filasPeriodo(db, periodoId) {
  const gids = new Set(
    db.grupos.filter((g) => g.periodo_id === periodoId).map((g) => g.id),
  );
  return db.inscripciones_alumno.filter((r) => gids.has(r.grupo_id));
}
const firma = (filas) =>
  JSON.stringify(
    filas.map((r) => ({
      id: r.id, curp: r.curp, grupo_id: r.grupo_id,
      activo: Boolean(r.activo), created_at: r.created_at,
    })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
function baseDbAB() {
  const db = crearDb();
  db.periodos.push(
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null, created_at: "2026-08-01" },
    { id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null, created_at: "2026-09-03" },
  );
  db.carreras.push(
    { id: "RH", clave: "RH", nombre: "Relaciones Humanas", activo: true },
    { id: "CA", clave: "CA", nombre: "Contabilidad", activo: true },
  );
  db.grupos.push(
    { id: "gA1", periodo_id: "A", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gA2", periodo_id: "A", grado: "1RO", nombre: "A", carrera_id: null, activo: true },
    { id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gB2", periodo_id: "B", grado: "1RO", nombre: "A", carrera_id: null, activo: true },
  );
  db["ALUMNOS"].push(
    { CURP: CURP_X, NOMBRE: "PRUEBA", P_APELLIDO: "F3", S_APELLIDO: "F3" },
    { CURP: CURP_Y, NOMBRE: "SEGUNDO", P_APELLIDO: "F3", S_APELLIDO: "F3" },
  );
  db.inscripciones_alumno.push({
    id: "rA1", curp: CURP_X, grupo_id: "gA1", activo: true, created_at: "2026-08-01T00:00:00",
  });
  return db;
}
const contextoB = () => ({
  periodoId: "B", periodoNombre: "PRUEBA-F3", grado: "", grupo: "", carrera: "",
});

/* CASO A — BORRADOR sin OPERATIVO: preview y apply con periodoId=B funcionan. */
{
  const db = crearDb();
  db.periodos.push({ id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null });
  db.carreras.push({ id: "RH", clave: "RH", nombre: null, activo: true });
  db.grupos.push({ id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true });
  db["ALUMNOS"].push({ CURP: CURP_X, NOMBRE: "PRUEBA", P_APELLIDO: "F3", S_APELLIDO: "F3" });
  const sb = cliente(db);
  const antes = firma(db.inscripciones_alumno);
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("A1: preview OK en BORRADOR sin OPERATIVO", prev.ok === true, JSON.stringify(prev).slice(0, 300));
  ok("A2: preview NO escribe", antes === firma(db.inscripciones_alumno));
  ok("A3: clasificación NUEVA_INSCRIPCION", prev.ok && prev.academico.nuevasInscripciones === 1);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("A4: apply OK sin OPERATIVO", res.ok === true, JSON.stringify(res));
  const filaB = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("A5: fila B creada con activo=false", Boolean(filaB && filaB.activo === false));
}

/* CASO B (CRÍTICO) — Aislamiento A/B: X activo en A; carga dirigida a B. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const antesA = firma(filasPeriodo(db, "A"));
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("B1: preview aislamiento OK", prev.ok === true, JSON.stringify(prev).slice(0, 300));
  const d = prev.ok && prev.detalle.find((x) => x.curp === CURP_X);
  ok("B2: preview es NUEVA_INSCRIPCION (no CAMBIO_DE_GRUPO)", d && d.estado === "NUEVA_INSCRIPCION", JSON.stringify(d));
  ok("B3: preview NO escribe", antesA === firma(filasPeriodo(db, "A")) && db.inscripciones_alumno.length === 1);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("B4: apply OK", res.ok === true && res.inscripciones.nuevas === 1, JSON.stringify(res));
  const filaB = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("B5: B tiene X→B1 activo=false", Boolean(filaB && filaB.activo === false));
  ok(
    "B6: A intacto (ninguna fila de A modificada)",
    antesA === firma(filasPeriodo(db, "A")),
    `antes=${antesA} despues=${firma(filasPeriodo(db, "A"))}`,
  );
  const activasX = db.inscripciones_alumno.filter((x) => x.curp === CURP_X && x.activo);
  ok("B7: X sigue con UNA activa en A", activasX.length === 1 && activasX[0].grupo_id === "gA1");
}

/* CASO C — Dos BORRADORES: A=BORRADOR y B=BORRADOR. A debe permanecer intacto. */
{
  const db = crearDb();
  db.periodos.push(
    { id: "A", nombre: "A-BORRADOR", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null },
    { id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null },
  );
  db.carreras.push({ id: "RH", clave: "RH", nombre: null, activo: true });
  db.grupos.push(
    { id: "gA1", periodo_id: "A", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
  );
  db["ALUMNOS"].push({ CURP: CURP_X, NOMBRE: "PRUEBA", P_APELLIDO: "F3", S_APELLIDO: "F3" });
  db.inscripciones_alumno.push({
    id: "rA1", curp: CURP_X, grupo_id: "gA1", activo: false, created_at: "2026-07-01T00:00:00",
  });
  const sb = cliente(db);
  const antesA = firma(filasPeriodo(db, "A"));
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("C1: apply dos BORRADORES OK", res.ok === true && res.inscripciones.nuevas === 1, JSON.stringify(res));
  ok("C2: A (BORRADOR) intacto", antesA === firma(filasPeriodo(db, "A")), `antes=${antesA} despues=${firma(filasPeriodo(db, "A"))}`);
  const filaB = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("C3: B tiene fila con activo=false", Boolean(filaB && filaB.activo === false));
  ok("C4: sin filas activas en ningún BORRADOR", db.inscripciones_alumno.every((x) => x.activo === false));
}

/* CASO D — BORRADOR inactive: toda nueva inscripción en BORRADOR tiene activo=false. */
{
  const db = crearDb();
  db.periodos.push({ id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null });
  db.carreras.push({ id: "RH", clave: "RH", nombre: null, activo: true });
  db.grupos.push({ id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true });
  db["ALUMNOS"].push({ CURP: CURP_X, NOMBRE: "PRUEBA", P_APELLIDO: "F3", S_APELLIDO: "F3" });
  const sb = cliente(db);
  const r = await INSC.inscribirAlumnoEnCiclo(sb, { curp: CURP_X, grupoId: "gB1", periodoId: "B" });
  ok("D1: inscribirAlumnoEnCiclo en BORRADOR OK", r.ok === true && r.activo === false, JSON.stringify(r));
  const fila = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("D2: fila creada con activo=false", Boolean(fila && fila.activo === false));
  ok("D3: no hay activas", db.inscripciones_alumno.every((x) => x.activo === false));
}

/* CASO E — ALUMNO existe en ALUMNOS pero no tiene inscripción en B → se crea B. */
{
  const db = baseDbAB();
  // X no está inscrito (se elimina su fila en A para aislar E).
  db.inscripciones_alumno = [];
  const sb = cliente(db);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("E1: apply OK", res.ok === true && res.inscripciones.nuevas === 1, JSON.stringify(res));
  const filaB = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("E2: X inscrito en B (activo=false)", Boolean(filaB && filaB.activo === false));
}

/* CASO F — CURP inexistente en ALUMNOS: no_encontrado sin inscripción inventada. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const antes = firma(db.inscripciones_alumno);
  const r = await INSC.inscribirAlumnoEnCiclo(sb, { curp: CURP_NOEXISTE, grupoId: "gB1", periodoId: "B" });
  ok("F1: no_encontrado", r.ok === false && r.estado === "no_encontrado", JSON.stringify(r));
  ok("F2: sin escritura", antes === firma(db.inscripciones_alumno));

  // En el pipeline, una CURP con formato inválido NO genera inscripción.
  const db2 = crearDb();
  db2.periodos.push({ id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador" });
  db2.grupos.push({ id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: null, activo: true });
  db2["ALUMNOS"].push({ CURP: CURP_X });
  const sb2 = cliente(db2);
  const res2 = await CARGA.aplicarCargaAcademica(sb2, csvRosterCurp("MAL"), { contexto: contextoB() });
  ok("F3: CURP inválida en pipeline no crea inscripción", res2.ok === true && db2.inscripciones_alumno.length === 0, JSON.stringify(db2.inscripciones_alumno));
}

/* CASO G — Invariante cross-period: la operación con periodoId=B no toca filas de
 * otros períodos (INSERT/UPDATE/DELETE/desactivación). */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const filasOriginales = db.inscripciones_alumno.map((x) => ({ ...x }));
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("G1: apply OK", res.ok === true, JSON.stringify(res));

  const gidsA = new Set(db.grupos.filter((g) => g.periodo_id === "A").map((g) => g.id));
  const gidsB = new Set(db.grupos.filter((g) => g.periodo_id === "B").map((g) => g.id));
  const fueraDeB = db.inscripciones_alumno.filter((x) => !gidsB.has(x.grupo_id));
  const originalesFueraDeB = filasOriginales.filter((x) => !gidsB.has(x.grupo_id));
  ok(
    "G2: ninguna fila fuera de B fue insertada/update/desactivada",
    firma(fueraDeB) === firma(originalesFueraDeB),
    `antes=${firma(originalesFueraDeB)} despues=${firma(fueraDeB)}`,
  );
  const filasB = db.inscripciones_alumno.filter((x) => gidsB.has(x.grupo_id));
  ok("G3: se agregó exactamente 1 fila en B", filasB.length === 1 && filasB[0].grupo_id === "gB1");
  const aIntacta = db.inscripciones_alumno.filter((x) => gidsA.has(x.grupo_id));
  ok("G4: fila original de A intacta (activo=true)", aIntacta.length === 1 && aIntacta[0].activo === true && aIntacta[0].curp === CURP_X);
}

/* CASO H — Grupo de OTRO período + periodoId=B → rechazo grupo_de_otro_periodo. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const antes = firma(db.inscripciones_alumno);
  const r = await INSC.inscribirAlumnoEnCiclo(sb, { curp: CURP_X, grupoId: "gA1", periodoId: "B" });
  ok("H1: grupo_de_otro_periodo", r.ok === false && r.estado === "grupo_de_otro_periodo", JSON.stringify(r));
  ok("H2: sin escritura", antes === firma(db.inscripciones_alumno));

  // Pipeline: el nombre de un grupo que solo existe en A dentro de una carga B
  // → GRUPO_INEXISTENTE (bloquea escritura).
  const db2 = crearDb();
  db2.periodos.push(
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo" },
    { id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador" },
  );
  db2.grupos.push(
    { id: "gA1", periodo_id: "A", grado: "3RO", nombre: "A", carrera_id: null, activo: true },
    { id: "gB1", periodo_id: "B", grado: "1RO", nombre: "B", carrera_id: null, activo: true },
  );
  db2["ALUMNOS"].push({ CURP: CURP_X });
  const sb2 = cliente(db2);
  const res2 = await CARGA.aplicarCargaAcademica(sb2, csvRosterX(), { contexto: { ...contextoB(), grado: "", grupo: "", carrera: "" } });
  ok("H3: grupo inexistente en B bloquea escritura", res2.ok === false && res2.error && /bloquean la escritura/.test(res2.error), JSON.stringify(res2).slice(0, 200));
  ok("H4: sin escrituras tras bloqueo", db2.inscripciones_alumno.length === 0);
}

/* CASO I — HISTORICO: rechazo antes de escribir. */
{
  const db = crearDb();
  db.periodos.push(
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo" },
    { id: "H", nombre: "2025-2026", activo: false, estado: "historico" },
  );
  db.carreras.push({ id: "RH", clave: "RH" });
  db.grupos.push(
    { id: "gH1", periodo_id: "H", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gA1", periodo_id: "A", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
  );
  db["ALUMNOS"].push({ CURP: CURP_X });
  const sb = cliente(db);
  const ctxH = { ...contextoB(), periodoId: "H", periodoNombre: "2025-2026" };
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: ctxH });
  ok("I1: preview rechaza HISTORICO", prev.ok === false && /HISTORICO/.test(prev.error ?? ""), JSON.stringify(prev).slice(0, 200));
  const antes = JSON.stringify(db);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: ctxH });
  ok("I2: apply rechaza HISTORICO", res.ok === false, JSON.stringify(res));
  ok("I3: sin escrituras", antes === JSON.stringify(db));
}

/* CASO J — período inexistente: rechazo antes de escribir. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const ctxX = { ...contextoB(), periodoId: "NOEXISTE", periodoNombre: "X" };
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: ctxX });
  ok("J1: preview rechaza período inexistente", prev.ok === false && /no existe/.test(prev.error ?? ""), JSON.stringify(prev).slice(0, 200));
  const antes = JSON.stringify(db);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: ctxX });
  ok("J2: apply rechaza período inexistente", res.ok === false, JSON.stringify(res));
  ok("J3: sin escrituras", antes === JSON.stringify(db));
}

/* CASO K — Legacy: sin periodoId el comportamiento anterior sigue funcionando
 * (resolución por nombre del ciclo OPERATIVO; BORRADOR no es destino legacy). */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const antes = firma(db.inscripciones_alumno);
  const ctxLegacy = { periodoNombre: "2026-2027", grado: "", grupo: "", carrera: "" };
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: ctxLegacy });
  ok("K1: legacy preview OK", prev.ok === true, JSON.stringify(prev).slice(0, 300));
  ok("K2: legacy clasifica SIN_CAMBIO (X ya activo en A)", prev.ok && prev.academico.sinCambio === 1 && prev.academico.nuevasInscripciones === 0);
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: ctxLegacy });
  ok("K3: legacy apply OK sin cambios", res.ok === true && res.inscripciones.nuevas === 0 && res.inscripciones.cambiosDeGrupo === 0, JSON.stringify(res));
  ok("K4: legacy NO escribió filas nuevas", antes === firma(db.inscripciones_alumno));

  // Legacy hacia el nombre de un BORRADOR sigue sin resolver (semántica antigua).
  const prevB = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), {
    contexto: { periodoNombre: "PRUEBA-F3", grado: "", grupo: "", carrera: "" },
  });
  ok("K5: legacy con nombre BORRADOR → SIN_DATOS_ACADEMICOS (intacto)", prevB.ok === true && prevB.academico.sinDatosAcademicos === 1);
}

/* CASO L — Grupos homónimos A.4A / B.4A: con periodoId=B se selecciona B.4A. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  const d = prev.ok && prev.detalle.find((x) => x.curp === CURP_X);
  ok("L1: grupo destino resuelto a gB1 (no gA1)", d && d.grupoDestinoId === "gB1", JSON.stringify(d));
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  const filaB = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  const filaA = db.inscripciones_alumno.find((x) => x.curp === CURP_X && x.grupo_id === "gA1");
  ok("L2: apply crea solo la fila B (gB1)", Boolean(filaB && filaB.activo === false));
  ok("L3: la fila A (gA1) permanece activa", Boolean(filaA && filaA.activo === true));
}

/* CASO M — Preview vs Apply: preview → 0 escrituras; apply → escritura explícita. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const antes = JSON.stringify(db);
  const prev = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("M1: preview ok", prev.ok === true);
  ok("M2: preview → 0 escrituras", antes === JSON.stringify(db));
  const res = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("M3: apply escribe (B recibe fila)", res.ok === true && db.inscripciones_alumno.length === 2, JSON.stringify(res));
}

/* CASO N — Idempotencia: aplicar la misma carga dos veces no duplica. */
{
  const db = baseDbAB();
  const sb = cliente(db);
  const r1 = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  const prev2 = await CARGA.previsualizarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("N1: segunda preview clasifica SIN_CAMBIO", prev2.ok === true && prev2.academico.sinCambio === 1 && prev2.academico.nuevasInscripciones === 0, JSON.stringify(prev2.academico));
  const r2 = await CARGA.aplicarCargaAcademica(sb, csvRosterX(), { contexto: contextoB() });
  ok("N2: segundo apply OK sin nuevas", r1.ok === true && r2.ok === true && r2.inscripciones.nuevas === 0 && r2.inscripciones.errores === 0, JSON.stringify(r2));
  const enB = filasPeriodo(db, "B").filter((x) => x.curp === CURP_X && x.grupo_id === "gB1");
  ok("N3: no hay duplicados en B (1 fila)", enB.length === 1);
}

console.log(`\nF3 PIPELINE FUNCIONAL (mock): ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);

