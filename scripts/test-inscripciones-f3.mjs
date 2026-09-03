// test-inscripciones-f3.mjs — Pruebas F3: preparación académica de BORRADOR
// (grupos/materias vía listado + inscripciones explícitas) sin activar y sin
// tocar el OPERATIVO. Usa un cliente Supabase simulado en memoria.
//
// Compilar:
//   npx tsc lib/escolar/inscripciones-borrador.ts --outDir scripts/.tmp-insc-f3 ^
//     --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
//   node scripts/test-inscripciones-f3.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-insc-f3");
const IN = require(path.join(dir, "inscripciones-borrador.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

/* Cliente simulado mínimo (subconjunto PostgREST usado por inscripciones F3). */
let _id = 1;
const nid = () => `f3-${_id++}`;
function crearDb({ esquemaEstado = true } = {}) {
  return {
    esquemaEstado,
    periodos: [], grupos: [], carreras: [], materias: [], grupo_materias: [],
    inscripciones_alumno: [], ALUMNOS: [],
  };
}
class Q {
  constructor(db, tabla) { this.db = db; this.tabla = tabla; this.f = []; this.single = false; this.op = "read"; this.patch = null; this.limite = Infinity; this.cols = ""; }
  select(cols) { this.cols = cols || "*"; return this; }
  eq(c, v) { this.f.push(["eq", c, v]); return this; }
  neq(c, v) { this.f.push(["neq", c, v]); return this; }
  in(c, vs) { this.f.push(["in", c, vs]); return this; }
  limit(n) { this.limite = n; return this; }
  order() { return this; }
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
    if (this.op === "update") { for (const x of r) Object.assign(x, this.patch); return { data: null, error: null }; }
    if (this.op === "insert" || this.op === "upsert") {
      const creadas = [];
      for (const f of this.filas) {
        const existe = this.op === "upsert" && (db[this.tabla] ?? []).some(
          (x) => x.curp === f.curp && x.grupo_id === f.grupo_id,
        );
        if (existe) {
          const objetivo = (db[this.tabla] ?? []).find((x) => x.curp === f.curp && x.grupo_id === f.grupo_id);
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
    if (r.length > this.limite) r = r.slice(0, this.limite);
    return { data: this.single ? (r[0] ?? null) : r, error: null };
  }
  then(res, rej) { return this._ej().then(res, rej); }
}

/* ---------------------------------------------------------------------------
 * Datos base: A = OPERATIVO, B = BORRADOR, alumno X activo en A.
 * ------------------------------------------------------------------------- */
function baseDb() {
  const db = crearDb();
  db.periodos.push(
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null, created_at: "2026-08-01" },
    { id: "B", nombre: "PRUEBA-F3", activo: false, estado: "borrador", fecha_inicio: "2027-08-30", fecha_fin: "2028-06-30", created_at: "2026-09-03" },
  );
  db.grupos.push(
    { id: "gA1", periodo_id: "A", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gB1", periodo_id: "B", grado: "3RO", nombre: "A", carrera_id: "RH", activo: true },
    { id: "gB2", periodo_id: "B", grado: "1RO", nombre: "A", carrera_id: null, activo: true },
  );
  db.carreras.push({ id: "RH", clave: "RH" });
  db.materias.push({ id: "m1", clave: "MAT", nombre: "Matemáticas", activo: true });
  db.grupo_materias.push({ grupo_id: "gB1", materia_id: "m1", activo: true }, { grupo_id: "gB2", materia_id: "m1", activo: true });
  db["ALUMNOS"].push({ CURP: "XALUMNO", NOMBRE: "PRUEBA", P_APELLIDO: "F3", S_APELLIDO: "F3" });
  db.inscripciones_alumno.push({ id: "rA1", curp: "XALUMNO", grupo_id: "gA1", activo: true, created_at: "2026-08-01T00:00:00" });
  return db;
}

/* CASO 1 — Inscribir alumno válido en BORRADOR → OK (activo=false) */
{
  const db = baseDb();
  const sb = cliente(db);
  const r = await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gB1", periodoId: "B" });
  ok("Inscr1: ok", r.ok, JSON.stringify(r));
  ok("Inscr1: activo=false", r.ok && r.activo === false);
  const fila = db.inscripciones_alumno.find((x) => x.curp === "XALUMNO" && x.grupo_id === "gB1");
  ok("Inscr1: fila en B existe con activo=false", Boolean(fila && fila.activo === false));
}

/* CASO 2 — Duplicado en el mismo grupo → bloqueado */
{
  const db = baseDb();
  const sb = cliente(db);
  await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gB1", periodoId: "B" });
  const r2 = await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gB1", periodoId: "B" });
  ok("Inscr2: duplicado bloqueado", r2.ok === false && r2.estado === "duplicado_en_grupo", JSON.stringify(r2));
}

/* CASO 3 — Grupo de OTRO periodo → bloqueado (referencia cruzada) */
{
  const db = baseDb();
  const sb = cliente(db);
  const r = await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gA1", periodoId: "B" });
  ok("Inscr3: referencia cruzada bloqueada", r.ok === false && r.estado === "grupo_de_otro_periodo", JSON.stringify(r));
}

/* CASO 4 — Alumno inexistente → bloqueado */
{
  const db = baseDb();
  const sb = cliente(db);
  const r = await IN.inscribirAlumnoEnCiclo(sb, { curp: "NOEXISTE", grupoId: "gB1", periodoId: "B" });
  ok("Inscr4: alumno inexistente bloqueado", r.ok === false && r.estado === "no_encontrado", JSON.stringify(r));
}

/* CASO 5 + anti-P0 — Configurar B no altera A */
{
  const db = baseDb();
  const sb = cliente(db);
  await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gB1", periodoId: "B" });
  const a = db.periodos.find((p) => p.id === "A");
  const b = db.periodos.find((p) => p.id === "B");
  ok("AntiP0: A sigue OPERATIVO/activo", a && a.activo === true && a.estado === "operativo");
  ok("AntiP0: B sigue BORRADOR/activo=false", b && b.activo === false && b.estado === "borrador");
  ok("AntiP0: exactamente un periodo activo", db.periodos.filter((p) => p.activo).length === 1);
  const activas = db.inscripciones_alumno.filter((x) => x.activo);
  ok("AntiP0: el alumno sigue con UNA activa (en A)", activas.length === 1 && activas[0].grupo_id === "gA1", JSON.stringify(activas));
}

/* CASO 6 — Modificar HISTORICO → bloqueado */
{
  const db = baseDb();
  db.periodos.push({ id: "H", nombre: "2025-2026", activo: false, estado: "historico", fecha_inicio: null, fecha_fin: null });
  db.grupos.push({ id: "gH1", periodo_id: "H", grado: "1RO", nombre: "A", carrera_id: null, activo: true });
  db["ALUMNOS"].push({ CURP: "YOTRO", NOMBRE: "OTRO", P_APELLIDO: "H", S_APELLIDO: "H" });
  const sb = cliente(db);
  const r = await IN.inscribirAlumnoEnCiclo(sb, { curp: "YOTRO", grupoId: "gH1", periodoId: "H" });
  ok("Inscr6: histórico bloqueado", r.ok === false && r.estado === "periodo_bloqueado", JSON.stringify(r));
}

/* CASO 7 — Resolución del alumno operativo no se contamina con B */
{
  const db = baseDb();
  const sb = cliente(db);
  await IN.inscribirAlumnoEnCiclo(sb, { curp: "XALUMNO", grupoId: "gB1", periodoId: "B" });
  const activas = db.inscripciones_alumno.filter((x) => x.activo && x.curp === "XALUMNO");
  ok("Inscr7: el alumno operativo mantiene UNA activa", activas.length === 1);
  ok("Inscr7: esa activa pertenece al ciclo A (operativo)", activas.length === 1 && db.grupos.find((g) => g.id === activas[0].grupo_id)?.periodo_id === "A");
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);

function cliente(db) {
  return { from: (tabla) => new Q(db, tabla) };
}
