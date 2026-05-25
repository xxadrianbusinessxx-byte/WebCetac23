import { actionObtenerNoticiasInicio } from "@/app/actions/noticias";
import { EventosCarrusel } from "@/app/components/eventos-carrusel";
import { eventosConImagen } from "@/lib/escolar/eventos-inicio";

export async function EventosInicio() {
  const noticias = await actionObtenerNoticiasInicio();
  const eventos = eventosConImagen(noticias);

  return <EventosCarrusel eventos={eventos} />;
}
