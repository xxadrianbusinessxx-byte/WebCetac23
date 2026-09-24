// test-asistencia-contexto.mjs — Pruebas F7 (contexto de asistencia).
// Ejecutar (Node carga los .ts de lib/ directamente; no hay paso de compilar): node scripts/test-asistencia-contexto.mjs
const C = await import("../lib/escolar/asistencia/asistencia-contexto.ts");

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

const pA = { id: "A", fecha_inicio: "2026-08-01", fecha_fin: "2026-12-31" };

// Plantilla de A contra contexto A → ok; contra B → rechazo.
{
  ok("F7: plantilla A contra A ok", C.validarContextoPlantilla({ periodoId: "A" }, { periodoId: "A" }).ok);
  const r = C.validarContextoPlantilla({ periodoId: "A" }, { periodoId: "B" });
  ok("F7: plantilla de B no se carga contra A", r.ok === false && r.codigo === "plantilla_ciclo_incorrecto", JSON.stringify(r));
}

// Fecha dentro/fuera del periodo.
{
  ok("F7: fecha dentro ok", C.clasePertenecePeriodo({ fecha: "2026-09-10" }, pA).ok);
  const r = C.clasePertenecePeriodo({ fecha: "2027-09-10" }, pA);
  ok("F7: fecha fuera de periodo rechazada", r.ok === false && r.codigo === "fecha_fuera_de_periodo", JSON.stringify(r));
}

// Justificación cruzada.
{
  const r = C.validarJustificacionContexto("A", { periodo_id: "B", fecha: "2026-09-10" }, pA);
  ok("F7: justificación de B contra A rechazada", r.ok === false && r.codigo === "justificacion_ciclo_incorrecto", JSON.stringify(r));
  ok("F7: justificación de A contra A ok", C.validarJustificacionContexto("A", { periodo_id: "A", fecha: "2026-09-10" }, pA).ok);
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
