import "server-only";

/**
 * portada.ts — el I/O de la portada administrable: Supabase (qué se muestra) y
 * Cloudinary (los archivos). No decide ninguna regla: todas viven en
 * `portada-puro.ts` y aquí solo se aplican. PROMPT M, 2026-09-23.
 *
 * ── El flujo de una subida ─────────────────────────────────────────────────
 *   1. `prepararSubida`  comprueba el destino y devuelve una FIRMA.
 *   2. el navegador sube el archivo directo a Cloudinary con esa firma.
 *   3. `registrarMedio`  NO se fía de lo que dice el navegador: lee el recurso
 *      REAL de Cloudinary, lo pasa por las reglas y, si no cumple, LO BORRA.
 *      Es §7 de la filosofía: la validación del navegador es cortesía; la que
 *      manda es esta.
 *
 * Entre 1 y 3 pueden pasar minutos y otra persona puede haber cambiado algo, así
 * que el destino se comprueba OTRA VEZ al registrar (`comprobarDestino`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_CARRERAS, TABLA_PORTADA_AJUSTES, TABLA_PORTADA_MEDIOS } from "../tables.ts";
import { urlCloudinaryDesdePublicId } from "../../cloudinary/urls.ts";
import { borrarRecurso, firmarSubida, leerRecurso, type FirmaSubida } from "../../cloudinary/firma.ts";
import {
  AJUSTES_PORTADA,
  TRANSFORMACION,
  enlaceWhatsApp,
  esClaveAjuste,
  esPermutacion,
  normalizarWhatsApp,
  ordenPermitidoParaSubir,
  ordenTrasEliminar,
  publicIdCorrespondeA,
  publicIdNuevo,
  rotuloCarrera,
  validarAjuste,
  validarDestino,
  validarImagen,
  validarVideo,
  type ClaveAjuste,
  type Destino,
  type TipoMedio,
} from "./portada-puro.ts";

/* ── Tipos ──────────────────────────────────────────────────────────────── */

export type FilaMedio = {
  id: string;
  tipo: TipoMedio;
  orden: number | null;
  carrera_id: string | null;
  public_id: string;
  version: number;
  public_id_movil: string | null;
  version_movil: number | null;
  texto_alt: string | null;
  ancho: number | null;
  alto: number | null;
  bytes: number | null;
  duracion_s: number | null;
  subido_por: number | null;
  updated_at: string;
};

export type ImagenPortada = {
  id: string;
  orden: number;
  textoAlt: string;
  urlEscritorio: string;
  urlMovil: string | null;
  ancho: number | null;
  alto: number | null;
  bytes: number | null;
};

export type VideoPortada = {
  id: string;
  url: string;
  poster: string;
  duracion_s: number | null;
  bytes: number | null;
};

export type CarreraPortada = {
  id: string;
  clave: string;
  rotulo: string;
  video: VideoPortada | null;
};

export type AjustesPortada = Partial<Record<ClaveAjuste, string>>;

export type EstadoPortada = {
  imagenes: ImagenPortada[];
  carreras: CarreraPortada[];
  ajustes: AjustesPortada;
};

/** Lo que pinta la portada pública: el estado más los enlaces ya construidos. */
export type PortadaPublica = EstadoPortada & {
  enlaces: {
    tiktok: string | null;
    facebook: string | null;
    whatsapp: string | null;
    correo: string | null;
    telefono: string | null;
    direccion: string | null;
  };
};

export type Resultado<T> = { ok: true } & T | { ok: false; error: string };

const TEXTO_ALT_POR_DEFECTO = "Portada del CETAC 23 El Marqués";
const ERROR_BASE = "No se pudo leer la portada. Inténtalo de nuevo en un momento.";

/* ── Lectura ────────────────────────────────────────────────────────────── */

