// test-calendario-periodo-f5.mjs — F5 FUNCIONAL: calendario resuelto por
// periodo_id (casos A–D + guardar/eliminar/base). Cliente Supabase SIMULADO.
//
// Compilar primero:
//   npx tsc lib/escolar/calendario.ts --rootDir lib/escolar --outDir scripts/.tmp-f5 ^
//     --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
//   node scripts/test-calendario-periodo-f5.mjs

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-f5");
const CAL = require(path.join(dir, "calendario.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok  ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

/* Cliente mínimo: select/eq/order/limit/upsert/delete sobre un array en memoria. */
function cliente(seed) {
  const filas = seed.map((f) => ({ ...f }));
  class Cadena {
    constructor() {
      this.o = { tipo: "read", eq: [], filas: null, opts: null };
    }
    select() { return this; }
    eq(c, v) { this.o.eq.push([c, v]); return this; }
    order() { return this; }
    limit() { return this; }
    delete() { this.o.tipo = "delete"; return this; }
    upsert(filas, opts) { this.o.tipo = "upsert"; this.o.filas = filas; this.o.opts = opts; return this._r(); }
    _r() {
      const o = this.o;
      if (o.tipo === "read") {
        let out = [...filas];
        for (const [c, v] of o.eq) out = out.filter((f) => f[c] === v);
        return Promise.resolve({ data: out, error: null });
      }
      if (o.tipo === "delete") {
        for (const [c, v] of o.eq) {
          for (let i = filas.length - 1; i >= 0; i--) {
            if (filas[i][c] === v) filas.splice(i, 1);
          }
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (o.tipo === "upsert") {
        const lista = Array.isArray(o.filas) ? o.filas : [o.filas];
        for (const f of lista) {
          const idx = filas.findIndex((x) => x.ciclo_escolar === f.ciclo_escolar && x.fecha === f.fecha);
          if (idx >= 0) filas[idx] = { ...filas[idx], ...f };
          else filas.push({ ...f });
        }
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }
    then(r, j) { return this._r().then(r, j); }
  }
  return {
    from() { return new Cadena(); },
    _filas() { return filas; },
  };
}
const fila = (id, ciclo, fecha, tipo = "clase", periodo_id = null) =>
  ({ id, ciclo_escolar: ciclo, fecha, tipo, descripcion: null, creado_por: null, created_at: null, periodo_id });

/* Caso A — periodo con calendario propio. */
{
  const c = cliente([fila("1", "2026-2027", "2026-09-07", "clase", "A")]);
  const dias = await CAL.obtenerCalendarioDePeriodo(c, "A", "2026-2027");
  ok("casoA: lee solo registros del periodo A", dias.length === 1 && dias[0].fecha === "2026-09-07");
}
/* Caso B — dos periodos; A jamás devuelve B. */
{
  const c = cliente([
    fila("1", "2026-2027", "2026-09-07", "clase", "A"),
    fila("2", "2026-2027", "2026-09-08", "festivo", "B"),
    fila("3", "2026-2027", "2026-09-09", "clase", "B"),
  ]);
  const dias = await CAL.obtenerCalendarioDePeriodo(c, "A", "2026-2027");
  ok("casoB: A no devuelve registros de B", dias.length === 1 && dias[0].id === "1");
}
/* Caso C — registro legacy (periodo_id NULL) queda fuera del flujo nuevo. */
{
  const c = cliente([
    fila("L", "2026-2027", "2026-09-07", "clase", null),
    fila("1", "2026-2027", "2026-09-08", "clase", "A"),
  ]);
  const dias = await CAL.obtenerCalendarioDePeriodo(c, "A", "2026-2027");
  ok("casoC: legacy NULL no se infiere ni se mezcla", dias.length === 1 && dias[0].id === "1");
}
/* Caso D — mismo nombre de ciclo, periodos distintos por id. */
{
  const c = cliente([
    fila("1", "2026-2027", "2026-09-07", "clase", "X"),
    fila("2", "2026-2027", "2026-09-08", "clase", "Y"),
  ]);
  const diasX = await CAL.obtenerCalendarioDePeriodo(c, "X", "2026-2027");
  ok("casoD: mismo nombre no confunde periodos", diasX.length === 1 && diasX[0].id === "1");
}
/* Guardar (UPSERT) por periodo. */
{
  const c = cliente([]);
  const g = await CAL.guardarDiaCalendarioDePeriodo(c, {
    periodoId: "A", periodoNombre: "2026-2027", fecha: "2026-09-07",
    tipo: "festivo", descripcion: "Inicio", creadoPor: "directivo",
  });
  const filas = c._filas();
  ok("guardar: ok y fila con periodo_id + ciclo legacy", g.ok && filas.length === 1 && filas[0].periodo_id === "A" && filas[0].ciclo_escolar === "2026-2027");
}
/* Eliminar por periodo. */
{
  const c = cliente([fila("1", "2026-2027", "2026-09-07", "clase", "A")]);
  const e = await CAL.eliminarDiaCalendarioDePeriodo(c, "A", "2026-09-07");
  ok("eliminar: ok y elimina SOLO la fila del periodo", e.ok && c._filas().length === 0);
}
/* Establecer base por periodo (rango laborable). */
{
  const c = cliente([]);
  const r = await CAL.establecerCalendarioBaseDePeriodo(c, {
    periodoId: "A", periodoNombre: "2026-2027", inicio: "2026-09-07", fin: "2026-09-11", creadoPor: "directivo",
  });
  const filas = c._filas();
  ok("base: genera 5 días clase del periodo", r.ok && r.generados === 5 && filas.length === 5 && filas.every((f) => f.periodo_id === "A" && f.tipo === "clase"));
}

console.log(`\nF5 CALENDARIO PERIODO: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
