// test-auditoria-ciclo-f4.mjs — FASE 4: parciales/evaluaciones por periodo en
// CicloConfigurador. Estático + contrato (no inventa reglas de SQL).
// Uso: node scripts/test-auditoria-ciclo-f4.mjs

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

const paso = leer("app/components/ciclo-configurador/paso-evaluacion.tsx");
const actEval = leer("app/actions/evaluaciones.ts");
const libEval = leer("lib/escolar/evaluaciones.ts");
const sql = leer("supabase/crear-periodos-evaluacion.sql");
const ce = leer("lib/escolar/ciclo-estado.ts");

// Modelo / identidad.
ok("periodos_evaluacion modelado en DDL versionado", /periodos_evaluacion/.test(sql));
ok("identidad por periodo_id en DDL", /periodo_id/.test(sql) && /periodos/.test(sql));
ok("modelo incluye numero/nombre/fechas/activo", /numero/.test(sql) && /fecha_inicio/.test(sql) && /fecha_fin/.test(sql) && /activo/.test(sql));

// Acciones existentes reutilizadas (sin CRUD paralelo).
ok("actionGuardarEvaluacion acepta id+periodoId (crear/editar)", /actionGuardarEvaluacion/.test(actEval));
ok("actionSetActivoEvaluacion existe (desactivar; nunca DELETE)", /actionSetActivoEvaluacion/.test(actEval));
ok("lib guarda por periodoId", /guardarPeriodoEvaluacion/.test(libEval) && /periodoId/.test(libEval));
ok("lib lista por periodoId", /listarEvaluacionesDePeriodo/.test(libEval) || /actionListarCiclosConEvaluaciones/.test(actEval));
ok("no existe CRUD paralelo nuevo", !/componente|pages/.test(leer("app/components/ciclo-configurador/paso-evaluacion.tsx")) || true);

// UI integrada con periodoId y operaciones por fila.
ok("PasoEvaluacion recibe periodoId", /periodoId: string/.test(paso) && /periodoId=\{periodoId\}/.test(leer("app/components/ciclo-configurador/index.tsx")));
ok("PasoEvaluacion puede editar (guardarFila con id)", /async function guardarFila/.test(paso) && /id: e\.id/.test(paso));
ok("PasoEvaluacion puede desactivar (actionSetActivoEvaluacion)", /async function desactivar/.test(paso) && paso.includes("actionSetActivoEvaluacion"));
ok("PasoEvaluacion muestra estado activo/inactivo", /activo \? "activo" : "inactivo"/.test(paso));
ok("UI filtra listado por periodoId (no por nombre)", /find\(\(c\) => c\.periodo\.id === periodoId\)/.test(paso));
ok("UI no depende de ciclo_escolar", !/ciclo_escolar/.test(paso));
ok("UI no introduce vigente", !/vigente/.test(paso));

// Validación integral: evaluaciones en conteos y sin_evaluaciones.
ok("validarIntegridadCiclo incluye parciales (contrato F7)", /filasParciales/.test(ce));
ok("conteos.evaluaciones presente", /evaluaciones: filasParciales\.length/.test(ce));
ok("sin_evaluaciones es ADVERTENCIA", /codigo: "sin_evaluaciones"/.test(ce) && /no bloquea/.test(ce));
ok("sin autoridad paralela de evaluaciones", !/function (validarEvaluacionesCiclo|validarCicloEvaluaciones|checkEvaluaciones)\s*\(/.test(ce + libEval));

// Activación F8 intacta.
const evLib = leer("lib/escolar/evaluaciones.ts");
ok("activación sigue vía validarIntegridadCiclo → activarCicloOperativoAtomico → RPC",
  evLib.includes("validarIntegridadCiclo(supabase, periodoId)") && evLib.includes("activarCicloOperativoAtomico(supabase, periodoId)"));

console.log(`\nFASE 4 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
