import "server-only";

/**
 * oembed.ts — el I/O con YouTube y TikTok para el video de cada carrera de la
 * portada (PROMPT U, 2026-10-01). Solo pregunta y devuelve lo que contestan: qué
 * significa cada respuesta lo decide `interpretarRespuestaOembed`
 * (`lib/escolar/portada/portada-puro.ts`), que tiene suite.
 *
 * ── A dónde puede llamar ───────────────────────────────────────────────────
 * Solo a los dos endpoints oEmbed FIJOS de abajo, y a un enlace corto de TikTok
 * que el puro ya aceptó (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/`). Nunca
 * a una dirección elegida por quien escribe el enlace: eso sería abrir el
 * servidor a pedir cualquier URL (SSRF).
 *
 * Todo con tiempo límite: guardar no puede quedarse colgado porque una
 * plataforma tarde en contestar.
 */
import type { PlataformaVideo } from "../escolar/portada/portada-puro.ts";

const TIEMPO_LIMITE_MS = 5000;

const ENDPOINT_OEMBED: Readonly<Record<PlataformaVideo, string>> = {
  youtube: "https://www.youtube.com/oembed?format=json&url=",
  tiktok: "https://www.tiktok.com/oembed?url=",
};

/**
 * Pregunta a la plataforma por este video. Devuelve el código HTTP, o `0` si no
 * hubo respuesta (sin red o tiempo agotado). YouTube contesta 200 si se puede
 * insertar, 401 si su dueño lo impide y 400/403/404 si no existe o es privado.
 */
export async function consultarOembed(plataforma: PlataformaVideo, urlCanonica: string): Promise<number> {
  try {
    const r = await fetch(`${ENDPOINT_OEMBED[plataforma]}${encodeURIComponent(urlCanonica)}`, {
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: "no-store",
    });
    await r.body?.cancel();
    return r.status;
  } catch (e) {
    console.warn("[oembed] sin respuesta de", plataforma, e);
    return 0;
  }
}

/**
 * Sigue un enlace corto de TikTok hasta la dirección del video. Devuelve la
 * dirección FINAL —que el llamador vuelve a pasar por el puro— o `null` si no
 * se pudo seguir. El cuerpo no se lee.
 */
export async function resolverEnlaceCortoTikTok(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: "no-store",
    });
    await r.body?.cancel();
    return r.url || null;
  } catch (e) {
    console.warn("[oembed] no se pudo seguir el enlace corto", url, e);
    return null;
  }
}
