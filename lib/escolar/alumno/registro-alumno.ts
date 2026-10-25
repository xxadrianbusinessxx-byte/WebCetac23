import type { SupabaseClient } from "@supabase/supabase-js";
import type { CriterioAlumnoEnFila } from "../buscar-en-filas.ts";
import { nombreTablaRegistroDesdeGrupo } from "../catalogo/grupo-parse.ts";
import { leerVistaRegistroEstatus } from "./registro-estatus.ts";
import {
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
} from "../tables.ts";

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
  fuente: "CATALOGO" | "SIN_INSCRIPCION";
};

/**
 * PROMPT Y — La pertenencia a partir de un grupo YA resuelto desde la inscripción
 * activa (p. ej. el `grupoCatalogo` de la RPC `obtener_perfil_alumno`, que también
 * exige grupo activo). Misma forma que `resolverPertenenciaBoleta`, sin consultas.
 * null si no hay grupo: entonces el registro lo resuelve por su cuenta.
 */
export function pertenenciaDesdeCatalogo(
  catalogo: { grupo: { grado?: string | null; nombre?: string | null }; carrera?: { clave?: string | null } | null } | null,
): { grado: string; grupo: string; carrera: string } | null {
  if (!catalogo) return null;
  return {
    grado: String(catalogo.grupo.grado ?? ""),
    grupo: String(catalogo.grupo.nombre ?? ""),
    carrera: String(catalogo.carrera?.clave ?? ""),
  };
}

/**
 * C4.4/C4.24 — Resuelve la pertenencia académica de la boleta.
 * SOLO desde la inscripción ACTIVA → grupos → carreras del catálogo.
 * Sin inscripción válida (o múltiples activas / grupo inexistente) NO se
 * infiere desde ETIQUETAS PERSONALES: se devuelve vacío (la identidad
 * académica la define únicamente el directivo).
 */
async function resolverPertenenciaBoleta(
  supabase: SupabaseClient,
  curp: string,
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
    }
  }

  return { grado: "", grupo: "", carrera: "", fuente: "SIN_INSCRIPCION" };
}

export async function obtenerVistaRegistroAlumno(
  supabase: SupabaseClient,
  curp: string | null | undefined,
  nombreCompleto: string,
  /**
   * PROMPT Y — la pertenencia YA resuelta desde la misma fuente (inscripción
   * activa → grupos → carreras), p. ej. por la RPC `obtener_perfil_alumno`. Si
   * viene, no se repiten esas tres consultas; si no, se resuelve como siempre.
   */
  pertenencia?: { grado: string; grupo: string; carrera: string } | null,
): Promise<VistaRegistroAlumno> {
  // C4.4 — Fuente única: inscripción activa → grupos/carreras del catálogo.
  const { grado, grupo, carrera } =
    pertenencia ?? (await resolverPertenenciaBoleta(supabase, curp ?? ""));
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

