/**
 * administracion.ts — I/O de las cuatro pantallas de Administración escolar:
 * reportes disciplinarios, citas, constancias y buzón.
 *
 * Recibe el cliente de Supabase por parámetro, como el resto de `lib/escolar/`:
 * así este módulo no importa nada de servidor y las decisiones que contiene
 * —que viven en `flujos-puro.ts`— se pueden probar sin base de datos.
 *
 * NO decide permisos. Cada action llama a `exigir()` antes de entrar aquí, y
 * el ALCANCE («¿de qué alumno?») lo resuelve la action también. Este módulo
 * asume que quien llama ya tiene derecho a lo que pide.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  puedeTransicionarCita,
  puedeTransicionarConstancia,
  type EstadoCita,
  type EstadoConstancia,
  type Gravedad,
  type TipoBuzon,
} from "./flujos-puro.ts";
import {
  TABLA_BUZON_MENSAJES,
  TABLA_CITAS as TABLA_CITAS_REGISTRO,
  TABLA_REPORTES_ALUMNO,
  TABLA_SOLICITUDES_CONSTANCIA,
} from "../tables.ts";

// Nombres del registro único `tables.ts`; se conservan los alias de este módulo.
export const TABLA_REPORTES = TABLA_REPORTES_ALUMNO;
export const TABLA_CITAS = TABLA_CITAS_REGISTRO;
export const TABLA_CONSTANCIAS = TABLA_SOLICITUDES_CONSTANCIA;
export const TABLA_BUZON = TABLA_BUZON_MENSAJES;

export type ReporteRow = {
  id: string;
  periodo_id: string;
  curp: string;
  grupo_id: string | null;
  motivo: string;
  gravedad: Gravedad;
  ocurrido_at: string;
  creado_por: number | null;
  created_at: string;
  anulado_at: string | null;
  anulado_por: number | null;
  motivo_anulacion: string | null;
};

export type CitaRow = {
  id: string;
  periodo_id: string;
  curp: string;
  solicitada_por: "alumno" | "tutor" | "directivo";
  motivo: string | null;
  propuesta_at: string;
  estado: EstadoCita;
  atendida_por: number | null;
  nota_cierre: string | null;
  created_at: string;
  actualizado_at: string | null;
};

export type ConstanciaRow = {
  id: string;
  periodo_id: string;
  curp: string;
  tipo: string;
  observaciones: string | null;
  estado: EstadoConstancia;
  resuelta_por: number | null;
  ruta_storage: string | null;
  created_at: string;
  resuelta_at: string | null;
};

export type BuzonRow = {
  id: string;
  periodo_id: string | null;
  tipo: TipoBuzon;
  remitente: "alumno" | "tutor";
  curp: string | null;
  mensaje: string;
  leido_at: string | null;
  atendido_por: number | null;
  created_at: string;
};

export type Resultado<T> = { ok: true; dato: T } | { ok: false; error: string };

/* ── Reportes ──────────────────────────────────────────────────────────── */

