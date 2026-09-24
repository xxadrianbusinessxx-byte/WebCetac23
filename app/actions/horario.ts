"use server";

import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
import {
  consultarHorarioAlumno,
  consultarHorarioGrupoPorIdentidad,
  duracionMinutos,
  etiquetaTipoClase,
  materiasAsignadasProfesorEnGrupo,
  normalizarHoraVisible,
  obtenerGruposConCarreraDePeriodo,
  totalBloquesGrupoPorDia,
  type HorarioBloqueRow,
} from "@/lib/escolar/horario/horario-semanal";
import {
  aplicarImportacionHorario,
  plantillaHorarioParaDescarga,
  previsualizarImportacionHorario,
  type PreviewImportacionHorario,
  type ResultadoAplicarHorario,
} from "@/lib/escolar/horario/horario-importar";
import { listarPeriodosSimple } from "@/lib/escolar/ciclo/ciclo-estado";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores/tutores";
import { createClient } from "@/lib/supabase/server";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaArchivoHorario } from "@/lib/validacion/esquemas-puro";

/**
 * Server Actions del HORARIO SEMANAL OFICIAL (FASE HORARIO).
 *
 * SEGURIDAD (server-side, nunca por query params ni campos del cliente):
 *   - ESCRITURA (importar/preview de importación): SOLO rol `directivo`.
 *   - CONSULTA de horario de grupo:
 *       · directivo: cualquier grupo.
 *       · maestro: SOLO grupos donde tiene asignaciones activas
 *         (`asignaciones_profesor`).
 *       · alumno/tutor: NUNCA recibe grado/grupo del cliente; el horario se
 *         deriva de la inscripción ACTIVA (CURP). El tutor solo de CURPs
 *         vinculados a él.
 */

export type PeriodoCatalogoSimple = {
  id: string;
  nombre: string;
  activo: boolean;
};

/** Lista los periodos/ciclos del catálogo académico (para importar horario). */
export async function actionListarPeriodosCatalogo(): Promise<
  | { ok: true; periodos: PeriodoCatalogoSimple[] }
  | { ok: false; error: string }
> {
  const g = await exigir("ciclo.ver_contexto");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden administrar el horario." };
  }
  const supabase = await createClient();
  const r = await listarPeriodosSimple(supabase);
  if (!r.ok) return { ok: false, error: r.error ?? "Sin periodos." };
  return { ok: true, periodos: r.periodos };
}

/** Grupos del catálogo de un periodo (para los filtros de consulta). */
export async function actionListarGruposDePeriodo(
  periodoId: string,
): Promise<
  | { ok: true; grupos: { grado: string; grupo: string; carrera: string }[] }
  | { ok: false; error: string }
> {
  const g = await exigir("inscripcion.ver");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden administrar el horario." };
  }
  const supabase = await createClient();
  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const unicos = new Map<string, { grado: string; grupo: string; carrera: string }>();
  for (const g of grupos) {
    unicos.set(`${g.grado}|${g.nombre}|${g.carreraClave}`, {
      grado: g.grado,
      grupo: g.nombre,
      carrera: g.carreraClave,
    });
  }
  return { ok: true, grupos: [...unicos.values()] };
}

function previewError(
  mensaje: string,
  periodoNombre: string,
): PreviewImportacionHorario {
  return {
    ok: false,
    error: mensaje,
    periodoNombre,
    periodoId: null,
    hojaDetalle: "",
    columnasDetectadas: [],
    columnasFaltantes: [],
    totalFilasArchivo: 0,
    filasValidas: 0,
    filasRechazadas: 0,
    gruposEncontrados: [],
    materiasVinculadasCatalogo: 0,
    materiasSinVinculo: 0,
    profesoresEncontrados: [],
    nuevas: 0,
    actualizables: 0,
    sinCambios: 0,
    aEliminar: 0,
    erroresPorFila: [],
    advertencias: [],
    bloqueaEscritura: true,
  };
}

