import "server-only";
/**
 * alta-manual-alumno.ts — alta de UN alumno desde el formulario de Personas ›
 * Alumnos › Inscripciones (PROMPT W, 2026-10-24). El I/O; las decisiones están
 * en `alta-manual-alumno-puro.ts`.
 *
 * No escribe nada propio: compone las tres escrituras que ya existían.
 *   - alumno      → la misma fila que inserta el roster (`CLAVE = claveDesdeCurp`);
 *   - inscripción → `inscribirAlumnoEnCiclo`, la fuente única alumno→grupo;
 *   - tutor       → `crearTutorConAlumnos`, lo mismo que «Generar automáticos».
 *
 * El periodo lo decide SIEMPRE el servidor (`obtenerCicloOperativoGlobal`): del
 * navegador solo llega un `grupos.id`, y se acepta solo si es un grupo activo de
 * ese periodo.
 *
 * No autoriza: quien llama ya pasó `exigir()`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listarGruposPeriodoAdmin, inscribirAlumnoEnCiclo } from "../catalogo/inscripciones-borrador.ts";
import { obtenerCicloOperativoGlobal } from "../ciclo/ciclo-estado.ts";
import { TABLA_ALUMNOS } from "../tables.ts";
import { crearTutorConAlumnos } from "../tutores/tutores-relacion.ts";
import type { AlumnoRow } from "../types.ts";
import {
  etiquetaGrupoAlta,
  mensajeDuplicadoAlta,
  ordenarGruposAlta,
  type ContextoAltaManual,
  type DatosAltaManualAlumno,
  type ResultadoAltaManual,
} from "./alta-manual-alumno-puro.ts";
import { claveDesdeCurp, nombreCompletoAlumno } from "./alumnos.ts";

const ERROR_GENERICO = "No se pudo dar de alta al alumno. Inténtalo de nuevo.";

/** Ciclo operativo y sus grupos activos, ya rotulados y ordenados para el selector. */
export async function obtenerContextoAltaManual(supabase: SupabaseClient): Promise<ContextoAltaManual> {
  const op = await obtenerCicloOperativoGlobal(supabase);
  if (!op.ok) return { ok: false, error: op.error ?? "No se pudo leer el ciclo operativo." };
  if (!op.periodo) {
    return {
      ok: false,
      error: "No hay ciclo operativo. Actívalo en Ciclo escolar antes de dar de alta alumnos.",
    };
  }
  const r = await listarGruposPeriodoAdmin(supabase, op.periodo.id);
  if (!r.ok) return { ok: false, error: r.error ?? "No se pudieron leer los grupos del ciclo." };
  const grupos = ordenarGruposAlta((r.grupos ?? []).filter((g) => g.activo)).map((g) => ({
    id: g.id,
    etiqueta: etiquetaGrupoAlta(g),
  }));
  return { ok: true, periodo: { id: op.periodo.id, nombre: op.periodo.nombre }, grupos };
}

/**
 * Da de alta al alumno. Primero TODAS las comprobaciones sin escribir; después
 * alumno → inscripción → tutor. Si la inscripción o el tutor fallan, el alumno
 * ya existe y no se borra: el resultado dice qué falta.
 */
export async function darDeAltaAlumnoManual(
  supabase: SupabaseClient,
  datos: DatosAltaManualAlumno,
): Promise<ResultadoAltaManual> {
  const contexto = await obtenerContextoAltaManual(supabase);
  if (!contexto.ok) return contexto;
  const grupo = contexto.grupos.find((g) => g.id === datos.grupoId);
  if (!grupo) {
    return {
      ok: false,
      error: "Ese grupo no es del ciclo operativo o está inactivo. Recarga la página y elige otro.",
    };
  }

  const { data: existente, error: eCurp } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO, CLAVE")
    .eq("CURP", datos.curp)
    .maybeSingle();
  if (eCurp) {
    console.error("[alta-manual-alumno] buscar CURP", eCurp);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (existente) {
    return {
      ok: false,
      error:
        `Ya existe un alumno con esa CURP: ${nombreCompletoAlumno(existente as AlumnoRow)}. ` +
        "Para cambiarlo de grupo usa Ciclo escolar › Configurador › Alumnos.",
    };
  }

  const { data: conNumero, error: eNum } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP")
    .eq("numero_control", datos.numeroControl)
    .limit(1);
  if (eNum) {
    console.error("[alta-manual-alumno] buscar número de control", eNum);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (conNumero && conNumero.length > 0) {
    return { ok: false, error: "Ese número de control ya lo tiene otro alumno." };
  }

  const fila: AlumnoRow & { numero_control: string } = {
    CURP: datos.curp,
    CLAVE: claveDesdeCurp(datos.curp),
    NOMBRE: datos.nombre,
    P_APELLIDO: datos.pApellido,
    S_APELLIDO: datos.sApellido,
    numero_control: datos.numeroControl,
  };
  const { error: eIns } = await supabase.from(TABLA_ALUMNOS).insert(fila);
  if (eIns) {
    if (eIns.code === "23505") return { ok: false, error: mensajeDuplicadoAlta(eIns.message) };
    console.error("[alta-manual-alumno] insertar", eIns);
    return { ok: false, error: ERROR_GENERICO };
  }

  const nombreCompleto = nombreCompletoAlumno(fila);

  const ins = await inscribirAlumnoEnCiclo(supabase, {
    curp: datos.curp,
    grupoId: grupo.id,
    periodoId: contexto.periodo.id,
  });

  let tutor: Extract<ResultadoAltaManual, { ok: true }>["tutor"] = null;
  if (datos.crearTutor) {
    const t = await crearTutorConAlumnos(supabase, {
      curpsAlumnos: [datos.curp],
      alumnoReferenciaParaUsuario: { curp: datos.curp, nombreCompleto },
    });
    tutor = t.ok
      ? {
          ok: true,
          claveTutor: t.credencialesIniciales.clave_tutor,
          usuario: t.credencialesIniciales.usuario,
          contraseñaInicial: t.credencialesIniciales.contraseñaInicial,
        }
      : { ok: false, error: t.error };
  }

  return {
    ok: true,
    alumno: { curp: datos.curp, nombreCompleto, grupo: grupo.etiqueta },
    inscripcion: ins.ok ? { ok: true } : { ok: false, error: ins.error },
    tutor,
  };
}
