"use server";

import { exigir } from "@/lib/auth/exigir";
import { puede } from "@/lib/auth/permisos";
import type { PortalRole } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { clienteLecturaEscolar, createServiceClient } from "@/lib/supabase/service";

import {
  DOCUMENTO_MAX_BYTES,
  type NivelPermiso,
} from "@/lib/escolar/tables";
import {
  asignarPermiso,
  crearCarpeta,
  eliminarCarpeta,
  eliminarDocumento,
  listarCarpetas,
  listarDocumentosDeCarpeta,
  listarPermisos,
  nivelAccesoProfesor,
  obtenerDocumento,
  puedeEliminar,
  puedeSubir,
  puedeVer,
  quitarPermiso,
  renombrarCarpeta,
  rutaStorageCarpeta,
  sanitizarNombreArchivo,
  subirDocumento,
  urlFirmadaDocumento,
  type CarpetaRow,
  type DocumentoRow,
  type PermisoCarpetaRow,
} from "@/lib/escolar/documentos";
import {
  listarProfesores,
  nombreProfesor,
  rolDesdePermisos,
} from "@/lib/escolar/catalogo/profesores";
import { normalizarNombre } from "@/lib/escolar/nombres";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaSubirDocumento } from "@/lib/validacion/esquemas-puro";



/** ¿El usuario es directivo? (acceso total de administración). Se deriva de la
 *  matriz de permisos: la capacidad `documento.gestionar_carpetas` es hoy de
 *  solo directivo, así que puede() con ella equivale al antiguo rol===. */
function esDirectivoConPermisos(sesion: { rol: PortalRole } | null): boolean {
  return sesion ? puede(sesion.rol, "documento.gestionar_carpetas") : false;
}

/** Nombre del profesor/directivo desde la sesión. */
function nombreSesion(
  sesion: { nombre?: string; matricula?: string } | null,
): string {
  return sesion?.nombre?.trim() || sesion?.matricula?.trim() || "";
}

export type EstadoDocumentos = {
  carpetas: CarpetaRow[];
  documentos: DocumentoRow[];
  permisos: PermisoCarpetaRow[];
  profesores: string[];
  esDirectivo: boolean;
  /** true si el profesor tiene al menos un permiso otorgado (para mostrar el botón DOCUMENTOS). */
  tieneAcceso: boolean;
  nivelActual: NivelPermiso | null;
  carpetaActualId: string | null;
};


export async function actionObtenerEstadoDocumentos(
  carpetaId: string | null,
  /** `undefined` = institucional (Contenido › Documentos). Con valor, los
   *  recursos de esa materia (Materias › Recursos). Mismo sistema, mismo
   *  permiso: solo cambia el ámbito de las carpetas. */
  materiaInterna?: string,
): Promise<EstadoDocumentos | null> {
  const g = await exigir("documento.ver");
  if (!g.ok) return null;
  const sesion = g.sesion;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);

  const [carpetas, permisos, profesoresRows] = await Promise.all([
    listarCarpetas(lectura, materiaInterna),
    listarPermisos(lectura),
    listarProfesores(lectura),
  ]);

  const esDir = esDirectivoConPermisos(sesion);
  const nombre = nombreSesion(sesion);

  // Nivel efectivo del usuario sobre la carpeta actual (maestros).
  let nivelActual: NivelPermiso | null = null;
  if (!esDir && carpetaId) {
    nivelActual = await nivelAccesoProfesor(lectura, nombre, carpetaId);
  }

  // Documentos visibles: directivo ve todos; maestro solo si tiene acceso.
  let documentos: DocumentoRow[] = [];
  if (carpetaId) {
    if (esDir || puedeVer(nivelActual)) {
      documentos = await listarDocumentosDeCarpeta(lectura, carpetaId);
    }
  }

  // Carpetas visibles: directivo ve todas; maestro solo las que puede ver
  // o que son ancestros de una carpeta con acceso (para poder navegar).
  let carpetasVisibles = carpetas;
  if (!esDir) {
    const carpetasConAcceso = new Set<string>();
    for (const c of carpetas) {
      const nivel = await nivelAccesoProfesor(lectura, nombre, c.id);
      if (puedeVer(nivel)) carpetasConAcceso.add(c.id);
    }
    // Incluir ancestros de carpetas con acceso.
    const mapa = new Map(carpetas.map((c) => [c.id, c]));
    const ancestros = new Set<string>();
    for (const id of carpetasConAcceso) {
      let actual = mapa.get(id)?.parent_id ?? null;
      while (actual) {
        ancestros.add(actual);
        actual = mapa.get(actual)?.parent_id ?? null;
      }
    }
    carpetasVisibles = carpetas.filter(
      (c) => carpetasConAcceso.has(c.id) || ancestros.has(c.id),
    );
  }

  // Lista de profesores para el selector de permisos: EXCLUYE directivos
  // (los directivos ya tienen acceso total por diseño y no pasan por
  // PERMISOS CARPETAS, así que nunca deben ser asignables/revocables).
  const profesoresAsignables = profesoresRows
    .filter((row) => rolDesdePermisos(row.Permisos) !== "directivo")
    .map(nombreProfesor)
    .filter(Boolean);

  // ¿El profesor actual tiene al menos un permiso otorgado? (para mostrar
  // el botón DOCUMENTOS en la navegación). Los directivos siempre tienen acceso.
  const tieneAcceso = esDir || permisos.some(
    (p) => normalizarNombre(p.profesor) === normalizarNombre(nombre),
  );

  return {
    carpetas: carpetasVisibles,
    documentos,
    permisos,
    profesores: profesoresAsignables,
    esDirectivo: esDir,
    tieneAcceso,
    nivelActual,
    carpetaActualId: carpetaId,
  };
}



