"use server";

import type { PortalRole } from "@/lib/auth/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  buscarAlumnoPorCurp,
  buscarAlumnoPorNombre,
  buscarAlumnoPorTexto,
  nombreCompletoAlumno,
  previsualizarSincronizacionAlumnos,
  sincronizarAlumnosDesdeArchivo,
} from "@/lib/escolar/alumnos";

import {
  mapeoRosterValido,
  type MapeoRoster,
} from "@/lib/escolar/mapeo-columnas";


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
import { buscarIndiceFilaAlumno } from "@/lib/escolar/buscar-en-filas";
import { vistaConColumnasIdentificadas } from "@/lib/escolar/columnas-calificaciones";
import { actualizarMateriaDesdeArchivo } from "@/lib/escolar/materia-avance";
import { obtenerMapeoColumnasMateria } from "@/lib/escolar/mapeo-columnas-materia";
import { leerVistaMateriaAlumno } from "@/lib/escolar/materia-vista-alumno";
import {
  resolverGrupoAlumno,
  resolverIdentidadesCatalogo,
  resolverMateriasAlumno,
  validarAccesoAlumno,
} from "@/lib/escolar/catalogo-academico";
import {
  gradoASemestre,
  semestreActivoDeGrupo,
  semestresInactivos,
} from "@/lib/escolar/semestres";
import {
  listarNombresVisiblesMaterias,
  materiasVisiblesDesdeCatalogo,
  type MateriaConNombreVisible,
} from "@/lib/escolar/nombres-visibles";
import { obtenerVistaRegistroAlumno } from "@/lib/escolar/registro-alumno";
import type { VistaRegistroAlumno } from "@/lib/escolar/registro-alumno";
import { reemplazarContenidoStatusDesdeArchivo } from "@/lib/escolar/etiquetas-status";
import {
  obtenerVistaMateria,
  reemplazarContenidoMateriaDesdeArchivo,
} from "@/lib/escolar/materias";
import { COMENTARIO_MAX_LENGTH, TABLA_GRUPO_MATERIAS } from "@/lib/escolar/tables";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { publicIdPerfilUpload } from "@/lib/cloudinary/urls";
import { invalidarUrlFotoPerfil } from "@/lib/cloudinary/urls-server";
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
  materias: MateriaConNombreVisible[];
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
  // C4.6 — La carrera ACADÉMICA OFICIAL proviene del catálogo
  // (grupoCatalogo.carrera) cuando existe inscripción activa. ETIQUETAS.CARRERA
  // se usa SOLO en el fallback legacy (sin inscripción) y como dato descriptivo.
  const registro = await obtenerVistaRegistroAlumno(
    supabaseLectura,
    curp,
    nombreCompleto,
  );
  const aliases = await listarNombresVisiblesMaterias(supabaseLectura);

  // C4.1 — Fuente primaria: catálogo académico nuevo.
  //   CURP → inscripciones_alumno (activa) → grupos → grupo_materias → materias.
  //   idInterno = grupo_materias.tabla_legacy (compatibilidad de UI); nombre
  //   visible sigue resolviéndose con el mecanismo existente (7A).
  // C4.14 — si el alumno tiene grupo resoluble y su SEMESTRE está inactivo
  // (academico_semestres), su oferta de materias queda vacía.
  // C4.24 — sin inscripción activa NO se infiere la oferta desde ETIQUETAS
  // PERSONALES (la identidad académica la define SOLO el directivo).
  const grupoCatalogo = await resolverGrupoAlumno(supabaseLectura, curp);
  const semestreActivo =
    grupoCatalogo && gradoASemestre(grupoCatalogo.grupo.grado) !== null
      ? await semestreActivoDeGrupo(supabaseLectura, grupoCatalogo.grupo)
      : true;
  const materiasCatalogo =
    grupoCatalogo && semestreActivo
      ? await resolverMateriasAlumno(supabaseLectura, curp)
      : [];
  const tablasLegacy = materiasCatalogo
    .map((m) => m.tablaLegacy)
    .filter((t): t is string => Boolean(t));

  // C4.24 — La oferta de materias del alumno proviene SOLO de su inscripción
  // activa (catálogo). Sin inscripción activa → sin oferta (NO se infiere de
  // ETIQUETAS PERSONALES). Semestre inactivo → oferta vacía (no se cae a un
  // fallback legacy).
  let fuente: "CATALOGO" | "SEMESTRE_INACTIVO" | "SIN_INSCRIPCION" =
    grupoCatalogo
      ? semestreActivo
        ? "CATALOGO"
        : "SEMESTRE_INACTIVO"
      : "SIN_INSCRIPCION";
  let materias: MateriaConNombreVisible[] = [];
  if (grupoCatalogo && semestreActivo) {
    // C4.28 — identidad desde el catálogo (grupo_materias → grupos → carreras
    // y materias). El nombre físico de la tabla NUNCA se interpreta.
    const identidades = await resolverIdentidadesCatalogo(
      supabaseLectura,
      tablasLegacy,
    );
    materias = materiasVisiblesDesdeCatalogo(
      tablasLegacy,
      identidades,
      aliases,
    );
  }
  void fuente;

  // C4.7 — CARRERA del PERFIL: proviene del CATÁLOGO cuando existe inscripción
  // activa (grupoCatalogo.carrera); vacía si no la hay (no se inventa).
  // ETIQUETAS.CARRERA permanece almacenada como dato legacy/descriptivo pero
  // deja de mostrarse como autoridad académica en el perfil.
  // C4.24 — GRADO/GRUPO también provienen SOLO del catálogo (inscripción que
  // controla el directivo). Las ETIQUETAS PERSONALES (legacy) dejan de
  // sobreponerse a la inscripción: si el alumno no tiene inscripción activa,
  // la identidad académica se muestra vacía (no se infiere de etiquetas).
  const etiquetasVisibles: EtiquetasPersonalesRow | null = etiquetas
    ? {
        ...etiquetas,
        GRADO: grupoCatalogo?.grupo.grado ?? "",
        GRUPO: grupoCatalogo?.grupo.nombre ?? "",
        CARRERA: grupoCatalogo?.carrera?.clave ?? "",
      }
    : null;

  const comentarios = await listarComentariosAlumno(supabase, curp);
  const fotoPerfilUrl = await obtenerFotoPerfilAlumno(supabase, curp);
  const puedeEditarEtiquetas =
    sesion?.rol === "alumno" || sesion?.rol === "directivo";

  return {
    alumno,
    etiquetas: etiquetasVisibles,
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

/**
 * C4.18 — ¿Por qué una materia NO debe cargarse/actualizarse? Devuelve el
 * motivo (materia desactivada en grupo_materias, o semestre inactivo) o null.
 */
async function motivoMateriaNoCargable(
  supabase: SupabaseClient,
  idInterno: string,
): Promise<string | null> {
  const id = idInterno.trim();
  if (!id) return null;
  const { data: gms } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("tabla_legacy, activo")
    .eq("tabla_legacy", id);
  if (gms && gms.length > 0 && gms.every((g) => g.activo === false)) {
    return "La materia está desactivada en el catálogo.";
  }
  // C4.28 — el semestre se resuelve desde el catálogo (grupo_materias →
  // grupos.grado). El nombre físico de la tabla NUNCA se parsea.
  const identidades = await resolverIdentidadesCatalogo(supabase, [id]);
  const identidad = identidades.get(id);
  if (identidad?.grado) {
    const sem = gradoASemestre(identidad.grado);
    if (sem !== null) {
      const inactivos = await semestresInactivos(supabase);
      if (inactivos.has(sem)) return "el semestre de esta materia está inactivo";
    }
  }
  return null;
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
  // C4.18 — no se permite subir calificaciones de materias desactivadas o de
  // semestres inactivos (la visualización y la operación quedan cerradas).
  const motivo = await motivoMateriaNoCargable(supabase, nombreMateria);
  if (motivo) {
    return { ok: false, error: `No se puede subir: ${motivo}.` };
  }
  return reemplazarContenidoMateriaDesdeArchivo(supabase, nombreMateria, archivo);
}

/**
 * BLOQUE 7C.2 — Modo «Actualizar / agregar avance».
 * Sube un Excel PARCIAL a una materia que ya tiene información:
 *   - actualiza SOLO las columnas presentes;
 *   - conserva columnas y alumnos ausentes;
 *   - actualiza alumnos existentes (CURP/nombre normalizado) y agrega nuevos.
 *
 * NO reemplaza el contenido completo (para eso está actionSubirMateriaExcel).
 */
export async function actionActualizarMateriaExcel(
  nombreMateria: string,
  formData: FormData,
): Promise<
  | {
      ok: true;
      actualizados: number;
      nuevos: number;
      columnasAgregadas: number;
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "maestro" && sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "No tienes permiso para actualizar calificaciones.",
    };
  }

  if (!nombreMateria.trim()) {
    return { ok: false, error: "Selecciona una materia en la lista." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  // C4.18 — tampoco se permite «actualizar/agregar avance» en materias
  // desactivadas o de semestres inactivos.
  const motivo = await motivoMateriaNoCargable(supabase, nombreMateria);
  if (motivo) {
    return { ok: false, error: `No se puede actualizar: ${motivo}.` };
  }
  return actualizarMateriaDesdeArchivo(supabase, nombreMateria, archivo);
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
): Promise<MateriaTablaVista | null> {
  const supabase = await createClient();
  const sesion = await obtenerSesionPortal();

  // BLOQUE 7C: configuración de mapeo de columnas (si existe). El mapeo
  // explícito tiene prioridad sobre la detección automática 7B. Si la tabla
  // de configuración aún no existe, la lectura devuelve null y se usa 7B.
  const mapeo = await obtenerMapeoColumnasMateria(supabase, nombreMateria);

  if (sesion?.rol === "alumno" && sesion.curp) {
    // C4.1 — SEGURIDAD: autorización server-side desde el catálogo.
    // 1) Fuente primaria: inscripción activa → grupo → grupo_materias → materias.
    // 2) La materia solicitada (idInterno = tabla_legacy) debe pertenecer al grupo.
    // 3) validarAccesoAlumno() confirma la relación persistida.
    // 4) Fallback legacy si no hay inscripción resoluble.
    // C4.14 — si el semestre del grupo está inactivo, el alumno no puede
    // acceder a la materia (sin caer al fallback legacy).
    const grupoAcceso = await resolverGrupoAlumno(supabase, sesion.curp);
    if (grupoAcceso) {
      const semestreGrupo = gradoASemestre(grupoAcceso.grupo.grado);
      if (
        semestreGrupo !== null &&
        !(await semestreActivoDeGrupo(supabase, grupoAcceso.grupo))
      ) {
        return null;
      }
    }
    const materiasCatalogo = await resolverMateriasAlumno(supabase, sesion.curp);
    const conTablaLegacy = materiasCatalogo.filter((m) => m.tablaLegacy);
    const permitidoCatalogo = conTablaLegacy.find(
      (m) => m.tablaLegacy === nombreMateria.trim(),
    );

    if (permitidoCatalogo) {
      const acceso = await validarAccesoAlumno(
        supabase,
        sesion.curp,
        permitidoCatalogo.grupoMateriaId,
      );
      if (!acceso) return null;
    } else {
      // C4.24 — La materia debe pertenecer a la inscripción activa del alumno.
      // Sin inscripción resoluble (o materia ajena al grupo) se DENIEGA; no se
      // infiere la pertenencia desde ETIQUETAS PERSONALES.
      return null;
    }

    // BLOQUE 7B — el alumno SOLO ve su propia fila. Se reutiliza
    // `leerVistaMateriaAlumno` (que usa buscar-en-filas: CURP primero, luego
    // nombre normalizado). Si la lectura optimizada no localiza la fila
    // (formato legacy o variantes de nombre), se hace un fallback con la
    // vista completa + búsqueda en memoria (misma lógica de buscar-en-filas).
    const alumno = await buscarAlumnoPorCurp(supabase, sesion.curp);
    const nombreCompleto = alumno
      ? nombreCompletoAlumno(alumno)
      : sesion.nombre ?? "";
    const criterio = { curp: sesion.curp, nombreCompleto };

    let vista: MateriaTablaVista | null = await leerVistaMateriaAlumno(
      supabase,
      nombreMateria,
      criterio,
    );

    if (!vista || !vista.filas.length) {
      const completa = await obtenerVistaMateria(supabase, nombreMateria);
      if (completa) {
        const idx = buscarIndiceFilaAlumno(completa.filas, criterio);
        vista = {
          encabezados: completa.encabezados,
          filas: idx >= 0 ? [completa.filas[idx]!] : [],
        };
      }
    }

    if (!vista) return null;
    return vistaConColumnasIdentificadas(vista, { rol: "alumno", mapeo });
  }

  const vista = await obtenerVistaMateria(supabase, nombreMateria);
  if (!vista) return null;
  return vistaConColumnasIdentificadas(vista, { rol: sesion?.rol, mapeo });
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

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }

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

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const subida = await subirImagenCloudinary(
    buffer,
    publicIdPerfilUpload(curp),
  );
  if (!subida.ok) return subida;

  const supabase = await createClient();
  const guardado = await guardarUrlFotoPerfil(supabase, curp, subida.url);
  if (!guardado.ok) return guardado;

  // O5 — La foto cambió: invalida la caché para que sea visible de inmediato.
  invalidarUrlFotoPerfil(curp);

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

export async function actionSubirEtiquetasStatus(
  formData: FormData,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo directivos pueden subir ETIQUETAS (STATUS).",
    };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  const supabase = await createClient();
  return reemplazarContenidoStatusDesdeArchivo(supabase, archivo);
}

