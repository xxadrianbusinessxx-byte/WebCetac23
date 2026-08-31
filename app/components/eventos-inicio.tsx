import { actionObtenerNoticiasInicio } from "@/app/actions/noticias";
import { EventoConVisor } from "./evento-visor";

export async function EventosInicio() {
  const noticias = await actionObtenerNoticiasInicio();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <EventoConVisor url={noticias[1]} label="Imagen de evento" />
      <EventoConVisor url={noticias[2]} label="Imagen de evento 2" />
    </div>
  );
}

