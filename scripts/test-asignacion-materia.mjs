#!/usr/bin/env node
/**
 * test-asignacion-materia.mjs — suite de la decisión PURA de asignar una
 * materia de grupo a un profesor (`lib/escolar/catalogo/asignacion-materia-puro.ts`,
 * 2026-11-17).
 *
 * Qué protege. Desde 2026-11-17 la propiedad de una materia vive SOLO en
 * `asignaciones_profesor` y la asigna el técnico: subir asistencia ya no la da.
 * Una materia tiene UN dueño activo. Si el plan se equivoca, una materia queda
 * con dos profesores (los dos justificarían las mismas faltas) o un alta en lote
 * barre a los demás profesores del grupo.
 *
 * Reglas verificadas:
 *   1. Materia sin filas → insertar, nada que desactivar.
 *   2. El mismo profesor ya activo → «ya_activa», nada que desactivar.
 *   3. El mismo profesor inactivo → reactivar SU fila (historial), sin insertar.
 *   4. Otro dueño activo → se desactiva (nunca se borra) y se informa a quién.
 *   5. Fila legacy (profesor_id NULL) con la CLAVE del profesor → reconciliar;
 *      la CLAVE vacía nunca reconcilia nada.
 *   6. Las filas inactivas de otros no se tocan: son historial.
 *   7. Sin `reemplazar`, una materia con otro dueño se detiene (el lote no barre);
 *      con `reemplazar`, sigue. El mensaje dice qué hacer.
 */
const M = await import("../lib/escolar/catalogo/asignacion-materia-puro.ts");

let pasos = 0;
let fallos = 0;
function ok(cond, nombre) {
  pasos++;
  if (cond) console.log(`  OK ${nombre}`);
  else {
    fallos++;
    console.error(`  FALLA ${nombre}`);
  }
}
const fila = (id, profesor_id, activo, profesor_clave = "X") => ({
  id,
  profesor_id,
  profesor_clave,
  activo,
});

console.log("1) Materia sin filas → insertar");
{
  const p = M.planAsignarMateria([], 7, "P7");
  ok(p.accion.tipo === "insertar", "accion insertar");
  ok(p.desactivar.length === 0 && p.reemplazados.length === 0, "nada que desactivar");
}

console.log("2) El mismo profesor ya activo → ya_activa");
{
  const p = M.planAsignarMateria([fila("a", 7, true)], 7, "P7");
  ok(p.accion.tipo === "ya_activa" && p.accion.filaId === "a", "ya_activa sobre su fila");
  ok(p.desactivar.length === 0, "no se desactiva a sí mismo");
}

console.log("3) El mismo profesor inactivo → reactivar su fila");
{
  const p = M.planAsignarMateria([fila("a", 7, false)], 7, "P7");
  ok(p.accion.tipo === "reactivar" && p.accion.filaId === "a", "reactiva la fila con historial");
}

console.log("4) Otro dueño activo → se desactiva y se informa");
{
  const p = M.planAsignarMateria([fila("b", 9, true)], 7, "P7");
  ok(p.accion.tipo === "insertar", "el nuevo se inserta");
  ok(p.desactivar.length === 1 && p.desactivar[0] === "b", "la fila del anterior se desactiva");
  ok(p.reemplazados.length === 1 && p.reemplazados[0] === 9, "se informa a quién reemplaza");

  const q = M.planAsignarMateria([fila("a", 7, false), fila("b", 9, true)], 7, "P7");
  ok(q.accion.tipo === "reactivar" && q.desactivar[0] === "b", "reactivar al nuevo y desactivar al anterior");
}

console.log("5) Fila legacy con la CLAVE del profesor → reconciliar");
{
  const p = M.planAsignarMateria([fila("l", null, false, "p7 ")], 7, "P7");
  ok(p.accion.tipo === "reconciliar" && p.accion.filaId === "l", "reconcilia (CLAVE sin mayúsculas ni espacios)");
  const activaLegacy = M.planAsignarMateria([fila("l", null, true, "P7")], 7, "P7");
  ok(activaLegacy.desactivar.length === 0, "la fila que se reconcilia no se desactiva a sí misma");
  const sinClave = M.planAsignarMateria([fila("l", null, false, "")], 7, "");
  ok(sinClave.accion.tipo === "insertar", "la CLAVE vacía nunca reconcilia");
  const ajena = M.planAsignarMateria([fila("l", null, true, "P9")], 7, "P7");
  ok(
    ajena.accion.tipo === "insertar" && ajena.desactivar[0] === "l" && ajena.reemplazados.length === 0,
    "una legacy activa de OTRA clave se desactiva (sin id que informar)",
  );
}

console.log("6) Las filas inactivas de otros no se tocan");
{
  const p = M.planAsignarMateria([fila("b", 9, false), fila("c", 11, false)], 7, "P7");
  ok(p.desactivar.length === 0 && p.reemplazados.length === 0, "historial intacto");
}

console.log("7) Sin reemplazar, una materia con otro dueño se detiene");
{
  const p = M.planAsignarMateria([fila("b", 9, true)], 7, "P7");
  ok(M.bloqueaPorOtroDueno(p, false) === true, "el lote (sin reemplazar) se detiene");
  ok(M.bloqueaPorOtroDueno(p, true) === false, "el alta individual (reemplazar) sigue");
  const libre = M.planAsignarMateria([], 7, "P7");
  ok(M.bloqueaPorOtroDueno(libre, false) === false, "una materia libre nunca se detiene");
  const msg = M.errorMateriaConOtroDueno([9]);
  ok(/ya tiene profesor/i.test(msg) && /9/.test(msg), "el mensaje dice de quién es");
  ok(/individual/i.test(msg), "y qué hacer para cambiarlo");
}

console.log("");
if (fallos > 0) {
  console.error(`FALLA ${fallos}/${pasos}`);
  process.exit(1);
}
console.log(`OK ${pasos}/${pasos}`);
