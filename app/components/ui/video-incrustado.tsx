/**
 * video-incrustado.tsx — el reproductor de YouTube o TikTok dentro de una caja
 * con la proporción del video: 16:9 horizontal o 9:16 vertical (PROMPT U).
 *
 * Presentación pura y sin `"use client"`: la usan la portada pública, que es un
 * componente de servidor, y la vista previa del panel de Configuración. El `src`
 * llega YA construido por `urlInsercionVideo` (portada-puro): aquí nunca entra
 * la URL que pegó la persona.
 *
 * - `loading="lazy"`: nada de YouTube ni de TikTok se descarga hasta acercarse.
 * - `referrerPolicy`: YouTube exige el Referer del sitio (si no, «Error 153»).
 */
export function VideoIncrustado({
  src,
  formato,
  titulo,
  className = "",
}: {
  src: string;
  /** Sin importar el tipo del dominio: esta pieza no sabe de portada (ORDEN §1, `ui/`). */
  formato: "horizontal" | "vertical";
  /** Para lectores de pantalla: qué video es. */
  titulo: string;
  className?: string;
}) {
  const caja = formato === "vertical" ? "aspect-[9/16] max-w-[340px]" : "aspect-video";
  return (
    <div className={`relative w-full overflow-hidden bg-black ${caja} ${className}`}>
      <iframe
        src={src}
        title={titulo}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