function aImagen(f: FilaMedio): ImagenPortada {
  return {
    id: f.id,
    orden: f.orden ?? 0,
    textoAlt: f.texto_alt?.trim() || TEXTO_ALT_POR_DEFECTO,
    urlEscritorio: urlCloudinaryDesdePublicId(f.public_id, TRANSFORMACION.escritorio, { version: f.version }),
    urlMovil: f.public_id_movil
      ? urlCloudinaryDesdePublicId(f.public_id_movil, TRANSFORMACION.movil, { version: f.version_movil })
      : null,
    ancho: f.ancho,
    alto: f.alto,
    bytes: f.bytes,
  };
}

function aVideo(f: FilaMedio): VideoPortada {
  return {
    id: f.id,
    url: urlCloudinaryDesdePublicId(f.public_id, TRANSFORMACION.video, { version: f.version, tipo: "video" }),
    poster: urlCloudinaryDesdePublicId(f.public_id, TRANSFORMACION.poster, { version: f.version, tipo: "video" }),
    duracion_s: f.duracion_s,
    bytes: f.bytes,
  };
}

/**
 * Todo lo de la portada en UNA ida: medios, carreras activas y ajustes, en
 * paralelo. La usan el panel de administración y la portada pública.
 */
export async function cargarPortada(supabase: SupabaseClient): Promise<EstadoPortada> {
  const [medios, carreras, ajustes] = await Promise.all([
    supabase.from(TABLA_PORTADA_MEDIOS).select("*").order("orden", { ascending: true, nullsFirst: false }),
    supabase.from(TABLA_CARRERAS).select("id, clave, nombre").eq("activo", true).order("nombre"),
    supabase.from(TABLA_PORTADA_AJUSTES).select("clave, valor"),
  ]);
  if (medios.error || carreras.error || ajustes.error) {
    console.error("[portada] cargarPortada", medios.error ?? carreras.error ?? ajustes.error);
    throw new Error(ERROR_BASE);
  }
  const filas = (medios.data ?? []) as FilaMedio[];
  const videoDe = new Map(filas.filter((f) => f.tipo === "video").map((f) => [f.carrera_id, f]));

  return {
    imagenes: filas.filter((f) => f.tipo === "imagen").map(aImagen),
    carreras: (carreras.data ?? []).map((c) => {
      const v = videoDe.get(c.id as string);
      return {
        id: c.id as string,
        clave: String(c.clave ?? ""),
        rotulo: rotuloCarrera(c.clave as string | null, c.nombre as string | null),
        video: v ? aVideo(v) : null,
      };
    }),
    ajustes: Object.fromEntries(
      (ajustes.data ?? [])
        .filter((a) => esClaveAjuste(String(a.clave)))
        .map((a) => [a.clave, String(a.valor ?? "")]),
    ) as AjustesPortada,
  };
}

/** La portada pública: el estado más los enlaces listos para pintar. */
export async function leerPortadaPublica(supabase: SupabaseClient): Promise<PortadaPublica> {
  const estado = await cargarPortada(supabase);
  const a = estado.ajustes;
  const limpio = (x: string | undefined) => (x && x.trim() ? x.trim() : null);
  return {
    ...estado,
    enlaces: {
      tiktok: limpio(a.tiktok_url),
      facebook: limpio(a.facebook_url),
      whatsapp: a.whatsapp_numero ? enlaceWhatsApp(a.whatsapp_numero) : null,
      correo: limpio(a.correo) ? `mailto:${limpio(a.correo)}` : null,
      telefono: limpio(a.telefono),
      direccion: limpio(a.direccion),
    },
  };
}

/* ── Comprobación del destino, contra la base ───────────────────────────── */

async function filasImagen(supabase: SupabaseClient): Promise<FilaMedio[]> {
  const { data, error } = await supabase
    .from(TABLA_PORTADA_MEDIOS)
    .select("*")
    .eq("tipo", "imagen")
    .order("orden", { ascending: true });
  if (error) throw new Error(ERROR_BASE);
  return (data ?? []) as FilaMedio[];
}

