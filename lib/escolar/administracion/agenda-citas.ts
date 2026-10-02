/**
 * agenda-citas.ts — I/O de la agenda de citas de la dirección (2026-10-01):
 * franjas semanales, días bloqueados y huecos ocupados. Tablas de
 * `supabase/crear-agenda-citas.sql`.
 *
 * Las DECISIONES viven en `agenda-citas-puro.ts`; aquí se lee, se escribe y se
 * llama a la regla antes de escribir. NO decide permisos ni alcance: la action
 * exige `cita.gestionar` (escribir la agenda) o `cita.solicitar` (pedir) y
 * resuelve de quién es la CURP antes de entrar aquí.
 *
 * Tres consultas fijas para leer la agenda entera —franjas, bloqueados, ocupados—,
 * en paralelo y sin bucle por día (§11).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_CITAS,
  TABLA_CITAS_DIAS_BLOQUEADOS,
  TABLA_CITAS_FRANJAS,
} from "../tables.ts";
import {
  HUECO_OCUPADO,
  claveHueco,
  rangoDeSolicitud,
  sumarDias,
  validarDiaBloqueado,
  validarFranja,
  validarSolicitudCita,
  type AgendaCitas,
  type DiaBloqueado,
  type Franja,
  type Hueco,
} from "./agenda-citas-puro.ts";
import { fechaHoraLocal, instanteDelPlantel } from "./hora-plantel-puro.ts";
import type { CitaRow, Resultado } from "./administracion.ts";

/** La agenda leída: lo que necesita la pantalla del directivo y la regla. */
export type AgendaLeida = {
  franjas: Franja[];
  /** Días bloqueados de hoy en adelante, por fecha. */
  diasBloqueados: DiaBloqueado[];
  agenda: AgendaCitas;
};

/** Si el `.sql` no se ha ejecutado, decirlo: una lista vacía parecería «sin horario». */
export const FALTA_ESQUEMA_AGENDA =
  "Falta crear la agenda de citas en la base: ejecuta supabase/crear-agenda-citas.sql.";

/* ── Lectura ───────────────────────────────────────────────────────────── */

/**
 * Franjas, días bloqueados desde `hoy` y huecos ocupados en el rango pedible
 * (mañana … hoy + 30). Las tres a la vez.
 */
export async function leerAgendaCitas(
  supabase: SupabaseClient,
  hoy: string,
): Promise<Resultado<AgendaLeida>> {
  const { desde, hasta } = rangoDeSolicitud(hoy);
  const [fr, bl, oc] = await Promise.all([
    supabase.from(TABLA_CITAS_FRANJAS).select("id, dia_semana, hora_inicio, hora_fin, duracion_min"),
    supabase
      .from(TABLA_CITAS_DIAS_BLOQUEADOS)
      .select("fecha, motivo")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true }),
    supabase
      .from(TABLA_CITAS)
      .select("propuesta_at")
      .in("estado", ["pendiente", "aceptada"])
      .gte("propuesta_at", instanteDelPlantel(desde, "00:00"))
      .lt("propuesta_at", instanteDelPlantel(sumarDias(hasta, 1), "00:00")),
  ]);
  const error = fr.error ?? bl.error ?? oc.error;
  if (error) return { ok: false, error: mensajeDeError(error) };

  const franjas = ((fr.data ?? []) as Franja[]).map((f) => ({
    ...f,
    hora_inicio: hhmm(f.hora_inicio),
    hora_fin: hhmm(f.hora_fin),
    duracion_min: Number(f.duracion_min),
  }));
  const diasBloqueados = (bl.data ?? []) as DiaBloqueado[];
  const ocupados = new Set<string>();
  for (const c of (oc.data ?? []) as Pick<CitaRow, "propuesta_at">[]) {
    const local = fechaHoraLocal(c.propuesta_at);
    if (local) ocupados.add(claveHueco(local));
  }
  return {
    ok: true,
    dato: {
      franjas,
      diasBloqueados,
      agenda: { franjas, bloqueados: new Set(diasBloqueados.map((d) => d.fecha)), ocupados },
    },
  };
}

/* ── Escritura de la agenda (directivo) ────────────────────────────────── */

/**
 * Guarda una franja nueva si `validarFranja` la acepta contra las que ya hay.
 * La comprobación de solape se hace aquí, sobre lo leído justo antes: la agenda
 * la edita una sola persona, y la exclusividad que de verdad importa —el hueco de
 * una cita— la impone el índice único de la base.
 */
