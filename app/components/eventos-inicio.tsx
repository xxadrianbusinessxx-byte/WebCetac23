import Image from "next/image";
import { actionObtenerNoticiasInicio } from "@/app/actions/noticias";

function EventoImagen({
  url,
  label,
}: {
  url: string | null;
  label: string;
}) {
  if (!url) {
    return (
      <div className="flex min-h-[140px] flex-1 items-center justify-center rounded-[1.35rem] border border-sky-950/25 bg-linear-to-b from-sky-800/80 via-sky-900/90 to-sky-950/95 px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-sky-100/90 shadow-[inset_0_3px_0_rgba(255,255,255,0.12)]">
        {label}
      </div>
    );
  }

  return (
    <div className="relative min-h-[140px] flex-1 overflow-hidden rounded-[1.35rem] border border-sky-950/25 shadow-[0_8px_24px_rgba(2,6,23,0.25)]">
      <Image
        src={url}
        alt={label}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 33vw"
        unoptimized
      />
    </div>
  );
}

export async function EventosInicio() {
  const noticias = await actionObtenerNoticiasInicio();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <EventoImagen url={noticias[1]} label="Imagen de evento" />
      <EventoImagen url={noticias[2]} label="Imagen de evento 2" />
    </div>
  );
}
