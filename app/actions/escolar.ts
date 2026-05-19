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
  comentarioPersonalDesdeFila,
  etiquetasEstatusDesdeFila,
  etiquetasPersonalesDesdeFila,
  obtenerEtiquetasPersonales,
  patchComentarioPersonal,
  patchSoloEstatus,
  patchSoloPersonales,
  patchTitulosEtiquetas,
  patchValoresEtiquetas,
  titulosEtiquetasPersonales,
  valoresEtiquetasPersonales,
} from "@/lib/escolar/etiquetas";
import {
  obtenerEtiquetasStatusPorCurp,
  vistaEstatusDesdeFila,
} from "@/lib/escolar/etiquetas-status";
import {
  obtenerVistaMateria,
  reemplazarContenidoMateriaDesdeArchivo,
} from "@/lib/escolar/materias";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type { VistaEstatusAlumno } from "@/lib/escolar/etiquetas-status";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { publicIdPerfilUpload } from "@/lib/cloudinary/urls";
import {
  guardarUrlFotoPerfil,
  obtenerFotoPerfilAlumno,
} from "@/lib/escolar/foto-perfil";
import { createClient } from "@/lib/supabase/server";

export async function actionObtenerPerfilAlumno(
  curpConsulta?: string | null,
): Promise<{
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  estatus: VistaEstatusAlumno;
  comentarios: ComentarioRow[];
  puedeEditarEtiquetas: boolean;
  fotoPerfilUrl: string | null;
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
      estatus: vistaEstatusDesdeFila(null),
      comentarios: [],
      puedeEditarEtiquetas: false,
      fotoPerfilUrl: null,
    };
  }

  const alumno = await buscarAlumnoPorCurp(supabase, curp);
  const etiquetas = await obtenerEtiquetasPersonales(supabase, curp);
  const filaStatus = await obtenerEtiquetasStatusPorCurp(supabase, curp);
  const estatus = vistaEstatusDesdeFila(filaStatus);
  const comentarios = await listarComentariosAlumno(supabase, curp);
  const fotoPerfilUrl = await obtenerFotoPerfilAlumno(supabase, curp);
  const puedeEditarEtiquetas =
    sesion?.rol === "alumno" || sesion?.rol === "directivo";

  return {
    alumno,
    etiquetas,
    estatus,
    comentarios,
    puedeEditarEtiquetas,
    fotoPerfilUrl,
  };
}

export async function actionGuardarEtiquetasPersonales(
  curp: string,
  titulos: [string, string, string],
  valores: [string, string, string],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "alumno" && sesion.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso." };
  }
  const supabase = await createClient();
  return actualizarEtiquetasPersonales(supabase, curp, {
    ...patchTitulosEtiquetas(...titulos),
    ...patchValoresEtiquetas(...valores),
  });
}

/** @deprecated Usar actionGuardarEtiquetasPersonales */
export async function actionActualizarEtiquetasPersonales(
  curp: string,
  empty4: string,
  empty5: string,
  empty6: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const titulos = titulosEtiquetasPersonales(
    await obtenerEtiquetasPersonales(await createClient(), curp),
  );
  return actionGuardarEtiquetasPersonales(curp, titulos, [
    empty4,
    empty5,
    empty6,
  ]);
}

/** @deprecated */
export async function actionActualizarEstatusDirectivo(
  curp: string,
  e1: string,
  e2: string,
  e3: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const row = await obtenerEtiquetasPersonales(supabase, curp);
  return actionGuardarEtiquetasPersonales(
    curp,
    [e1, e2, e3],
    valoresEtiquetasPersonales(row),
  );
}

export async function actionGuardarComentarioPersonal(
  curp: string,
  comentario: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "alumno" && sesion.rol !== "directivo") {
    return { ok: false, error: "No tienes permiso." };
  }
  if (comentario.length > COMENTARIO_MAX_LENGTH) {
    return {
      ok: false,
      error: `Máximo ${COMENTARIO_MAX_LENGTH} caracteres.`,
    };
  }
  const supabase = await createClient();
  return actualizarEtiquetasPersonales(
    supabase,
    curp,
    patchComentarioPersonal(comentario),
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

  const supabase = await createClient();
  return reemplazarContenidoMateriaDesdeArchivo(supabase, nombreMateria, archivo);
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

  const curp =
    sesion.curp?.trim().toUpperCase() ??
    (await (async () => {
      const supabase = await createClient();
      const { buscarAlumnoPorClave } = await import("@/lib/escolar/alumnos");
      const a = await buscarAlumnoPorClave(supabase, sesion.matricula);
      return a?.CURP ?? "";
    })());

  if (!curp) {
    return { ok: false, error: "No se encontró CURP del alumno." };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const subida = await subirImagenCloudinary(
    buffer,
    publicIdPerfilUpload(curp),
  );
  if (!subida.ok) return subida;

  const supabase = await createClient();
  const guardado = await guardarUrlFotoPerfil(supabase, curp, subida.url);
  if (!guardado.ok) return guardado;

  return subida;
}

export async function actionEtiquetasResumen(curp: string) {
  const supabase = await createClient();
  const row = await obtenerEtiquetasPersonales(supabase, curp);
  const filaStatus = await obtenerEtiquetasStatusPorCurp(supabase, curp);
  return {
    titulos: titulosEtiquetasPersonales(row),
    valores: valoresEtiquetasPersonales(row),
    comentarioPersonal: comentarioPersonalDesdeFila(row),
    estatus: vistaEstatusDesdeFila(filaStatus),
    /** @deprecated */
    estatusLegacy: etiquetasEstatusDesdeFila(row),
    personales: etiquetasPersonalesDesdeFila(row),
  };
}
