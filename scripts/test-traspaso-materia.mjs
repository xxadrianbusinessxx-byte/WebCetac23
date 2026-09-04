/**
 * test-traspaso-materia.mjs - Pruebas PURAS del traspaso TOTAL de una materia
 * al profesor que la sube (Prompt D), sin Supabase.
 *
 * El traspaso REAL vive en la RPC `traspasar_materia_a_profesor`
 * (supabase/crear-rpc-traspasar-materia.sql): una sola transacción. Como este
 * entorno no tiene psql/Postgres local (mismo bloqueo documentado para la RPC
 * eliminar_ciclo), el test usa un modelo EN MEMORIA que refleja fielmente el
 * algoritmo de la RPC (mismo orden y mismas reglas) + aserciones ESTÁTICAS
 * sobre el SQL y el código.
 *
 * No requiere compilación: node scripts/test-traspaso-materia.mjs
 *
 * Casos de la VALIDACIÓN del prompt:
 *  1. A tiene HISTORIA y MATE; B sube MATE → A conserva HISTORIA activa, MATE
 *     queda solo de B;
 *  2. los registros de MATE cambian de profesor_id y TODAS las demás columnas
 *     quedan idénticas (comparación campo a campo);
 *  3. los registros de HISTORIA de A no se tocan;
 *  4. reversible: A vuelve a subir MATE → vuelve a A con los mismos conteos;
 *  5. idempotente: B sube MATE dos veces → 0 traspasos la segunda;
 *  6. colisión: A y B con fila para la misma materia/grupo/fecha → la de B
 *     queda activa, la de A va al historial, ninguna se pierde;
 *  7. nunca se busca ni se escribe por profesor_clave (estático).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

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

// ============================================================================
// MODELO EN MEMORIA del algoritmo de la RPC (mismo orden y reglas)
// ============================================================================
const GM_MATE = "GM-MATE";
const GM_HIS = "GM-HIS";

function crearModelo() {
  const t = (min) => 1_700_000_000_000 + min * 60_000;
  const m = {
    ahora: t(0),
    reloj: 0,
    asignaciones: [],
    clases: [],
    asistencias: [],
    historial: [],
    sgteId: 1,
  };
  m.id = () => `id-${m.sgteId++}`;
  m.tick = () => {
    m.reloj += 1;
    return t(m.reloj);
  };
  return m;
}

function asig(m, prof, gm, activo = true, hasta = null) {
  return { id: m.id(), gm, prof, activo, hasta };
}
function filaClases(m, prof, gm, fecha, clases = 2, updatedAt) {
  return {
    id: m.id(), gm, prof, grado: "2DO", grupo: "A", carrera: "RH",
    fecha, clases, extra: "se-conserva",
    updatedAt: updatedAt ?? m.tick(),
  };
}
function filaAsist(m, prof, gm, curp, fecha, asistidas = 2, updatedAt) {
  return {
    id: m.id(), gm, prof, curp, grado: "2DO", grupo: "A", carrera: "RH",
    nombre: "Alumno " + curp.slice(0, 3), fecha, clases_asistidas: asistidas,
    extra: "se-conserva", updatedAt: updatedAt ?? m.tick(),
  };
}

/**
 * Espejo de `traspasar_materia_a_profesor`. Reglas (mismas que la RPC):
 *   - desactivar asignaciones activas de OTROS dueños;
 *   - crear/reactivar la asignación del destino;
 *   - migrar filas (clases/asistencia) cuyo gm coincida: si el destino ya
 *     tiene fila para la misma clave natural (o hay una fila más reciente),
 *     la fila anterior se ARCHIVA en `historial` (nunca se pierde).
 */
