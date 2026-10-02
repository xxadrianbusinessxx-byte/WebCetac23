/**
 * agenda-citas-puro.ts — MÓDULO PURO. La agenda de citas de la dirección: en qué
 * días y horas recibe citas, y si un hueco concreto se puede pedir. Cero I/O.
 *
 * ── Una sola regla, dos usos ───────────────────────────────────────────────
 * La lista de huecos que ve el tutor (`huecosDisponibles`) y la comprobación que
 * hace el servidor al guardar (`validarSolicitudCita`) son LA MISMA regla: la
 * primera se construye filtrando con la segunda. Si fueran dos copias, el día que
 * una cambiara el tutor vería huecos que el servidor rechaza —o al revés—. La
 * suite lo afirma como propiedad: todo hueco ofrecido es válido.
 *
 * ── Fechas y horas ─────────────────────────────────────────────────────────
 * Todo es LOCAL del plantel: «YYYY-MM-DD» y «HH:MM». `hoy` se RECIBE (no se lee
 * del reloj) para que la suite sea estable; quien llama lo calcula con
 * `hoyEnElPlantel`. Las fechas se suman con aritmética de calendario en UTC, sin
 * depender de la zona del servidor. Pasar de aquí a `citas.propuesta_at` es
 * `instanteDelPlantel` (hora-plantel-puro).
 *
 * Reutiliza, no reescribe: el día de la semana de una fecha y su vocabulario son
 * los de `ciclo/calendario.ts` (los mismos que `horario_semanal`), y las horas se
 * leen con los helpers de `horario-semanal-puro.ts`.
 */
import { DIAS_SEMANA, diaSemanaDesdeFecha, type DiaSemana } from "../ciclo/calendario.ts";
import { horaAMinutos, minutosAHora } from "../horario/horario-semanal-puro.ts";

/* ── Tipos ─────────────────────────────────────────────────────────────── */

/** Un tramo del horario semanal de atención. Las horas, «HH:MM» del plantel. */
export type Franja = {
  id?: string;
  dia_semana: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  duracion_min: number;
};

export type DiaBloqueado = { fecha: string; motivo: string | null };

/** Un hueco pedible: el inicio de una cita. */
export type Hueco = { fecha: string; hora: string };

/**
 * Lo que hace falta para decidir. `ocupados` son claves `claveHueco()` de las
 * citas que siguen ocupando su hora (pendiente o aceptada).
 */
export type AgendaCitas = {
  franjas: readonly Franja[];
  bloqueados: ReadonlySet<string>;
  ocupados: ReadonlySet<string>;
};

export type Validacion = { ok: true } | { ok: false; error: string };

/* ── Constantes ────────────────────────────────────────────────────────── */

/** Las mismas que el CHECK de `citas_franjas.duracion_min`. */
export const DURACIONES_CITA = [15, 20, 30, 45, 60] as const;

/** Hasta dónde se puede pedir: más lejos es una fecha que nadie va a recordar. */
export const DIAS_MAXIMOS_CITA = 30;

/** Hasta dónde se puede bloquear un día. Un año cubre el ciclo y las vacaciones. */
export const DIAS_MAXIMOS_BLOQUEO = 365;

/** Rótulos para la pantalla: el vocabulario guardado va sin acentos. */
export const NOMBRE_DIA: Readonly<Record<DiaSemana, string>> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  domingo: "domingo",
};

export const SIN_AGENDA = "La dirección todavía no ha publicado su horario de citas.";
export const HUECO_OCUPADO = "Ese horario ya está ocupado. Elige otro.";

/* ── Fechas ────────────────────────────────────────────────────────────── */

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^\d{2}:\d{2}$/;

/** ¿«YYYY-MM-DD» y además una fecha que existe? */
export function esFechaValida(fecha: string): boolean {
  const m = RE_FECHA.exec(fecha);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** `fecha` + `n` días, en calendario (sin zona horaria). */
export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const r = new Date(Date.UTC(y, m - 1, d + n));
  return `${r.getUTCFullYear()}-${String(r.getUTCMonth() + 1).padStart(2, "0")}-${String(r.getUTCDate()).padStart(2, "0")}`;
}

/** Desde mañana hasta `hoy + dias`, ambos incluidos. */
export function rangoDeSolicitud(hoy: string, dias = DIAS_MAXIMOS_CITA): { desde: string; hasta: string } {
  return { desde: sumarDias(hoy, 1), hasta: sumarDias(hoy, dias) };
}

export function claveHueco(h: Hueco): string {
  return `${h.fecha} ${h.hora}`;
}

function esDiaSemana(v: string): v is DiaSemana {
  return (DIAS_SEMANA as readonly string[]).includes(v);
}

function esDuracionValida(n: number): boolean {
  return (DURACIONES_CITA as readonly number[]).includes(n);
}

/* ── Franjas ───────────────────────────────────────────────────────────── */

/**
 * ¿Se puede guardar esta franja junto a las que ya hay? Formato, orden de horas,
 * duración permitida, que quepa al menos una cita y que NO se cruce con otra del
 * mismo día (dos franjas solapadas ofrecerían el mismo hueco dos veces). Una
 * franja con el mismo `id` no se compara consigo misma.
 */
