/**
 * test-atribucion-profesor.mjs - Pruebas PURAS de la atribución de materia al
 * profesor en la subida de asistencias (Prompt C, R-3), sin Supabase.
 *
 * Ejecutar (Node carga los .ts de lib/ directamente; no hay paso de compilar):
 *   node scripts/test-atribucion-profesor.mjs
 *
 * Casos de la VALIDACIÓN del prompt (R-3 + R-2):
 *  1. un profesor sube 2 materias distintas del MISMO grupo y día → 2 filas de
 *     clases_impartidas (distintas por grupo_materia_id), no una sobrescrita;
 *  2. subir dos veces la misma materia → la misma fila objetivo (idempotente);
 *  3. (2026-11-17) OTRA persona que captura la misma materia y día —Servicio
 *     Escolar, el directivo— cae en la MISMA clave natural (no duplica) y su
 *     fila lleva SU profesor_id (autoría de la sesión);
 *  4. (2026-11-17) subir NO da la propiedad: el resultado no trae asignación y
 *     la clave de conflicto no lleva profesor_id;
 *  5. sin profesorId en sesión → error, y las filas NUEVAS nunca se escriben
 *     con profesor_clave (la contraseña deja de ser identidad).
 */

const M = await import("../lib/escolar/asistencia/atribucion-profesor.ts");

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
const PERIODO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
  periodoId: PERIODO,
});
const subidaHis = M.atribuirMateriaAlPlan(planDia, {
  profesorId: PROFESOR,
  grupoMateriaId: GM_HIS,
  profesorClave: "P7",
  periodoId: PERIODO,
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
  ok(
    "las filas nuevas llevan periodo_id (A4)",
    filaMat &&
      filaHis &&
      filaMat.periodo_id === PERIODO &&
      filaHis.periodo_id === PERIODO,
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

console.log("2) Subir dos veces la misma materia => misma fila objetivo (idempotente)");
{
  const segunda = M.atribuirMateriaAlPlan(planDia, {
    profesorId: PROFESOR,
    grupoMateriaId: GM_MAT,
    periodoId: PERIODO,
  });
  ok("segunda subida MAT ok", segunda.ok);
  if (subidaMat.ok && segunda.ok) {
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
  }
}

console.log("3) Otra persona captura la misma materia y dia => misma clave natural, su autoria");
{
  const SERVICIO = 23;
  const captura = M.atribuirMateriaAlPlan(planDia, {
    profesorId: SERVICIO,
    grupoMateriaId: GM_MAT,
    periodoId: PERIODO,
  });
  ok("captura de Servicio Escolar ok", captura.ok);
  if (subidaMat.ok && captura.ok) {
    const valoresClave = (fila, claves) =>
      claves.split(",").map((c) => String(fila[c])).join("|");
    ok(
      "clases: misma clave natural que la del profesor (no duplica)",
      valoresClave(captura.clasesImpartidas[0], captura.conflictoClases) ===
        valoresClave(subidaMat.clasesImpartidas[0], subidaMat.conflictoClases),
    );
    ok(
      "asistencia: misma clave natural que la del profesor (no duplica)",
      valoresClave(captura.asistencias[0], captura.conflictoAsistencia) ===
        valoresClave(subidaMat.asistencias[0], subidaMat.conflictoAsistencia),
    );
    ok(
      "la fila lleva el profesor_id de la SESION que captura (autoria)",
      captura.asistencias[0].profesor_id === SERVICIO &&
        captura.clasesImpartidas[0].profesor_id === SERVICIO,
    );
  }
}

console.log("4) Subir NO da la propiedad de la materia");
{
  ok(
    "la clave de conflicto de clases no lleva profesor_id",
    !M.CLAVES_CONFLICTO_CLASES_CON_MATERIA.split(",").includes("profesor_id"),
  );
  ok(
    "la clave de conflicto de asistencia no lleva profesor_id",
    !M.CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA.split(",").includes("profesor_id"),
  );
  ok(
    "clave natural de asistencia = curp + materia + fecha",
    M.CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA === "curp,grupo_materia_id,fecha",
  );
  ok(
    "clave natural de clases = materia + fecha",
    M.CLAVES_CONFLICTO_CLASES_CON_MATERIA === "grupo_materia_id,fecha",
  );
  ok(
    "el resultado no trae asignacion que escribir",
    subidaMat.ok && !("asignacionActiva" in subidaMat) && !("claveAsignacion" in subidaMat),
  );
}

console.log("5) Sin profesorId en sesion => error y NUNCA se escribe con profesor_clave");
{
  const sinId = M.atribuirMateriaAlPlan(planDia, {
    profesorId: null,
    grupoMateriaId: GM_MAT,
    periodoId: PERIODO,
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
    periodoId: PERIODO,
  });
  ok("rechazado sin grupo_materia_id", sinMateria.ok === false);
  ok(
    "mensaje de materia no atribuible",
    !sinMateria.ok && sinMateria.error === M.ERROR_ATRIBUCION_MATERIA_NO_RESUELTA,
  );
}

console.log("7) Sin periodoId => error y NO se escribe (A4)");
{
  const sinPeriodo = M.atribuirMateriaAlPlan(planDia, {
    profesorId: PROFESOR,
    grupoMateriaId: GM_MAT,
    periodoId: null,
  });
  ok("rechazado sin periodoId", sinPeriodo.ok === false);
  ok(
    "mensaje de periodo operativo",
    !sinPeriodo.ok && sinPeriodo.error === M.ERROR_ATRIBUCION_SIN_PERIODO_ID,
  );
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);