export async function guardarFranja(
  supabase: SupabaseClient,
  f: Franja,
  quien: number | null,
): Promise<Resultado<true>> {
  const { data, error: errLeer } = await supabase
    .from(TABLA_CITAS_FRANJAS)
    .select("id, dia_semana, hora_inicio, hora_fin, duracion_min")
    .eq("dia_semana", f.dia_semana);
  if (errLeer) return { ok: false, error: mensajeDeError(errLeer) };
  const existentes = ((data ?? []) as Franja[]).map((e) => ({
    ...e,
    hora_inicio: hhmm(e.hora_inicio),
    hora_fin: hhmm(e.hora_fin),
  }));
  const v = validarFranja(f, existentes);
  if (!v.ok) return v;
  const { error } = await supabase.from(TABLA_CITAS_FRANJAS).insert({
    dia_semana: f.dia_semana,
    hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin,
    duracion_min: f.duracion_min,
    creado_por: quien,
  });
  if (error) return { ok: false, error: mensajeDeError(error) };
  return { ok: true, dato: true };
}

/** Borrado real: es configuración, no historial. Las citas ya pedidas no cambian. */
export async function borrarFranja(supabase: SupabaseClient, id: string): Promise<Resultado<true>> {
  const { error } = await supabase.from(TABLA_CITAS_FRANJAS).delete().eq("id", id);
  if (error) return { ok: false, error: mensajeDeError(error) };
  return { ok: true, dato: true };
}

export async function bloquearDia(
  supabase: SupabaseClient,
  d: DiaBloqueado,
  hoy: string,
  quien: number | null,
): Promise<Resultado<true>> {
  const v = validarDiaBloqueado(d.fecha, hoy);
  if (!v.ok) return v;
  const { error } = await supabase
    .from(TABLA_CITAS_DIAS_BLOQUEADOS)
    .insert({ fecha: d.fecha, motivo: d.motivo, creado_por: quien });
  if (error?.code === "23505") return { ok: false, error: "Ese día ya estaba bloqueado." };
  if (error) return { ok: false, error: mensajeDeError(error) };
  return { ok: true, dato: true };
}

export async function desbloquearDia(supabase: SupabaseClient, fecha: string): Promise<Resultado<true>> {
  const { error } = await supabase.from(TABLA_CITAS_DIAS_BLOQUEADOS).delete().eq("fecha", fecha);
  if (error) return { ok: false, error: mensajeDeError(error) };
  return { ok: true, dato: true };
}

/* ── Pedir una cita (alumno o tutor) ───────────────────────────────────── */

/**
 * Lee la agenda, pregunta a la regla única y, solo si la acepta, inserta la cita
 * en `instanteDelPlantel(fecha, hora)`. El instante NUNCA llega del navegador.
 * Si dos personas piden el mismo hueco a la vez, el índice `ux_citas_hueco_vivo`
 * rechaza a la segunda (23505) y se le dice con el mismo texto que la regla.
 */
export async function pedirCitaEnAgenda(
  supabase: SupabaseClient,
  c: {
    periodoId: string;
    curp: string;
    solicitadaPor: CitaRow["solicitada_por"];
    motivo: string | null;
    hueco: Hueco;
  },
  hoy: string,
): Promise<Resultado<true>> {
  const leida = await leerAgendaCitas(supabase, hoy);
  if (!leida.ok) return leida;
  const v = validarSolicitudCita(c.hueco, leida.dato.agenda, hoy);
  if (!v.ok) return v;
  const { error } = await supabase.from(TABLA_CITAS).insert({
    periodo_id: c.periodoId,
    curp: c.curp,
    solicitada_por: c.solicitadaPor,
    motivo: c.motivo,
    propuesta_at: instanteDelPlantel(c.hueco.fecha, c.hueco.hora),
  });
  if (error?.code === "23505") return { ok: false, error: HUECO_OCUPADO };
  if (error) return { ok: false, error: mensajeDeError(error) };
  return { ok: true, dato: true };
}

/* ── Helpers privados ──────────────────────────────────────────────────── */

/** PostgREST devuelve `time` como «09:00:00»; la regla trabaja con «09:00». */
function hhmm(t: string): string {
  return String(t ?? "").slice(0, 5);
}

/** PGRST205 / 42P01 = la tabla no existe: el `.sql` no se ha ejecutado. */
function mensajeDeError(error: { code?: string; message: string }): string {
  if (error.code === "PGRST205" || error.code === "42P01") return FALTA_ESQUEMA_AGENDA;
  return error.message;
}
