import Image from "next/image";

/**
 * Pantalla de inicio de sesión (login) — sección lateral.
 *
 * El sistema de noticias (Cloudinary) está DESACTIVADO: el directivo ya no
 * publica noticias y aquí se muestra por ahora una imagen fija:
 * public/decoraciones-imagenes/cree-en-ti.jpg
 */
export function EventosInicio() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[1.35rem] border border-sky-950/25 bg-linear-to-b from-sky-800/80 via-sky-900/90 to-sky-950/95 shadow-[0_8px_24px_rgba(2,6,23,0.25)]">
        <Image
          src="/decoraciones-imagenes/cree-en-ti.jpg"
          alt="Cree en ti"
          fill
          className="object-contain p-3"
          sizes="(max-width: 1024px) 100vw, 33vw"
        />
      </div>
    </div>
  );
}

