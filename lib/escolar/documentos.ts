import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET_DOCUMENTOS,
  TABLA_CARPETAS,
  TABLA_DOCUMENTOS,
  TABLA_PERMISOS_CARPETAS,
  type NivelPermiso,
} from "./tables";
import { normalizarNombre } from "./nombres";

export type CarpetaRow = {
  id: string;
  nombre: string;
  parent_id: string | null;
  creado_por: string | null;
  created_at: string | null;
};

export type DocumentoRow = {
  id: string;
  carpeta_id: string;
  nombre_original: string;
  ruta_storage: string;
  tipo: string | null;
  tamano_bytes: number | null;
  curp_vinculado: string | null;
  subido_por: string | null;
  created_at: string | null;
};

export type PermisoCarpetaRow = {
  id: string;
  profesor: string;
  carpeta_id: string;
  nivel: NivelPermiso;
  autorizado_por: string | null;
  created_at: string | null;
};

/** Nivel efectivo de acceso de un profesor a una carpeta (o null si no tiene). */
export type NivelAcceso = NivelPermiso | null;

const SELECT_CARPETA = "id, nombre, parent_id, creado_por, created_at";
const SELECT_DOCUMENTO =
  "id, carpeta_id, nombre_original, ruta_storage, tipo, tamano_bytes, curp_vinculado, subido_por, created_at";
const SELECT_PERMISO =
  "id, profesor, carpeta_id, nivel, autorizado_por, created_at";

/** Orden de niveles: eliminar > subir > ver. */
const ORDEN_NIVEL: Record<NivelPermiso, number> = {
  ver: 1,
  subir: 2,
  eliminar: 3,
};

export function nivelMayor(a: NivelPermiso, b: NivelPermiso): NivelPermiso {
  return ORDEN_NIVEL[a] >= ORDEN_NIVEL[b] ? a : b;
}

/** ¿El nivel permite subir archivos? (subir o eliminar). */
export function puedeSubir(nivel: NivelPermiso | null): boolean {
  return nivel === "subir" || nivel === "eliminar";
}

/** ¿El nivel permite eliminar? (solo eliminar). */
export function puedeEliminar(nivel: NivelPermiso | null): boolean {
  return nivel === "eliminar";
}

/** ¿El nivel permite al menos ver? */
export function puedeVer(nivel: NivelPermiso | null): boolean {
  return nivel !== null;
}

export async function listarCarpetas(
  supabase: SupabaseClient,
): Promise<CarpetaRow[]> {
  const { data, error } = await supabase
    .from(TABLA_CARPETAS)
    .select(SELECT_CARPETA)
    .order("nombre", { ascending: true });
  if (error || !data) return [];
  return data as CarpetaRow[];
}