/**
 * ¿Se puede escribir en este destino AHORA? Las reglas de forma son del puro
 * (`validarDestino`); aquí se añaden las que necesitan mirar la base.
 */
async function comprobarDestino(
  supabase: SupabaseClient,
  d: Destino,
): Promise<{ ok: true; existente: FilaMedio | null } | { ok: false; error: string }> {
  const forma = validarDestino(d);
  if (!forma.ok) return forma;

  if (d.tipo === "video") {
    const { data: carrera, error } = await supabase
      .from(TABLA_CARRERAS)
      .select("id, activo")
      .eq("id", d.carreraId!)
      .maybeSingle();
    if (error) return { ok: false, error: ERROR_BASE };
    if (!carrera || carrera.activo !== true) return { ok: false, error: "Esa carrera no existe o no está activa." };
    const { data: previo } = await supabase
      .from(TABLA_PORTADA_MEDIOS)
      .select("*")
      .eq("tipo", "video")
      .eq("carrera_id", d.carreraId!)
      .maybeSingle();
    return { ok: true, existente: (previo as FilaMedio | null) ?? null };
  }

  const imagenes = await filasImagen(supabase);
  const enEsaPosicion = imagenes.find((f) => f.orden === d.orden) ?? null;
  if (d.variante === "movil") {
    if (!enEsaPosicion) {
      return { ok: false, error: "Primero sube la imagen de escritorio de esa posición; la de teléfono es su variante." };
    }
    return { ok: true, existente: enEsaPosicion };
  }
  const ocupados = imagenes.map((f) => f.orden as number);
  if (!ordenPermitidoParaSubir(ocupados, d.orden as number)) {
    return { ok: false, error: "Sube las imágenes en orden: esa posición dejaría un hueco en el carrusel." };
  }
  return { ok: true, existente: enEsaPosicion };
}

/* ── 1. Firma ───────────────────────────────────────────────────────────── */

export async function prepararSubida(
  supabase: SupabaseClient,
  d: Destino,
): Promise<Resultado<{ firma: FirmaSubida }>> {
  const destino = await comprobarDestino(supabase, d);
  if (!destino.ok) return destino;
  const variante = d.tipo === "imagen" ? (d.variante ?? "escritorio") : null;
  // El sufijo aleatorio sale de aquí y no del puro, que no genera aleatorios.
  const publicId = publicIdNuevo(d.tipo, variante, crypto.randomUUID());
  return { ok: true, firma: firmarSubida(publicId, d.tipo === "video" ? "video" : "image") };
}

/* ── 3. Registro, contra el archivo REAL ────────────────────────────────── */

export type EntradaRegistro = Destino & { public_id: string; textoAlt?: string | null };

