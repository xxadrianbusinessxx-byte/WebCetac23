/**
 * flujos-puro.ts — MÓDULO PURO. Las máquinas de estado de Administración
 * escolar: citas, constancias y reportes. Cero I/O.
 *
 * ── Por qué un módulo puro y no un `if` en la action ───────────────────────
 * Las cuatro pantallas nuevas comparten la misma forma: algo llega
 * `pendiente`, alguien lo acepta o lo rechaza, y termina `finalizada` o
 * `anulada`. Esa decisión —«¿puedo pasar de este estado a este otro?»— no
 * necesita base de datos, así que va aquí y se prueba sin ella (ORDEN.md §3).
 *
 * Si viviera dentro de cada action habría cuatro copias de la misma regla, y
 * divergirían a la primera corrección.
 */

/* ── Citas ─────────────────────────────────────────────────────────────── */

export const ESTADOS_CITA = [
  "pendiente",
  "aceptada",
  "rechazada",
  "finalizada",
  "cancelada",
] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

/**
 * Transiciones permitidas. Un estado que no aparece como clave es TERMINAL.
 *
 * `finalizada` solo se alcanza desde `aceptada`: marcar como finalizada una
 * cita que nadie aceptó sería inventar que ocurrió.
 */
const TRANSICIONES_CITA: Readonly<Partial<Record<EstadoCita, readonly EstadoCita[]>>> = {
  pendiente: ["aceptada", "rechazada", "cancelada"],
  aceptada: ["finalizada", "cancelada"],
};

export function puedeTransicionarCita(desde: EstadoCita, hasta: EstadoCita): boolean {
  return (TRANSICIONES_CITA[desde] ?? []).includes(hasta);
}

export function esEstadoCitaTerminal(e: EstadoCita): boolean {
  return TRANSICIONES_CITA[e] === undefined;
}

/* ── Constancias ───────────────────────────────────────────────────────── */

export const ESTADOS_CONSTANCIA = [
  "pendiente",
  "aceptada",
  "rechazada",
  "entregada",
  "anulada",
] as const;
export type EstadoConstancia = (typeof ESTADOS_CONSTANCIA)[number];

/** `entregada` exige haber pasado por `aceptada`: no se entrega lo que no se
 *  aprobó. Y de `entregada` ya no se sale — el documento está en manos del
 *  alumno y anularlo después no lo recupera. */
const TRANSICIONES_CONSTANCIA: Readonly<Partial<Record<EstadoConstancia, readonly EstadoConstancia[]>>> = {
  pendiente: ["aceptada", "rechazada", "anulada"],
  aceptada: ["entregada", "anulada"],
};

export function puedeTransicionarConstancia(
  desde: EstadoConstancia,
  hasta: EstadoConstancia,
): boolean {
  return (TRANSICIONES_CONSTANCIA[desde] ?? []).includes(hasta);
}

/**
 * Día para recoger una constancia de estudios (2026-09-25). Lo propone quien la
 * pide —alumno o tutor— desde su perfil. Reglas:
 *   · a partir de MAÑANA: el mismo día no da tiempo a prepararla y firmarla;
 *   · de lunes a viernes: el plantel no la entrega en fin de semana;
 *   · como mucho a 60 días: más lejos es una fecha que nadie va a recordar.
 * `hoy` se recibe, no se lee del reloj, para que la prueba sea estable. La fecha
 * llega como «YYYY-MM-DD» (un <input type="date">) y se compara sin zona horaria.
 */
export const DIAS_MAXIMOS_RECOGIDA = 60;

export function validarFechaRecogida(
  fecha: string,
  hoy: Date,
): { ok: true } | { ok: false; error: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return { ok: false, error: "Indica el día en que pasarás a recogerla." };
  const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (dia.getMonth() !== Number(m[2]) - 1) return { ok: false, error: "Esa fecha no existe." };
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diferencia = Math.round((dia.getTime() - base.getTime()) / 86_400_000);
  if (diferencia < 1) return { ok: false, error: "El día para recogerla tiene que ser a partir de mañana." };
  if (diferencia > DIAS_MAXIMOS_RECOGIDA) {
    return { ok: false, error: `El día para recogerla no puede pasar de ${DIAS_MAXIMOS_RECOGIDA} días.` };
  }
  const semana = dia.getDay();
  if (semana === 0 || semana === 6) return { ok: false, error: "Elige un día entre lunes y viernes." };
  return { ok: true };
}

/* ── Reportes disciplinarios ───────────────────────────────────────────── */

export const GRAVEDADES = ["leve", "media", "grave"] as const;
export type Gravedad = (typeof GRAVEDADES)[number];

export function esGravedadValida(v: string): v is Gravedad {
  return (GRAVEDADES as readonly string[]).includes(v);
}

/** Orden para presentar: lo grave primero. No es una jerarquía de permisos,
 *  es de atención. */
const PESO_GRAVEDAD: Record<Gravedad, number> = { grave: 3, media: 2, leve: 1 };

export function compararGravedad(a: Gravedad, b: Gravedad): number {
  return PESO_GRAVEDAD[b] - PESO_GRAVEDAD[a];
}

/**
 * Un reporte anulado no se borra (la tabla no tiene DELETE en su flujo): se
 * marca. Esto responde si YA está anulado, que es lo que la UI necesita para
 * no ofrecer «Anular» dos veces.
 */
export function estaAnulado(r: { anulado_at: string | null }): boolean {
  return r.anulado_at !== null;
}

/* ── Buzón ─────────────────────────────────────────────────────────────── */

export const TIPOS_BUZON = ["queja", "comentario"] as const;
export type TipoBuzon = (typeof TIPOS_BUZON)[number];

export function esTipoBuzonValido(v: string): v is TipoBuzon {
  return (TIPOS_BUZON as readonly string[]).includes(v);
}

/** ¿Está sin leer? La UI marca el punto de color con esto. */
export function sinLeer(m: { leido_at: string | null }): boolean {
  return m.leido_at === null;
}

/* ── Validación compartida ─────────────────────────────────────────────── */

/**
 * Texto de usuario: se recorta y se acota. Devuelve `null` si queda vacío,
 * para que quien llame decida si eso es un error o un campo opcional.
 *
 * El tope existe porque estas cajas las escribe cualquiera: sin él, una queja
 * de 2 MB entra en la base y sale en la pantalla del directivo.
 */
export const LARGO_MAX_TEXTO = 2000;

export function sanearTexto(v: unknown, max = LARGO_MAX_TEXTO): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : null;
}
