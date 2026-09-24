/**
 * subida-navegador.ts — sube un archivo DIRECTO del navegador a Cloudinary con la
 * firma que emitió el servidor. PROMPT N, 2026-09-23.
 *
 * Sin SDK de Cloudinary y sin secretos: se puede usar en componentes de cliente,
 * igual que `urls.ts`. La firma (lib/cloudinary/firma.ts) la calcula el servidor
 * después de comprobar permisos; aquí solo se entrega tal cual.
 *
 * `XMLHttpRequest` y no `fetch`: es lo único que informa del PROGRESO de una
 * subida. Un video de 50 MB sin barra de progreso parece colgado.
 */
import type { FirmaSubida } from "./firma.ts";

export type SubidaHecha = { public_id: string; version: number };

export function subirConFirma(
  firma: FirmaSubida,
  archivo: File,
  alProgresar: (porcentaje: number) => void,
): Promise<SubidaHecha> {
  return new Promise((resolver, rechazar) => {
    const datos = new FormData();
    datos.append("file", archivo);
    datos.append("api_key", firma.apiKey);
    datos.append("timestamp", String(firma.timestamp));
    datos.append("signature", firma.signature);
    datos.append("public_id", firma.public_id);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", firma.urlSubida);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alProgresar(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let cuerpo: { public_id?: string; version?: number; error?: { message?: string } } = {};
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta no JSON: se trata abajo como error */
      }
      if (xhr.status >= 200 && xhr.status < 300 && cuerpo.public_id) {
        resolver({ public_id: cuerpo.public_id, version: Number(cuerpo.version) });
      } else {
        rechazar(new Error(cuerpo.error?.message || `Cloudinary respondió ${xhr.status}.`));
      }
    };
    xhr.onerror = () => rechazar(new Error("Se cortó la conexión durante la subida."));
    xhr.send(datos);
  });
}
