import type { SupabaseClient } from "@supabase/supabase-js";
import type { CriterioAlumnoEnFila } from "./buscar-en-filas";
import { carreraEscolarDesdeEtiquetas } from "./informacion-personal";
import { nombreTablaRegistroDesdeGrupo } from "./grupo-parse";
import { leerVistaRegistroEstatus } from "./registro-estatus";
import {
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
} from "./tables";
import type { EtiquetasPersonalesRow } from "./types";

export type VistaRegistroAlumno = {
  encabezados: string[];
  filas: string[][];
  nombreTabla: string | null;
  grado: string;
  grupo: string;
  carrera: string;
  alumnoEncontrado: boolean;
  filaAlumnoIndice: number;
  mensaje: string | null;
};

function criterioDesdeAlumno(
  curp: string | null | undefined,
  nombreCompleto: string,
): CriterioAlumnoEnFila {
  return {
    curp: curp?.trim() || null,
    nombreCompleto: nombreCompleto.trim() || null,
  };
}

type PertenenciaBoleta = {
  grado: string;
  grupo: string;
  carrera: string;
  fuente: "CATALOGO" | "FALLBACK_LEGACY";
};

/**
 * C4.4 — Resuelve la pertenencia académica de la boleta.
 * Fuente primaria: inscripción ACTIVA → grupos → carreras del catálogo.
 * Fallback LEGACY (ETIQUETAS PERSONALES) si no hay inscripción válida,
 * si hay más de una inscripción activa (anomalía: no se elige arbitrariamente)
 * o si el grupo es inexistente/inactivo.
 */
async function resolverPertenenciaBoleta(
  supabase: SupabaseClient,
  curp: string,
  etiquetas: EtiquetasPersonalesRow | null,
): Promise<PertenenciaBoleta> {
  const c = curp.trim().toUpperCase();
  if (c) {
    const { data: inscripciones, error } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .select("grupo_id, activo")
      .eq("curp", c)
      .eq("activo", true)
      .limit(2);

    if (!error && inscripciones && inscripciones.length === 1) {
      const { data: grupo, error: eG } = await supabase
        .from(TABLA_GRUPOS)
        .select("*")
        .eq("id", inscripciones[0].grupo_id)
        .eq("activo", true)
        .maybeSingle();
      if (!eG && grupo) {
        let carrera = "";
        if (grupo.carrera_id) {
          const { data: carreraRow } = await supabase
            .from(TABLA_CARRERAS)
            .select("clave")
            .eq("id", grupo.carrera_id)
            .maybeSingle();
          carrera = String(carreraRow?.clave ?? "");
        }
        return {
          grado: String(grupo.grado ?? ""),
          grupo: String(grupo.nombre ?? ""),
          carrera,
          fuente: "CATALOGO",
        };
      }
      // Grupo inexistente/inactivo → no es una pertenencia válida → fallback.
    }
  }

  // Fallback LEGACY (sin inscripción válida, múltiples activas o error).
  return {
    grado: etiquetas?.GRADO?.trim() ?? "",
    grupo: etiquetas?.GRUPO?.trim() ?? "",
    carrera: carreraEscolarDesdeEtiquetas(etiquetas),
    fuente: "FALLBACK_LEGACY",
  };
}

export async function obtenerVistaRegistroAlumno(
  supabase: SupabaseClient,
  curp: string | null | undefined,
  nombreCompleto: string,
  etiquetas: EtiquetasPersonalesRow | null,
): Promise<VistaRegistroAlumno> {
  // C4.4 — Fuente primaria: inscripción activa → grupos/carreras del catálogo.
  // Fallback LEGACY (ETIQUETAS PERSONALES) si no hay inscripción válida.
  const { grado, grupo, carrera } = await resolverPertenenciaBoleta(
    supabase,
    curp ?? "",
    etiquetas,
  );
  const criterio = criterioDesdeAlumno(curp, nombreCompleto);

  const vacio = (): VistaRegistroAlumno => ({
    encabezados: [],
    filas: [],
    nombreTabla: null,
    grado,
    grupo,
    carrera,
    alumnoEncontrado: false,
    filaAlumnoIndice: -1,
    mensaje: null,
  });

  if (!grado || !grupo) {
    return vacio();
  }

  const nombreTabla = await nombreTablaRegistroDesdeGrupo(
    grado,
    grupo,
    carrera,
  );

  if (!nombreTabla) {
    return {
      ...vacio(),
      mensaje: carrera
        ? `No se encontró el registro de calificaciones para ${grado} · grupo ${grupo} · ${carrera}.`
        : `No se encontró el registro de calificaciones para ${grado} · grupo ${grupo}.`,
    };
  }

  const estatus = await leerVistaRegistroEstatus(
    supabase,
    nombreTabla,
    criterio,
  );

  if (!estatus) {
    return {
      ...vacio(),
      nombreTabla,
      mensaje: `No hay datos cargados en «${nombreTabla}».`,
    };
  }

  return {
    encabezados: estatus.vista.encabezados,
    filas: estatus.vista.filas,
    nombreTabla,
    grado,
    grupo,
    carrera,
    alumnoEncontrado: estatus.alumnoEncontrado,
    filaAlumnoIndice: estatus.filaAlumnoIndice,
    mensaje: estatus.alumnoEncontrado
      ? null
      : `No se encontró tu nombre ni CURP en ninguna celda de «${nombreTabla}».`,
  };
}

