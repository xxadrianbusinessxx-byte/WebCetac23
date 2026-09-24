"use server";

/**
 * mensajes-internos.ts — Server Actions de la mensajería privada entre
 * personal: directivo, técnico y profesor.
 *
 * ── La guarda que importa ──────────────────────────────────────────────────
 * Todo se resuelve con el `profesorId` de la SESIÓN, nunca con uno que llegue
 * por parámetro. En una mensajería privada eso no es una precaución de estilo:
 * aceptar un remitente del cliente permitiría leer la bandeja de cualquiera.
 *
 * Y el destinatario se valida contra la lista de destinatarios permitidos, que
 * el servidor calcula. Sin eso, `para_profesor` sería un número libre y se
 * podría escribir a una fila que no debería recibir mensajes.
 */
import { randomUUID } from "node:crypto";
import { exigir } from "@/lib/auth/exigir";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { listarProfesores, nombreProfesor } from "@/lib/escolar/catalogo/profesores";
import {
  agruparEnHilos,
  enviarMensaje,
  marcarHiloLeido,
  mensajesDe,
  type HiloResumen,
  type MensajeInternoRow,
} from "@/lib/escolar/mensajes-internos";
import { sanearTexto } from "@/lib/escolar/administracion/flujos-puro";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

export type Destinatario = { id: number; nombre: string; permisos: string | null };

/**
 * Con quién se puede hablar. Se calcula en el servidor y se envía a la UI, para
 * que el selector no sea una caja de texto donde escribir cualquier id.
 *
 * Se excluye uno mismo: `enviarMensaje` también lo rechaza, pero ofrecerlo en
 * la lista y luego negarlo sería un control que miente.
 */
export async function actionDestinatariosInternos(): Promise<Destinatario[]> {
  const g = await exigir("mensaje_interno.usar");
  if (!g.ok) return [];
  const sesion = await obtenerSesionPortal();
  const supabase = await createClient();
  const profesores = await listarProfesores(supabase);
  const yo = sesion?.profesorId ?? null;
  // `ID` y `Permisos` en mayúsculas: son los nombres reales de las columnas de
  // PROFESORES, y el nombre completo se lee con `nombreProfesor()` porque la
  // columna se llama "NOMBRE/PROFESOR/DIRECTIVO".
  return profesores
    .filter((p) => p.ID !== yo)
    .map((p) => ({ id: p.ID, nombre: nombreProfesor(p), permisos: p.Permisos ?? null }));
}

export async function actionBandejaInterna(): Promise<HiloResumen[]> {
  const g = await exigir("mensaje_interno.usar");
  if (!g.ok) return [];
  const sesion = await obtenerSesionPortal();
  if (!sesion?.profesorId) return [];
  const supabase = await createClient();
  const mensajes = await mensajesDe(supabase, sesion.profesorId);
  return agruparEnHilos(mensajes, sesion.profesorId);
}

/**
 * Los mensajes de un hilo. Se filtran EN SERVIDOR a los que me tocan: pedir un
 * `hiloId` ajeno no devuelve nada, porque el filtro no es «este hilo» sino
 * «este hilo Y yo participo».
 */
export async function actionHiloInterno(hiloId: string): Promise<MensajeInternoRow[]> {
  const g = await exigir("mensaje_interno.usar");
  if (!g.ok) return [];
  const sesion = await obtenerSesionPortal();
  if (!sesion?.profesorId) return [];
  const supabase = await createClient();
  const todos = await mensajesDe(supabase, sesion.profesorId, 500);
  const delHilo = todos
    .filter((m) => m.hilo_id === hiloId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (delHilo.length > 0) await marcarHiloLeido(supabase, hiloId, sesion.profesorId);
  return delHilo;
}

export async function actionEnviarMensajeInterno(datos: {
  paraProfesor: number;
  asunto?: string;
  cuerpo: string;
  hiloId?: string | null;
}): Promise<{ ok: true; hiloId: string } | Fallo> {
  const g = await exigir("mensaje_interno.usar");
  if (!g.ok) return fallo("No autorizado.");
  const sesion = await obtenerSesionPortal();
  if (!sesion?.profesorId) return fallo("Tu sesión no está asociada a un profesor.");

  const cuerpo = sanearTexto(datos.cuerpo);
  if (!cuerpo) return fallo("El mensaje no puede estar vacío.");

  // El destinatario tiene que estar en la lista que el servidor permite. Sin
  // esta comprobación, `paraProfesor` sería un número libre venido del cliente.
  const permitidos = await actionDestinatariosInternos();
  if (!permitidos.some((d) => d.id === datos.paraProfesor)) {
    return fallo("Ese destinatario no está disponible.");
  }

  const hiloId = datos.hiloId || randomUUID();
  const supabase = await createClient();
  const r = await enviarMensaje(supabase, {
    hiloId,
    deProfesor: sesion.profesorId,
    paraProfesor: datos.paraProfesor,
    asunto: sanearTexto(datos.asunto, 200),
    cuerpo,
  });
  return r.ok ? { ok: true, hiloId } : fallo(r.error);
}
