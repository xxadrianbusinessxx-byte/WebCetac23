// test-ciclo-estado.mjs — Pruebas F1 (estado BORRADOR/OPERATIVO/HISTORICO e
// integridad). Usa un cliente Supabase MÍNIMO simulado (solo `periodos`) y el
// dominio puro. No toca datos reales ni requiere DDL.
//
// Compilar primero:
//   npx tsc lib/escolar/ciclo-estado.ts --outDir scripts/.tmp-ciclo-estado ^
//     --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
//   node scripts/test-ciclo-estado.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-ciclo-estado");
const M = require(path.join(dir, "ciclo-estado.js"));
const P = require(path.join(dir, "ciclo-estado-puro.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

/* Cliente mínimo: solo operaciones sobre `periodos` (crear/consultar/estado). */
function clientePeriodos(periodos, esquemaEstado = true) {
  class Q {
    constructor() { this.f = []; this.single = false; this.op = "read"; this.patch = null; }
    select(cols) { this.colsSeleccion = cols || ""; return this; }
    eq(c, v) { this.f.push([c, v]); return this; }
    limit() { return this; }
    order() { return this; }
    maybeSingle() { this.single = true; return this; }
    insert(filas) { this.op = "insert"; this.filas = Array.isArray(filas) ? filas : [filas]; return this; }
    update(p) { this.op = "update"; this.patch = p; return this; }
    async _ej() {
      const conEstado = String(this.colsSeleccion ?? "").includes("estado");
      if (this.colsSeleccion === undefined) this.colsSeleccion = "";
      if (esquemaEstado === false && this.colsSeleccion.includes("estado")) {
        return { data: null, error: { message: "column periodos.estado does not exist (42703)" } };
      }
      let r = periodos;
      for (const [c, v] of this.f) r = r.filter((x) => x[c] === v);
      if (this.op === "update") { for (const x of r) Object.assign(x, this.patch); return { data: null, error: null }; }
      if (this.op === "insert") {
        const creadas = [];
        for (const f of this.filas) {
          const fila = { id: `p-${periodos.length + 1}`, ...f };
          periodos.push(fila);
          creadas.push(fila);
        }
        return { data: this.single ? (creadas[0] ?? null) : creadas, error: null };
      }
      return { data: this.single ? (r[0] ?? null) : r, error: null };
    }
    then(res, rej) { return this._ej().then(res, rej); }
  }
  return {
    from: () => new Q(),
  };
}


/* ---------------------------------------------------------------------------
 * Datos de apoyo (contexto válido para validarIntegridad)
 * ------------------------------------------------------------------------- */
function datosValidos(overrides = {}) {
  return {
    periodo: { id: "P", nombre: "2027-2028", activo: false, estado: "borrador", fecha_inicio: "2027-08-30", fecha_fin: "2028-06-30" },
    grupos: [{ id: "g1", grado: "1RO", nombre: "A", carrera_id: null, activo: true }],
    grupoMaterias: [{ grupo_id: "g1", materia_id: "m1", activo: true }],
    materiasActivas: new Set(["m1"]),
    inscripciones: [{ curp: "X1RO", grupo_id: "g1", activo: true }],
    parciales: [{ id: "e1", numero: 1, nombre: "Parcial 1", fecha_inicio: "2027-09-01", fecha_fin: "2027-10-31", activo: true }],
    diasClase: 1,
    ...overrides,
  };
}

/* CASO 1 — crearCicloBorrador: BORRADOR y NO operativo */
{
  const periodos = [];
  const sb = clientePeriodos(periodos, true);
  const r = await M.crearCicloBorrador(sb, { nombre: "2028-2029", fechaInicio: "2028-08-30", fechaFin: "2029-06-30" });
  ok("Caso1: crear devuelve ok", r.ok, JSON.stringify(r));
  const creado = periodos[0];
  ok("Caso1: activo=false", creado && creado.activo === false);
  ok("Caso1: estado='borrador'", creado && creado.estado === "borrador");
  ok("Caso1: mensaje indica BORRADOR", /BORRADOR/.test(r.mensaje ?? ""));
}

/* CASO 2 — BORRADOR admite configuración y permanece BORRADOR */
{
  const periodos = [{ id: "B", nombre: "2027-2028", activo: false, estado: "borrador", fecha_inicio: null, fecha_fin: null }];
  const sb = clientePeriodos(periodos, true);
  const permiso = await M.configuracionPermitidaEnPeriodo(sb, "B");
  ok("Caso2: configuración permitida en BORRADOR", permiso.ok, JSON.stringify(permiso));
  const estado = await M.estadoActualCiclo(sb, "B");
  ok("Caso2: sigue BORRADOR tras consultar/configurar", estado.ok && estado.estado === "borrador" && estado.activo === false, JSON.stringify(estado));
}

/* CASO 3 — Ciclo incompleto → validación bloquea (con errores) */
{
  const r = P.validarIntegridadCiclo({
    ...datosValidos(),
    grupos: [],
    grupoMaterias: [],
    inscripciones: [],
    materiasActivas: new Set(),
  });
  ok("Caso3: integridad en rojo", r.ok === false);
  ok("Caso3: hay errores bloqueantes", r.errores.length > 0, JSON.stringify(r.errores));
  ok("Caso3: incluye sin_grupos y sin_inscripciones", r.errores.some((e) => e.codigo === "sin_grupos") && r.errores.some((e) => e.codigo === "sin_inscripciones"));
}

/* CASO 4 — Ciclo completo → validación en verde */
{
  const r = P.validarIntegridadCiclo(datosValidos());
  ok("Caso4: integridad en verde", r.ok, JSON.stringify(r.errores));
}

/* CASO 5 — Activar B → A pasa a inactivo; B operativo (plan exclusivo) */
{
  const filas = [
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo" },
    { id: "B", nombre: "2027-2028", activo: false, estado: "borrador" },
  ];
  const plan = P.planActivacionExclusiva(filas, "B");
  const aplicadas = P.aplicarPlanActivacion(filas, plan.cambios);
  ok("Caso5: B operativo", aplicadas.find((p) => p.id === "B")?.activo === true && aplicadas.find((p) => p.id === "B")?.estado === "operativo");
  ok("Caso5: A inactivo", aplicadas.find((p) => p.id === "A")?.activo === false);
  ok("Caso5: exactamente un operativo", P.unicoOperativo(aplicadas));
}

/* CASO 6 — Imposible terminar con dos operativos */
{
  const filas = [
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo" },
    { id: "B", nombre: "2027-2028", activo: true, estado: "operativo" },
  ];
  const plan = P.planActivacionExclusiva(filas, "B");
  const aplicadas = P.aplicarPlanActivacion(filas, plan.cambios);
  ok("Caso6: queda un único operativo", P.unicoOperativo(aplicadas));
  ok("Caso6: el objetivo B es el operativo", aplicadas.find((p) => p.id === "B")?.activo === true);
}

/* CASO 7 — 1RO sin carrera es válido */
{
  const r = P.validarIntegridadCiclo(datosValidos());
  ok("Caso7: validación ok (1RO sin carrera)", r.ok, JSON.stringify(r.errores));
  ok("Caso7: ningún error de carrera", !r.errores.some((e) => e.codigo === "grupo_sin_carrera_grado_superior"));
}

/* Compatibilidad legacy: sin columna estado */
{
  const periodos = [{ id: "L", nombre: "2026-2027", activo: true }];
  const sb = clientePeriodos(periodos, false);
  const r = await M.crearCicloBorrador(sb, { nombre: "LEGACY" });
  ok("Legacy: crear ok sin esquema", r.ok, JSON.stringify(r));
  const creado = periodos.find((p) => p.nombre === "LEGACY");
  ok("Legacy: activo=false", creado && creado.activo === false);
  const est = await M.estadoActualCiclo(sb, "L");
  ok("Legacy: activo=true → OPERATIVO", est.ok && est.estado === "operativo", JSON.stringify(est));
}

/* PRUEBA ANTI-P0 — crear/configurar un BORRADOR no toca al OPERATIVO */
{
  const periodos = [
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
  ];
  const sb = clientePeriodos(periodos, true);
  const r = await M.crearCicloBorrador(sb, { nombre: "B-NUEVO", fechaInicio: "2028-08-30", fechaFin: "2029-06-30" });
  ok("AntiP0: crear B devuelve ok", r.ok, JSON.stringify(r));
  const b = periodos.find((p) => p.nombre === "B-NUEVO");
  ok("AntiP0: B es BORRADOR con activo=false", b && b.activo === false && b.estado === "borrador");
  const a = periodos.find((p) => p.id === "A");
  ok("AntiP0: A sigue OPERATIVO", a && a.activo === true && a.estado === "operativo");
  ok("AntiP0: exactamente un OPERATIVO", periodos.filter((p) => p.activo).length === 1);
}

/* F4 — activar un HISTORICO (esquema) está bloqueado */
{
  const periodos = [
    { id: "OP", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
    { id: "HI", nombre: "2025-2026", activo: false, estado: "historico", fecha_inicio: null, fecha_fin: null },
  ];
  const sb = clientePeriodos(periodos, true);
  const r = await M.activarCicloOperativo(sb, "HI");
  ok("F4: histórico no puede reactivarse", r.ok === false && /HISTORICO/.test(r.error ?? ""), JSON.stringify(r));
}

/* F4 — activar el único OPERATIVO es idempotente */
{
  const periodos = [
    { id: "OP", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
  ];
  const sb = clientePeriodos(periodos, true);
  const r = await M.activarCicloOperativo(sb, "OP");
  ok("F4: ya único operativo → ok sin cambios", r.ok, JSON.stringify(r));
}

/* F4 — orquestador: crear ciclo con contexto deja BORRADOR no activo */
{
  const periodos = [];
  const sb = clientePeriodos(periodos, true);
  const ORQ = require(path.join(dir, "orquestador-ciclo.js"));
  const r = await ORQ.crearCicloConContexto(sb, { nombre: "F4-ORQ", fechaInicio: "2028-08-30", fechaFin: "2029-06-30" });
  ok("F4: orquestador crea ok", r.ok, JSON.stringify(r));
  const fila = periodos.find((p) => p.nombre === "F4-ORQ");
  ok("F4: orquestador deja BORRADOR activo=false", fila && fila.activo === false && fila.estado === "borrador", JSON.stringify(fila));
}

/* F1 — resolución del CICLO GLOBAL (obtenerCicloOperativoGlobal). */
{
  const periodos = [
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
    { id: "B", nombre: "2025-2026", activo: false, estado: "historico", fecha_inicio: null, fecha_fin: null },
  ];
  const sb = clientePeriodos(periodos, true);
  const r = await M.obtenerCicloOperativoGlobal(sb);
  ok("F1 caso1: operativo por estado → A", r.ok && r.periodo?.id === "A" && r.via === "estado", JSON.stringify(r));
}
{
  const periodos = [{ id: "A", nombre: "2026-2027", activo: true }];
  const sb = clientePeriodos(periodos, false);
  const r = await M.obtenerCicloOperativoGlobal(sb);
  ok("F1 caso2: legacy activo=true → A (fallback)", r.ok && r.periodo?.id === "A" && r.via === "fallback_activo", JSON.stringify(r));
}
{
  const periodos = [{ id: "A", nombre: "2026-2027", activo: false, estado: "operativo", fecha_inicio: null, fecha_fin: null }];
  const sb = clientePeriodos(periodos, true);
  const r = await M.obtenerCicloOperativoGlobal(sb);
  ok("F1 caso3: activo=false pero estado=operativo → A (estado manda)", r.ok && r.periodo?.id === "A" && r.via === "estado", JSON.stringify(r));
}
{
  const periodos = [
    { id: "A", nombre: "2026-2027", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
    { id: "B", nombre: "2027-2028", activo: true, estado: "operativo", fecha_inicio: null, fecha_fin: null },
  ];
  const sb = clientePeriodos(periodos, true);
  const r = await M.obtenerCicloOperativoGlobal(sb);
  ok("F1 caso4: dos OPERATIVO → error (sin elección arbitraria)", !r.ok && /OPERATIVO simultáneos/.test(r.error ?? ""), JSON.stringify(r));
}
{
  const periodos = [];
  const sb = clientePeriodos(periodos, true);
  const r = await M.obtenerCicloOperativoGlobal(sb);
  ok("F1 caso5: sin operativo ni legacy → null controlado", r.ok && r.periodo === null && r.via === "ninguno", JSON.stringify(r));
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);

