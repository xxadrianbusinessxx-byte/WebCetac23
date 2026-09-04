/**
 * test-atribucion-profesor.mjs - Pruebas PURAS de la atribución de materia al
 * profesor en la subida de asistencias (Prompt C, R-3), sin Supabase.
 *
 * Compilar (tras cambios en lib/escolar/atribucion-profesor.ts):
 *   npx tsc lib/escolar/atribucion-profesor.ts ^
 *     --outDir scripts/.tmp-atribucion-profesor --module commonjs ^
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/test-atribucion-profesor.mjs
 *
 * Casos de la VALIDACIÓN del prompt (R-3 + R-2):
 *  1. un profesor sube 2 materias distintas del MISMO grupo y día → 2 filas de
 *     clases_impartidas (distintas por grupo_materia_id), no una sobrescrita;
 *  2. subir dos veces la misma materia → 1 sola asignación (idempotente) y la
 *     misma fila objetivo (la clave de conflicto incluye la materia);
 *  3. un profesor con 2 materias tiene 2 asignaciones activas;
 *  4. desactivar una asignación deja la otra intacta (nunca DELETE);
 *  5. sin profesorId en sesión → error, y las filas NUEVAS nunca se escriben
 *     con profesor_clave (la contraseña deja de ser identidad).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".tmp-atribucion-profesor",
);
const M = require(path.join(dir, "atribucion-profesor.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log("  OK " + nombre);
  } else {
    fallidas++;
    console.error("  FALLA " + nombre + (detalle ? " — " + detalle : ""));
  }
}

// Un profesor (PROFESORES.ID 7) sube el MISMO grupo y día, primero
// MATEMATICAS (grupo_materia GM_MAT) y después HISTORIA (GM_HIS).
const PROFESOR = 7;
const GM_MAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GM_HIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const planDia = {
  clasesImpartidas: [
    {
      profesor_clave: "P7", // NO debe terminar en las filas nuevas
      grado: "2DO",
      grupo: "A",
      carrera: "RH",
      fecha: "2026-09-04",
      clases: 2,
    },
  ],
  asistencias: [
    {
      profesor_clave: "P7",
      curp: "ZAFA100523MVZPMMA6",
      grado: "2DO",
      grupo: "A",
      carrera: "RH",
      nombre: "Alumno Demo",
      fecha: "2026-09-04",
      clases_asistidas: 2,
    },
  ],
};

const subidaMat = M.atribuirMateriaAlPlan(planDia, {
  profesorId: PROFESOR,
  grupoMateriaId: GM_MAT,
  profesorClave: "P7",
});
const subidaHis = M.atribuirMateriaAlPlan(planDia, {
  profesorId: PROFESOR,
  grupoMateriaId: GM_HIS,
  profesorClave: "P7",
});

console.log("1) Dos materias del MISMO grupo y día => 2 filas, no una sobrescrita");
ok("subida MAT ok", subidaMat.ok);
ok("subida HIS ok", subidaHis.ok);
if (subidaMat.ok && subidaHis.ok) {
  const filaMat = subidaMat.clasesImpartidas[0];
  const filaHis = subidaHis.clasesImpartidas[0];
  ok(
    "fila MAT lleva grupo_materia_id MAT",
    filaMat && filaMat.grupo_materia_id === GM_MAT,
  );
  ok(
    "fila HIS lleva grupo_materia_id HIS",
    filaHis && filaHis.grupo_materia_id === GM_HIS,
  );
  ok(
    "ambas comparten profesor_id",
    filaMat &&
      filaHis &&
      filaMat.profesor_id === PROFESOR &&
      filaHis.profesor_id === PROFESOR,
  );
  const clavesFila = new Set([
    `${filaMat.grupo_materia_id}|${filaMat.grado}|${filaMat.grupo}|${filaMat.fecha}`,
    `${filaHis.grupo_materia_id}|${filaHis.grado}|${filaHis.grupo}|${filaHis.fecha}`,
  ]);
  ok("2 claves distintas por materia (no colisionan)", clavesFila.size === 2);
  ok(
    "la clave de conflicto del UPSERT incluye la materia",
    subidaMat.conflictoClases === M.CLAVES_CONFLICTO_CLASES_CON_MATERIA &&
      subidaMat.conflictoAsistencia === M.CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA,
  );
}

console.log("2) Subir dos veces la misma materia => 1 sola asignacion (idempotente)");
{
  const segunda = M.atribuirMateriaAlPlan(planDia, {
    profesorId: PROFESOR,
    grupoMateriaId: GM_MAT,
    profesorClave: "P7",
  });
  ok("segunda subida MAT ok", segunda.ok);
  if (subidaMat.ok && segunda.ok) {
    ok(
      "misma claveAsignacion (dedupe en asignaciones_profesor)",
      subidaMat.claveAsignacion === segunda.claveAsignacion,
    );
    ok(
      "misma fila objetivo para clases_impartidas",
      JSON.stringify(subidaMat.clasesImpartidas[0]) ===
        JSON.stringify(segunda.clasesImpartidas[0]),
    );
    ok(
      "misma fila objetivo para asistencia_alumnos",
      JSON.stringify(subidaMat.asistencias[0]) ===
        JSON.stringify(segunda.asistencias[0]),
    );
    ok(
      "asignacion siempre activo=true",
      subidaMat.asignacionActiva.activo === true &&
        segunda.asignacionActiva.activo === true,
    );
  }
}

console.log("3) Un profesor con 2 materias tiene 2 asignaciones activas");
{
  ok("asignacion MAT activa", subidaMat.ok && subidaMat.asignacionActiva.activo);
  ok("asignacion HIS activa", subidaHis.ok && subidaHis.asignacionActiva.activo);
  if (subidaMat.ok && subidaHis.ok) {
    const claves = new Set([subidaMat.claveAsignacion, subidaHis.claveAsignacion]);
    ok("2 claves de asignacion distintas", claves.size === 2);
    ok(
      "claveAsignacion = profesorId|gm (identidad natural)",
      subidaMat.claveAsignacion ===
        M.claveAsignacionProfesorMateria(PROFESOR, GM_MAT),
    );
  }
}

console.log("4) Desactivar una asignacion deja la otra intacta");
{
  if (subidaMat.ok && subidaHis.ok) {
    const inactiva = M.asignacionInactiva(
      subidaMat.asignacionActiva,
      "2026-09-30T00:00:00.000Z",
    );
    ok("MAT quedo inactiva (activo=false)", inactiva.activo === false);
    ok("MAT tiene hasta (no DELETE)", typeof inactiva.hasta === "string");
    ok("HIS sigue activa", subidaHis.asignacionActiva.activo === true);
    ok(
      "HIS conserva su materia",
      subidaHis.asignacionActiva.grupo_materia_id === GM_HIS,
    );
  }
}

console.log("5) Sin profesorId en sesion => error y NUNCA se escribe con profesor_clave");
{
  const sinId = M.atribuirMateriaAlPlan(planDia, {
    profesorId: null,
    grupoMateriaId: GM_MAT,
    profesorClave: "P7",
  });
  ok("rechazado sin profesorId", sinId.ok === false);
  ok(
    "mensaje de re-login (identidad PROFESORES.ID)",
    !sinId.ok && sinId.error === M.ERROR_ATRIBUCION_SIN_PROFESOR_ID,
  );
  // Incluso cuando la atribución SÍ procede, las filas nuevas NO llevan
  // profesor_clave: la contraseña deja de escribirse en tablas de datos.
  if (subidaMat.ok) {
    const filaClases = subidaMat.clasesImpartidas[0];
    const filaAsist = subidaMat.asistencias[0];
    ok(
      "fila de clases_impartidas sin profesor_clave",
      filaClases && !Object.prototype.hasOwnProperty.call(filaClases, "profesor_clave"),
    );
    ok(
      "fila de asistencia_alumnos sin profesor_clave",
      filaAsist && !Object.prototype.hasOwnProperty.call(filaAsist, "profesor_clave"),
    );
  }
}

console.log("6) Materia no resuelta => error controlado");
{
  const sinMateria = M.atribuirMateriaAlPlan(planDia, {
    profesorId: PROFESOR,
    grupoMateriaId: null,
    profesorClave: "P7",
  });
  ok("rechazado sin grupo_materia_id", sinMateria.ok === false);
  ok(
    "mensaje de materia no atribuible",
    !sinMateria.ok && sinMateria.error === M.ERROR_ATRIBUCION_MATERIA_NO_RESUELTA,
  );
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);

