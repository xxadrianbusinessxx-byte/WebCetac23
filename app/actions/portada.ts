"use server";

/**
 * portada.ts — Server Actions de la portada administrable. PROMPT M, 2026-09-23.
 *
 * Todas con `exigir("noticia.publicar")`, la capacidad que ya tenían directivo y
 * técnico —y nadie más— para publicar en la portada. No se creó una nueva: diría
 * lo mismo y obligaría a tocar la matriz.
 *
 * Orden en cada una: AUTORIZAR, luego VALIDAR la forma (`leerEntrada`), luego
 * DELEGAR en `lib/escolar/portada/portada.ts`, que aplica las reglas del puro.
 * Aquí no hay lógica.
 *
 * NINGUNA recibe un archivo: va directo del navegador a Cloudinary con la firma
 * que devuelve `actionFirmarSubidaPortada` (el cuerpo de una action está
 * limitado a 1 MB). Y este archivo SOLO exporta funciones async: nada de
 * `export type { … }`, que Turbopack registra como Server Action y tumbó todas
 * las de /oceano del 17 al 23 de septiembre (C14). Los tipos que necesite la UI
 * se importan de `lib/escolar/portada/` con `import type`.
 */
import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import { leerEntrada } from "@/lib/validacion/leer-form-data";
import {
  esquemaAjustesPortada,
  esquemaEliminarPortada,
  esquemaFirmarPortada,
  esquemaRegistrarPortada,
  esquemaReordenarPortada,
} from "@/lib/validacion/esquemas-puro";
import { CLAVES_AJUSTE, MAX_IMAGENES } from "@/lib/escolar/portada/portada-puro";
import {
  cargarPortada,
  eliminarMedio,
  guardarAjustes,
  prepararSubida,
  registrarMedio,
  reordenarImagenes,
  type EstadoPortada,
} from "@/lib/escolar/portada/portada";
import type { FirmaSubida } from "@/lib/cloudinary/firma";

type ConEstado = { ok: true; estado: EstadoPortada } | { ok: false; error: string };

const SIN_PERMISO = "Solo dirección y el técnico pueden cambiar la portada.";

/** El estado completo, para el panel «Configuración → Video e imágenes». */
export async function actionListarMediosPortada(): Promise<ConEstado> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  try {
    return { ok: true, estado: await cargarPortada(await createClient()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer la portada." };
  }
}

/** Paso 1 de una subida: comprueba el destino y devuelve la firma para Cloudinary. */
export async function actionFirmarSubidaPortada(
  entrada: unknown,
): Promise<{ ok: true; firma: FirmaSubida } | { ok: false; error: string }> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  const e = leerEntrada(esquemaFirmarPortada(MAX_IMAGENES), entrada);
  if (!e.ok) return e;
  try {
    return await prepararSubida(await createClient(), e.datos);
  } catch (x) {
    console.error("[portada] firmar", x);
    return { ok: false, error: "No se pudo preparar la subida. Inténtalo de nuevo." };
  }
}

/** Paso 3: registra lo subido, verificándolo contra el archivo REAL de Cloudinary. */
export async function actionRegistrarMedioPortada(entrada: unknown): Promise<ConEstado> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  const e = leerEntrada(esquemaRegistrarPortada(MAX_IMAGENES), entrada);
  if (!e.ok) return e;
  try {
    return await registrarMedio(await createClient(), e.datos, g.sesion?.profesorId ?? null);
  } catch (x) {
    console.error("[portada] registrar", x);
    return { ok: false, error: "No se pudo registrar el archivo. Inténtalo de nuevo." };
  }
}

/** Elimina una imagen o un video; con `variante: "movil"`, solo la versión de teléfono. */
export async function actionEliminarMedioPortada(entrada: unknown): Promise<ConEstado> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  const e = leerEntrada(esquemaEliminarPortada, entrada);
  if (!e.ok) return e;
  try {
    return await eliminarMedio(await createClient(), e.datos.id, e.datos.variante === "movil");
  } catch (x) {
    console.error("[portada] eliminar", x);
    return { ok: false, error: "No se pudo eliminar. Inténtalo de nuevo." };
  }
}

/** Nuevo orden del carrusel: los ids de TODAS las imágenes. */
export async function actionReordenarPortada(entrada: unknown): Promise<ConEstado> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  const e = leerEntrada(esquemaReordenarPortada(MAX_IMAGENES), entrada);
  if (!e.ok) return e;
  try {
    return await reordenarImagenes(await createClient(), e.datos.ids);
  } catch (x) {
    console.error("[portada] reordenar", x);
    return { ok: false, error: "No se pudo guardar el nuevo orden." };
  }
}

/** Enlaces de redes y datos de contacto. Un valor vacío quita ese dato de la portada. */
export async function actionGuardarAjustesPortada(entrada: unknown): Promise<ConEstado> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO };
  const e = leerEntrada(esquemaAjustesPortada(CLAVES_AJUSTE), entrada);
  if (!e.ok) return e;
  try {
    return await guardarAjustes(await createClient(), e.datos.ajustes, g.sesion?.profesorId ?? null);
  } catch (x) {
    console.error("[portada] ajustes", x);
    return { ok: false, error: "No se pudieron guardar los ajustes." };
  }
}
