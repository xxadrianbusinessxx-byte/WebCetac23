import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TABLA_CALENDARIO_ESCOLAR,
  TIPOS_DIA_CALENDARIO,
  type TipoDiaCalendario,
} from "./tables";

/**
 * Dominio del CALENDARIO ESCOLAR (Bloque 5A).
 *
 * El calendario es la FUENTE DE VERDAD para saber qué días son días válidos de
 * clase. La plantilla de asistencias del profesor (bloque posterior) consultará
 * `calendario_escolar WHERE tipo = 'clase'` para generar sus fechas.
 *
 * Estrategia de almacenamiento:
 *  - Solo se persisten los días LUNES A VIERNES del rango del ciclo (los días
 *    candidatos a clase). NO se insertan sábados ni domingos.
 *  - El día por defecto de un día laborable es `clase`.
 *  - Las excepciones (festivo, mantenimiento, descanso) se guardan con su tipo
 *    y una descripción opcional.
 *  - Todo se escribe mediante UPSERT sobre la UNIQUE (ciclo_escolar, fecha),
 *    de modo que modificar un día nunca crea duplicados.
 */

export type DiaCalendarioRow = {
  id: string;
  ciclo_escolar: string;
  fecha: string;
  tipo: TipoDiaCalendario;
  descripcion: string | null;
  creado_por: string | null;
  created_at: string | null;
};

const SELECT_DIA =
  "id, ciclo_escolar, fecha, tipo, descripcion, creado_por, created_at";

/** Normaliza un ciclo escolar (ej. "2026-2027") a mayúsculas y sin espacios. */
export function normalizarCicloEscolar(ciclo: string): string {
  return ciclo.trim().toUpperCase();
}

/** Valida que un valor sea un tipo de día permitido. */
export function esTipoDiaCalendario(valor: unknown): valor is TipoDiaCalendario {
  return (
    typeof valor === "string" &&
    (TIPOS_DIA_CALENDARIO as readonly string[]).includes(valor)
  );
}

