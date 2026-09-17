"use server";

import { exigir } from "@/lib/auth/exigir";
import { esRol } from "@/lib/auth/permisos";
import {
  buscarAlumnoPorCurp,
  buscarAlumnoPorTexto,
  nombreCompletoAlumno,
  previsualizarSincronizacionAlumnos,
  sincronizarAlumnosDesdeArchivo,
} from "@/lib/escolar/alumno/alumnos";

import {
  mapeoRosterValido,
  type MapeoRoster,
} from "@/lib/escolar/materia/mapeo-columnas";


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
  patchTitulosEtiquetas,
  patchValoresEtiquetas,
  titulosEtiquetasPersonales,
  valoresEtiquetasPersonales,
} from "@/lib/escolar/alumno/etiquetas";
import { buscarIndiceFilaAlumno, normalizarCurp } from "@/lib/escolar/buscar-en-filas";
import { listarCurpsDeTutor } from "@/lib/escolar/tutores/tutores";
import { vistaConColumnasIdentificadas } from "@/lib/escolar/materia/columnas-calificaciones";
import { actualizarMateriaDesdeArchivo } from "@/lib/escolar/materia/materia-avance";
import { obtenerMapeoColumnasMateria } from "@/lib/escolar/materia/mapeo-columnas-materia";
import { leerVistaMateriaAlumno } from "@/lib/escolar/materia/materia-vista-alumno";
import {
  motivoMateriaNoCargable,
  resolverGrupoAlumno,
  resolverIdentidadesCatalogo,
  resolverMateriasAlumno,
  verificarAccesoAlumnoMateria,
  type CarreraRow,
  type GrupoAlumnoResuelto,
  type GrupoMateriaRow,
  type GrupoRow,
  type InscripcionRow,
  type MateriaIdentidadCatalogo,
  type MateriaRow,
  type PeriodoRow,
} from "@/lib/escolar/catalogo/catalogo-academico";
import {
  gradoASemestre,
  semestreActivoDeGrupo,
  semestreActivoDesdeFilas,
} from "@/lib/escolar/ciclo/semestres";
import {
  aliasActivosDesdeFilas,
  listarNombresVisiblesMaterias,
  materiasVisiblesDesdeCatalogo,
  type MateriaConNombreVisible,
} from "@/lib/escolar/materia/nombres-visibles";
import { obtenerVistaRegistroAlumno } from "@/lib/escolar/alumno/registro-alumno";
import type { VistaRegistroAlumno } from "@/lib/escolar/alumno/registro-alumno";
import { reemplazarContenidoStatusDesdeArchivo } from "@/lib/escolar/alumno/etiquetas-status";
import {
  obtenerVistaMateria,
  reemplazarContenidoMateriaDesdeArchivo,
} from "@/lib/escolar/materia/materias";
import { COMENTARIO_MAX_LENGTH, TABLA_GRUPO_MATERIAS } from "@/lib/escolar/tables";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import {
  obtenerFotoPerfilAlumno,
  subirFotoPerfilAlumno,
} from "@/lib/escolar/alumno/foto-perfil";
import { createClient } from "@/lib/supabase/server";
import { clienteLecturaEscolar } from "@/lib/supabase/service";
import {
  resolverAccesoAlumno,
  type AccesoAlumno,
} from "@/lib/escolar/alumno/acceso-alumno";
import { obtenerEtiquetasDinamicas } from "@/lib/escolar/alumno/etiquetas-dinamicas-servicio";
import type { AlumnoEtiquetaRow } from "@/lib/escolar/alumno/etiquetas-dinamicas";
import { obtenerTutorPrincipalDeAlumno } from "@/lib/escolar/tutores/tutores";
import { nombreCompletoTutor } from "@/lib/escolar/tutores/tutores-types";

/**
 * FASE 3 — Contrato de salida de la RPC `obtener_perfil_alumno(p_curp)`.
 * Coincide con el SQL de supabase/crear-rpc-obtener-perfil-alumno.sql y con los
 * tipos TS que consume el perfil. Las claves que no son "consolidables" (registro
 * y foto de Cloudinary) se resuelven en la aplicación.
 */
