/**
 * actividades-puro.ts — MÓDULO PURO. El estado de una actividad y su peso.
 * Cero I/O.
 *
 * ── La decisión que este módulo protege ────────────────────────────────────
 * El estado ACTIVA / VENCIDA **no se guarda en la base**, se DERIVA de la fecha
 * límite contra el momento en que se mira. Guardarlo habría obligado a un
 * proceso que lo refresque, y entre dos pasadas de ese proceso el dato mentiría:
 * una actividad vencida seguiría diciendo «activa».
 *
 * Como se deriva, `ahora` entra por parámetro y nunca se lee de `Date.now()`
 * aquí dentro. Eso es lo que hace la función probable: sin ese parámetro, la
 * suite tendría que esperar a que pasara el tiempo.
 */

export const ESTADOS_ACTIVIDAD = ["sin-fecha", "activa", "vencida"] as const;
export type EstadoActividad = (typeof ESTADOS_ACTIVIDAD)[number];

export type ActividadFechable = { fecha_limite: string | null };

/**
 * Estado de una actividad en un instante dado.
 *
 * Sin fecha límite NO es «activa para siempre»: es `sin-fecha`, un estado
 * propio. El diseño pinta activa y vencida con colores distintos, y una
 * actividad que nadie fechó no es ninguna de las dos — llamarla activa
 * escondería que a alguien se le olvidó ponerle plazo.
 */
export function estadoActividad(a: ActividadFechable, ahora: Date): EstadoActividad {
  if (!a.fecha_limite) return "sin-fecha";
  const limite = new Date(a.fecha_limite);
  if (Number.isNaN(limite.getTime())) return "sin-fecha";
  return limite.getTime() >= ahora.getTime() ? "activa" : "vencida";
}

/** ¿Se puede entregar todavía? Una vencida no admite entrega. */
export function admiteEntrega(a: ActividadFechable, ahora: Date): boolean {
  return estadoActividad(a, ahora) !== "vencida";
}

/**
 * Reparto de la calificación. Devuelve el total de los pesos declarados.
 *
 * NO fuerza que sumen 100: el profesor puede tener actividades a medio
 * configurar, y bloquearle la pantalla por eso sería peor que enseñarle el
 * total y dejarle decidir. `pesosCuadran` responde si suman, y quien presenta
 * decide qué hacer con la respuesta.
 */
export function totalPesos(actividades: readonly { peso: number | null }[]): number {
  return actividades.reduce((s, a) => s + (a.peso ?? 0), 0);
}

/** Tolerancia de un céntimo: los pesos son `numeric(5,2)` y comparar decimales
 *  con `===` produce falsos negativos. */
export function pesosCuadran(actividades: readonly { peso: number | null }[]): boolean {
  return Math.abs(totalPesos(actividades) - 100) < 0.01;
}

/**
 * Orden de presentación: primero lo que urge.
 *
 * Activas antes que vencidas antes que sin fecha, y dentro de cada grupo por
 * fecha límite ascendente — lo que vence antes, arriba. Es el orden que el
 * diseño insinúa al poner las vencidas en rojo: se mira para actuar.
 */
export function ordenarParaAlumno<T extends ActividadFechable>(
  actividades: readonly T[],
  ahora: Date,
): T[] {
  const rango: Record<EstadoActividad, number> = { activa: 0, vencida: 1, "sin-fecha": 2 };
  return [...actividades].sort((a, b) => {
    const d = rango[estadoActividad(a, ahora)] - rango[estadoActividad(b, ahora)];
    if (d !== 0) return d;
    if (!a.fecha_limite) return 1;
    if (!b.fecha_limite) return -1;
    return a.fecha_limite.localeCompare(b.fecha_limite);
  });
}
