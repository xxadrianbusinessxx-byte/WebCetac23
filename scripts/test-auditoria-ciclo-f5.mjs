// test-auditoria-ciclo-f5.mjs — FASE 5: calendario por periodo_id.
// Solo lectura del filesystem. Detecta regresiones a periodoId→nombreCiclo→ciclo_escolar.
// Uso: node scripts/test-auditoria-ciclo-f5.mjs

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

const paso = leer("app/components/ciclo-configurador/paso-calendario.tsx");
const panel = leer("app/components/calendario-escolar-panel.tsx");
const actions = leer("app/actions/calendario.ts");
const lib = leer("lib/escolar/calendario.ts");

// 1) PasoCalendario conserva periodoId (no lo descarta).
ok("paso-calendario recibe y usa periodoId", paso.includes("periodoIdInicial={periodoId}"));
ok("paso-calendario no vuelve a nombreCiclo como persistencia", !paso.includes("cicloInicial="));
ok("paso-calendario conserva nombreCiclo SOLO visual", paso.includes("nombreCiclo") && /Paso 5 · Calendario del ciclo/.test(paso));

// 2) Panel acepta periodoId y modo periodo.
ok("panel declara prop periodoIdInicial", /periodoIdInicial\?: string/.test(panel));
ok("panel ramifica por modoPeriodo", /const modoPeriodo = Boolean\(periodoIdInicial\)/.test(panel));
ok("panel lee por periodo", panel.includes("actionObtenerCalendarioDePeriodo"));
ok("panel guarda por periodo", panel.includes("actionGuardarDiaCalendarioDePeriodo"));
ok("panel elimina por periodo", panel.includes("actionEliminarDiaCalendarioDePeriodo"));
ok("panel establece base por periodo", panel.includes("actionEstablecerCalendarioBaseDePeriodo"));
ok("panel no fuerza lista legacy en modo periodo", /if \(modoPeriodo\) \{\s+setCiclos\(\[\]\);\s+return;\s+\}/.test(panel));

// 3) Flujo nuevo: sin filtros por ciclo_escolar en las rutas de periodo.
ok("domain lee por periodo_id", lib.includes('.eq("periodo_id", periodoId)'));
ok("domain elimina por periodo_id", lib.includes('.eq("periodo_id", periodoId)') && lib.includes(".delete()"));
ok("domain upsert de periodo incluye periodo_id", /periodo_id: input\.periodoId/.test(lib));
ok("actions nuevas exponen API por periodo", actions.includes("actionObtenerCalendarioDePeriodo") && actions.includes("actionEliminarDiaCalendarioDePeriodo"));

// 4) Legacy aislado y documentado (no contaminado el flujo nuevo).
ok("lib conserva legacy ciclo_escolar (LEGACY CONTROLADO)", (lib.match(/\.eq\("ciclo_escolar"/g) ?? []).length >= 1);
ok("panel conserva actions legacy para modo no-periodo", panel.includes("actionObtenerCalendario("));
ok("actions legacy siguen existiendo para consumidores antiguos", /actionObtenerCalendario\(\s+ciclo: string/.test(actions));

// 5) Sin vigente y sin tocar activo en el dominio calendario.
ok("sin vigente en flujo calendario", !/vigente/.test(paso + panel + actions + lib));
ok("sin filtros por activo en calendario", !/\.eq\("activo", true\)/.test(lib));
ok("obtenerCalendarioDePeriodo es la única lectura nueva (sin 2ª vía)", (lib.match(/export async function obtenerCalendarioDePeriodo/g) ?? []).length === 1);

console.log(`\nFASE 5 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