type RpcPerfilAlumno = {
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  inscripcion: InscripcionRow | null;
  grupo: GrupoRow | null;
  periodo: PeriodoRow | null;
  carrera: CarreraRow | null;
  semestres: { periodo_id: string; semestre: number; activo: boolean }[];
  grupo_materias: GrupoMateriaRow[];
  materias: MateriaRow[];
  identidades: MateriaIdentidadCatalogo[];
  nombres_visibles: {
    materia_id: string;
    nombre_visible: string;
    activo?: boolean;
  }[];
  comentarios: ComentarioRow[];
};

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
  /** FASE 2 — permisos efectivos calculados en el servidor (nunca por la UI). */
  acceso: AccesoAlumno | null;
  /** FASE 2 — etiquetas dinámicas del módulo alumno_etiquetas. */
  etiquetasDinamicas: AlumnoEtiquetaRow[];
  /** FASE 2 — contacto del tutor principal (fuente: tutores + tutor_alumnos). */
  tutorContacto: {
    nombre: string;
    telefono: string | null;
    correo: string | null;
  } | null;
}> {
  const g = await exigir("alumno.ver_perfil");
  if (!g.ok) {
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
      acceso: null,
      etiquetasDinamicas: [],
      tutorContacto: null,
    };
  }
  const sesion = g.sesion;
  const supabase = await createClient();

  // FASE 2 — autorización de ALCANCE: sesión + rol + CURP objetivo + relación.
  // La capacidad (alumno.ver_perfil) dice QUÉ; resolverAccesoAlumno dice SOBRE
  // QUIÉN (alumno propio, tutor con relación, maestro de sus grupos, directivo).
  // El parámetro solo sirve de presentación; la decisión es server-side.
  const resolucion = await resolverAccesoAlumno(supabase, sesion, curpConsulta);
  if (!resolucion.ok) {
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
      acceso: null,
      etiquetasDinamicas: [],
      tutorContacto: null,
    };
  }
  const curp = resolucion.curp;
  const acceso = resolucion.acceso;

  // FASE 3 — Intento de RPC consolidada `obtener_perfil_alumno(p_curp)`:
  // 1 request HTTP a PostgREST en lugar de ~21. Si la función no existe o el
  // service_role no está disponible, se cae al flujo directo O1 (mismo
  // resultado). La RPC NO decide roles: la autorización sigue aquí.
  const supabaseLectura = await clienteLecturaEscolar(supabase);

  let rpcData: RpcPerfilAlumno | null = null;
  try {
    const { data, error } = await supabaseLectura.rpc(
      "obtener_perfil_alumno",
      { p_curp: curp },
    );
    if (!error && data) rpcData = data as RpcPerfilAlumno;
  } catch {
    rpcData = null;
  }

  let alumno: AlumnoRow | null = null;
  let etiquetas: EtiquetasPersonalesRow | null = null;
  let grupoCatalogo: GrupoAlumnoResuelto | null = null;
  let aliases: ReadonlyMap<string, string> = new Map();
  let comentarios: ComentarioRow[] = [];
  let fotoPerfilUrl: string | null = null;
  let semestreActivo = true;
  let tablasLegacy: string[] = [];
  let identidades: ReadonlyMap<string, MateriaIdentidadCatalogo> = new Map();

  if (rpcData) {
    // --- Fuente consolidada (RPC) ---
    alumno = rpcData.alumno;
    etiquetas = rpcData.etiquetas;
    comentarios = rpcData.comentarios;
    fotoPerfilUrl = await obtenerFotoPerfilAlumno(supabase, curp);
    // inscripción → grupo → periodo (carrera opcional): misma semántica que
    // resolverGrupoAlumno (null si falta inscripción/grupo/periodo).
    grupoCatalogo =
      rpcData.inscripcion && rpcData.grupo && rpcData.periodo
        ? {
            inscripcion: rpcData.inscripcion,
            grupo: rpcData.grupo,
            periodo: rpcData.periodo,
            carrera: rpcData.carrera ?? null,
          }
        : null;
    tablasLegacy = (rpcData.grupo_materias ?? [])
      .map((g) => (g.tabla_legacy ?? "").trim())
      .filter((t): t is string => Boolean(t));
    identidades = new Map(
      (rpcData.identidades ?? []).map((i) => [i.tablaLegacy, i]),
    );
    aliases = aliasActivosDesdeFilas(rpcData.nombres_visibles ?? []);
    semestreActivo = grupoCatalogo
      ? semestreActivoDesdeFilas(rpcData.semestres ?? [], grupoCatalogo.grupo)
      : true;
  } else {
    // --- Flujo directo O1 (fallback; comportamiento previo exacto) ---
    // O1 — Consultas INDEPENDIENTES en paralelo (mismo resultado, menos latencia).
    // Cadenas dependientes conservadas: alumno → registro; grupo → semestre → materias.
    [alumno, etiquetas, grupoCatalogo, aliases, comentarios, fotoPerfilUrl] =
      await Promise.all([
        buscarAlumnoPorCurp(supabase, curp),
        obtenerEtiquetasPersonales(supabaseLectura, curp),
        resolverGrupoAlumno(supabaseLectura, curp),
        listarNombresVisiblesMaterias(supabaseLectura),
        listarComentariosAlumno(supabase, curp),
        obtenerFotoPerfilAlumno(supabase, curp),
      ]);
    semestreActivo =
      grupoCatalogo && gradoASemestre(grupoCatalogo.grupo.grado) !== null
        ? await semestreActivoDeGrupo(supabaseLectura, grupoCatalogo.grupo)
        : true;
    const materiasCatalogo =
      grupoCatalogo && semestreActivo
        ? await resolverMateriasAlumno(supabaseLectura, curp)
        : [];
    tablasLegacy = materiasCatalogo
      .map((m) => m.tablaLegacy)
      .filter((t): t is string => Boolean(t));
    if (grupoCatalogo && semestreActivo) {
      // C4.28 — identidad desde el catálogo (grupo_materias → grupos → carreras
      // y materias). El nombre físico de la tabla NUNCA se interpreta.
      // O-1 — acotado al grupo del alumno: el mismo `tabla_legacy` existe en
      // todos los ciclos clonados y sin este filtro ganaba una fila al azar.
      identidades = await resolverIdentidadesCatalogo(
        supabaseLectura,
        tablasLegacy,
        { grupoId: grupoCatalogo.grupo.id },
      );
    }
  }

  const nombreCompleto = alumno ? nombreCompletoAlumno(alumno) : "";
  // C4.6 — La carrera ACADÉMICA OFICIAL proviene del catálogo
  // (grupoCatalogo.carrera) cuando existe inscripción activa. ETIQUETAS.CARRERA
  // se usa SOLO en el fallback legacy (sin inscripción) y como dato descriptivo.
  const registro = await obtenerVistaRegistroAlumno(
    supabaseLectura,
    curp,
    nombreCompleto,
  );

  // C4.1 — Fuente primaria: catálogo académico nuevo.
  //   CURP → inscripciones_alumno (activa) → grupos → grupo_materias → materias.
  //   idInterno = grupo_materias.tabla_legacy (compatibilidad de UI); nombre
  //   visible sigue resolviéndose con el mecanismo existente (7A).
  // C4.14 — si el alumno tiene grupo resoluble y su SEMESTRE está inactivo
  // (academico_semestres), su oferta de materias queda vacía.
  // C4.24 — sin inscripción activa NO se infiere la oferta desde ETIQUETAS
  // PERSONALES (la identidad académica la define SOLO el directivo).
  let materias: MateriaConNombreVisible[] = [];
  if (grupoCatalogo && semestreActivo) {
    materias = materiasVisiblesDesdeCatalogo(
      tablasLegacy,
      identidades,
      aliases,
    );
  }

  // C4.7 — CARRERA del PERFIL: proviene del CATÁLOGO cuando existe inscripción
  // activa (grupoCatalogo.carrera); vacía si no la hay (no se inventa).
  // C4.24 — GRADO/GRUPO también provienen SOLO del catálogo.
  const etiquetasVisibles: EtiquetasPersonalesRow | null = etiquetas
    ? {
        ...etiquetas,
        GRADO: grupoCatalogo?.grupo.grado ?? "",
        GRUPO: grupoCatalogo?.grupo.nombre ?? "",
        CARRERA: grupoCatalogo?.carrera?.clave ?? "",
      }
    : null;

  // FASE 2 — etiquetas dinámicas (módulo separado, sin N+1) + contacto del
  // tutor principal (fuente de verdad: tutores + tutor_alumnos).
  const [etiquetasDinamicas, tutor] = await Promise.all([
    obtenerEtiquetasDinamicas(supabaseLectura, curp),
    obtenerTutorPrincipalDeAlumno(supabaseLectura, curp),
  ]);
  const tutorContacto = tutor
    ? {
        nombre: nombreCompletoTutor(tutor),
        telefono: tutor.telefono,
        correo: tutor.correo,
      }
    : null;

  const puedeEditarEtiquetas = acceso.puedeEditarEtiquetas;

  return {
    alumno,
    etiquetas: etiquetasVisibles,
    registro,
    materias,
    comentarios,
    puedeEditarEtiquetas,
    fotoPerfilUrl,
    acceso,
    etiquetasDinamicas,
    tutorContacto,
  };
}

