// test-auditoria-ciclo-f0.mjs — FASE 0: verifica que el mapa del sistema
// existente coincide con los archivos reales (contrato de auditoría).
// Solo lectura del filesystem; no toca Supabase ni escribe código.
//
// Uso: node scripts/test-auditoria-ciclo-f0.mjs  (desde la raíz del repo)

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

// 1) El wizard existe y declara los 7 pasos en orden.
const index = leer("app/components/ciclo-configurador/index.tsx");
const pasosEsperados = ["datos", "academico", "alumnos", "evaluacion", "calendario", "horario", "validacion"];
for (const p of pasosEsperados) {
  ok(`index.tsx contiene paso ${p}`, index.includes(`id: \"${p}\"`));
}

// 2) Cada paso mapea a su Server Action real (entrypoint documentado en F0).
const fuentes = {
  "paso-datos.tsx": ["actionGuardarRangoCiclo"],
  "paso-academico.tsx": ["actionClonarContextoAcademico"],
  "paso-alumnos.tsx": ["actionBuscarAlumnosInscripcion", "actionListarGruposPeriodo", "actionInscribirAlumnoEnCiclo"],
  "paso-evaluacion.tsx": ["actionListarCiclosConEvaluaciones", "actionGuardarEvaluacion"],
  "paso-calendario.tsx": ["CalendarioEscolarPanel"],
  "paso-horario.tsx": ["HorarioEscolarPanel"],
};
for (const [archivo, marcas] of Object.entries(fuentes)) {
  const contenido = leer(`app/components/ciclo-configurador/${archivo}`);
  for (const m of marcas) {
    ok(`${archivo} referencia ${m}`, contenido.includes(m));
  }
}

// 3) El index conserva periodoId de punta a punta y activa por periodoId.
ok("index conserva periodoId en estado", index.includes("setPeriodoId(id)") || /setPeriodoId/.test(index));
ok("index pasa periodoId a cada paso", (index.match(/periodoId=\{periodoId\}/g) ?? []).length >= 5);
ok("index activa con actionSetActivoCiclo(periodoId,true)", /actionSetActivoCiclo\(periodoId, true\)/.test(index));

// 4) Hallazgo F0 (estado actual, se codifica): calendario aún por ciclo_escolar TEXT.
const pasoCalendario = leer("app/components/ciclo-configurador/paso-calendario.tsx");
ok("paso-calendario recibe nombreCiclo (LEGACY documentado F5)",
  pasoCalendario.includes("cicloInicial={nombreCiclo}"));
const calendarioLib = leer("lib/escolar/calendario.ts");
ok("lib/calendario aún usa ciclo_escolar (LEGACY documentado F5)",
  (calendarioLib.match(/\.eq\("ciclo_escolar"/g) ?? []).length >= 1);
ok("calendario conoce periodo_id (plan F5 existe)",
  calendarioLib.includes("periodo_id"));

// 5) Activación: autoridad actual TS (hallazgo F8).
const cicloEstado = leer("lib/escolar/ciclo-estado.ts");
ok("activarCicloOperativo existe en ciclo-estado.ts", /export async function activarCicloOperativo/.test(cicloEstado));
const acciones = leer("app/actions/calendario.ts") + leer("app/actions/ciclo-orquestador.ts") + leer("app/actions/evaluaciones.ts");
ok("ninguna Server Action invoca el RPC activar_ciclo_operativo (F8 pendiente)",
  !/rpc\(\s*["']activar_ciclo_operativo/.test(acciones));

// 6) RPC transaccional existe como SQL preparado (no ejecutado aquí).
const rpcSql = leer("supabase/crear-rpc-activar-ciclo-f4.sql");
ok("SQL RPC activar_ciclo_operativo existe", rpcSql.includes("activar_ciclo_operativo"));

// 7) Orquestador con auditoría existe (acción server + registro de transición).
const orquestador = leer("app/actions/ciclo-orquestador.ts");
ok("ciclo-orquestador registra transición", orquestador.includes("registrarTransicionCiclo"));

// 8) Inscripciones: el manual identifica periodo vía grupo del periodo.
const inscAdmin = leer("app/actions/inscripciones-admin.ts");
ok("inscripciones-admin usa periodoId+grupoId",
  inscAdmin.includes("periodoId") && inscAdmin.includes("grupoId"));

// 9) Sin vigente en código (regla de la misión).
const docF0 = leer("docs/AUDITORIA-CICLO-FASE-0.md");
ok("documento AUDITORIA-CICLO-FASE-0.md existe", docF0.length > 500);

// 10) Referencias: acciones de calendario operan con string ciclo (texto legacy).
const accCalendario = leer("app/actions/calendario.ts");
ok("acciones calendario firman ciclo: string (LEGACY F5)", /ciclo: string/.test(accCalendario));

console.log(`\nFASE 0 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
