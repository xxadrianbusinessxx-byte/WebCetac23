#!/usr/bin/env node
/**
 * test-borrar-paso.mjs — PROMPT-4/T4 suite de la decisión PURA de bloqueo del
 * borrado por paso (`calcularBloqueosPaso` en borrar-paso.ts).
 *
 * Reglas verificadas:
 *   1. académico vacío → bloquea (nada que borrar).
 *   2. académico con inscripciones → bloquea (huérfanas); sin inscripciones y
 *      con contexto → no bloquea.
 *   3. horario/calendario con actividad registrada (clases/asistencias/
 *      justificaciones) → bloquea; sin actividad → no bloquea.
 *   4. roster en OPERATIVO con inscripciones → bloquea (usar T3); en BORRADOR
 *      → no bloquea; sin inscripciones → bloquea.
 *   5. evaluaciones → nunca bloquea por sí solo.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const tmp = path.join(__dirname, ".tmp-borrar-paso");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const codigo = fs.readFileSync(
  path.join(root, "lib/escolar/ciclo/borrar-paso-puro.ts"),
  "utf8",
);
const { outputText } = ts.transpileModule(codigo, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
  fileName: "borrar-paso-puro.ts",
});
fs.writeFileSync(path.join(tmp, "borrar-paso-puro.js"), outputText);

const { calcularBloqueosPaso } = require(path.join(tmp, "borrar-paso-puro.js"));

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
function seccion(t) {
  console.log(`\n${t}`);
}

const base = {
  estado: "borrador",
  activo: false,
  grupos: 0,
  grupoMaterias: 0,
  inscripciones: 0,
  asignaciones: 0,
  clasesImpartidas: 0,
  asistenciaAlumnos: 0,
  justificaciones: 0,
};

seccion("academico");
{
  const b = calcularBloqueosPaso({ ...base, paso: "academico" });
  ok(b.some((x) => /contexto académico/.test(x)), "vacío → bloquea (nada que borrar)");

  const conInsc = calcularBloqueosPaso({
    ...base,
    paso: "academico",
    grupos: 24,
    grupoMaterias: 241,
    inscripciones: 357,
  });
  ok(
    conInsc.some((x) => /inscripciones/.test(x)),
    "con inscripciones → bloquea (huérfanas)",
  );

  const limpio = calcularBloqueosPaso({
    ...base,
    paso: "academico",
    grupos: 24,
    grupoMaterias: 241,
  });
  ok(limpio.length === 0, "con contexto y sin inscripciones/asignaciones → puede borrarse");
}

seccion("horario / calendario");
{
  const conActividad = calcularBloqueosPaso({
    ...base,
    paso: "horario",
    grupos: 24,
    asistenciaAlumnos: 100,
  });
  ok(conActividad.some((x) => /actividad registrada/.test(x)), "horario con asistencias → bloquea");

  const calActividad = calcularBloqueosPaso({
    ...base,
    paso: "calendario",
    justificaciones: 5,
  });
  ok(calActividad.some((x) => /actividad registrada/.test(x)), "calendario con justificaciones → bloquea");

  const limpioH = calcularBloqueosPaso({ ...base, paso: "horario", grupos: 24 });
  ok(limpioH.length === 0, "horario sin actividad → puede borrarse");
}

seccion("roster");
{
  const operativo = calcularBloqueosPaso({
    ...base,
    paso: "roster",
    activo: true,
    estado: "operativo",
    inscripciones: 357,
  });
  ok(operativo.some((x) => /OPERATIVO/.test(x)), "OPERATIVO con inscripciones → bloquea (usar T3)");

  const borrador = calcularBloqueosPaso({
    ...base,
    paso: "roster",
    inscripciones: 357,
  });
  ok(borrador.length === 0, "BORRADOR con inscripciones → puede borrarse (deshacer preparado)");

  const vacio = calcularBloqueosPaso({ ...base, paso: "roster" });
  ok(vacio.some((x) => /No hay inscripciones/.test(x)), "sin inscripciones → bloquea");
}

seccion("evaluaciones");
{
  const b = calcularBloqueosPaso({ ...base, paso: "evaluaciones" });
  ok(b.length === 0, "nunca bloquea por sí solo");
}

console.log(`\nResultado: ${pasos} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
