import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Documentos",
  description: "Los documentos institucionales viven en el portal.",
};

/**
 * RUTA RETIRADA (2026-09-17) — redirige al portal.
 *
 * Durante el rediseño Océano esta ruta quedó en una situación absurda: seguía
 * VIVA y funcionando, pero HUÉRFANA. La barra de navegación legacy que la
 * enlazaba no se dibuja en `/oceano`, y como el resto de rutas ya redirigían,
 * `/documentos` era la única página donde esa barra aparecía. Se llegaba
 * escribiendo la URL a mano, o no se llegaba.
 *
 * El panel no se pierde ni se reescribe: `DocumentosPanel` se monta ahora en
 * `Contenido › Documentos` del técnico, con el mismo backend de siempre
 * (`CARPETAS`, `DOCUMENTOS`, `PERMISOS CARPETAS`) y las mismas capacidades.
 *
 * Redirigir es reversible; borrar no (R8).
 */
export default function DocumentosPage() {
  redirect("/oceano");
}
