#!/usr/bin/env node
/**
 * test-alcance-profesor.mjs — suite de la regla PURA de qué asistencia ve un
 * profesor (`lib/escolar/asistencia/alcance-profesor-puro.ts`, 2026-11-18).
 *
 * Qué protege. Capturar no da la materia (2026-11-17): la fila guarda quién la
 * capturó. Si el alcance del profesor siguiera saliendo de la autoría, el dueño
 * de una materia no vería lo que Servicio Escolar subió por él (caso real:
 * 1RO A · Ciencias Naturales I). Y si se abriera de más, vería las materias de
 * otros profesores del grupo.
 *
 * Reglas verificadas:
 *   1. Materia asignada capturada por OTRO → la ve.
 *   2. Lo que él capturó en una materia NO asignada → lo ve.
 *   3. Materia de otro profesor, capturada por otro → no la ve.
 *   4. Fila sin materia (legacy / marcador) → solo si la capturó él.
 *   5. Sin asignaciones → la regla anterior: solo lo suyo.
 *   6. El filtro conserva orden y filas; acepta profesor_id como texto numérico.
 *   7. Acceso al grupo: asignado en él o ya capturó ahí; ninguno → no.
 */
const M = await import("../lib/escolar/asistencia/alcance-profesor-puro.ts");

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

const CN = "gm-ciencias-naturales";
const MAT = "gm-matematicas";
const ING = "gm-ingles";
const PROFESOR = 19;
const SERVICIO = 23;
const OTRO = 7;
const alcance = { profesorId: PROFESOR, materiasAsignadas: new Set([CN]) };
const fila = (grupo_materia_id, profesor_id) => ({ grupo_materia_id, profesor_id });

console.log("1) Materia asignada capturada por otro → la ve");
ok(M.filaEnAlcanceProfesor(fila(CN, SERVICIO), alcance), "capturada por Servicio Escolar");
ok(M.filaEnAlcanceProfesor(fila(CN, null), alcance), "sin autor, en su materia");

console.log("2) Lo que capturó en una materia no asignada → lo ve");
ok(M.filaEnAlcanceProfesor(fila(MAT, PROFESOR), alcance), "su captura en materia ajena");

console.log("3) Materia de otro, capturada por otro → no la ve");
ok(!M.filaEnAlcanceProfesor(fila(MAT, OTRO), alcance), "materia y autor ajenos");
ok(!M.filaEnAlcanceProfesor(fila(ING, SERVICIO), alcance), "Servicio Escolar en materia ajena");

console.log("4) Fila sin materia → solo si es suya");
ok(M.filaEnAlcanceProfesor(fila(null, PROFESOR), alcance), "legacy suya");
ok(!M.filaEnAlcanceProfesor(fila(null, SERVICIO), alcance), "legacy / marcador ajeno");
ok(!M.filaEnAlcanceProfesor(fila(null, null), alcance), "legacy sin autor");

console.log("5) Sin asignaciones → solo lo suyo");
{
  const sin = { profesorId: PROFESOR, materiasAsignadas: new Set() };
  ok(M.filaEnAlcanceProfesor(fila(CN, PROFESOR), sin), "lo suyo sí");
  ok(!M.filaEnAlcanceProfesor(fila(CN, SERVICIO), sin), "lo de otro no");
}

console.log("6) El filtro conserva orden y filas");
{
  const filas = [
    { id: 1, ...fila(CN, SERVICIO) },
    { id: 2, ...fila(MAT, OTRO) },
    { id: 3, ...fila(MAT, PROFESOR) },
    { id: 4, ...fila(null, SERVICIO) },
    { id: 5, ...fila(CN, SERVICIO) },
  ];
  const vistas = M.filtrarPorAlcanceProfesor(filas, alcance);
  ok(vistas.map((f) => f.id).join(",") === "1,3,5", "deja 1, 3 y 5 en orden");
  ok(vistas[0] === filas[0], "devuelve las mismas filas (no copias)");
  ok(M.filaEnAlcanceProfesor(fila(MAT, "19"), alcance), "profesor_id como texto numérico");
}

console.log("7) Acceso al grupo");
ok(M.accesoProfesorAGrupo({ asignadoEnGrupo: true, capturoEnGrupo: false }), "asignado sin capturar");
ok(M.accesoProfesorAGrupo({ asignadoEnGrupo: false, capturoEnGrupo: true }), "capturó sin asignación");
ok(!M.accesoProfesorAGrupo({ asignadoEnGrupo: false, capturoEnGrupo: false }), "ni una ni otra → no");

console.log("");
if (fallos > 0) {
  console.error(`FALLA ${fallos}/${pasos}`);
  process.exit(1);
}
console.log(`OK ${pasos}/${pasos}`);
