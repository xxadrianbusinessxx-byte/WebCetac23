import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CETAC 23",
  description: "El portal vive en /perfil.",
};

/**
 * RUTA RENOMBRADA (2026-10-25) — el portal pasó a `/perfil`.
 *
 * `/oceano` era el nombre de la FASE de rediseño, no el de la pantalla: lo que
 * la gente abre es su perfil. El shell y todo lo que monta siguen siendo los
 * mismos —el directorio `app/components/oceano/` y los tokens `--oc-*` no se
 * tocan: renombrarlos sería un cambio enorme sin nada a cambio—, lo único que
 * cambió es la URL.
 *
 * Esta redirección se queda: hay enlaces, marcadores y capturas que apuntan
 * aquí, y redirigir es reversible mientras que borrar no (R8). Es el mismo
 * trato que recibieron `/profesor`, `/directivo`, `/configuracion`, `/tutor` y
 * `/documentos` cuando el portal los absorbió.
 */
export default function OceanoPage() {
  redirect("/perfil");
}
