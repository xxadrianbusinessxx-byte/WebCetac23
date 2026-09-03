// test-roster-validacion.mjs — Pruebas F6 (coherencia horario + profesor ambiguo).
// Compilar: npx tsc lib/escolar/roster-validacion.ts --outDir scripts/.tmp-rv ^
//   --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-rv");
const R = require(path.join(dir, "roster-validacion.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

const base = {
  periodoId: "A",
  grupos: [
    { id: "gA1", periodo_id: "A" },
    { id: "gB1", periodo_id: "B" },
  ],
  grupoMaterias: [{ grupo_id: "gA1", materia_id: "m1", activo: true }],
  materias: [{ id: "m1", activo: true }],
};

// 1) Horario de A con grupo de B → error.
{
  const errs = R.validarCoherenciaHorario(base, [{ periodo_id: "A", grupo_id: "gB1", materia_id: "m1" }]);
  ok("F6: grupo de otro periodo rechazado", errs.some((e) => e.codigo === "grupo_de_otro_periodo"), JSON.stringify(errs));
}
// 2) Materia no vinculada al grupo → error.
{
  const errs = R.validarCoherenciaHorario(base, [{ periodo_id: "A", grupo_id: "gA1", materia_id: "mX" }]);
  ok("F6: materia ajena al grupo rechazada", errs.some((e) => e.codigo === "materia_no_pertenece_grupo"), JSON.stringify(errs));
}
// 3) Bloque correcto → sin errores.
{
  const errs = R.validarCoherenciaHorario(base, [{ periodo_id: "A", grupo_id: "gA1", materia_id: "m1" }]);
  ok("F6: bloque coherente aceptado", errs.length === 0, JSON.stringify(errs));
}
// 4) Horario de B no debe verse como de A (periodo distinto) → error.
{
  const errs = R.validarCoherenciaHorario(base, [{ periodo_id: "B", grupo_id: "gB1", materia_id: "m1" }]);
  ok("F6: bloque del otro periodo rechazado", errs.some((e) => e.codigo === "bloque_periodo_incorrecto"), JSON.stringify(errs));
}
// 5) Profesor ambiguo (CLAVE repetida con IDs distintos) detectado.
{
  const amb = R.profesoresClaveAmbiguos([
    { id: 1, clave: "4321", nombre: "A" },
    { id: 2, clave: "4321", nombre: "B" },
    { id: 3, clave: "8080", nombre: "ADMIN" },
  ]);
  ok("F6: clave 4321 reportada como ambigua", amb.some((a) => a.clave === "4321" && a.filas.length === 2), JSON.stringify(amb));
  ok("F6: clave única no reportada", !amb.some((a) => a.clave === "8080"));
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
