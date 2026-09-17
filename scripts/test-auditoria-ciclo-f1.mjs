// test-auditoria-ciclo-f1.mjs — FASE 1: auditoría estática de la identidad
// del ciclo. Comprueba que el CICLO GLOBAL se resuelve por estado='operativo'
// (fallback legacy explícito) y detecta regresiones a activo como fuente única.
// Solo lectura del filesystem.
// Uso: node scripts/test-auditoria-ciclo-f1.mjs

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

// Patrón legacy: consulta directa a periodos filtrando por activo.
const LEGACY_PERIODOS_ACTIVO = /from\(TABLA_PERIODOS\)[\s\S]{0,140}?\.eq\("activo", true\)/;

// 1) Helper central existe (único mecanismo nuevo) en ciclo-estado.
const ce = leer("lib/escolar/ciclo/ciclo-estado.ts");
ok("ciclo-estado exporta obtenerCicloOperativoGlobal", /export async function obtenerCicloOperativoGlobal/.test(ce));
ok("helper usa estado=operativo como primario", /resolverEstadoPeriodo\(f\) === ESTADO_OPERATIVO/.test(ce));
ok("helper declara fallback legacy explícito activo=true", /via: "fallback_activo"/.test(ce));
ok("helper falla ante múltiples OPERATIVO", /OPERATIVO simultáneos/.test(ce));
ok("no existe vigente en ciclo-estado", !/vigente/.test(ce));

// 2) Los 6 lectores globales migrados no dependen exclusivamente de activo.
const lectores = {
  "app/actions/asistencias.ts (actionObtenerCicloActual)": "app/actions/asistencias.ts",
  "app/actions/carga-academica.ts (catálogo reconocimiento)": "app/actions/carga-academica.ts",
  "app/configuracion/page.tsx": "app/configuracion/page.tsx",
  "lib/escolar/asistencia/asistencia-configuracion.ts (contexto asistencia)": "lib/escolar/asistencia/asistencia-configuracion.ts",
  "lib/escolar/catalogo/carga-academica.ts (índice grupos)": "lib/escolar/catalogo/carga-academica.ts",
  "lib/escolar/ciclo/semestres.ts (oferta semestres)": "lib/escolar/ciclo/semestres.ts",
};
for (const [nombre, rel] of Object.entries(lectores)) {
  const contenido = leer(rel);
  ok(`${nombre}: sin consulta legacy a periodos.activo`, !LEGACY_PERIODOS_ACTIVO.test(contenido));
}

// 3) Los lectores consumen el helper central (import presente).
// 2026-09-11 (rediseño Océano, Fase 9): el lector de `app/configuracion/page.tsx`
// se MOVIÓ a `app/oceano/page.tsx` al retirar esa ruta —ahora redirige—. No
// desapareció un lector ni se abrió un camino paralelo: el mismo helper se llama
// desde el portal. Siguen siendo seis y la regla no se relaja.
//
// 2026-09-16 (PROMPT E · R-1 · bajada del I/O a lib/): la lista pasa de seis a
// cinco por el mismo motivo, un movimiento de capa. `actionListarCatalogoReconocimiento`
// dejó de ser un LECTOR: su consulta bajó a
// `lib/escolar/catalogo/carga-academica.ts` (`listarCatalogoReconocimiento`), que
// ya usaba el helper, y la action ahora solo valida la capacidad y delega. El
// lector no desapareció ni se creó un camino paralelo a `periodos`: la regla que
// se comprueba (todo lector del ciclo global usa el helper central) es la misma.
// La comprobación #2 sigue cubriendo `app/actions/carga-academica.ts`, de modo
// que esa action tampoco puede volver a resolver el ciclo por su cuenta.
const LECTORES_CICLO_GLOBAL = [
  "app/actions/asistencias.ts",
  "app/oceano/page.tsx",
  "lib/escolar/asistencia/asistencia-configuracion.ts",
  "lib/escolar/catalogo/carga-academica.ts",
  "lib/escolar/ciclo/semestres.ts",
];
const conHelper = LECTORES_CICLO_GLOBAL.filter((rel) =>
  leer(rel).includes("obtenerCicloOperativoGlobal"),
);
ok(
  `todos los lectores importan/usar el helper (${conHelper.length}/${LECTORES_CICLO_GLOBAL.length})`,
  conHelper.length === LECTORES_CICLO_GLOBAL.length,
  conHelper.join(","),
);

// 4) Sin 'vigente' en código productivo (lib + app).
const barrido = ["lib/escolar/ciclo/ciclo-estado.ts", "app/actions/asistencias.ts", "app/actions/carga-academica.ts",
  "lib/escolar/asistencia/asistencia-configuracion.ts", "lib/escolar/catalogo/carga-academica.ts", "lib/escolar/ciclo/semestres.ts"];
const conVigente = barrido.filter((rel) => /vigente/.test(leer(rel)));
ok("ningún archivo migrado introduce vigente", conVigente.length === 0, conVigente.join(","));

// 5) activo de ENTIDADES HIJAS se conserva (no hubo reemplazo global):
// los lectores migrados siguen filtrando grupos/inscripciones/gm por activo.
const libAsis = leer("lib/escolar/asistencia/asistencia-configuracion.ts");
ok("asistencias conserva grupos.activo=true (hija)", /from\(TABLA_GRUPOS\)[\s\S]{0,120}?\.eq\("activo", true\)/.test(libAsis));
const libCarga = leer("lib/escolar/catalogo/carga-academica.ts");
ok("carga-academica conserva grupos.activo=true (hija)", /from\(TABLA_GRUPOS\)[\s\S]{0,120}?\.eq\("activo", true\)/.test(libCarga));

// 6) Un solo mecanismo nuevo para ciclo global: fuera de ciclo-estado.ts solo
// se USARÁ obtenerCicloOperativoGlobal (ninguna otra resolución paralela nueva).
const inventores = ["app/actions/asistencias.ts", "app/actions/carga-academica.ts", "app/configuracion/page.tsx",
  "lib/escolar/asistencia/asistencias.ts", "lib/escolar/catalogo/carga-academica.ts", "lib/escolar/ciclo/semestres.ts"].filter((rel) => {
  const c = leer(rel);
  return /export async function (obtenerCiclo|resolverCicloOperativo)/.test(c);
});
ok("ningún lector define su propio resolver de ciclo global", inventores.length === 0, inventores.join(","));

console.log(`\nFASE 1 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
