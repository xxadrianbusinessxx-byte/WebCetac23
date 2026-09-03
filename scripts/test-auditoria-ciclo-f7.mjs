// test-auditoria-ciclo-f7.mjs — FASE 7: validación integral coordinada.
// Verifica que existe UNA validación de servidor (validarIntegridadCiclo),
// que la UI la consume y que la activación respeta el contrato (previa → RPC).
// Solo lectura del filesystem + relación estática entre archivos.
// Uso: node scripts/test-auditoria-ciclo-f7.mjs

import fs from "node:fs";
import path from "node:path";
const raiz = path.resolve(".");
const leer = (rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, "utf8");
};
let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok  ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

const ce = leer("lib/escolar/ciclo-estado.ts");
const evLib = leer("lib/escolar/evaluaciones.ts");
const pasoV = leer("app/components/ciclo-configurador/paso-validacion.tsx");
const appEval = leer("app/actions/evaluaciones.ts");

// 1) Una única autoridad de validación (sin paralelas).
const defs = (fs.readdirSync("lib/escolar").map((f) => fs.readFileSync(path.join("lib/escolar", f), "utf8")));
ok("validarIntegridadCiclo definida UNA vez en lib/escolar", defs.filter((c) => /export async function validarIntegridadCiclo/.test(c)).length === 1);
const alternativos = defs.filter((c) => /function (validarCicloCompleto|validarCiclo\b|puedeActivarCiclo|esCicloValido|checkCiclo|validarAntesDeActivar)\s*\(/.test(c));
ok("no existen validaciones paralelas nuevas (validarCicloCompleto etc.)", alternativos.length === 0, alternativos.join(","));

// 2) La validación está anclada a periodo_id.
ok("validarIntegridadCiclo consulta por periodo_id", ce.includes('.eq("periodo_id", periodoId)') || ce.includes('.in("grupo_id", grupoIds)'));

// 3) UI consume el resultado del servidor (bloqueadores/advertencias/resumen).
ok("PasoValidacion muestra bloqueadores", pasoV.includes("d.errores") && pasoV.includes("Bloqueadores"));
ok("PasoValidacion muestra advertencias", pasoV.includes("d.advertencias") && pasoV.includes("Advertencias"));
ok("PasoValidacion muestra resumen/conteos", pasoV.includes("d.conteos"));
ok("PasoValidacion decide listo/bloqueado por d.ok", /d\.ok \? "Puede activarse" : "NO puede activarse"/.test(pasoV));
ok("PasoValidacion deshabilita activación si no ok", /disabled=\{!d\.ok/.test(pasoV));

// 4) Activación respeta el contrato: validación previa antes de la RPC.
const idxPrevia = evLib.indexOf("validarIntegridadCiclo(supabase, periodoId)");
const idxAtomico = evLib.indexOf("activarCicloOperativoAtomico(supabase, periodoId)");
ok("setActivoCiclo ejecuta validación previa antes de la RPC", idxPrevia !== -1 && idxAtomico !== -1 && idxPrevia < idxAtomico);
ok("advertencias NO bloquean (solo !ok bloquea)", /if \(!previa\.ok\)/.test(evLib) && !/previa\.advertencias.*length/.test(evLib));
ok("Server Action conserva la acción de detalle para la UI", appEval.includes("actionDetalleCicloAdmin"));

// 5) Sin identidad nueva por nombre ni vigente en el flujo validación.
ok("PasoValidacion no usa ciclo_escolar como identidad", !pasoV.includes("ciclo_escolar"));
ok("sin vigente en validación/activación", !/vigente/.test(ce + evLib + pasoV + appEval));

// 6) Invariantes críticos permanecen en la capa RPC (no solo UI/TS).
const rpc = leer("supabase/crear-rpc-activar-ciclo-f4.sql");
ok("RPC conserva RAISE sin grupos/materias/alumnos", /RAISE EXCEPTION 'sin grupos/.test(rpc) && /RAISE EXCEPTION 'sin materias/.test(rpc) && /RAISE EXCEPTION 'sin alumnos/.test(rpc));
ok("RPC bloquea histórico", /historico/.test(rpc));

console.log(`\nFASE 7 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
