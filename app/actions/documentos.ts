"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { clienteLecturaEscolar, createServiceClient } from "@/lib/supabase/service";

import {
  BUCKET_DOCUMENTOS,
  DOCUMENTO_MAX_BYTES,
  TABLA_DOCUMENTOS,
  type NivelPermiso,
} from "@/lib/escolar/tables";
import {
  asignarPermiso,
  crearCarpeta,
  eliminarCarpeta,
  listarCarpetas,
  listarDocumentosDeCarpeta,
  listarPermisos,
  nivelAccesoProfesor,
  puedeEliminar,
  puedeSubir,
  puedeVer,
  quitarPermiso,
  renombrarCarpeta,
  rutaStorageCarpeta,
  sanitizarNombreArchivo,
  type CarpetaRow,

  type DocumentoRow,
  type PermisoCarpetaRow,
} from "@/lib/escolar/documentos";
import {
  listarProfesores,
  nombreProfesor,
  rolDesdePermisos,
} from "@/lib/escolar/profesores";
import { normalizarNombre } from "@/lib/escolar/nombres";



/** ¿El usuario es directivo? (acceso total de administración). */
function esDirectivo(rol: string | undefined): boolean {
  return rol === "directivo";
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
): Promise<EstadoDocumentos | null> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return null;
  if (sesion.rol !== "directivo" && sesion.rol !== "maestro") return null;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);

  const [carpetas, permisos, profesoresRows] = await Promise.all([
    listarCarpetas(lectura),
    listarPermisos(lectura),
    listarProfesores(lectura),
  ]);

  const esDir = esDirectivo(sesion.rol);
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
    return { ok: false, error: "Solo directivos pueden crear carpetas." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return crearCarpeta(escritura, {
    nombre,
    parentId,
    creadoPor: nombreSesion(sesion),
  });

}

export async function actionRenombrarCarpeta(
  carpetaId: string,
  nombre: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
    return { ok: false, error: "Solo directivos pueden renombrar carpetas." };
  }
  const supabase = await createClient();
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  return renombrarCarpeta(escritura, carpetaId, nombre);

}

export async function actionEliminarCarpeta(
  carpetaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "directivo" && sesion.rol !== "maestro") {
    return { ok: false, error: "No tienes permiso." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo válido." };
  }
  if (archivo.size > DOCUMENTO_MAX_BYTES) {
    return { ok: false, error: "El archivo supera el límite de 20MB." };
  }

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras
  const nombre = nombreSesion(sesion);

  // Verificar permiso de subida (maestros) o acceso total (directivos).
  if (!esDirectivo(sesion.rol)) {
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


  const buffer = Buffer.from(await archivo.arrayBuffer());
  const { error: errorSubida } = await escritura.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(rutaStorage, buffer, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });

  if (errorSubida) {
    return { ok: false, error: `No se pudo subir: ${errorSubida.message}` };
  }

  const { data, error } = await escritura
    .from(TABLA_DOCUMENTOS)
    .insert({
      carpeta_id: carpetaId,
      nombre_original: archivo.name,
      ruta_storage: rutaStorage,
      tipo: archivo.type || null,
      tamano_bytes: archivo.size,
      subido_por: nombre,
    })
    .select("id")
    .single();

  if (error) {
    // Limpiar el archivo subido si falla el registro.
    await escritura.storage.from(BUCKET_DOCUMENTOS).remove([rutaStorage]);
    return { ok: false, error: error.message };
  }


  return { ok: true, id: data.id as string };
}

export async function actionEliminarDocumento(
  documentoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "directivo" && sesion.rol !== "maestro") {
    return { ok: false, error: "No tienes permiso." };
  }

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const escritura = createServiceClient() ?? supabase; // service role: omite RLS en escrituras

  const { data: doc } = await supabase
    .from(TABLA_DOCUMENTOS)
    .select("id, carpeta_id, ruta_storage")
    .eq("id", documentoId)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Documento no encontrado." };

  // Verificar permiso de eliminación.
  if (!esDirectivo(sesion.rol)) {
    const nivel = await nivelAccesoProfesor(
      lectura,
      nombreSesion(sesion),
      doc.carpeta_id as string,
    );
    if (!puedeEliminar(nivel)) {
      return { ok: false, error: "No tienes permiso para eliminar." };
    }
  }

  const { error: errorStorage } = await escritura.storage
    .from(BUCKET_DOCUMENTOS)
    .remove([doc.ruta_storage as string]);
  if (errorStorage) {
    return { ok: false, error: `No se pudo eliminar del storage: ${errorStorage.message}` };
  }

  const { error } = await escritura
    .from(TABLA_DOCUMENTOS)
    .delete()
    .eq("id", documentoId);
  if (error) return { ok: false, error: error.message };


  return { ok: true };
}

export async function actionDescargarDocumento(
  documentoId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (sesion.rol !== "directivo" && sesion.rol !== "maestro") {
    return { ok: false, error: "No tienes permiso." };
  }

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);

  const { data: doc } = await supabase
    .from(TABLA_DOCUMENTOS)
    .select("id, carpeta_id, ruta_storage")
    .eq("id", documentoId)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Documento no encontrado." };

  if (!esDirectivo(sesion.rol)) {
    const nivel = await nivelAccesoProfesor(
      lectura,
      nombreSesion(sesion),
      doc.carpeta_id as string,
    );
    if (!puedeVer(nivel)) {
      return { ok: false, error: "No tienes permiso para ver este documento." };
    }
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(doc.ruta_storage as string, 60);

  if (error || !data?.signedUrl) {
    return { ok: false, error: "No se pudo generar el enlace de descarga." };
  }

  return { ok: true, url: data.signedUrl };
}

export async function actionAsignarPermiso(
  carpetaId: string,
  profesor: string,
  nivel: NivelPermiso,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
    return { ok: false, error: "Solo directivos pueden asignar permisos." };
  }
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };
  if (!esDirectivo(sesion.rol)) {
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
  const sesion = await obtenerSesionPortal();
  if (!sesion) return false;
  if (esDirectivo(sesion.rol)) return true;
  if (sesion.rol !== "maestro") return false;

  const supabase = await createClient();
  const lectura = await clienteLecturaEscolar(supabase);
  const permisos = await listarPermisos(lectura);
  const nombre = nombreSesion(sesion);
  return permisos.some(
    (p) => normalizarNombre(p.profesor) === normalizarNombre(nombre),
  );
}