export async function registrarMedio(
  supabase: SupabaseClient,
  e: EntradaRegistro,
  subidoPor: number | null,
): Promise<Resultado<{ estado: EstadoPortada }>> {
  const variante = e.tipo === "imagen" ? (e.variante ?? null) : null;
  const tipoRecurso = e.tipo === "video" ? "video" : "image";

  if (!publicIdCorrespondeA(e.public_id, e.tipo, variante)) {
    // No se borra: si no es de la portada, no es nuestro.
    return { ok: false, error: "El archivo registrado no corresponde a ese destino." };
  }

  const recurso = await leerRecurso(e.public_id, tipoRecurso);
  if (!recurso) return { ok: false, error: "No se encontró el archivo subido. Vuelve a intentarlo." };

  const medida =
    e.tipo === "video"
      ? validarVideo({
          ancho: recurso.width,
          alto: recurso.height,
          bytes: recurso.bytes,
          formato: recurso.format,
          duracion_s: recurso.duration ?? 0,
        })
      : validarImagen({
          ancho: recurso.width,
          alto: recurso.height,
          bytes: recurso.bytes,
          formato: recurso.format,
          variante: variante ?? "escritorio",
        });
  if (!medida.ok) {
    await borrarRecurso(e.public_id, tipoRecurso).catch((x) => console.warn("[portada] no se pudo borrar lo rechazado", x));
    return medida;
  }

  const destino = await comprobarDestino(supabase, e);
  if (!destino.ok) {
    await borrarRecurso(e.public_id, tipoRecurso).catch((x) => console.warn("[portada] no se pudo borrar lo huérfano", x));
    return destino;
  }

  const ahora = new Date().toISOString();
  const previo = destino.existente;
  const textoAlt = e.textoAlt?.trim() || null;
  let anterior: string | null = null;
  let error: { message: string; code?: string } | null = null;

  if (e.tipo === "imagen" && variante === "movil") {
    anterior = previo!.public_id_movil;
    ({ error } = await supabase
      .from(TABLA_PORTADA_MEDIOS)
      .update({ public_id_movil: recurso.public_id, version_movil: recurso.version, updated_at: ahora })
      .eq("id", previo!.id));
  } else if (previo) {
    anterior = previo.public_id;
    ({ error } = await supabase
      .from(TABLA_PORTADA_MEDIOS)
      .update({
        public_id: recurso.public_id,
        version: recurso.version,
        ancho: recurso.width,
        alto: recurso.height,
        bytes: recurso.bytes,
        duracion_s: e.tipo === "video" ? recurso.duration : null,
        texto_alt: textoAlt ?? previo.texto_alt,
        subido_por: subidoPor,
        updated_at: ahora,
      })
      .eq("id", previo.id));
  } else {
    ({ error } = await supabase.from(TABLA_PORTADA_MEDIOS).insert({
      tipo: e.tipo,
      orden: e.tipo === "imagen" ? e.orden : null,
      carrera_id: e.tipo === "video" ? e.carreraId : null,
      public_id: recurso.public_id,
      version: recurso.version,
      ancho: recurso.width,
      alto: recurso.height,
      bytes: recurso.bytes,
      duracion_s: e.tipo === "video" ? recurso.duration : null,
      texto_alt: textoAlt,
      subido_por: subidoPor,
    }));
  }

  if (error) {
    console.error("[portada] registrarMedio", error);
    await borrarRecurso(e.public_id, tipoRecurso).catch(() => {});
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Otra persona acaba de subir algo a ese mismo sitio. Recarga la página y vuelve a intentarlo."
          : "No se pudo guardar. Inténtalo de nuevo.",
    };
  }

  // EN ESTE ORDEN: primero se guarda lo nuevo y DESPUÉS se borra lo viejo. Si
  // falla el borrado queda un archivo huérfano en Cloudinary (se anota); al
  // revés, si fallara el guardado, la portada se quedaría sin esa imagen.
  if (anterior && anterior !== recurso.public_id) {
    await borrarRecurso(anterior, tipoRecurso).catch((x) => console.warn("[portada] huérfano en Cloudinary:", anterior, x));
  }
  return { ok: true, estado: await cargarPortada(supabase) };
}

/* ── Eliminar y reordenar ───────────────────────────────────────────────── */

