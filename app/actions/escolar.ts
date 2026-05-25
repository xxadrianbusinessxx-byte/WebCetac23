"use server";

import type { PortalRole } from "@/lib/auth/types";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  buscarAlumnoPorCurp,
  buscarAlumnoPorNombre,
  buscarAlumnoPorTexto,
  nombreCompletoAlumno,
  variantesNombreAlumno,
} from "@/lib/escolar/alumnos";
import {
  guardarComentarioAlumno,
  listarComentariosAlumno,
} from "@/lib/escolar/comentarios";
import {
  actualizarEtiquetasPersonales,
  comentarioPersonalDesdeFila,
  etiquetasPersonalesDesdeFila,
  obtenerEtiquetasPersonales,
  patchComentarioPersonal,
  patchSoloPersonales,
  patchTitulosEtiquetas,
  patchValoresEtiquetas,
  titulosEtiquetasPersonales,
  valoresEtiquetasPersonales,
} from "@/lib/escolar/etiquetas";
import { filtrarMateriasPorGrupo } from "@/lib/escolar/materias-alumno";
import { obtenerVistaRegistroAlumno } from "@/lib/escolar/registro-alumno";
import type { VistaRegistroAlumno } from "@/lib/escolar/registro-alumno";
import { carreraEscolarDesdeEtiquetas } from "@/lib/escolar/informacion-personal";
import { listarMateriasCompletas } from "@/lib/escolar/tablas-supabase";
import { leerVistaMateriaAlumno } from "@/lib/escolar/materia-vista-alumno";
import {
  obtenerVistaMateria,
  reemplazarContenidoMateriaDesdeArchivo,
} from "@/lib/escolar/materias";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { publicIdPerfilUpload } from "@/lib/cloudinary/urls";
import { bufferImagenDesdeFormData } from "@/lib/imagen/leer-archivo-form";
import {
  guardarUrlFotoPerfil,
  obtenerFotoPerfilAlumno,
} from "@/lib/escolar/foto-perfil";
import { createClient } from "@/lib/supabase/server";
import { clienteLecturaEscolar } from "@/lib/supabase/service";

