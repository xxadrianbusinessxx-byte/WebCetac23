import type { SupabaseClient } from "@supabase/supabase-js";
import type { CriterioAlumnoEnFila } from "./buscar-en-filas";
import { carreraEscolarDesdeEtiquetas } from "./informacion-personal";
import { nombreTablaRegistroDesdeGrupo } from "./grupo-parse";
import { leerVistaRegistroEstatus } from "./registro-estatus";
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

export async function obtenerVistaRegistroAlumno(
  supabase: SupabaseClient,
  curp: string | null | undefined,
  nombreCompleto: string,
  etiquetas: EtiquetasPersonalesRow | null,
): Promise<VistaRegistroAlumno> {
  const grado = etiquetas?.GRADO?.trim() ?? "";
  const grupo = etiquetas?.GRUPO?.trim() ?? "";
  const carrera = carreraEscolarDesdeEtiquetas(etiquetas);
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
    return vacio();
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

