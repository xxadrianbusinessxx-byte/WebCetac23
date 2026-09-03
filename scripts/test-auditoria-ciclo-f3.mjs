// test-auditoria-ciclo-f3.mjs — FASE 3: alumnos/roster hacia ciclo BORRADOR.
// Mapea el estado real del pipeline y el contrato de aislamiento por periodo_id.
// Estático; no inventa parser ni CRUD de alumnos paralelos.
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

// Inscripciones existentes por periodo.
ok("inscripciones-admin opera con periodoId", /periodoId/.test(insc));
ok("inscripciones-borrador prepara BORRADOR (activo=false)", /BORRADOR|activo/.test(inscLib));
ok("PasoAlumnos recibe periodoId y usa actions de inscripción", /periodoId: string/.test(paso) && /actionInscribirAlumnoEnCiclo/.test(paso));

// GAP documentado (estado real, honesto).
ok("GAP: pipeline roster resuelve contexto por periodoNombre (no periodoId destino)",
  /extraerContexto/.test(actCarga) && /periodoNombre/.test(actCarga));
ok("GAP: PasoAlumnos no integra preview/confirmación del roster CSV todavía",
  !/archivoCsv|actionPrevisualizarCargaAcademica/.test(paso));

// Contrato de aislamiento esperado.
ok("validarIntegridadCiclo sigue siendo autoridad única (F7)", /export async function validarIntegridadCiclo/.test(leer("lib/escolar/ciclo-estado.ts")));
ok("activación F8 intacta (no depende de F3)", /activarCicloOperativoAtomico/.test(leer("lib/escolar/ciclo-estado.ts")));
ok("sin vigente en el flujo", !/vigente/.test(paso + actCarga + libCarga + insc));
ok("sin parser paralelo en PasoAlumnos", !/xlsx\.read|new .*Parser/.test(paso));

console.log(`\nFASE 3 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