function traspasar(m, gm, dest) {
  if (![...m.asignaciones, ...m.clases, ...m.asistencias].some((r) => r.gm === gm)) {
    throw new Error("traspasar: el grupo_materia no existe en el modelo");
  }
  const antes = m.tick();
  const res = {
    asignacionesDesactivadas: 0,
    asignacionDestino: "ya_activa",
    clasesMigradas: 0,
    clasesArchivadas: 0,
    asistenciaMigradas: 0,
    asistenciaArchivadas: 0,
  };

  // 2) Asignaciones de otros dueños activos → inactivas.
  for (const a of m.asignaciones) {
    if (a.gm === gm && a.prof !== dest && a.activo) {
      a.activo = false;
      a.hasta = m.ahora;
      res.asignacionesDesactivadas += 1;
    }
  }

  // 3) Asignación destino.
  const propia = m.asignaciones.find((a) => a.gm === gm && a.prof === dest);
  if (propia) {
    if (!propia.activo) {
      propia.activo = true;
      propia.hasta = null;
      res.asignacionDestino = "reactivada";
    }
  } else {
    m.asignaciones.push(asig(m, dest, gm, true, null));
    res.asignacionDestino = "creada";
  }

  // 4) Migrar/archivar filas de cada tabla (misma regla que la RPC).
  const migrarTabla = (filas, nombreTabla) => {
    let migradas = 0;
    let archivadas = 0;
    const mismaClave = (r) =>
      filas.filter(
        (x) =>
          x !== r &&
          x.gm === r.gm &&
          x.fecha === r.fecha &&
          (r.curp === undefined || x.curp === r.curp),
      );
    for (const fila of [...filas]) {
      if (fila.gm !== gm || fila.prof === dest) continue;
      const rival = mismaClave(fila).find(
        (x) =>
          x.prof === dest ||
          (x.prof !== dest &&
            (x.updatedAt ?? antes) >= (fila.updatedAt ?? antes) &&
            x.id !== fila.id),
      );
      if (rival) {
        m.historial.push({
          ...fila,
          tabla_origen: nombreTabla,
          profesor_id_origen: fila.prof,
          profesor_id_destino: dest,
          traspasado_en: m.ahora,
        });
        filas.splice(filas.indexOf(fila), 1);
        archivadas += 1;
      } else {
        fila.prof = dest;
        migradas += 1;
      }
    }
    return { migradas, archivadas };
  };

  const rClases = migrarTabla(m.clases, "clases_impartidas");
  const rAsist = migrarTabla(m.asistencias, "asistencia_alumnos");
  res.clasesMigradas = rClases.migradas;
  res.clasesArchivadas = rClases.archivadas;
  res.asistenciaMigradas = rAsist.migradas;
  res.asistenciaArchivadas = rAsist.archivadas;
  return res;
}

const copiaSinProf = (f) => {
  const copia = { ...f };
  delete copia.prof;
  return JSON.parse(JSON.stringify(copia));
};


console.log("1) A tiene HISTORIA y MATE; B sube MATE => A conserva HISTORIA, MATE es de B");
{
  const m = crearModelo();
  m.asignaciones.push(asig(m, "A", GM_HIS), asig(m, "A", GM_MATE));
  m.asistencias.push(filaAsist(m, "A", GM_MATE, "C1", "2026-09-04"));
  const r = traspasar(m, GM_MATE, "B");
  const hisA = m.asignaciones.find((a) => a.gm === GM_HIS && a.prof === "A");
  const mateA = m.asignaciones.find((a) => a.gm === GM_MATE && a.prof === "A");
  const mateB = m.asignaciones.find((a) => a.gm === GM_MATE && a.prof === "B");
  ok("HISTORIA de A sigue activa", hisA && hisA.activo === true);
  ok("MATE de A quedó inactiva", mateA && mateA.activo === false && mateA.hasta);
  ok("MATE quedó solo de B (activa)", mateB && mateB.activo === true);
  ok("1 asignación desactivada", r.asignacionesDesactivadas === 1);
  ok(
    "la fila de MATE migró a B",
    m.asistencias.every((f) => f.gm !== GM_MATE || f.prof === "B"),
  );
}