/** Convierte una fecha a string ISO `YYYY-MM-DD` (sin hora). */
export function fechaISO(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ¿Es día laborable (lunes a viernes)? */
export function esDiaLaborable(fecha: Date): boolean {
  const dia = fecha.getDay();
  return dia >= 1 && dia <= 5;
}

/** Días de la semana (lunes = 0 … domingo = 6). */
export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/**
 * Devuelve el día de la semana real de una fecha ISO `YYYY-MM-DD`.
 *
 * IMPORTANTE (zona horaria): se construye un Date local a partir de los
 * componentes de la fecha (año, mes, día) en lugar de `new Date("YYYY-MM-DD")`,
 * que se interpreta como UTC y puede desplazar el día en zonas negativas.
 * Así `2026-09-07` SIEMPRE es lunes, sin importar la zona horaria del servidor.
 */
export function diaSemanaDesdeFecha(fechaISOStr: string): DiaSemana {
  const [anio, mes, dia] = fechaISOStr.split("-").map(Number);
  const fecha = new Date(anio, (mes ?? 1) - 1, dia ?? 1);
  const idx = fecha.getDay(); // 0 = domingo … 6 = sábado
  // getDay(): 0=domingo,1=lunes,...,6=sábado → mapear a DIAS_SEMANA (lunes=0).
  const lunesBase = (idx + 6) % 7;
  return DIAS_SEMANA[lunesBase] ?? "lunes";
}


/**
 * Genera la lista de fechas laborables (lunes a viernes) entre dos fechas
 * (inclusive). Devuelve strings ISO `YYYY-MM-DD`. No incluye sábados/domingos.
 */
export function generarDiasLaborables(inicio: Date, fin: Date): string[] {
  const dias: string[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const ultimo = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

  if (cursor.getTime() > ultimo.getTime()) return dias;

  while (cursor.getTime() <= ultimo.getTime()) {
    if (esDiaLaborable(cursor)) dias.push(fechaISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/** Cuenta cuántos días laborables (lunes a viernes) hay en un rango. */
export function contarDiasLaborables(inicio: Date, fin: Date): number {
  return generarDiasLaborables(inicio, fin).length;
}

/** Lista los ciclos escolares distintos que ya existen en el calendario. */
export async function listarCiclosEscolares(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLA_CALENDARIO_ESCOLAR)
    .select("ciclo_escolar")
    .order("ciclo_escolar", { ascending: false });

  if (error || !data) return [];

  const unicos = new Set<string>();
  for (const fila of data as { ciclo_escolar: string }[]) {
    const c = normalizarCicloEscolar(fila.ciclo_escolar);
    if (c) unicos.add(c);
  }
  return [...unicos];
}

/** Obtiene todos los días registrados de un ciclo escolar. */
export async function obtenerCalendarioEscolar(
  supabase: SupabaseClient,
  ciclo: string,
): Promise<DiaCalendarioRow[]> {
  const cicloNorm = normalizarCicloEscolar(ciclo);
  if (!cicloNorm) return [];

  const { data, error } = await supabase
    .from(TABLA_CALENDARIO_ESCOLAR)
    .select(SELECT_DIA)
    .eq("ciclo_escolar", cicloNorm)
    .order("fecha", { ascending: true });

  if (error || !data) return [];
  return data as DiaCalendarioRow[];
}

/**
 * Guarda (UPSERT) un día del calendario. Si ya existe la combinación
 * (ciclo_escolar, fecha), actualiza el mismo registro; nunca crea duplicados.
 */
export async function guardarDiaCalendario(
  supabase: SupabaseClient,
  input: {
    ciclo: string;
    fecha: string;
    tipo: TipoDiaCalendario;
    descripcion?: string | null;
    creadoPor?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ciclo = normalizarCicloEscolar(input.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar válido." };
  if (!esTipoDiaCalendario(input.tipo)) {
    return { ok: false, error: "El tipo de día no es válido." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    return { ok: false, error: "La fecha no es válida." };
  }

  const descripcion = input.descripcion?.trim() || null;

  const { error } = await supabase
    .from(TABLA_CALENDARIO_ESCOLAR)
    .upsert(
      {
        ciclo_escolar: ciclo,
        fecha: input.fecha,
        tipo: input.tipo,
        descripcion,
        creado_por: input.creadoPor?.trim() || null,
      },
      { onConflict: "ciclo_escolar,fecha" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Elimina un día del calendario (para volver a dejarlo sin registro explícito).
 * Útil si el directivo quiere revertir una excepción.
 */
export async function eliminarDiaCalendario(
  supabase: SupabaseClient,
  ciclo: string,
  fecha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cicloNorm = normalizarCicloEscolar(ciclo);
  if (!cicloNorm) return { ok: false, error: "Indica un ciclo escolar válido." };

  const { error } = await supabase
    .from(TABLA_CALENDARIO_ESCOLAR)
    .delete()
    .eq("ciclo_escolar", cicloNorm)
    .eq("fecha", fecha);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Establece la base del calendario: marca todos los días laborables
 * (lunes a viernes) del rango como `clase`, mediante UPSERT. No toca los días
 * que ya tengan un tipo distinto (festivo/mantenimiento/descanso) para no
 * pisar excepciones ya configuradas.
 */
export async function establecerCalendarioBase(
  supabase: SupabaseClient,
  input: {
    ciclo: string;
    inicio: string;
    fin: string;
    creadoPor?: string | null;
  },
): Promise<{ ok: true; generados: number } | { ok: false; error: string }> {
  const ciclo = normalizarCicloEscolar(input.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar válido." };

  const inicio = new Date(`${input.inicio}T00:00:00`);
  const fin = new Date(`${input.fin}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return { ok: false, error: "El rango de fechas no es válido." };
  }
  if (inicio.getTime() > fin.getTime()) {
    return { ok: false, error: "La fecha inicial no puede ser posterior a la final." };
  }

  const dias = generarDiasLaborables(inicio, fin);
  if (dias.length === 0) {
    return { ok: false, error: "El rango no contiene días laborables." };
  }

  // Cargar los días ya existentes del ciclo para no pisar excepciones.
  const existentes = await obtenerCalendarioEscolar(supabase, ciclo);
  const porFecha = new Map(existentes.map((d) => [d.fecha, d]));

  const filas = dias
    .filter((fecha) => {
      const existente = porFecha.get(fecha);
      // Si ya existe y NO es "clase", respetar la excepción configurada.
      return !existente || existente.tipo === "clase";
    })
    .map((fecha) => ({
      ciclo_escolar: ciclo,
      fecha,
      tipo: "clase" as TipoDiaCalendario,
      descripcion: null,
      creado_por: input.creadoPor?.trim() || null,
    }));

  if (filas.length === 0) {
    return { ok: true, generados: 0 };
  }

  const { error } = await supabase
    .from(TABLA_CALENDARIO_ESCOLAR)
    .upsert(filas, { onConflict: "ciclo_escolar,fecha" });

  if (error) return { ok: false, error: error.message };
  return { ok: true, generados: filas.length };
}