/**
 * Sincronización INCREMENTAL del roster de alumnos (CSV/Excel) contra la tabla
 * ALUMNOS. SOLO AGREGA alumnos nuevos y COMPLETA campos vacíos de existentes;
 * nunca borra, reemplaza ni sobrescribe datos existentes. Solo directivos
 * pueden ejecutarla.
 */
export async function actionSincronizarAlumnosDesdeArchivo(
  formData: FormData,
): Promise<
  | {
      ok: true;
      agregados: number;
      completados: number;
      yaExistentesSinCambios: number;
      omitidos: number;
      omitidosDetalle: string[];
      duplicados: number;
      completadosDetalle: string[];
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo directivos pueden sincronizar el roster de alumnos.",
    };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  // Mapeo de columnas (etapa visual). Si el usuario envió un mapeo explícito,
  // debe ser válido; si es inválido se devuelve error (NO se sustituye
  // silenciosamente por detección automática). Solo se usa detección
  // automática cuando el mapeo NO fue enviado.
  let mapeo: MapeoRoster | undefined;
  const mapeoRaw = formData.get("mapeo");
  if (typeof mapeoRaw === "string" && mapeoRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(mapeoRaw);
    } catch {
      return {
        ok: false,
        error: "El mapeo de columnas enviado no es válido. Reintenta.",
      };
    }
    if (!mapeoRosterValido(parsed, 100)) {
      return {
        ok: false,
        error: "El mapeo de columnas enviado no es válido. Revisa la asignación.",
      };
    }
    mapeo = parsed as MapeoRoster;
  }

  const supabase = await createClient();
  return sincronizarAlumnosDesdeArchivo(supabase, archivo, mapeo);
}