console.log("2) Registros de MATE cambian de profesor_id, demás columnas idénticas");
{
  const m = crearModelo();
  const original = filaAsist(m, "A", GM_MATE, "C1", "2026-09-04", 2, m.tick());
  m.asistencias.push(original);
  const snapshot = copiaSinProf(original);
  const r = traspasar(m, GM_MATE, "B");
  const despues = m.asistencias[0];
  ok("migrada a B", despues.prof === "B" && r.asistenciaMigradas === 1);
  ok(
    "todas las columnas de datos idénticas (campo a campo)",
    JSON.stringify(copiaSinProf(despues)) === JSON.stringify(snapshot),
  );
}

console.log("3) Los registros de HISTORIA de A no se tocan");
{
  const m = crearModelo();
  m.asistencias.push(
    filaAsist(m, "A", GM_MATE, "C1", "2026-09-04"),
    filaAsist(m, "A", GM_HIS, "C1", "2026-09-04"),
  );
  const hisAntes = copiaSinProf(m.asistencias.find((f) => f.gm === GM_HIS));
  traspasar(m, GM_MATE, "B");
  const hisDespues = copiaSinProf(m.asistencias.find((f) => f.gm === GM_HIS));
  ok(
    "HISTORIA intacta (contenido y dueño A)",
    JSON.stringify(hisAntes) === JSON.stringify(hisDespues) &&
      m.asistencias.find((f) => f.gm === GM_HIS).prof === "A",
  );
}


console.log("4) Reversible: A vuelve a subir MATE => vuelve a A con los mismos conteos");
{
  const m = crearModelo();
  m.asignaciones.push(asig(m, "A", GM_HIS), asig(m, "A", GM_MATE));
  m.clases.push(filaClases(m, "A", GM_MATE, "2026-09-04", 2, m.tick()));
  m.clases.push(filaClases(m, "A", GM_MATE, "2026-09-05", 2, m.tick()));
  m.asistencias.push(
    filaAsist(m, "A", GM_MATE, "C1", "2026-09-04", 2, m.tick()),
    filaAsist(m, "A", GM_MATE, "C2", "2026-09-04", 2, m.tick()),
  );

  const totalClases = m.clases.length;
  const totalAsist = m.asistencias.length;
  const sumaClases = m.clases.reduce((s, f) => s + f.clases, 0);
  const sumaAsist = m.asistencias.reduce((s, f) => s + f.clases_asistidas, 0);
  const contenidoAntes = JSON.stringify(m.clases.map(copiaSinProf));

  const ida = traspasar(m, GM_MATE, "B");
  ok("ida: B recibe todas las filas", ida.clasesMigradas === totalClases && ida.asistenciaMigradas === totalAsist);
  const vuelta = traspasar(m, GM_MATE, "A");
  ok(
    "vuelta: las filas vuelven a A con los mismos conteos",
    vuelta.clasesMigradas === totalClases && vuelta.asistenciaMigradas === totalAsist,
  );
  ok("vuelta: A vuelve a tener MATE activa", m.asignaciones.find((a) => a.gm === GM_MATE && a.prof === "A").activo === true);
  ok(
    "sin pérdida de datos: mismas filas, mismas sumas, mismo contenido",
    m.clases.length === totalClases &&
      m.asistencias.length === totalAsist &&
      m.clases.reduce((s, f) => s + f.clases, 0) === sumaClases &&
      m.asistencias.reduce((s, f) => s + f.clases_asistidas, 0) === sumaAsist &&
      JSON.stringify(m.clases.map(copiaSinProf)) === contenidoAntes,
  );
}

console.log("5) Idempotente: B sube MATE dos veces => 0 traspasos la segunda");
{
  const m = crearModelo();
  m.asignaciones.push(asig(m, "A", GM_MATE));
  m.asistencias.push(filaAsist(m, "A", GM_MATE, "C1", "2026-09-04"));
  traspasar(m, GM_MATE, "B");
  const segunda = traspasar(m, GM_MATE, "B");
  ok("segunda subida: 0 asignaciones desactivadas", segunda.asignacionesDesactivadas === 0);
  ok("segunda subida: 0 filas migradas", segunda.clasesMigradas === 0 && segunda.asistenciaMigradas === 0);
  ok("segunda subida: destino ya_activa", segunda.asignacionDestino === "ya_activa");
}

