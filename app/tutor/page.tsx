import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Tutor",
  description: "El panel del tutor vive en el portal.",
};

/**
 * RUTA RETIRADA (Fase 9 del rediseño Océano) — redirige al portal.
 *
 * Era la última bloqueada, y el bloqueo era real: `tutor-client.tsx` tenía una
 * pestaña «Mensajes» que el shell no cubría. No era la misma lectura que las
 * justificaciones del alumno — `actionListarMensajesDelTutor` devuelve lo
 * dirigido AL TUTOR, de todos sus vinculados a la vez— así que retirar esta
 * ruta antes habría borrado su bandeja.
 *
 * Se desbloqueó dándole apartado propio, `Perfil › Mis mensajes`, por decisión
 * del responsable. Cobertura de las cuatro pestañas del cliente viejo:
 *   datos ....... Perfil › Información personal (del alumno seleccionado)
 *   alumnos ..... el selector del rail, que fija el alcance de todo
 *   asistencia .. Calendario › Asistencia y Calendario escolar
 *   mensajes .... Perfil › Mis mensajes
 *
 * `tutor-client.tsx` NO se borra: redirigir es reversible, borrar no (R8).
 */
export default function TutorPage() {
  redirect("/oceano");
}