/** Preview de importación del horario (SIN escribir). Solo directivo. */
export async function actionImportarHorarioPreview(
  formData: FormData,
  periodoNombre: string,
): Promise<PreviewImportacionHorario> {
  const g = await exigir("horario.importar");
  if (!g.ok) {
    return previewError("Solo directivos pueden importar el horario.", periodoNombre);
  }
  const sesion = g.sesion;
  const entrada = leerFormData(esquemaArchivoHorario, formData);
  if (!entrada.ok) return previewError(entrada.error, periodoNombre);
  const supabase = await createClient();
  return previsualizarImportacionHorario(supabase, entrada.datos.archivo, {
    periodoNombre,
    creadoPor: sesion?.nombre ?? sesion?.matricula ?? "",
  });
}

/** Aplica la importación del horario (reemplazo-diferenciado por periodo). */
export async function actionImportarHorarioAplicar(
  formData: FormData,
  periodoNombre: string,
): Promise<ResultadoAplicarHorario> {
  const g = await exigir("horario.importar");
  if (!g.ok) {
    return {
      ok: false,
      error: "Solo directivos pueden importar el horario.",
      periodoNombre,
      aplicadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      sinCambios: 0,
      rechazadas: 0,
      erroresDetalle: [],
    };
  }
  const sesion = g.sesion;
  const entrada = leerFormData(esquemaArchivoHorario, formData);
  if (!entrada.ok) {
    return {
      ok: false,
      error: entrada.error,
      periodoNombre,
      aplicadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      sinCambios: 0,
      rechazadas: 0,
      erroresDetalle: [],
    };
  }
  const supabase = await createClient();
  return aplicarImportacionHorario(supabase, entrada.datos.archivo, {
    periodoNombre,
    creadoPor: sesion?.nombre ?? sesion?.matricula ?? "",
  });
}

/* ---------------------------------------------------------------------------
 * CONSULTAS DE LECTURA (directivo / maestro / alumno / tutor)
 * ------------------------------------------------------------------------- */

export type BloqueHorarioConsulta = {
  diaSemana: string;
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  duracionMin: number;
  materiaNombre: string;
  materiaId: string | null;
  tipoClase: string;
  tipoEtiqueta: string;
  profesor: string;
  profesorClave: string | null;
};

export type HorarioGrupoConsultable = {
  grupo: {
    grado: string;
    grupo: string;
    carreraClave: string;
    carreraNombre: string;
    periodoNombre: string;
  };
  bloques: BloqueHorarioConsulta[];
  resumenPorDia: Record<string, number>;
};

function aConsultaBloque(b: HorarioBloqueRow): BloqueHorarioConsulta {
  return {
    diaSemana: b.dia_semana,
    horaInicio: normalizarHoraVisible(b.hora_inicio),
    horaFin: normalizarHoraVisible(b.hora_fin),
    duracionMin: duracionMinutos(b.hora_inicio, b.hora_fin),
    materiaNombre: b.materia_nombre,
    materiaId: b.materia_id,
    tipoClase: b.tipo_clase,
    tipoEtiqueta: etiquetaTipoClase(b.tipo_clase),
    profesor: b.profesor_nombre || b.profesor_clave || "Sin profesor asignado",
    profesorClave: b.profesor_clave,
  };
}

function aConsultaGrupo(consulta: {
  grupo: { grado: string; grupo: string; carreraClave: string; carreraNombre: string; periodoNombre: string };
  bloques: HorarioBloqueRow[];
}): HorarioGrupoConsultable {
  return {
    grupo: consulta.grupo,
    bloques: consulta.bloques.map(aConsultaBloque),
    resumenPorDia: totalBloquesGrupoPorDia(consulta.bloques) as Record<string, number>,
  };
}

/**
 * Consulta el horario semanal de un grupo (directivo = libre; maestro = solo
 * grupos con asignaciones activas). El servidor valida el acceso: grado/grupo/
 * carrera/ciclo son solo identificadores de la solicitud, nunca autorización.
 */
export async function actionConsultarHorarioGrupo(input: {
  ciclo: string;
  grado: string;
  grupo: string;
  carrera: string;
}): Promise<
  | { ok: true; horario: HorarioGrupoConsultable | null }
  | { ok: false; error: string }