console.log("6) Colisión (A y B con fila misma materia/grupo/fecha): B queda, A se archiva");
{
  const m = crearModelo();
  m.asignaciones.push(asig(m, "A", GM_MATE), asig(m, "B", GM_MATE));
  // A (anterior) y B (destino) tienen fila para el MISMO día.
  m.asistencias.push(
    filaAsist(m, "A", GM_MATE, "C1", "2026-09-04", 2, m.tick()),
    filaAsist(m, "B", GM_MATE, "C1", "2026-09-04", 3, m.tick()),
  );
  const r = traspasar(m, GM_MATE, "B");
  ok("la fila de A se archivó (1) y la de B queda activa", r.asistenciaArchivadas === 1 && m.asistencias.length === 1);
  ok("la fila viva es la de B (autoritativa)", m.asistencias[0].prof === "B" && m.asistencias[0].clases_asistidas === 3);
  ok(
    "ninguna se pierde: A está en el historial con trazabilidad",
    m.historial.length === 1 &&
      m.historial[0].profesor_id_origen === "A" &&
      m.historial[0].profesor_id_destino === "B" &&
      m.historial[0].clases_asistidas === 2,
  );
}


console.log("7) Nunca se busca ni se escribe por profesor_clave (estático)");
{
  const sql = leer("supabase/crear-rpc-traspasar-materia.sql");
  const mod = leer("lib/escolar/asistencias.ts");
  const actions = leer("app/actions/asistencias.ts");
  const helper = leer("lib/escolar/traspaso-materia.ts");

  ok("existe la RPC transaccional", /CREATE OR REPLACE FUNCTION public\.traspasar_materia_a_profesor/.test(sql));
  ok("existe la tabla de historial", /CREATE TABLE IF NOT EXISTS public\.asistencia_traspasos_historico/.test(sql));
  ok(
    "el SQL no busca por profesor_clave en WHERE/AND/JOIN",
    !/(?:WHERE|AND|JOIN)[^;]*profesor_clave\s*[=<>]/.test(sql.replace(/\n/g, " ")),
  );
  ok(
    "el SQL solo escribe profesor_clave = NULL (migración) o conserva el origen en historial",
    (sql.match(/profesor_clave\s*=\s*NULL/g) ?? []).length >= 2 &&
      /profesor_clave_origen/.test(sql),
  );
  ok(
    "confirmarAsistencias llama a la RPC ANTES de los UPSERT de asistencia",
    (() => {
      const fn = mod.slice(mod.indexOf("export async function confirmarAsistencias"));
      const iRpc = fn.indexOf("traspasarMateriaAProfesor(");
      const iUpsertClases = fn.indexOf("Error en clases impartidas");
      const iUpsertAsist = fn.indexOf("Error en asistencias");
      return iRpc !== -1 && iRpc < iUpsertClases && iRpc < iUpsertAsist;
    })(),
  );
  ok(
    "el módulo ya no acota clases/asistencia por .eq(\"profesor_clave\", …)",
    !/(?:TABLA_CLASES_IMPARTIDAS|TABLA_ASISTENCIA_ALUMNOS)[\s\S]{0,160}\.eq\(\s*"profesor_clave"/.test(
      mod,
    ),
  );
  ok(
    "las acciones ya no consultan ni escriben por la contraseña",
    !/\.eq\(\s*"profesor_clave",\s*sesion\.matricula/.test(actions) &&
      !/"profesor_clave",\s*sesion\.matricula/.test(actions),
  );
  ok(
    "helper RPC sin fallback multi-paso y con error explícito si no está desplegada",
    /supabase\.rpc\(\s*"traspasar_materia_a_profesor"/.test(helper) &&
      /ERROR_RPC_TRASPASO_NO_DESPLEGADA/.test(helper),
  );
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);

