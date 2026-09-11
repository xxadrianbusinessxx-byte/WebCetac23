import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Directivo",
  description: "El panel del directivo vive en el portal.",
};

/**
 * RUTA RETIRADA (Fase 9 del rediseño Océano) — redirige al portal.
 *
 * Cobertura comprobada componente a componente. `directivo-client.tsx` montaba
 * cinco paneles, y de ellos:
 *   · JustificacionesAdmin, MateriaSelector y MateriaTablaVistaPanel están en
 *     el shell (el primero se montó al cerrar esta fase, en
 *     Calendario/Asistencias › Asistencias, que es donde lo pone el frame).
 *   · MateriasConfigPanel y ProfesoresCredencialesPanel NO están, y NO hacen
 *     falta: el PROMPT-3/T5 le quitó al directivo `materia.editar_alias` y
 *     nunca tuvo `profesor.ver_credenciales_acceso`. Esos dos paneles llevaban
 *     ahí desde antes de aquel recorte y hoy el servidor le rechaza sus
 *     acciones. Eran controles muertos, no funcionalidad perdida.
 *
 * `directivo-client.tsx` NO se borra: redirigir es reversible, borrar no (R8).
 */
export default function DirectivoPage() {
  redirect("/oceano");
}
