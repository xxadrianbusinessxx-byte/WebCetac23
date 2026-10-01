/**
 * evaluaciones-puro.ts — MÓDULO PURO de `evaluaciones.ts`.
 *
 * Exports sin `async` de FASE CICLO: validación de fechas, rangos,
 * solapamientos, validación de entrada y resolución local fecha→(ciclo,parcial).
 * Cero imports: no toca Supabase ni nada externo.
 *
 * Movido desde `evaluaciones.ts` (PROMPT Q · Parte 1 · R-1) tal cual;
 * `evaluaciones.ts` re-exporta todo para que ningún import cambie de ruta.
 */

export type PeriodoEscolarRow = {
  id: string;
  nombre: string;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PeriodoEvaluacionRow = {
  id: string;
  periodo_id: string;
  numero: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Resultado de la resolución de una fecha contra ciclo y parcial. */
export type FechaCicloEvaluacion = {
  periodo: PeriodoEscolarRow;
  /** null = la fecha pertenece al ciclo pero no a ningún parcial activo. */
  evaluacion: PeriodoEvaluacionRow | null;
};

/* ---------------------------------------------------------------------------
 * VALIDACIÓN DE FECHAS (solo fechas YYYY-MM-DD; comparación lexicográfica
 * segura e independiente de la zona horaria del servidor)
 * ------------------------------------------------------------------------- */

const ISO_FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  if (!ISO_FECHA_RE.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const fecha = new Date(a ?? 0, (m ?? 1) - 1, d ?? 1);
  return (
    fecha.getFullYear() === a &&
    fecha.getMonth() + 1 === m &&
    fecha.getDate() === d
  );
}

export function normalizarFechaEvaluacion(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return esFechaISO(v) ? v : null;
}

/** ¿Una fecha pertenece al rango [fecha_inicio, fecha_fin] (inclusive)? */
export function evaluacionContieneFecha(
  evaluacion: Pick<PeriodoEvaluacionRow, "fecha_inicio" | "fecha_fin">,
  fecha: string,
): boolean {
  return fecha >= evaluacion.fecha_inicio && fecha <= evaluacion.fecha_fin;
}

/** ¿El ciclo (con rango definido) contiene la fecha? Sin rango → false. */
export function cicloContieneFecha(
  periodo: Pick<PeriodoEscolarRow, "fecha_inicio" | "fecha_fin">,
  fecha: string,
): boolean {
  if (!periodo.fecha_inicio || !periodo.fecha_fin) return false;
  return fecha >= periodo.fecha_inicio && fecha <= periodo.fecha_fin;
}

/** ¿Dos rangos inclusive de fechas se solapan? */

/* ---------------------------------------------------------------------------
 * VALIDACIÓN PURA DE ENTRADA (reutilizada por UI y Server Actions)
 * ------------------------------------------------------------------------- */

export type InputEvaluacion = {
  numero: number | string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo?: boolean;
};

export type ResultadoValidacionEvaluacion =
  | {
      ok: true;
      valor: {
        numero: number;
        nombre: string;
        fechaInicio: string;
        fechaFin: string;
        activo: boolean;
      };
    }
  | { ok: false; errores: string[] };

export function validarInputEvaluacion(
  input: InputEvaluacion,
): ResultadoValidacionEvaluacion {
  const errores: string[] = [];
  const numeroNum = Number(input.numero);
  if (!Number.isInteger(numeroNum) || numeroNum < 1) {
    errores.push("El número de parcial debe ser un entero >= 1.");
  }
  const nombre = (input.nombre ?? "").trim();
  if (!nombre) errores.push("Indica el nombre del parcial.");
  else if (nombre.length > 80) errores.push("El nombre no puede superar 80 caracteres.");
  const fechaInicio = normalizarFechaEvaluacion(input.fechaInicio);
  const fechaFin = normalizarFechaEvaluacion(input.fechaFin);
  if (!fechaInicio) errores.push("Fecha de inicio inválida (usa YYYY-MM-DD).");
  if (!fechaFin) errores.push("Fecha de cierre inválida (usa YYYY-MM-DD).");
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    errores.push("La fecha de cierre no puede ser anterior a la de inicio.");
  }
  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    valor: {
      numero: numeroNum,
      nombre,
      fechaInicio: fechaInicio!,
      fechaFin: fechaFin!,
      activo: input.activo !== false,
    },
  };
}