/**
 * @deprecated Legacy (EMPTY1-6 de ETIQUETAS PERSONALES). Usar
 * `actionGuardarEtiquetasDinamicas` (módulo alumno_etiquetas).
 * Autorización: solo tutor (con relación) o directivo.
 */
export async function actionGuardarEtiquetasPersonales(
  curp: string,
  titulos: [string, string, string],
  valores: [string, string, string],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("alumno.editar_etiquetas");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
  const sesion = g.sesion;
  const supabase = await createClient();
  const res = await resolverAccesoAlumno(supabase, sesion, curp);
  if (!res.ok) return { ok: false, error: res.error };
  if (!res.acceso.puedeEditarEtiquetas) {
    return { ok: false, error: "No tienes permiso." };
  }
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
  const g = await exigir("alumno.editar_etiquetas");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
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
  const g = await exigir("alumno.editar_estatus");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }
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
  const g = await exigir("alumno.editar_datos_personales");
  if (!g.ok) return { ok: false, error: "No tienes permiso." };
  const sesion = g.sesion;
  const supabase = await createClient();
  const res = await resolverAccesoAlumno(supabase, sesion, curp);
  if (!res.ok) return { ok: false, error: res.error };
  if (!res.acceso.puedeEditarDatosPersonales) {
    return { ok: false, error: "No tienes permiso." };
  }
  if (comentario.length > COMENTARIO_MAX_LENGTH) {
    return {
      ok: false,
      error: `Máximo ${COMENTARIO_MAX_LENGTH} caracteres.`,
    };
  }
  return actualizarEtiquetasPersonales(
    supabase,
    curp,
    patchComentarioPersonal(comentario),
  );
}