> {
  const g = await exigir("horario.ver_grupo");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar horarios." };
  }
  const sesion = g.sesion!;
  const supabase = await createClient();

  if (esRol(sesion.rol, "maestro")) {
    const materias = await materiasAsignadasProfesorEnGrupo(supabase, {
      profesorClave: sesion.matricula,
      ciclo: input.ciclo,
      grado: input.grado,
      grupo: input.grupo,
      carrera: input.carrera,
    });
    if (!materias) {
      return {
        ok: false,
        error:
          "Solo puedes consultar horarios de los grupos donde tienes asignaciones activas (asignaciones_profesor).",
      };
    }
  }

  const consulta = await consultarHorarioGrupoPorIdentidad(supabase, input);
  if (!consulta) {
    return { ok: true, horario: null };
  }
  return {
    ok: true,
    horario: aConsultaGrupo({
      grupo: {
        grado: consulta.grupo.grado,
        grupo: consulta.grupo.grupo,
        carreraClave: consulta.grupo.carreraClave,
        carreraNombre: consulta.grupo.carreraNombre,
        periodoNombre: consulta.grupo.periodoNombre,
      },
      bloques: consulta.bloques,
    }),
  };
}

/**
 * Horario semanal del grupo del alumno. El alumno ve SOLO su propia CURP; el
 * tutor SOLO CURPs vinculados a él. La identidad académica se resuelve en el
 * servidor desde la inscripción ACTIVA (nunca de grado/grupo del cliente).
 */
export async function actionObtenerHorarioAlumno(
  curp: string,
): Promise<
  | { ok: true; horario: HorarioGrupoConsultable | null; grupo: string }
  | { ok: false; error: string }
> {
  const g = await exigir("horario.ver_alumno");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para consultar horarios." };
  }
  const sesion = g.sesion;
  const c = curp.trim().toUpperCase();
  if (!sesion || !c) {
    return { ok: false, error: "No tienes permiso para consultar horarios." };
  }
  if (esRol(sesion.rol, "alumno")) {
    if (!sesion.curp || sesion.curp.trim().toUpperCase() !== c) {
      return { ok: false, error: "Solo puedes consultar tu propio horario." };
    }
  } else if (esRol(sesion.rol, "tutor")) {
    const supabaseT = await createClient();
    const curps = await listarCurpsDeTutor(supabaseT, sesion.matricula);
    if (!curps.includes(c)) {
      return { ok: false, error: "No tienes relación con ese alumno." };
    }
  } else if (
    !esRol(sesion.rol, "directivo") &&
    !esRol(sesion.rol, "maestro") &&
    !esRol(sesion.rol, "administracion")
  ) {
    return { ok: false, error: "No tienes permiso para consultar horarios." };
  }

  const supabase = await createClient();
  const consulta = await consultarHorarioAlumno(supabase, c);
  if (!consulta) {
    return {
      ok: true,
      horario: null,
      grupo: "",
    };
  }
  return {
    ok: true,
    horario: aConsultaGrupo({
      grupo: {
        grado: consulta.grupo.grado,
        grupo: consulta.grupo.grupo,
        carreraClave: consulta.grupo.carreraClave,
        carreraNombre: consulta.grupo.carreraNombre,
        periodoNombre: consulta.grupo.periodoNombre,
      },
      bloques: consulta.bloques,
    }),
    grupo: `${consulta.grupo.grado} ${consulta.grupo.grupo}`.trim(),
  };
}

/**
 * Descarga la PLANTILLA del horario (.xlsx con la estructura oficial y filas
 * de ejemplo). Disponible para directivo y maestro (es solo lectura de la
 * plantilla de referencia).
 */
export async function actionDescargarPlantillaHorario(): Promise<
  | { ok: true; base64: string; nombreArchivo: string }
  | { ok: false; error: string }
> {
  const g = await exigir("horario.descargar_plantilla");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso para descargar la plantilla." };
  }
  const plantilla = await plantillaHorarioParaDescarga();
  return {
    ok: true,
    base64: plantilla.base64,
    nombreArchivo: plantilla.nombreArchivo,
  };
}