export async function listarDocumentosDeCarpeta(
  supabase: SupabaseClient,
  carpetaId: string,
): Promise<DocumentoRow[]> {
  const { data, error } = await supabase
    .from(TABLA_DOCUMENTOS)
    .select(SELECT_DOCUMENTO)
    .eq("carpeta_id", carpetaId)
    .order("created_at", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data as DocumentoRow[];
}

export async function listarPermisos(
  supabase: SupabaseClient,
): Promise<PermisoCarpetaRow[]> {
  const { data, error } = await supabase
    .from(TABLA_PERMISOS_CARPETAS)
    .select(SELECT_PERMISO);
  if (error || !data) return [];
  return data as PermisoCarpetaRow[];
}

export async function listarPermisosDeCarpeta(
  supabase: SupabaseClient,
  carpetaId: string,
): Promise<PermisoCarpetaRow[]> {
  const { data, error } = await supabase
    .from(TABLA_PERMISOS_CARPETAS)
    .select(SELECT_PERMISO)
    .eq("carpeta_id", carpetaId);
  if (error || !data) return [];
  return data as PermisoCarpetaRow[];
}

export async function crearCarpeta(
  supabase: SupabaseClient,
  input: {
    nombre: string;
    parentId: string | null;
    creadoPor: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre de la carpeta no puede estar vacío." };

  const { data, error } = await supabase
    .from(TABLA_CARPETAS)
    .insert({
      nombre,
      parent_id: input.parentId,
      creado_por: input.creadoPor,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la carpeta." };
  return { ok: true, id: data.id as string };
}

export async function renombrarCarpeta(
  supabase: SupabaseClient,
  carpetaId: string,
  nombre: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede estar vacío." };
  const { error } = await supabase
    .from(TABLA_CARPETAS)
    .update({ nombre: limpio })
    .eq("id", carpetaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarCarpeta(
  supabase: SupabaseClient,
  carpetaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_CARPETAS)
    .delete()
    .eq("id", carpetaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function asignarPermiso(
  supabase: SupabaseClient,
  input: {
    profesor: string;
    carpetaId: string;
    nivel: NivelPermiso;
    autorizadoPor: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profesor = input.profesor.trim();
  if (!profesor) return { ok: false, error: "Selecciona un profesor." };

  // Si ya existe un permiso para ese profesor+carpeta, actualizar el nivel.
  const { data: existente } = await supabase
    .from(TABLA_PERMISOS_CARPETAS)
    .select("id")
    .eq("profesor", profesor)
    .eq("carpeta_id", input.carpetaId)
    .maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from(TABLA_PERMISOS_CARPETAS)
      .update({ nivel: input.nivel, autorizado_por: input.autorizadoPor })
      .eq("id", existente.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from(TABLA_PERMISOS_CARPETAS).insert({
    profesor,
    carpeta_id: input.carpetaId,
    nivel: input.nivel,
    autorizado_por: input.autorizadoPor,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function quitarPermiso(
  supabase: SupabaseClient,
  permisoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_PERMISOS_CARPETAS)
    .delete()
    .eq("id", permisoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Calcula el nivel efectivo de acceso de un profesor a una carpeta,
 * recorriendo la cadena de permisos hacia la raíz (herencia).
 */
export async function nivelAccesoProfesor(
  supabase: SupabaseClient,
  profesor: string,
  carpetaId: string,
): Promise<NivelAcceso> {
  const permisos = await listarPermisos(supabase);
  const carpetas = await listarCarpetas(supabase);
  const mapaCarpetas = new Map(carpetas.map((c) => [c.id, c]));

  const buscado = normalizarNombre(profesor);
  let actual: string | null = carpetaId;
  let mejor: NivelPermiso | null = null;

  while (actual) {
    const permiso = permisos.find(
      (p) =>
        p.carpeta_id === actual && normalizarNombre(p.profesor) === buscado,
    );
    if (permiso) {
      mejor = mejor ? nivelMayor(mejor, permiso.nivel) : permiso.nivel;
    }
    const carpeta = mapaCarpetas.get(actual);
    actual = carpeta?.parent_id ?? null;
  }

  return mejor;
}

/** Ruta de nombres de una carpeta hacia la raíz (para breadcrumb). */
export function rutaCarpeta(
  carpetas: CarpetaRow[],
  carpetaId: string | null,
): CarpetaRow[] {
  const mapa = new Map(carpetas.map((c) => [c.id, c]));
  const ruta: CarpetaRow[] = [];
  let actual = carpetaId;
  while (actual) {
    const c = mapa.get(actual);
    if (!c) break;
    ruta.unshift(c);
    actual = c.parent_id;
  }
  return ruta;
}

/**
 * Sanitiza el nombre de un archivo o carpeta para usarlo como key/ruta en
 * Supabase Storage. Supabase Storage no acepta caracteres no-ASCII (acentos,
 * ñ, ü, etc.) en la ruta/key del objeto, así que se normalizan a ASCII y se
 * reemplaza lo que no sea letra/número/guion/guion bajo/punto/paréntesis por
 * "_". La extensión se conserva intacta.
 */
export function sanitizarNombreArchivo(nombre: string): string {
  // Separar extensión (último punto) para conservarla intacta.
  const ultimoPunto = nombre.lastIndexOf(".");
  const base = ultimoPunto > 0 ? nombre.slice(0, ultimoPunto) : nombre;
  const ext = ultimoPunto > 0 ? nombre.slice(ultimoPunto) : "";

  // ñ/Ñ no se descomponen con NFD; se reemplazan manualmente antes.
  const conN = base.replace(/ñ/g, "n").replace(/Ñ/g, "N");

  // Quitar acentos/diacríticos (NFD + eliminar marcas de combinación).
  const sinAcentos = conN.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Reemplazar cualquier carácter que no sea letra ASCII, número, guion,
  // guion bajo, punto o paréntesis por "_".
  const sanitizado = sinAcentos.replace(/[^A-Za-z0-9\-_.()]/g, "_");

  return sanitizado + ext;
}

/** Construye la ruta de storage para un archivo dentro de una carpeta. */
export function rutaStorageCarpeta(
  carpetas: CarpetaRow[],
  carpetaId: string,
): string {
  const ruta = rutaCarpeta(carpetas, carpetaId);
  // Sanitizar cada nombre de carpeta: Supabase Storage no acepta caracteres
  // no-ASCII en la ruta/key del objeto.
  return ruta.map((c) => sanitizarNombreArchivo(c.nombre)).join("/");
}


export { BUCKET_DOCUMENTOS };

/* ---------------------------------------------------------------------------
 * ARCHIVOS — Storage + registro en `documentos`
 * ---------------------------------------------------------------------------
 * Todo el I/O de archivos de este dominio vive aquí: la Server Action solo
 * valida la sesión, el tamaño y el nivel de acceso, y delega. El objeto
 * `storage.from(BUCKET_DOCUMENTOS)` se usa con el cliente que recibe cada
 * función (en las escrituras, el de service role que arma la action).
 */

/** Proyección mínima de un documento para operar sobre su archivo. */
export type DocumentoResumen = {
  id: string;
  carpeta_id: string;
  ruta_storage: string;
};

/** Documento por id (id, carpeta_id, ruta_storage), o null si no existe. */
export async function obtenerDocumento(
  supabase: SupabaseClient,
  documentoId: string,
): Promise<DocumentoResumen | null> {
  const { data } = await supabase
    .from(TABLA_DOCUMENTOS)
    .select("id, carpeta_id, ruta_storage")
    .eq("id", documentoId)
    .maybeSingle();
  return (data ?? null) as DocumentoResumen | null;
}

/**
 * Sube el archivo al bucket y registra la fila en `documentos`.
 * Si el registro falla, borra el archivo recién subido (no deja huérfanos).
 * La `rutaStorage` la calcula la action (nombre único + ruta de carpetas).
 */
export async function subirDocumento(
  supabase: SupabaseClient,
  archivo: File,
  datos: { carpetaId: string; rutaStorage: string; subidoPor: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(datos.rutaStorage, buffer, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });

  if (errorSubida) {
    return { ok: false, error: `No se pudo subir: ${errorSubida.message}` };
  }

  const { data, error } = await supabase
    .from(TABLA_DOCUMENTOS)
    .insert({
      carpeta_id: datos.carpetaId,
      nombre_original: archivo.name,
      ruta_storage: datos.rutaStorage,
      tipo: archivo.type || null,
      tamano_bytes: archivo.size,
      subido_por: datos.subidoPor,
    })
    .select("id")
    .single();

  if (error) {
    // Limpiar el archivo subido si falla el registro.
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([datos.rutaStorage]);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data.id as string };
}

/** Elimina el archivo del Storage y después su fila (sin DELETE en cascada). */
export async function eliminarDocumento(
  supabase: SupabaseClient,
  documento: Pick<DocumentoResumen, "id" | "ruta_storage">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: errorStorage } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .remove([documento.ruta_storage]);
  if (errorStorage) {
    return {
      ok: false,
      error: `No se pudo eliminar del storage: ${errorStorage.message}`,
    };
  }

  const { error } = await supabase
    .from(TABLA_DOCUMENTOS)
    .delete()
    .eq("id", documento.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Enlace de descarga firmado y temporal (60 s) para un archivo del bucket. */
export async function urlFirmadaDocumento(
  supabase: SupabaseClient,
  rutaStorage: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(rutaStorage, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: "No se pudo generar el enlace de descarga." };
  }
  return { ok: true, url: data.signedUrl };
}