export async function listarReportes(
  supabase: SupabaseClient,
  periodoId: string,
  filtro: { grupoId?: string | null; curp?: string | null } = {},
): Promise<ReporteRow[]> {
  let q = supabase.from(TABLA_REPORTES).select("*").eq("periodo_id", periodoId);
  if (filtro.grupoId) q = q.eq("grupo_id", filtro.grupoId);
  if (filtro.curp) q = q.eq("curp", filtro.curp);
  const { data, error } = await q.order("ocurrido_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ReporteRow[];
}

export async function crearReporte(
  supabase: SupabaseClient,
  r: {
    periodoId: string;
    curp: string;
    grupoId: string | null;
    motivo: string;
    gravedad: Gravedad;
    ocurridoAt: string;
    creadoPor: number | null;
  },
): Promise<Resultado<ReporteRow>> {
  const { data, error } = await supabase
    .from(TABLA_REPORTES)
    .insert({
      periodo_id: r.periodoId,
      curp: r.curp,
      grupo_id: r.grupoId,
      motivo: r.motivo,
      gravedad: r.gravedad,
      ocurrido_at: r.ocurridoAt,
      creado_por: r.creadoPor,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: data as ReporteRow };
}

/**
 * Anular NO borra. Marca. Un reporte disciplinario anulado sigue siendo parte
 * del historial del alumno, y borrarlo lo destruiría — por eso la tabla no
 * tiene DELETE en su flujo.
 */
export async function anularReporte(
  supabase: SupabaseClient,
  id: string,
  quien: number | null,
  motivo: string | null,
): Promise<Resultado<true>> {
  const { data: actual } = await supabase
    .from(TABLA_REPORTES)
    .select("anulado_at")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { ok: false, error: "El reporte no existe." };
  if ((actual as { anulado_at: string | null }).anulado_at) {
    return { ok: false, error: "Ese reporte ya estaba anulado." };
  }
  const { error } = await supabase
    .from(TABLA_REPORTES)
    .update({ anulado_at: new Date().toISOString(), anulado_por: quien, motivo_anulacion: motivo })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/* ── Citas ─────────────────────────────────────────────────────────────── */

export async function listarCitas(
  supabase: SupabaseClient,
  periodoId: string,
  filtro: { curps?: readonly string[]; estado?: EstadoCita } = {},
): Promise<CitaRow[]> {
  let q = supabase.from(TABLA_CITAS).select("*").eq("periodo_id", periodoId);
  // `curps` acota al alcance del tutor: sus vinculados, no todos. La lista la
  // calcula la action; aquí solo se aplica.
  if (filtro.curps) q = q.in("curp", [...filtro.curps]);
  if (filtro.estado) q = q.eq("estado", filtro.estado);
  const { data, error } = await q.order("propuesta_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as CitaRow[];
}

export async function solicitarCita(
  supabase: SupabaseClient,
  c: {
    periodoId: string;
    curp: string;
    solicitadaPor: "alumno" | "tutor" | "directivo";
    motivo: string | null;
    propuestaAt: string;
  },
): Promise<Resultado<CitaRow>> {
  const { data, error } = await supabase
    .from(TABLA_CITAS)
    .insert({
      periodo_id: c.periodoId,
      curp: c.curp,
      solicitada_por: c.solicitadaPor,
      motivo: c.motivo,
      propuesta_at: c.propuestaAt,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: data as CitaRow };
}

/**
 * Cambiar el estado de una cita. La transición la valida el módulo PURO, no un
 * `if` aquí: así la regla se prueba sin base y no hay dos copias.
 */
export async function cambiarEstadoCita(
  supabase: SupabaseClient,
  id: string,
  hasta: EstadoCita,
  quien: number | null,
  nota: string | null = null,
): Promise<Resultado<true>> {
  const { data: actual } = await supabase
    .from(TABLA_CITAS)
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { ok: false, error: "La cita no existe." };
  const desde = (actual as { estado: EstadoCita }).estado;
  if (!puedeTransicionarCita(desde, hasta)) {
    return { ok: false, error: `Una cita «${desde}» no puede pasar a «${hasta}».` };
  }
  const { error } = await supabase
    .from(TABLA_CITAS)
    .update({
      estado: hasta,
      atendida_por: quien,
      nota_cierre: nota,
      actualizado_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/* ── Constancias ───────────────────────────────────────────────────────── */

export async function listarConstancias(
  supabase: SupabaseClient,
  periodoId: string,
  filtro: { curps?: readonly string[]; estado?: EstadoConstancia } = {},
): Promise<ConstanciaRow[]> {
  let q = supabase.from(TABLA_CONSTANCIAS).select("*").eq("periodo_id", periodoId);
  if (filtro.curps) q = q.in("curp", [...filtro.curps]);
  if (filtro.estado) q = q.eq("estado", filtro.estado);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ConstanciaRow[];
}

export async function solicitarConstancia(
  supabase: SupabaseClient,
  c: { periodoId: string; curp: string; tipo: string; observaciones: string | null },
): Promise<Resultado<ConstanciaRow>> {
  const { data, error } = await supabase
    .from(TABLA_CONSTANCIAS)
    .insert({
      periodo_id: c.periodoId,
      curp: c.curp,
      tipo: c.tipo,
      observaciones: c.observaciones,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: data as ConstanciaRow };
}

export async function cambiarEstadoConstancia(
  supabase: SupabaseClient,
  id: string,
  hasta: EstadoConstancia,
  quien: number | null,
  rutaStorage: string | null = null,
): Promise<Resultado<true>> {
  const { data: actual } = await supabase
    .from(TABLA_CONSTANCIAS)
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { ok: false, error: "La solicitud no existe." };
  const desde = (actual as { estado: EstadoConstancia }).estado;
  if (!puedeTransicionarConstancia(desde, hasta)) {
    return { ok: false, error: `Una solicitud «${desde}» no puede pasar a «${hasta}».` };
  }
  const parche: Record<string, unknown> = {
    estado: hasta,
    resuelta_por: quien,
    resuelta_at: new Date().toISOString(),
  };
  if (rutaStorage) parche.ruta_storage = rutaStorage;
  const { error } = await supabase.from(TABLA_CONSTANCIAS).update(parche).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/* ── Buzón ─────────────────────────────────────────────────────────────── */

export async function listarBuzon(
  supabase: SupabaseClient,
  tipo: TipoBuzon | null = null,
): Promise<BuzonRow[]> {
  let q = supabase.from(TABLA_BUZON).select("*");
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []) as BuzonRow[];
}

/**
 * `curp` puede ir en null y es DELIBERADO: el buzón admite mensajes anónimos.
 * Una queja que obliga a identificarse deja de recibir las quejas que importan.
 */
export async function enviarAlBuzon(
  supabase: SupabaseClient,
  m: {
    periodoId: string | null;
    tipo: TipoBuzon;
    remitente: "alumno" | "tutor";
    curp: string | null;
    mensaje: string;
  },
): Promise<Resultado<true>> {
  const { error } = await supabase.from(TABLA_BUZON).insert({
    periodo_id: m.periodoId,
    tipo: m.tipo,
    remitente: m.remitente,
    curp: m.curp,
    mensaje: m.mensaje,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

export async function marcarBuzonLeido(
  supabase: SupabaseClient,
  id: string,
  quien: number | null,
): Promise<Resultado<true>> {
  const { error } = await supabase
    .from(TABLA_BUZON)
    .update({ leido_at: new Date().toISOString(), atendido_por: quien })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}
