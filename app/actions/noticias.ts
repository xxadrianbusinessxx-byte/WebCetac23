"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  eliminarNoticiaInicioEnCloudinary,
  esSlotEventoValido,
  listarUrlsNoticiasInicio,
  publicIdNoticiaInicio,
  type NoticiaInicioSlot,
} from "@/lib/cloudinary/noticias";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { bufferImagenDesdeFormData } from "@/lib/imagen/leer-archivo-form";

function revalidarVistasConEventos() {
  revalidatePath("/");
  revalidatePath("/perfil");
  revalidatePath("/directivo");
}

export async function actionObtenerNoticiasInicio() {
  return listarUrlsNoticiasInicio();
}

export async function actionPublicarNoticiaInicio(
  slot: number,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden publicar noticias." };
  }

  if (!esSlotEventoValido(slot)) {
    return { ok: false, error: "Número de evento no válido." };
  }

  const leido = await bufferImagenDesdeFormData(formData);
  if (!leido.ok) return leido;

  const slotValido = slot as NoticiaInicioSlot;

  // Borra la anterior (mismo public_id) y sube la nueva → reemplazo real + menos residuos en CDN
  await eliminarNoticiaInicioEnCloudinary(slotValido);

  const subida = await subirImagenCloudinary(
    leido.buffer,
    publicIdNoticiaInicio(slotValido),
  );
  if (subida.ok) revalidarVistasConEventos();
  return subida;
}

export async function actionEliminarNoticiaInicio(
  slot: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden eliminar noticias." };
  }
  if (!esSlotEventoValido(slot)) {
    return { ok: false, error: "Número de evento no válido." };
  }
  const resultado = await eliminarNoticiaInicioEnCloudinary(
    slot as NoticiaInicioSlot,
  );
  if (resultado.ok) revalidarVistasConEventos();
  return resultado;
}
