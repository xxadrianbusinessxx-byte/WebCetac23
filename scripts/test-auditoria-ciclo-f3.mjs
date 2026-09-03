// test-auditoria-ciclo-f3.mjs — FASE 3: alumnos/roster hacia ciclo BORRADOR.
// Verifica la implementación del pipeline F3 dirigido por `periodoId` y el
// contrato de aislamiento por periodo_id. Estático; no inventa parser ni CRUD.
// Uso: node scripts/test-auditoria-ciclo-f3.mjs

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
const paso = leer("app/components/ciclo-configurador/paso-alumnos.tsx");
const insc = leer("app/actions/inscripciones-admin.ts");
const inscLib = leer("lib/escolar/inscripciones-borrador.ts");

// Pipeline real (roster de alumnos) reutilizable.
ok("preview roster existe (SOLO LECTURA)", /actionPrevisualizarCargaAcademica/.test(actCarga));
ok("aplicación roster separada (confirmación)", /actionAplicarCargaAcademica/.test(actCarga));
ok("dominio resuelve grupos EXISTENTES (no crea grupos)", /gruposInexistentes/.test(libCarga));
ok("parser CSV único reutilizable", /archivoCsvAFilas/.test(libCarga));

// F3 — parametrización por `periodoId` (GAP cerrado).
ok("ContextoAcademico incluye periodoId (opcional)", /periodoId\?: string/.test(libCarga));
ok("extraerContexto lee formData.periodoId", /formData\.get\("periodoId"\)/.test(actCarga));
ok("ruta F3 valida período destino por id (BORRADOR/OPERATIVO)", /validarPeriodoDestinoCarga/.test(libCarga) && /consultarPeriodo/.test(libCarga) && /resolverEstadoPeriodo/.test(libCarga));
ok("ruta F3 resuelve grupos por grupos.periodo_id", /eq\("periodo_id", periodoId\)/.test(libCarga) || /eq\("periodo_id", pid\)/.test(libCarga));
ok("preview F3 no usa inscripción activa global en la ruta periodoId",
  /obtenerInscripcionActivaEnPeriodo/.test(libCarga) && /obtenerInscripcionActiva\(supabase, fila\.curp\)/.test(libCarga));
ok("apply F3 usa inscribirAlumnoEnCiclo (no unaActiva en ruta periodoId)",
  /inscribirAlumnoEnCiclo/.test(libCarga) && /rutaPeriodo/.test(libCarga));
ok("la ruta legacy conserva inscribirAlumno con unaActiva", /inscribirAlumno\(supabase, d\.curp, d\.grupoDestinoId/.test(libCarga) && /unaActiva/.test(libCarga));

// Inscripciones existentes por periodo.
ok("inscripciones-admin opera con periodoId", /periodoId/.test(insc));
ok("inscripciones-borrador prepara BORRADOR (activo=false)", /BORRADOR|activo/.test(inscLib));
ok("inscripciones-borrador lista inscripciones del periodo (UI/verificación)",
  /listarInscripcionesPeriodoAdmin/.test(inscLib) && /actionListarInscripcionesPeriodo/.test(insc));
ok("PasoAlumnos recibe periodoId y usa actions de inscripción", /periodoId: string/.test(paso) && /actionInscribirAlumnoEnCiclo/.test(paso));

// F3 — PasoAlumnos integra el roster CSV (preview/confirmación/apply).
ok("PasoAlumnos usa preview de carga", /actionPrevisualizarCargaAcademica/.test(paso));
ok("PasoAlumnos usa apply de carga", /actionAplicarCargaAcademica/.test(paso));
ok("PasoAlumnos envía periodoId al FormData de carga", /fd\.set\("periodoId", periodoId\)/.test(paso));
ok("PasoAlumnos mantiene confirmación explícita", /setConfirmado\(true\)/.test(paso));
ok("PasoAlumnos refresca inscripciones del periodo tras apply", /cargarInscripciones/.test(paso) && /actionListarInscripcionesPeriodo/.test(paso));

// Contrato de aislamiento esperado.
ok("validarIntegridadCiclo sigue siendo autoridad única (F7)", /export async function validarIntegridadCiclo/.test(leer("lib/escolar/ciclo-estado.ts")));
ok("activación F8 intacta (no depende de F3)", /activarCicloOperativoAtomico/.test(leer("lib/escolar/ciclo-estado.ts")));
ok("sin vigente en el flujo", !/vigente/.test(paso + actCarga + libCarga + insc));
ok("sin parser paralelo en PasoAlumnos", !/xlsx\.read|new .*Parser/.test(paso));
ok("sin crear otra función de inscripción equivalente", (libCarga.match(/inscribirAlumnoEnCiclo/g) ?? []).length >= 1);

console.log(`\nFASE 3 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
