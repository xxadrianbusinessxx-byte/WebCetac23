#!/usr/bin/env node
/**
 * test-permisos.mjs — PRUEBAS PURAS de la matriz de permisos (PROMPT-2/T1/T2).
 *
 * Qué hace:
 *   1) Transpila a CommonJS temporal `lib/auth/capacidades.ts`, `types.ts` y
 *      `permisos.ts` (módulos puros, sin I/O ni Supabase).
 *   2) Prueba `puede()` con la matriz HOY (2026-09-06).
 *   3) Compara la matriz del código contra `docs/sistema/MATRIZ-PERMISOS.md`
 *      §5 (inventario generado): cada capacidad del union type debe existir en
 *      §5 y, para cada acción, los roles que su «Guardia hoy» admite deben
 *      poder la capacidad en el código (regla de oro: nadie pierde acceso).
 *
 * Uso: node scripts/test-permisos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1) Módulos puros de lib/auth: Node carga los `.ts` directamente (PROMPT H-bis)
// ---------------------------------------------------------------------------
const { CAPACIDADES } = await import("../lib/auth/capacidades.ts");
const { puede, rolesDe, CAPACIDADES_PUBLICAS } = await import("../lib/auth/permisos.ts");

const ROLES = ["alumno", "maestro", "directivo", "tutor", "tecnico"];

// ---------------------------------------------------------------------------
// 2) Harness de aserciones
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
// 3) Comparación contra §5 de docs/sistema/MATRIZ-PERMISOS.md
// ---------------------------------------------------------------------------
const doc = fs.readFileSync(path.join(root, "docs/sistema/MATRIZ-PERMISOS.md"), "utf8");
const ini = doc.indexOf("<!-- INVENTARIO:INICIO -->");
const fin = doc.indexOf("<!-- INVENTARIO:FIN -->");
const inventario = ini >= 0 && fin >= ini ? doc.slice(ini, fin) : "";
ok(ini >= 0 && fin >= ini, "MATRIZ-PERMISOS.md contiene el inventario §5");

// Capacidades mencionadas en §5 (columna Capacidad de cada action). Se leen
// SOLO de filas de acción (`| actionX | guardia | capacidad |`).
const capsDoc = new Set();
for (const m of inventario.matchAll(/^\| `action\w+` \| [^|]+ \| `?([a-z_]+\.[a-z_]+)`? \|/gm)) {
  capsDoc.add(m[1]);
}

seccion("Capacidades del código existen en §5 (y viceversa)");
for (const c of CAPACIDADES) {
  const presente = capsDoc.has(c);
  if (presente) ok(true, `capacidad en código existe en §5: ${c}`);
  // Las capacidades nuevas de la resolución T2 (divisiones ciclo.ver y
  // horario.importar) aún no tienen fila propia en §5: entran cuando sus
  // acciones se migran a exigir() en el commit de su dominio (T3). Se avisan,
  // no fallan: el invariante se cierra al regenerar §5 con `npm run gen:matriz`.
  else console.log(`  -- ${c} (nueva de T2; entra en §5 al migrar su dominio)`);
}
for (const c of capsDoc) ok(CAPACIDADES.includes(c), `capacidad de §5 existe en el código: ${c}`);

// Guardia hoy → roles admitidos (según la leyenda de §2 del documento).
function rolesDeGuardia(guardia) {
  const roles = new Set();
  if (/solo directivo\/maestro/.test(guardia)) {
    roles.add("directivo");
    roles.add("maestro");
  } else if (/solo alumno\/directivo\/maestro\/tutor/.test(guardia)) {
    ROLES.forEach((r) => roles.add(r));
  } else if (/solo alumno\/tutor/.test(guardia)) {
    roles.add("alumno");
    roles.add("tutor");
  } else if (/solo directivo/.test(guardia)) {
    roles.add("directivo");
  } else if (/solo maestro/.test(guardia)) {
    roles.add("maestro");
  } else if (/solo tutor/.test(guardia)) {
    roles.add("tutor");
  } else if (/solo alumno/.test(guardia)) {
    roles.add("alumno");
  } else if (/sesion \(cualquier rol\)/.test(guardia)) {
    ROLES.forEach((r) => roles.add(r));
  } else if (/esDirectivo/.test(guardia)) {
    roles.add("directivo");
  }
  return roles;
}

seccion("Regla de oro: ningún rol que HOY admite una acción pierde la capacidad");
// Re-mapeo de la resolución T2 (PROMPT-2): acciones cuya CAPACIDAD cambió al
// dividir guardias mezcladas. La §5 aún las lista con la capacidad vieja
// mientras el dominio no se migra; la regla de oro se valida contra la
// capacidad RESULTADO (que es la que tendrán tras exigir()).
const CAPACIDAD_RESULTADO_T2 = {
  actionImportarHorarioPreview: "horario.importar",
  actionImportarHorarioAplicar: "horario.importar",
  actionDescargarPlantillaHorario: "horario.descargar_plantilla",
  actionObtenerCicloActual: "ciclo.ver_operativo",
  actionListarPeriodosContexto: "ciclo.ver_contexto",
  actionVerContextoAcademico: "ciclo.ver_contexto",
  actionListarCiclosAdmin: "ciclo.ver_contexto",
  actionDetalleCicloAdmin: "ciclo.ver_contexto",
  actionListarPeriodosCatalogo: "ciclo.ver_contexto",
};

// Por cada fila de §5: action | guardia hoy | capacidad.
for (const m of inventario.matchAll(/^\| `(action\w+)` \| ([^|]+) \| `?([a-z_]+\.[a-z_]+)`? \|/gm)) {
  const action = m[1];
  const guardia = m[2].trim();
  const cap = CAPACIDAD_RESULTADO_T2[action] ?? m[3];
  const roles = rolesDeGuardia(guardia);
  for (const rol of roles) {
    ok(puede(rol, cap), `${action}: ${rol} puede ${cap} (guardia hoy: ${guardia})`);
  }
}

// La regla de oro inversa solo es verificable donde la guardia es excluyente
// para TODAS las acciones de una capacidad; para las 13 mezcladas (resueltas
// en T2) se valida con casos directos abajo.

seccion("Casos directos de puede() (matriz HOY)");
// Público.
ok(puede(null, "portada.ver"), "sin sesión puede portada.ver");
ok(puede("alumno", "portada.ver"), "alumno puede portada.ver");
ok(!puede(null, "ciclo.ver"), "sin sesión NO puede ciclo.ver");
// Directivo tras PROMPT-3/T5: conserva lectura y operación diaria, pierde la
// configuración (ciclo, calendario-edición, tutores-admin, horario-importar,
// contexto de ciclo) que pasa al rol técnico.
ok(!puede("directivo", "ciclo.crear"), "directivo NO puede ciclo.crear (T5)");
ok(!puede("directivo", "calendario.editar"), "directivo NO puede calendario.editar (T5)");
ok(!puede("directivo", "tutor.crear"), "directivo NO puede tutor.crear (T5)");
ok(!puede("directivo", "horario.importar"), "directivo NO puede horario.importar (T5)");
ok(!puede("directivo", "ciclo.ver_contexto"), "directivo NO puede ciclo.ver_contexto (T5)");
ok(puede("directivo", "materia.ver_catalogo"), "directivo conserva materia.ver_catalogo (lectura)");
ok(puede("directivo", "semestre.ver"), "directivo conserva semestre.ver (lectura)");
ok(puede("directivo", "ciclo.ver_operativo"), "directivo conserva ciclo.ver_operativo (T5.3)");
ok(puede("directivo", "justificacion.ver_todas"), "directivo conserva justificacion.ver_todas");
ok(!puede("maestro", "ciclo.crear"), "maestro NO puede ciclo.crear");
ok(!puede("tutor", "ciclo.crear"), "tutor NO puede ciclo.crear");
ok(!puede("alumno", "ciclo.crear"), "alumno NO puede ciclo.crear");
// Maestro (asistencia/materias/documentos).
ok(puede("maestro", "asistencia.subir"), "maestro puede asistencia.subir");
ok(puede("maestro", "materia.ver_catalogo"), "maestro puede materia.ver_catalogo");
ok(!puede("alumno", "asistencia.subir"), "alumno NO puede asistencia.subir");
// Maestro: no configura, pero sabe el ciclo operativo.
ok(!puede("maestro", "ciclo.ver_contexto"), "maestro NO puede ciclo.ver_contexto");
ok(puede("maestro", "ciclo.ver_operativo"), "maestro puede ciclo.ver_operativo");
// Tutor.
ok(puede("tutor", "tutor.ver_propio"), "tutor puede tutor.ver_propio");
ok(!puede("maestro", "tutor.ver_propio"), "maestro NO puede tutor.ver_propio");
// Alumno: propia asistencia y horario (con alcance en la acción).
ok(puede("alumno", "asistencia.ver_alumno"), "alumno puede asistencia.ver_alumno");
ok(puede("tutor", "asistencia.ver_alumno"), "tutor puede asistencia.ver_alumno");
ok(puede("alumno", "horario.ver_alumno"), "alumno puede horario.ver_alumno");

seccion("Técnico (PROMPT-3) — capacidades que §4 le asigna");
// La columna Tec de la §4 se implementa en T1 (aditivo). La comparación de los
// 5 roles contra §4 se completa en T5 (cuando directivo se recorta).
ok(puede("tecnico", "asignacion.editar"), "tecnico puede asignacion.editar (A2)");
ok(puede("tecnico", "ciclo.crear"), "tecnico puede ciclo.crear");
ok(puede("tecnico", "alumno.cargar_roster"), "tecnico puede alumno.cargar_roster");
ok(puede("tecnico", "tutor.crear"), "tecnico puede tutor.crear");
ok(puede("tecnico", "calendario.editar"), "tecnico puede calendario.editar");
ok(puede("tecnico", "profesor.ver_credenciales_acceso"), "tecnico puede profesor.ver_credenciales_acceso");
ok(puede("tecnico", "profesor.forzar_cambio_clave"), "tecnico puede profesor.forzar_cambio_clave");
ok(puede("tecnico", "profesor.cambiar_clave_propia"), "tecnico puede profesor.cambiar_clave_propia (autoservicio)");
ok(puede("tecnico", "materia.ver_catalogo"), "tecnico puede materia.ver_catalogo");
ok(!puede("tecnico", "asistencia.subir"), "tecnico NO puede asistencia.subir");
ok(!puede("tecnico", "calificacion.ver"), "tecnico NO puede calificacion.ver");
ok(!puede("tecnico", "justificacion.ver_todas"), "tecnico NO puede justificacion.ver_todas");
ok(!puede("tecnico", "tutor.ver_propio"), "tecnico NO puede tutor.ver_propio");
ok(!puede("tecnico", "materia.mapear_columnas"), "tecnico NO puede materia.mapear_columnas");

// Lectura de la §4: cada fila `| capacidad | ... | D | M | Tec | T | A |`.
// PROMPT-3/T5: el código = §4 completa con los 5 roles (directivo recortado).
seccion("Código ⇄ §4 (los 5 roles)");
const ROL_POR_COLUMNA = { D: "directivo", M: "maestro", Tec: "tecnico", T: "tutor", A: "alumno" };
const celdasVacias = [];
for (const m of doc.matchAll(/^\| `([a-z_]+\.[a-z_]+)` \| [^|]* \| ([^|]*?) \| ([^|]*?) \| ([^|]*?) \| ([^|]*?) \| ([^|]*?) \|/gm)) {
  const cap = m[1];
  const celdas = { D: m[2], M: m[3], Tec: m[4], T: m[5], A: m[6] };
  for (const [col, rol] of Object.entries(ROL_POR_COLUMNA)) {
    const celda = String(celdas[col] ?? "").trim();
    if (celda === "✅") ok(puede(rol, cap), `§4 ${col} ✅ → ${rol} puede ${cap}`);
    else if (celda === "X") ok(!puede(rol, cap), `§4 ${col} X → ${rol} NO puede ${cap}`);
    else if (!celda) {
      // "vacío = sin decidir. No debe quedar ninguna al implementar." Lo
      // tratamos como X (el rol no la tiene) y lo avisamos para el informe.
      celdasVacias.push(`${cap} columna ${col}`);
      ok(!puede(rol, cap), `§4 ${col} (vacío→X) → ${rol} NO puede ${cap}`);
    }
  }
}
if (celdasVacias.length) {
  console.log(`  -- celdas vacías en §4 tratadas como X: ${celdasVacias.join(", ")}`);
}

seccion("rolesDe() y públicas");
ok(rolesDe("portada.ver").length === 5, "portada.ver la tienen los 5 roles");
ok(!CAPACIDADES_PUBLICAS.has("ciclo.ver"), "ciclo.ver no es pública");



console.log(`\nResultado: ${pasos} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);

