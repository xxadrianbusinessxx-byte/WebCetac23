import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "El perfil del alumno vive en el portal.",
};

/**
 * RUTA RETIRADA (Fase 9 del rediseño Océano) — redirige al portal.
 *
 * Se retira porque `/oceano` la cubre por completo, y eso está VERIFICADO, no
 * supuesto: el informe de la Fase 3.1 recorrió los cuatro tabs de `/perfil`
 * apartado por apartado y la lista de «qué hace aquí que allí no» quedó vacía.
 * Además el portal añade notificaciones con fecha y estado, seguimiento
 * semestral, seguimiento médico separado y los datos crudos de asistencia.
 *
 * `perfil-client.tsx` NO se borra todavía. Redirigir es reversible; borrar no.
 * El archivo queda como red hasta que el portal lleve un tiempo en uso, y su
 * retirada es una decisión propia (R8).
 */
/**
 * El tipo se conserva porque `perfil-client.tsx` lo importa desde aquí y ese
 * archivo sigue en pie (R8). Desaparece con él, no antes: quitarlo ahora
 * obligaría a tocar un archivo que esta fase ha decidido no tocar.
 */
export type ModoPerfil = "alumno" | "tutor" | "maestro" | "directivo";

export default function PerfilPage() {
  redirect("/oceano");
}