/** ¿Dos rangos inclusive de fechas se solapan? */
export function rangosSeSolapan(
  a: { fecha_inicio: string; fecha_fin: string },
  b: { fecha_inicio: string; fecha_fin: string },
): boolean {
  return a.fecha_fin >= b.fecha_inicio && b.fecha_fin >= a.fecha_inicio;
}

/** Otras evaluaciones del MISMO ciclo que se solapan con el rango propuesto. */
export function evaluacionesEnConflicto(
  rango: { fechaInicio: string; fechaFin: string },
  otras: Array<
    Pick<PeriodoEvaluacionRow, "id" | "numero" | "nombre" | "fecha_inicio" | "fecha_fin">
  >,
  ignorarId?: string,
): Array<Pick<PeriodoEvaluacionRow, "id" | "numero" | "nombre" | "fecha_inicio" | "fecha_fin">> {
  const otrosRango = {
    fecha_inicio: rango.fechaInicio,
    fecha_fin: rango.fechaFin,
  };
  return otras.filter((o) => {
    if (ignorarId && o.id === ignorarId) return false;
    return rangosSeSolapan(otrosRango, o);
  });
}

/* ---------------------------------------------------------------------------
 * RESOLUCIÓN PURA POR FECHA (compartida con las pruebas sin Supabase)
 * ------------------------------------------------------------------------- */

/** Parcial (activo) que contiene la fecha; null si no hay. */
export function resolverEvaluacionPorFechaLocal(
  fecha: string,
  evaluaciones: PeriodoEvaluacionRow[],
): PeriodoEvaluacionRow | null {
  for (const e of evaluaciones) {
    if (e.activo === false) continue;
    if (evaluacionContieneFecha(e, fecha)) return e;
  }
  return null;
}

/**
 * Resuelve fecha → (ciclo, parcial) sin base de datos.
 *
 * Regla determinista:
 *   1) Si existe un ciclo con RANGO explícito que contiene la fecha, ese es el
 *      ciclo; el parcial se busca dentro de ese ciclo.
 *   2) Si ningún ciclo tiene rango que la contenga, se acepta un ciclo cuyo
 *      PARCIAL contenga la fecha (permite operar ciclos sin rango definido).
 *   3) Se prefiere un ciclo ACTIVO; en caso de empate se usa el primero del
 *      arreglo (el flujo real mantiene un único ciclo activo).
 */
export function resolverCicloEvaluacionLocal(
  fecha: string,
  periodos: PeriodoEscolarRow[],
  evaluacionesPorPeriodo: Map<string, PeriodoEvaluacionRow[]>,
): FechaCicloEvaluacion | null {
  const activos = periodos.filter((p) => p.activo);
  const todos = periodos.filter((p) => !p.activo);

  const elegirPeriodo = (
    candidatos: PeriodoEscolarRow[],
  ): PeriodoEscolarRow | null => {
    if (candidatos.length === 0) return null;
    return candidatos[0]!;
  };

  // 1) Ciclos con rango que contienen la fecha.
  const conRango = [...activos, ...todos].filter((p) => cicloContieneFecha(p, fecha));
  const periodoBase = elegirPeriodo(conRango);

  if (periodoBase) {
    const evaluacion =
      resolverEvaluacionPorFechaLocal(
        fecha,
        evaluacionesPorPeriodo.get(periodoBase.id) ?? [],
      ) ?? null;
    return { periodo: periodoBase, evaluacion };
  }

  // 2) Ciclos sin rango cuyo parcial contiene la fecha (solo parciales activos).
  const conParcial = [...activos, ...todos].filter((p) => {
    const evals = evaluacionesPorPeriodo.get(p.id) ?? [];
    return evals.some((e) => e.activo !== false && evaluacionContieneFecha(e, fecha));
  });
  const periodoParcial = elegirPeriodo(conParcial);
  if (!periodoParcial) return null;
  const evaluacion = resolverEvaluacionPorFechaLocal(
    fecha,
    evaluacionesPorPeriodo.get(periodoParcial.id) ?? [],
  );
  return { periodo: periodoParcial, evaluacion };
}

/** Ordena parciales por numero de forma estable. */
export function ordenarEvaluacionesPorNumero<T extends { numero: number }>(
  filas: T[],
): T[] {
  return [...filas].sort((a, b) => a.numero - b.numero);
}
