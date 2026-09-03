// test-auditoria-ciclo-f2.mjs — FASE 2: auditoría del Excel académico.
// Mapea el flujo real (preview/confirmación existentes) y los huecos del wizard.
// Estático; no inventa parser ni CRUD paralelos.
// Uso: node scripts/test-auditoria-ciclo-f2.mjs

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

const actCarga = leer("app/actions/carga-academica.ts");
const libCarga = leer("lib/escolar/carga-academica.ts");
const paso = leer("app/components/ciclo-configurador/paso-academico.tsx");
const client = leer("app/configuracion/configuracion-client.tsx");
const recon = leer("app/components/reconocimiento-academico.tsx");

// Flujo Excel real existente (reutilizar, no duplicar).
ok("preview existe (SOLO LECTURA)", /actionPrevisualizarCargaAcademica/.test(actCarga));
ok("aplicación separada (confirmación explícita)", /actionAplicarCargaAcademica/.test(actCarga));
ok("dominio con previsualizar/aplicar separados", /previsualizarCargaAcademica/.test(libCarga) && /aplicarCargaAcademica/.test(libCarga));
ok("consumidores externos al wizard existen", recon.includes("actionPrevisualizarCargaAcademica") && client.includes("actionAplicarCargaAcademica"));
ok("parser CSV existente reutilizado", /archivoCsvAFilas/.test(recon));

// Identidad actual de la carga (GAP documentado).
ok("GAP: la carga resuelve contexto por periodoNombre (no periodoId destino)",
  /extraerContexto/.test(actCarga) && /periodoNombre/.test(actCarga));
ok("GAP: wizard PasoAcademico solo clona (no importa Excel)", !/archivo|Excel|FormData/.test(paso) && paso.includes("actionClonarContextoAcademico"));
ok("PasoAcademico recibe periodoId", /periodoId/.test(paso));

// Sin parser/CRUD paralelos nuevos en el wizard.
ok("sin parser paralelo en PasoAcademico", !/new .*Parser|xlsx\.read/.test(paso));
ok("sin vigente", !/vigente/.test(paso + actCarga + libCarga));

// Aislamiento estructural esperado (contrato; implementación F2 pendiente).
ok("grupos tienen periodo_id (modelo)", /periodo_id/.test(leer("supabase/crear-tablas-catalogo-academico.sql")));
ok("grupo_materias usa grupo_id/materia_id/tabla_legacy", /grupo_id/.test(leer("supabase/crear-tablas-catalogo-academico.sql")) && /tabla_legacy/.test(leer("supabase/crear-tablas-catalogo-academico.sql")));

// validarIntegridadCiclo sigue siendo autoridad (F7).
const ce = leer("lib/escolar/ciclo-estado.ts");
ok("validarIntegridadCiclo sigue siendo autoridad única", /export async function validarIntegridadCiclo/.test(ce));

console.log(`\nFASE 2 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