/**
 * Previsualiza la sincronización del roster SIN escribir en Supabase. Devuelve
 * el resumen de lo que ocurriría (nuevos, completados, existentes sin cambios,
 * omitidos, duplicados) para mostrarlo antes de confirmar. Solo directivos.
 */
export async function actionPrevisualizarSincronizacionAlumnos(
  formData: FormData,
): Promise<
  | {
      ok: true;
      agregados: number;
      completados: number;
      yaExistentesSinCambios: number;
      omitidos: number;
      omitidosDetalle: string[];
      duplicados: number;
      completadosDetalle: string[];
    }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "Solo directivos pueden previsualizar el roster de alumnos.",
    };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }

  // Mapeo de columnas (etapa visual). Si se envía explícito debe ser válido.
  let mapeo: MapeoRoster | undefined;
  const mapeoRaw = formData.get("mapeo");
  if (typeof mapeoRaw === "string" && mapeoRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(mapeoRaw);
    } catch {
      return {
        ok: false,
        error: "El mapeo de columnas enviado no es válido. Reintenta.",
      };
    }
    if (!mapeoRosterValido(parsed, 100)) {
      return {
        ok: false,
        error: "El mapeo de columnas enviado no es válido. Revisa la asignación.",
      };
    }
    mapeo = parsed as MapeoRoster;
  }

  const supabase = await createClient();
  return previsualizarSincronizacionAlumnos(supabase, archivo, mapeo);
}