export async function eliminarMedio(
  supabase: SupabaseClient,
  id: string,
  soloMovil: boolean,
): Promise<Resultado<{ estado: EstadoPortada }>> {
  const { data, error } = await supabase.from(TABLA_PORTADA_MEDIOS).select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: ERROR_BASE };
  const fila = data as FilaMedio | null;
  if (!fila) return { ok: false, error: "Ese elemento ya no existe. Recarga la página." };

  if (soloMovil) {
    if (fila.tipo !== "imagen" || !fila.public_id_movil) {
      return { ok: false, error: "Esa imagen no tiene versión para teléfono." };
    }
    const movil = fila.public_id_movil;
    const r = await supabase
      .from(TABLA_PORTADA_MEDIOS)
      .update({ public_id_movil: null, version_movil: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error) return { ok: false, error: "No se pudo quitar la versión para teléfono." };
    await borrarRecurso(movil, "image").catch((x) => console.warn("[portada] huérfano:", movil, x));
    return { ok: true, estado: await cargarPortada(supabase) };
  }

  const r = await supabase.from(TABLA_PORTADA_MEDIOS).delete().eq("id", id);
  if (r.error) return { ok: false, error: "No se pudo eliminar." };

  const tipoRecurso = fila.tipo === "video" ? "video" : "image";
  await borrarRecurso(fila.public_id, tipoRecurso).catch((x) => console.warn("[portada] huérfano:", fila.public_id, x));
  if (fila.public_id_movil) {
    await borrarRecurso(fila.public_id_movil, "image").catch((x) => console.warn("[portada] huérfano:", fila.public_id_movil, x));
  }

  // El carrusel no tiene huecos: se compacta con la regla del puro y la RPC.
  if (fila.tipo === "imagen") {
    const restantes = await filasImagen(supabase);
    const compacto = ordenTrasEliminar(
      restantes.map((f) => ({ id: f.id, orden: f.orden as number })),
      id,
    );
    const hayHueco = compacto.some((c, i) => restantes[i]?.orden !== c.orden);
    if (hayHueco) {
      const rr = await supabase.rpc("reordenar_portada", { p_ids: compacto.map((c) => c.id) });
      if (rr.error) console.error("[portada] no se pudo compactar el orden", rr.error);
    }
  }
  return { ok: true, estado: await cargarPortada(supabase) };
}

export async function reordenarImagenes(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Resultado<{ estado: EstadoPortada }>> {
  const actuales = (await filasImagen(supabase)).map((f) => f.id);
  if (!esPermutacion(ids, actuales)) {
    return { ok: false, error: "El carrusel cambió mientras lo ordenabas. Recarga la página." };
  }
  const { error } = await supabase.rpc("reordenar_portada", { p_ids: ids });
  if (error) {
    console.error("[portada] reordenar", error);
    return { ok: false, error: "No se pudo guardar el nuevo orden." };
  }
  return { ok: true, estado: await cargarPortada(supabase) };
}

/* ── Ajustes ────────────────────────────────────────────────────────────── */

/**
 * Guarda los ajustes que lleguen. Un valor VACÍO borra el ajuste: la portada deja
 * de mostrar ese icono en vez de pintar un enlace muerto. El número de WhatsApp
 * se guarda ya normalizado, para que el enlace no dependa de cómo se escribió.
 */
export async function guardarAjustes(
  supabase: SupabaseClient,
  ajustes: Record<string, string>,
  actualizadoPor: number | null,
): Promise<Resultado<{ estado: EstadoPortada }>> {
  for (const [clave, valor] of Object.entries(ajustes)) {
    const r = validarAjuste(clave, valor);
    if (!r.ok) {
      const etiqueta = AJUSTES_PORTADA.find((a) => a.clave === clave)?.etiqueta ?? clave;
      return { ok: false, error: `${etiqueta}: ${r.error}` };
    }
  }

  const ahora = new Date().toISOString();
  const borrar = Object.entries(ajustes).filter(([, v]) => !v.trim()).map(([k]) => k);
  const guardar = Object.entries(ajustes)
    .filter(([, v]) => v.trim())
    .map(([clave, v]) => ({
      clave,
      valor: clave === "whatsapp_numero" ? (normalizarWhatsApp(v) ?? v.trim()) : v.trim(),
      actualizado_por: actualizadoPor,
      updated_at: ahora,
    }));

  if (guardar.length) {
    const { error } = await supabase.from(TABLA_PORTADA_AJUSTES).upsert(guardar, { onConflict: "clave" });
    if (error) {
      console.error("[portada] guardarAjustes", error);
      return { ok: false, error: "No se pudieron guardar los ajustes." };
    }
  }
  if (borrar.length) {
    const { error } = await supabase.from(TABLA_PORTADA_AJUSTES).delete().in("clave", borrar);
    if (error) return { ok: false, error: "No se pudieron quitar algunos ajustes." };
  }
  return { ok: true, estado: await cargarPortada(supabase) };
}
