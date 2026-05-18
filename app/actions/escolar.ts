"use server";

import type { PortalRole } from "@/lib/auth/types";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  buscarAlumnoPorCurp,
  buscarAlumnoPorNombre,
  nombreCompletoAlumno,
} from "@/lib/escolar/alumnos";
import {
  guardarComentarioAlumno,
  listarComentariosAlumno,
} from "@/lib/escolar/comentarios";
import {
  actualizarEtiquetasPersonales,
  etiquetasEstatusDesdeFila,
  etiquetasPersonalesDesdeFila,
  obtenerEtiquetasPersonales,
  patchSoloEstatus,
  patchSoloPersonales,
} from "@/lib/escolar/etiquetas";
import { obtenerVistaMateria, reemplazarContenidoMateria } from "@/lib/escolar/materias";
import { parseArchivoCalificaciones } from "@/lib/escolar/parse-hoja";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { createClient } from "@/lib/supabase/server";

export async function actionObtenerPerfilAlumno(
  curpConsulta?: string | null,
): Promise<{
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  comentarios: ComentarioRow[];
  puedeEditarEstatus: boolean;
}> {
  const sesion = await obtenerSesionPortal();
  const supabase = await createClient();

  let curp = curpConsulta?.trim().toUpperCase() ?? sesion?.curp;
  if (!curp && sesion?.matricula) {
    const { buscarAlumnoPorClave } = await import("@/lib/escolar/alumnos");
    const a = await buscarAlumnoPorClave(supabase, sesion.matricula);
    curp = a?.CURP;
  }
  if (!curp) {
    return {
      alumno: null,
      etiquetas: null,
      comentarios: [],
      puedeEditarEstatus: false,
    };
  }

  const alumno = await buscarAlumnoPorCurp(supabase, curp);
  const etiquetas = await obtenerEtiquetasPersonales(supabase, curp);
  const comentarios = await listarComentariosAlumno(supabase, curp);
  const puedeEditarEstatus = sesion?.rol === "directivo";

  return { alumno, etiquetas, comentarios, puedeEditarEstatus };
}

export async function actionActualizarEtiquetasPersonales(
  curp: string,
  empty4: string,
  empty5: string,
  empty6: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "alumno" && sesion.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso." };
  }
  const supabase = await createClient();
  return actualizarEtiquetasPersonales(
    supabase,
    curp,
    patchSoloPersonales(empty4, empty5, empty6),
  );
}

export async function actionActualizarEstatusDirectivo(
  curp: string,
  e1: string,
  e2: string,
  e3: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden editar el estatus." };
  }
  const supabase = await createClient();
  return actualizarEtiquetasPersonales(
    supabase,
    curp,
    patchSoloEstatus(e1, e2, e3),
  );
}

export async function actionSubirMateriaExcel(
  nombreMateria: string,
  formData: FormData,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso para subir calificaciones." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  try {
    const filas = await parseArchivoCalificaciones(archivo);
    const supabase = await createClient();
    return reemplazarContenidoMateria(supabase, nombreMateria, filas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }
}

export async function actionObtenerVistaMateria(
  nombreMateria: string,
): Promise<MateriaTablaVista | null> {
  const supabase = await createClient();
  return obtenerVistaMateria(supabase, nombreMateria);
}

export async function actionEnviarComentarioAlumno(
  nombreAlumno: string,
  comentario: string,
  autorProfesor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso." };
  }
  if (comentario.length > COMENTARIO_MAX_LENGTH) {
    return {
      ok: false,
      error: `Máximo ${COMENTARIO_MAX_LENGTH} caracteres.`,
    };
  }

  const supabase = await createClient();
  const alumno = await buscarAlumnoPorNombre(supabase, nombreAlumno);
  if (!alumno) {
    return { ok: false, error: "No se encontró al alumno por nombre." };
  }

  const autor =
    autorProfesor.trim() ||
    sesion.nombre ||
    sesion.matricula;

  return guardarComentarioAlumno(supabase, {
    curpAlumno: alumno.CURP,
    comentario,
    autorProfesor: autor,
  });
}

export async function actionBuscarAlumnoPorNombre(
  nombre: string,
): Promise<AlumnoRow | null> {
  const supabase = await createClient();
  return buscarAlumnoPorNombre(supabase, nombre);
}

export async function actionSubirFotoPerfil(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }

  const id =
    sesion.curp?.replace(/[^a-zA-Z0-9]/g, "_") ??
    sesion.matricula.replace(/[^a-zA-Z0-9]/g, "_");

  const buffer = Buffer.from(await archivo.arrayBuffer());
  return subirImagenCloudinary(buffer, `perfil_${id}`);
}

export async function actionEtiquetasResumen(curp: string) {
  const supabase = await createClient();
  const row = await obtenerEtiquetasPersonales(supabase, curp);
  return {
    estatus: etiquetasEstatusDesdeFila(row),
    personales: etiquetasPersonalesDesdeFila(row),
  };
}