export async function actionObtenerPerfilAlumno(
  curpConsulta?: string | null,
): Promise<{
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  registro: VistaRegistroAlumno;
  materias: string[];
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
      registro: {
        encabezados: [],
        filas: [],
        nombreTabla: null,
        grado: "",
        grupo: "",
        carrera: "",
        alumnoEncontrado: false,
        filaAlumnoIndice: -1,
        mensaje: null,
      },
      materias: [],
      comentarios: [],
      puedeEditarEtiquetas: false,
      fotoPerfilUrl: null,
    };
  }

  const alumno = await buscarAlumnoPorCurp(supabase, curp);
  const nombreCompleto = alumno ? nombreCompletoAlumno(alumno) : "";
  const supabaseLectura = await clienteLecturaEscolar(supabase);
  const etiquetas = await obtenerEtiquetasPersonales(supabaseLectura, curp);
  const carrera = carreraEscolarDesdeEtiquetas(etiquetas);
  const registro = await obtenerVistaRegistroAlumno(
    supabaseLectura,
    curp,
    nombreCompleto,
    etiquetas,
    variantesNombreAlumno(alumno),
  );
  const todasMaterias = await listarMateriasCompletas();
  const consultaOtroAlumno = Boolean(
    curpConsulta?.trim() &&
      curpConsulta.trim().toUpperCase() !== sesion?.curp?.trim().toUpperCase(),
  );
  const materias =
    sesion?.rol === "alumno" || consultaOtroAlumno
      ? filtrarMateriasPorGrupo(
          todasMaterias,
          etiquetas?.GRADO ?? "",
          etiquetas?.GRUPO ?? "",
          carrera,
        )
      : [...todasMaterias];
  const comentarios = await listarComentariosAlumno(supabase, curp);
  const fotoPerfilUrl = await obtenerFotoPerfilAlumno(supabase, curp);
  const puedeEditarEtiquetas =
    sesion?.rol === "alumno" || sesion?.rol === "directivo";

  return {
    alumno,
    etiquetas,
    registro,
    materias,
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

  if (!nombreMateria.trim()) {
    return { ok: false, error: "Selecciona una materia en la lista." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  return reemplazarContenidoMateriaDesdeArchivo(supabase, nombreMateria, archivo);
}

export async function actionSubirRegistroExcel(
  nombreRegistro: string,
  formData: FormData,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo directivos pueden subir registros de calificaciones finales.",
    };
  }

  if (!nombreRegistro.trim()) {
    return { ok: false, error: "Selecciona un registro de grupo en la lista." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  return reemplazarContenidoMateriaDesdeArchivo(supabase, nombreRegistro, archivo);
}

export async function actionObtenerVistaRegistro(
  nombreRegistro: string,
): Promise<MateriaTablaVista | null> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return null;
  if (!nombreRegistro.trim()) return null;
  const supabase = await createClient();
  return obtenerVistaMateria(supabase, nombreRegistro);
}

export async function actionObtenerVistaMateria(
  nombreMateria: string,
  curpConsulta?: string | null,
): Promise<MateriaTablaVista | null> {
  const supabaseSesion = await createClient();
  const supabase = await clienteLecturaEscolar(supabaseSesion);
  const sesion = await obtenerSesionPortal();
  const tabla = nombreMateria.trim();
  if (!tabla) return null;

  let curp =
    curpConsulta?.trim().toUpperCase() ??
    sesion?.curp?.trim().toUpperCase() ??
    "";

  if (!curp && sesion?.rol === "alumno" && sesion.matricula) {
    const { buscarAlumnoPorClave } = await import("@/lib/escolar/alumnos");
    const a = await buscarAlumnoPorClave(supabase, sesion.matricula);
    curp = a?.CURP ?? "";
  }

  const vistaSoloAlumno =
    sesion?.rol === "alumno" || Boolean(curpConsulta?.trim());

  if (vistaSoloAlumno && curp) {
    const etiquetas = await obtenerEtiquetasPersonales(supabase, curp);
    const carrera = carreraEscolarDesdeEtiquetas(etiquetas);
    const todas = await listarMateriasCompletas();
    const permitidas = filtrarMateriasPorGrupo(
      todas,
      etiquetas?.GRADO ?? "",
      etiquetas?.GRUPO ?? "",
      carrera,
    );
    if (!permitidas.includes(tabla)) return null;

    const alumno = await buscarAlumnoPorCurp(supabase, curp);
    const nombreCompleto = alumno ? nombreCompletoAlumno(alumno) : "";
    const nombresAlternativos = variantesNombreAlumno(alumno);
    return leerVistaMateriaAlumno(supabase, tabla, {
      curp,
      nombreCompleto,
      nombresAlternativos,
    });
  }

  return obtenerVistaMateria(supabase, tabla);
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
  const alumno = await buscarAlumnoPorTexto(supabase, nombreAlumno);
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
  return buscarAlumnoPorTexto(supabase, nombre);
}

export async function actionSubirFotoPerfil(
  formData: FormData,
  curpConsulta?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };

  const leido = await bufferImagenDesdeFormData(formData);
  if (!leido.ok) return leido;

  let curp = curpConsulta?.trim().toUpperCase() ?? "";

  if (!curp && sesion.rol === "alumno") {
    curp =
      sesion.curp?.trim().toUpperCase() ??
      (await (async () => {
        const supabase = await createClient();
        const { buscarAlumnoPorClave } = await import("@/lib/escolar/alumnos");
        const a = await buscarAlumnoPorClave(supabase, sesion.matricula);
        return a?.CURP ?? "";
      })());
  }

  if (!curp && sesion.rol === "directivo") {
    return {
      ok: false,
      error: "No se indicó el CURP del alumno para guardar la foto.",
    };
  }

  if (!curp) {
    return { ok: false, error: "No se encontró CURP del alumno." };
  }

  if (
    sesion.rol === "alumno" &&
    sesion.curp &&
    sesion.curp.toUpperCase() !== curp
  ) {
    return { ok: false, error: "No puedes cambiar la foto de otro alumno." };
  }

  const subida = await subirImagenCloudinary(
    leido.buffer,
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
  return {
    titulos: titulosEtiquetasPersonales(row),
    valores: valoresEtiquetasPersonales(row),
    comentarioPersonal: comentarioPersonalDesdeFila(row),
    personales: etiquetasPersonalesDesdeFila(row),
  };
}
