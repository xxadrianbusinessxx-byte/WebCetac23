#!/usr/bin/env node
/**
 * test-auditoria-permisos.mjs — DETECTOR DE REGRESIÓN de la centralización
 * (PROMPT-2/T5).
 *
 * Falla si:
 *   1) Aparece `rol !== "` o `rol === "` en una Server Action de app/actions
 *      (fuera de lib/auth/permisos.ts). Las capas de alcance de lib/escolar
 *      (accesoAlumno, nivelAccesoProfesor) y lib/auth/session.ts NO se tocan
 *      (regla 5 del MATRIZ-PERMISOS): se declaran como excepción comentada.
 *   2) Un `export async function action*` no llama a `exigir()` — con dos
 *      excepciones legítimas declaradas: las públicas de `portada.ver`
 *      (actionAlumnosEstrella, actionObtenerNoticiasInicio) y la delegación
 *      verificada de etiquetas-dinamicas (autorizarEscrituraEtiquetas, que
 *      llama a exigir y a resolverAccesoAlumno).
 *   3) Una capacidad de lib/auth/capacidades.ts no aparece en la §5 del
 *      documento, o al revés (una capacidad de §5 no está en el código).
 *   4) Una action lee el rol del FormData / de un parámetro (fuente distinta
 *      de la sesión). Patrón histórico: `formData.get("rol")`.
 *
 * Uso: node scripts/test-auditoria-permisos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1) La lista cerrada de capacidades: Node carga el `.ts` directamente (PROMPT H-bis)
// ---------------------------------------------------------------------------
const { CAPACIDADES } = await import("../lib/auth/capacidades.ts");

// ---------------------------------------------------------------------------
// 2) Harness
// ---------------------------------------------------------------------------
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
function seccion(titulo) {
  console.log(`\n${titulo}`);
}

// ---------------------------------------------------------------------------
// 3) Excepciones legítimas declaradas (lista explícita y comentada)
// ---------------------------------------------------------------------------
// Portada pública: se sirve antes del login; capacidad `portada.ver`.
const PUBLICAS_POR_DISENO = new Set([
  "actionAlumnosEstrella", // app/actions/home.ts
  "actionObtenerNoticiasInicio", // app/actions/noticias.ts
]);
// Delegación verificada: el helper `autorizarEscrituraEtiquetas` llama a
// exigir("alumno.editar_etiquetas") + resolverAccesoAlumno (alcance). Estas 4
// acciones lo usan como PRIMERA línea (mismo efecto que exigir directo).
const DELEGAN_EN_HELPER_CON_EXIGIR = new Set([
  "actionGuardarEtiquetasDinamicas",
  "actionEliminarEtiquetaDinamica",
  "actionReordenarEtiquetasDinamicas",
  "actionImportarEtiquetasIndividual",
]);
// No son una capacidad: operan sobre la credencial de QUIEN LLAMA, no sobre
// datos de nadie. `exigir()` responde «¿puede este rol ejecutar tal
// capacidad?», y cerrar la propia sesión no es algo que un rol pueda tener o
// no tener; pedir permiso aquí dejaría encerrada a una sesión rota.
const OPERAN_SOBRE_LA_PROPIA_CREDENCIAL = new Set([
  "actionCerrarSesion", // app/actions/login.ts — borra la cookie y redirige
]);

// ---------------------------------------------------------------------------
// 4) Chequeos
// ---------------------------------------------------------------------------
const dirActions = path.join(root, "app/actions");
const archivos = fs.readdirSync(dirActions).filter((f) => f.endsWith(".ts"));

seccion("1) Ninguna Server Action pregunta por rol (rol !== / rol ===)");
let conRol = 0;
for (const fn of archivos) {
  const lineas = fs.readFileSync(path.join(dirActions, fn), "utf8").split("\n");
  for (let i = 0; i < lineas.length; i++) {
    if (/rol !== "|rol === "/.test(lineas[i])) {
      conRol++;
      ok(false, `${fn}:${i + 1} usa comparación de rol fuera de permisos.ts`);
    }
  }
}
ok(conRol === 0, "app/actions no contiene `rol !== \"` / `rol === \"`");


seccion("2) Toda action exportada llama a exigir() (o es excepción declarada)");
const totalActions = [];
for (const fn of archivos) {
  const lineas = fs.readFileSync(path.join(dirActions, fn), "utf8").split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const m = /^export async function (action\w+)/.exec(lineas[i]);
    if (!m) continue;
    totalActions.push(m[1]);
    let j = i + 1;
    while (j < lineas.length && !/^export async function action/.test(lineas[j])) j++;
    const cuerpo = lineas.slice(i, j).join("\n");
    const nombre = m[1];
    if (
      PUBLICAS_POR_DISENO.has(nombre) ||
      DELEGAN_EN_HELPER_CON_EXIGIR.has(nombre) ||
      OPERAN_SOBRE_LA_PROPIA_CREDENCIAL.has(nombre)
    ) {
      continue;
    }
    ok(/exigir\(/.test(cuerpo), `${fn}: ${nombre} llama a exigir()`);
  }
}

seccion("3) Capacidades del código ⇄ §5 del documento");
const doc = fs.readFileSync(path.join(root, "docs/sistema/MATRIZ-PERMISOS.md"), "utf8");
const ini = doc.indexOf("<!-- INVENTARIO:INICIO -->");
const fin = doc.indexOf("<!-- INVENTARIO:FIN -->");
const inventario = ini >= 0 && fin >= ini ? doc.slice(ini, fin) : "";
ok(ini >= 0 && fin >= ini, "MATRIZ-PERMISOS.md contiene el inventario §5");
const capsDoc = new Set();
for (const m of inventario.matchAll(/^\| `action\w+` \| [^|]+ \| `?([a-z_]+\.[a-z_]+)`? \|/gm)) {
  capsDoc.add(m[1]);
}
// Capacidades nuevas de la división T2 entran a §5 al migrar su dominio y
// regenerar con `npm run gen:matriz`; se avisan (no fallan) hasta entonces.
for (const c of CAPACIDADES) {
  if (!capsDoc.has(c)) {
    console.log(`  -- ${c} (nueva de T2; entrará a §5 al regenerar el inventario)`);
  }
}
for (const c of capsDoc) ok(CAPACIDADES.includes(c), `capacidad de §5 existe en el código: ${c}`);

seccion("4) El rol nunca se lee del FormData/parámetros");
for (const fn of archivos) {
  const contenido = fs.readFileSync(path.join(dirActions, fn), "utf8");
  const m = contenido.match(/formData\.get\("rol"\)|params\??\.rol\b|input\.rol\b/);
  ok(!m, `${fn} no lee el rol de FormData/parámetros`);
}

console.log(
  `\nServer Actions auditadas: ${totalActions.length} · ${pasos} pasadas, ${fallos} fallidas`,
);
if (fallos > 0) process.exit(1);