export function validarFranja(f: Franja, existentes: readonly Franja[]): Validacion {
  if (!esDiaSemana(f.dia_semana)) return { ok: false, error: "Elige el día de la semana." };
  const ini = RE_HORA.test(f.hora_inicio) ? horaAMinutos(f.hora_inicio) : null;
  const fin = RE_HORA.test(f.hora_fin) ? horaAMinutos(f.hora_fin) : null;
  if (ini === null || fin === null) return { ok: false, error: "Indica la hora de inicio y la de fin." };
  if (fin <= ini) return { ok: false, error: "La hora de fin tiene que ser posterior a la de inicio." };
  if (!esDuracionValida(f.duracion_min)) return { ok: false, error: "Elige la duración de cada cita." };
  if (fin - ini < f.duracion_min) {
    return { ok: false, error: `En ese horario no cabe ni una cita de ${f.duracion_min} minutos.` };
  }
  for (const otra of existentes) {
    if (otra.dia_semana !== f.dia_semana || (f.id && otra.id === f.id)) continue;
    const oIni = horaAMinutos(otra.hora_inicio);
    const oFin = horaAMinutos(otra.hora_fin);
    if (oIni === null || oFin === null) continue;
    if (ini < oFin && oIni < fin) {
      return {
        ok: false,
        error: `Se cruza con el horario del ${NOMBRE_DIA[f.dia_semana]} de ${otra.hora_inicio} a ${otra.hora_fin}.`,
      };
    }
  }
  return { ok: true };
}

/** Los inicios de cita de una franja: inicio, inicio + duración… mientras quepa entera. */
export function huecosDeFranja(f: Franja): string[] {
  const ini = horaAMinutos(f.hora_inicio);
  const fin = horaAMinutos(f.hora_fin);
  if (ini === null || fin === null || !esDuracionValida(f.duracion_min)) return [];
  const horas: string[] = [];
  for (let t = ini; t + f.duracion_min <= fin; t += f.duracion_min) horas.push(minutosAHora(t));
  return horas;
}

/** Las franjas de un día de la semana, por hora de inicio. */
export function franjasDelDia(franjas: readonly Franja[], dia: DiaSemana): Franja[] {
  return franjas
    .filter((f) => f.dia_semana === dia)
    .sort((a, b) => (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0));
}

/* ── Días bloqueados ───────────────────────────────────────────────────── */

/** Se puede bloquear desde hoy (avisar tarde es mejor que no avisar) hasta un año. */
export function validarDiaBloqueado(fecha: string, hoy: string): Validacion {
  if (!esFechaValida(fecha)) return { ok: false, error: "Elige una fecha válida." };
  if (fecha < hoy) return { ok: false, error: "No se puede bloquear un día que ya pasó." };
  if (fecha > sumarDias(hoy, DIAS_MAXIMOS_BLOQUEO)) {
    return { ok: false, error: "Solo se pueden bloquear días del próximo año." };
  }
  return { ok: true };
}

/* ── La regla: ¿se puede pedir este hueco? ─────────────────────────────── */

/**
 * La ÚNICA respuesta a «¿se puede pedir una cita aquí?». Cada rechazo con su
 * motivo, en el orden en que se lo diría una persona: primero si hay agenda,
 * luego el día, luego la hora, y al final si alguien se adelantó.
 */
export function validarSolicitudCita(hueco: Hueco, agenda: AgendaCitas, hoy: string): Validacion {
  if (agenda.franjas.length === 0) return { ok: false, error: SIN_AGENDA };
  if (!esFechaValida(hueco.fecha) || !RE_HORA.test(hueco.hora)) {
    return { ok: false, error: "Elige el día y la hora de la cita." };
  }
  const { desde, hasta } = rangoDeSolicitud(hoy);
  if (hueco.fecha < desde) return { ok: false, error: "La cita tiene que ser a partir de mañana." };
  if (hueco.fecha > hasta) {
    return { ok: false, error: `La cita no puede ser a más de ${DIAS_MAXIMOS_CITA} días.` };
  }
  if (agenda.bloqueados.has(hueco.fecha)) return { ok: false, error: "La dirección no atiende citas ese día." };
  const dia = diaSemanaDesdeFecha(hueco.fecha);
  const delDia = franjasDelDia(agenda.franjas, dia);
  if (delDia.length === 0) return { ok: false, error: `La dirección no atiende citas los ${NOMBRE_DIA[dia]}.` };
  if (!delDia.some((f) => huecosDeFranja(f).includes(hueco.hora))) {
    return { ok: false, error: "Esa hora está fuera del horario de citas." };
  }
  if (agenda.ocupados.has(claveHueco(hueco))) return { ok: false, error: HUECO_OCUPADO };
  return { ok: true };
}

/**
 * Los huecos que se pueden pedir, de mañana a `hoy + 30`, en orden. Se construye
 * CON `validarSolicitudCita`: genera los candidatos de cada día y deja pasar solo
 * los que esa regla acepta. Así no hay una segunda versión de la regla.
 */
export function huecosDisponibles(agenda: AgendaCitas, hoy: string): Hueco[] {
  if (agenda.franjas.length === 0) return [];
  const { desde } = rangoDeSolicitud(hoy);
  const huecos: Hueco[] = [];
  for (let i = 0; i < DIAS_MAXIMOS_CITA; i++) {
    const fecha = sumarDias(desde, i);
    const horas = new Set(franjasDelDia(agenda.franjas, diaSemanaDesdeFecha(fecha)).flatMap(huecosDeFranja));
    for (const hora of [...horas].sort()) {
      const h = { fecha, hora };
      if (validarSolicitudCita(h, agenda, hoy).ok) huecos.push(h);
    }
  }
  return huecos;
}