export async function actionCrearCarpeta(
  nombre: string,
  parentId: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await exigir("documento.gestionar_carpetas");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden crear carpetas." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return crearCarpeta(escritura, {
    nombre,
    parentId,
    creadoPor: nombreSesion(g.sesion),
  });

}

export async function actionRenombrarCarpeta(
  carpetaId: string,
  nombre: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("documento.gestionar_carpetas");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden renombrar carpetas." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return renombrarCarpeta(escritura, carpetaId, nombre);

}

export async function actionEliminarCarpeta(
  carpetaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("documento.gestionar_carpetas");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden eliminar carpetas." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return eliminarCarpeta(escritura, carpetaId);

}

export async function actionSubirDocumento(
  carpetaId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await exigir("documento.subir");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso." };
  }
  const sesion = g.sesion;

  const entrada = leerFormData(esquemaSubirDocumento(DOCUMENTO_MAX_BYTES), formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };
  const archivo = entrada.datos.archivo;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  const nombre = nombreSesion(sesion);

  // Verificar permiso de subida (maestros) o acceso total (directivos).
  if (!esDirectivoConPermisos(sesion)) {
    const nivel = await nivelAccesoProfesor(lectura, nombre, carpetaId);
    if (!puedeSubir(nivel)) {
      return { ok: false, error: "No tienes permiso para subir en esta carpeta." };
    }
  }

  const carpetas = await listarCarpetas(lectura);
  const rutaCarpeta = rutaStorageCarpeta(carpetas, carpetaId);
  // Sanitizar el nombre para la key física de Storage (Supabase no acepta
  // caracteres no-ASCII en la ruta/key). nombre_original conserva el real.
  const nombreUnico = `${Date.now()}_${sanitizarNombreArchivo(archivo.name)}`;
  const rutaStorage = `${rutaCarpeta}/${nombreUnico}`.replace(/^\/+/, "");

  // Subida al bucket + registro en `documentos`: el I/O vive en
  // lib/escolar/documentos.ts (la action solo valida sesión, tamaño y nivel).
  return subirDocumento(escritura, archivo, {
    carpetaId,
    rutaStorage,
    subidoPor: nombre,
  });
}

export async function actionEliminarDocumento(
  documentoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("documento.eliminar");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso." };
  }
  const sesion = g.sesion;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras

  const doc = await obtenerDocumento(supabase, documentoId);
  if (!doc) return { ok: false, error: "Documento no encontrado." };

  // Verificar permiso de eliminación.
  if (!esDirectivoConPermisos(sesion)) {
    const nivel = await nivelAccesoProfesor(
      lectura,
      nombreSesion(sesion),
      doc.carpeta_id,
    );
    if (!puedeEliminar(nivel)) {
      return { ok: false, error: "No tienes permiso para eliminar." };
    }
  }

  return eliminarDocumento(escritura, doc);
}

export async function actionDescargarDocumento(
  documentoId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await exigir("documento.ver");
  if (!g.ok) {
    return { ok: false, error: "No tienes permiso." };
  }
  const sesion = g.sesion;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);

  const doc = await obtenerDocumento(supabase, documentoId);
  if (!doc) return { ok: false, error: "Documento no encontrado." };

  if (!esDirectivoConPermisos(sesion)) {
    const nivel = await nivelAccesoProfesor(
      lectura,
      nombreSesion(sesion),
      doc.carpeta_id,
    );
    if (!puedeVer(nivel)) {
      return { ok: false, error: "No tienes permiso para ver este documento." };
    }
  }

  return urlFirmadaDocumento(supabase, doc.ruta_storage);
}

export async function actionAsignarPermiso(
  carpetaId: string,
  profesor: string,
  nivel: NivelPermiso,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("documento.asignar_permisos");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden asignar permisos." };
  }
  const sesion = g.sesion;
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return asignarPermiso(escritura, {
    profesor,
    carpetaId,
    nivel,
    autorizadoPor: nombreSesion(sesion),
  });

}

export async function actionQuitarPermiso(
  permisoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("documento.asignar_permisos");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden quitar permisos." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return quitarPermiso(escritura, permisoId);

}

/** Recarga la lista de profesores asignables (excluye directivos) bajo demanda.
 *  Se usa desde el botón "Actualizar lista" de la vista de Permisos, para que
 *  el directivo vea profesores nuevos sin recargar toda la página. */
export async function actionListarProfesoresPermisos(): Promise<
  { ok: true; profesores: string[] } | { ok: false; error: string }
> {
  const g = await exigir("documento.asignar_permisos");
  if (!g.ok) {
    return { ok: false, error: "Solo directivos pueden administrar permisos." };
  }
  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const rows = await listarProfesores(lectura);
  const profesores = rows
    .filter((row) => rolDesdePermisos(row.Permisos) !== "directivo")
    .map(nombreProfesor)
    .filter(Boolean);
  return { ok: true, profesores };
}

/** Indica si el profesor actual tiene al menos un permiso otorgado en
 *  PERMISOS CARPETAS. Se usa en la navegación para mostrar el botón
 *  DOCUMENTOS solo a profesores con acceso (los directivos siempre lo tienen). */
export async function actionTieneAccesoDocumentos(): Promise<boolean> {
  const g = await exigir("documento.ver");
  if (!g.ok) return false;
  const sesion = g.sesion;
  if (esDirectivoConPermisos(sesion)) return true;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const permisos = await listarPermisos(lectura);
  const nombre = nombreSesion(sesion);
  return permisos.some(
    (p) => normalizarNombre(p.profesor) === normalizarNombre(nombre),
  );
}