/**
 * C4.18 — ¿Por qué una materia NO debe cargarse/actualizarse? La decisión vive
 * en `lib/escolar/catalogo/catalogo-academico.ts` (`motivoMateriaNoCargable`).
 */
export async function actionSubirMateriaExcel(
  nombreMateria: string,
  formData: FormData,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const g = await exigir("calificacion.subir");
  if (!g.ok) {
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
  const g = await exigir("calificacion.subir");
  if (!g.ok) {
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
  const g = await exigir("calificacion.subir");
  if (!g.ok) {
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
  const g = await exigir("calificacion.ver");
  if (!g.ok) return null;
  if (!nombreRegistro.trim()) return null;
  const sesion = g.sesion;

  // ── Fase 4.1 — ALCANCE ────────────────────────────────────────────────────
  // `calificacion.ver` la tienen también ALUMNO y TUTOR, y esta action devuelve
  // la tabla COMPLETA del grupo (`obtenerVistaMateria`, lectura cruda): con una
  // sesión válida, un alumno recibía las calificaciones de sus compañeros.
  //
  // Se NIEGA a quien no sea directivo ni maestro —mismo patrón que
  // `actionObtenerHorarioAlumno`— y NO se filtra por fila a propósito: no hay
  // ningún flujo legítimo de alumno ni de tutor que pase por aquí (hoy solo la
  // usa el panel del directivo), así que el filtrado sería código muerto. Si
  // algún día lo necesitan, se les da SU fila entonces.
  //
  // La capacidad que exige NO cambia: esto es ALCANCE, no permiso.
  if (sesion && !esRol(sesion.rol, "directivo") && !esRol(sesion.rol, "maestro")) {
    return null;
  }

  const supabase = await createClient();
  return obtenerVistaMateria(supabase, nombreRegistro);
}

export async function actionObtenerVistaMateria(
  nombreMateria: string,
  /**
   * Fase 4 — ALCANCE: sobre QUÉ alumno se consulta. Solo lo necesita el TUTOR
   * (sus alumnos vinculados): el alumno usa su propia sesión y maestro/directivo
   * consultan la vista completa. Un tutor SIN curp no recibe nada.
   */
  curpConsulta?: string | null,
): Promise<MateriaTablaVista | null> {
  const g = await exigir("calificacion.ver");
  if (!g.ok) return null;
  const sesion = g.sesion;
  const supabase = await createClient();

  // BLOQUE 7C: configuración de mapeo de columnas (si existe). El mapeo
  // explícito tiene prioridad sobre la detección automática 7B. Si la tabla
  // de configuración aún no existe, la lectura devuelve null y se usa 7B.
  const mapeo = await obtenerMapeoColumnasMateria(supabase, nombreMateria);

  if (sesion && esRol(sesion.rol, "alumno") && sesion.curp) {
    // C4.1 — SEGURIDAD: autorización server-side desde el catálogo.
    // FASE 7 (6A-4) — Validación LIGERA: en lugar de re-resolver la oferta
    // (resolverGrupoAlumno + semestre + resolverMateriasAlumno +
    // validarAccesoAlumno ≈ 15 queries, con inscripción/grupo repetidos),
    // verifica con 6 consultas las MISMAS reglas: inscripción activa,
    // grupo_materias activo con tabla_legacy == solicitada, pertenencia al
    // grupo de la inscripción, grupo activo, periodo activo, semestre activo
    // y materia activa. NO cambia identidad ni la búsqueda CURP + nombre.
    const acceso = await verificarAccesoAlumnoMateria(
      supabase,
      sesion.curp,
      nombreMateria,
    );
    if (!acceso) return null;

    // BLOQUE 7B — el alumno SOLO ve su propia fila. Se reutiliza
    // `leerVistaMateriaAlumno` (que usa buscar-en-filas: CURP primero, luego
    // nombre normalizado). Si la lectura optimizada no localiza la fila
    // (formato legacy `__HOJA__`/`datos`/`contenido` o variantes de nombre),
    // se hace un fallback con la vista completa + búsqueda en memoria (misma
    // lógica de buscar-en-filas). FASE 7 (6A-3): leerVistaMateriaAlumno ya no
    // re-descarga internamente la misma tabla (R3 era idéntica a R2).
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

    // Fallback con la vista completa + búsqueda en memoria SOLO si la lectura
    // optimizada no localizó la fila. Se conserva el comportamiento original:
    // cubre formatos legacy (tabla con fila `__HOJA__`/`datos`/`contenido`)
    // donde leerVistaMateriaAlumno no puede leer la fila por columnas directas.
    // FASE 7 (6A-3): la duplicación INTERNA de leerVistaMateriaAlumno ya se
    // eliminó; este fallback solo añade UNA lectura en el camino de error.
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

  // ── Fase 4 · PASO 0 — ALCANCE del TUTOR ───────────────────────────────────
  // La capacidad `calificacion.ver` dice QUÉ puede hacer (y el tutor la tiene);
  // esto dice SOBRE QUIÉN. Sin esta guarda el tutor caía al camino de vista
  // COMPLETA y recibía las calificaciones de TODO EL GRUPO.
  //
  // Mismo patrón que `actionObtenerHorarioAlumno`: la relación se valida en el
  // servidor contra `tutor_alumnos`; un CURP ajeno se NIEGA (no se ignora). La
  // decisión «qué fila corresponde a este alumno» NO vive aquí: se reutiliza
  // `leerVistaMateriaAlumno` + `buscarIndiceFilaAlumno` (buscar-en-filas), el
  // MISMO criterio (CURP primero, nombre normalizado después) que usa el alumno.
  if (sesion && esRol(sesion.rol, "tutor")) {
    const curpObjetivo = normalizarCurp(curpConsulta ?? "");
    if (!curpObjetivo) return null;

    const vinculados = await listarCurpsDeTutor(supabase, sesion.matricula);
    if (!vinculados.includes(curpObjetivo)) return null;

    const alumno = await buscarAlumnoPorCurp(supabase, curpObjetivo);
    const criterio = {
      curp: curpObjetivo,
      nombreCompleto: alumno ? nombreCompletoAlumno(alumno) : "",
    };

    let vista: MateriaTablaVista | null = await leerVistaMateriaAlumno(
      supabase,
      nombreMateria,
      criterio,
    );

    // Mismo fallback que el camino del alumno: formatos legacy que la lectura
    // por columnas no localiza.
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
    // La fila es la del alumno: se presenta como la del alumno (nunca la
    // vista completa de directivo).
    return vistaConColumnasIdentificadas(vista, { rol: "alumno", mapeo });
  }

  const vista = await obtenerVistaMateria(supabase, nombreMateria);
  if (!vista) return null;
  // El rol aquí solo distingue "alumno" (fila propia) del resto (vista
  // completa). El técnico no llega: `calificacion.ver` se lo niega en exigir().
  // `RolVistaCalificaciones` es un tipo de presentación en lib/ (no se toca).
  const rolVista =
    sesion && !esRol(sesion.rol, "alumno")
      ? "directivo"
      : (sesion?.rol as "alumno" | undefined);
  return vistaConColumnasIdentificadas(vista, { rol: rolVista, mapeo });
}

export async function actionEnviarComentarioAlumno(
  nombreAlumno: string,
  comentario: string,
  autorProfesor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("alumno.comentar");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso." };
  }
  const sesion = g.sesion!;
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
  const g = await exigir("alumno.ver_perfil");
  if (!g.ok) return null;
  const supabase = await createClient();
  return buscarAlumnoPorTexto(supabase, nombre);
}

export async function actionSubirFotoPerfil(
  formData: FormData,
  curpConsulta?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await exigir("alumno.editar_datos_personales");
  if (!g.ok) return { ok: false, error: "No tienes permiso para cambiar la foto." };
  const sesion = g.sesion;
  const supabase = await createClient();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }

  // FASE 2 — autorización de ALCANCE (filosofia.estructural §7). La foto es
  // un dato personal: solo el TUTOR (con relación) o el DIRECTIVO pueden
  // cambiarla; el ALUMNO conserva lectura (sin escritura propia).
  const resolucion = await resolverAccesoAlumno(supabase, sesion, curpConsulta);
  if (!resolucion.ok) return { ok: false, error: resolucion.error };
  if (!resolucion.acceso.puedeSubirFoto) {
    return { ok: false, error: "No tienes permiso para cambiar la foto." };
  }
  const curp = resolucion.curp;

  // El I/O de Cloudinary (buffer + subida con public_id determinista + caché)
  // vive en lib/escolar/alumno/foto-perfil.ts.
  return subirFotoPerfilAlumno(supabase, curp, archivo);
}

export async function actionEtiquetasResumen(curp: string) {
  const g = await exigir("alumno.ver_perfil");
  if (!g.ok) return null;
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
  const g = await exigir("alumno.importar_estatus");
  if (!g.ok) {
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
  const g = await exigir("alumno.cargar_roster");
  if (!g.ok) {
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
  const g = await exigir("alumno.cargar_roster");
  if (!g.ok) {
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

/* ===========================================================================
 * PROMPT-4/T3 — Roster: borrar y restaurar (previsualizar → confirmar).
 * La baja es una DECISIÓN HUMANA: activo=false + decision_manual=true (T1).
 * No borra al alumno de ALUMNOS ni su historial.
 * ========================================================================= */

import {
  aplicarBajaRoster,
  previsualizarBajaRoster,
  restaurarEnRoster,
} from "@/lib/escolar/catalogo/roster-borrado";

/** Previsualiza qué implica sacar a un CURP del roster (NO escribe). */
export async function actionPrevisualizarBajaRoster(curpRaw: string) {
  const g = await exigir("alumno.borrar_roster");
  if (!g.ok) return null;
  const supabase = await createClient();
  return previsualizarBajaRoster(supabase, curpRaw);
}

/** Confirma la baja de roster (escribe: activo=false + marca T1). */
export async function actionConfirmarBajaRoster(curpRaw: string) {
  const g = await exigir("alumno.borrar_roster");
  if (!g.ok) return { ok: false as const, error: "No autorizado." };
  const supabase = await createClient();
  return aplicarBajaRoster(supabase, curpRaw);
}

/** Restaura a un alumno al roster (activo=true + limpia marca T1). */
export async function actionRestaurarEnRoster(curpRaw: string) {
  const g = await exigir("alumno.borrar_roster");
  if (!g.ok) return { ok: false as const, error: "No autorizado." };
  const supabase = await createClient();
  return restaurarEnRoster(supabase, curpRaw);
}





