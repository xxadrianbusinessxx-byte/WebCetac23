/**
 * mensajes-internos.ts — mensajería privada entre personal: directivo, técnico
 * y profesor.
 *
 * ── Qué NO es ──────────────────────────────────────────────────────────────
 * NO es el chat global que se retiró en 2026-09-06. Aquel era alumno↔profesor,
 * se descartó por decisión de producto y su código está archivado. Este es otro
 * alcance —solo personal— y por eso no reutiliza `COMENTARIOS` ni resucita nada.
 *
 * ── La identidad, que aquí es crítica ──────────────────────────────────────
 * Remitente y destinatario son `PROFESORES.ID`, NUNCA `CLAVE`. Es la deuda
 * estructural nº2 del sistema: 15 de 21 profesores comparten la clave `4321`,
 * así que un mensaje dirigido «a la clave» llegaría a quince personas. En una
 * mensajería privada eso no es un bug de datos, es una fuga.
 *
 * Recibe el cliente por parámetro; no decide permisos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TABLA_MENSAJES_INTERNOS = "mensajes_internos";

export type MensajeInternoRow = {
  id: string;
  hilo_id: string;
  de_profesor: number;
  para_profesor: number;
  asunto: string | null;
  cuerpo: string;
  leido_at: string | null;
  created_at: string;
};

/** Un hilo, resumido para la bandeja. */
export type HiloResumen = {
  hiloId: string;
  asunto: string | null;
  conQuien: number;
  ultimoAt: string;
  ultimoCuerpo: string;
  sinLeer: number;
};

export type Resultado<T> = { ok: true; dato: T } | { ok: false; error: string };

/** Mensajes en los que participa un profesor, en cualquiera de los dos lados. */
export async function mensajesDe(
  supabase: SupabaseClient,
  profesorId: number,
  limite = 300,
): Promise<MensajeInternoRow[]> {
  const { data, error } = await supabase
    .from(TABLA_MENSAJES_INTERNOS)
    .select("*")
    .or(`de_profesor.eq.${profesorId},para_profesor.eq.${profesorId}`)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []) as MensajeInternoRow[];
}

/**
 * Agrupa los mensajes en hilos para la bandeja.
 *
 * Se hace EN MEMORIA y no con SQL a propósito: agrupar por hilo quedándose con
 * el último mensaje exige un `distinct on` o una ventana, y ninguno de los dos
 * pasa limpio por PostgREST. Sobre un tope de 300 mensajes el coste es
 * irrelevante, y a cambio la lógica es legible y se puede probar.
 */
export function agruparEnHilos(
  mensajes: readonly MensajeInternoRow[],
  yo: number,
): HiloResumen[] {
  const porHilo = new Map<string, MensajeInternoRow[]>();
  for (const m of mensajes) {
    const l = porHilo.get(m.hilo_id);
    if (l) l.push(m);
    else porHilo.set(m.hilo_id, [m]);
  }
  const hilos: HiloResumen[] = [];
  for (const [hiloId, lista] of porHilo) {
    const ordenados = [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const ultimo = ordenados[0]!;
    hilos.push({
      hiloId,
      asunto: ordenados.find((m) => m.asunto)?.asunto ?? null,
      conQuien: ultimo.de_profesor === yo ? ultimo.para_profesor : ultimo.de_profesor,
      ultimoAt: ultimo.created_at,
      ultimoCuerpo: ultimo.cuerpo,
      // Sin leer cuenta SOLO lo que me mandaron: mis propios mensajes nunca
      // están «sin leer» para mí.
      sinLeer: ordenados.filter((m) => m.para_profesor === yo && m.leido_at === null).length,
    });
  }
  return hilos.sort((a, b) => b.ultimoAt.localeCompare(a.ultimoAt));
}

export async function enviarMensaje(
  supabase: SupabaseClient,
  m: {
    hiloId: string;
    deProfesor: number;
    paraProfesor: number;
    asunto: string | null;
    cuerpo: string;
  },
): Promise<Resultado<true>> {
  if (m.deProfesor === m.paraProfesor) {
    return { ok: false, error: "No puedes enviarte un mensaje a ti mismo." };
  }
  const { error } = await supabase.from(TABLA_MENSAJES_INTERNOS).insert({
    hilo_id: m.hiloId,
    de_profesor: m.deProfesor,
    para_profesor: m.paraProfesor,
    asunto: m.asunto,
    cuerpo: m.cuerpo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/**
 * Marca leído SOLO lo que va dirigido a quien lee. El filtro por
 * `para_profesor` es la guarda: sin él, cualquiera podría marcar como leídos
 * los mensajes de otro.
 */
export async function marcarHiloLeido(
  supabase: SupabaseClient,
  hiloId: string,
  profesorId: number,
): Promise<Resultado<true>> {
  const { error } = await supabase
    .from(TABLA_MENSAJES_INTERNOS)
    .update({ leido_at: new Date().toISOString() })
    .eq("hilo_id", hiloId)
    .eq("para_profesor", profesorId)
    .is("leido_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}
