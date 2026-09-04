/**
 * Dominio puro POR PARCIAL de las asistencias (ciclo global + parciales).
 *
 * Funciones 100% PURAS: no reciben Supabase ni hacen I/O. Operan sobre
 * estructuras mínimas (`fecha`, `tipo`, `estado`) y devuelven resultados
 * deterministas, de modo que `scripts/test-asistencia-parciales.mjs` compila y
 * corre sin red ni base de datos.
 *
 * Reglas (mismo criterio que `lib/escolar/evaluaciones.ts`, FASE CICLO):
 *  - El parcial (periodos_evaluacion) pertenece a UN periodo; su rango es
 *    INCLUSIVO en ambos extremos.
 *  - Una fecha NUNCA se asigna "a ojo": si cae fuera de todo parcial queda
 *    etiquetada `sin_parcial` (nunca se le inventa un parcial). Si cae en DOS
 *    o mas parciales activos (datos anomalos solapados) se reporta `conflicto`
 *    y no se elige uno al azar.
 *  - El resumen por parcial deja los PENDIENTES fuera del denominador
 *    (asistencias / (asistencias + faltas)), igual que
 *    `calcularPorcentajeAsistencia` de asistencias.ts.
 */

/** Subconjunto mínimo de `periodos_evaluacion` que este módulo necesita. */
export type ParcialAsistencia = {
  id: string;
  numero: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo?: boolean;
};

/** Día de asistencia derivado (subconjunto de `DiaEstadoAsistencia`). */
export type DiaResumenAsistencia = {
  fecha: string;
  /** 'clase' o excepción (festivo/mantenimiento/descanso). */
  tipo: string;
  /** 'asistio' | 'falta' | 'pendiente' | 'sin_clase'. */
  estado: string;
};

/** Identidad mínima de un parcial para mensajes y agrupación. */
export type ParcialIdResumen = {
  id: string;
  numero: number;
  nombre: string;
};

/** Resultado de etiquetar una fecha contra la lista de parciales. */
export type EtiquetaParcial =
  | { caso: "en_parcial"; parcial: ParcialIdResumen }
  | { caso: "sin_parcial" }
  | { caso: "conflicto"; parciales: ParcialIdResumen[] };

/** ¿`fecha` cae en el rango inclusivo del parcial? (comparación ISO lexicográfica). */
export function fechaDentroDeParcial(
  parcial: Pick<ParcialAsistencia, "fecha_inicio" | "fecha_fin">,
  fecha: string,
): boolean {
  return fecha >= parcial.fecha_inicio && fecha <= parcial.fecha_fin;
}

/** Solo parciales activos (por defecto `activo !== false`). */
export function parcialesActivos(
  parciales: ParcialAsistencia[],
): ParcialAsistencia[] {
  return parciales.filter((p) => p.activo !== false);
}

/**
 * Filtra días cuyo `fecha` cae en el rango del parcial (bordes inclusive).
 * La fecha justo fuera del parcial (un día antes o un día después) queda fuera.
 */
export function filtrarDiasDeParcial<T extends { fecha: string }>(
  dias: T[],
  parcial: Pick<ParcialAsistencia, "fecha_inicio" | "fecha_fin">,
): T[] {
  return dias.filter((d) => fechaDentroDeParcial(parcial, d.fecha));
}

/**
 * Etiqueta UNA fecha contra los parciales activos.
 *  - `en_parcial`: la contiene UN único parcial activo.
 *  - `sin_parcial`: no cae en ninguno (queda null, nunca se asigna).
 *  - `conflicto`: cae en varios (parciales solapados): se reporta, no se elige.
 */
export function etiquetarFechaConParcial(
  parciales: ParcialAsistencia[],
  fecha: string,
): EtiquetaParcial {
  const activos = parcialesActivos(parciales);
  const resumir = (p: ParcialAsistencia): ParcialIdResumen => ({
    id: p.id,
    numero: p.numero,
    nombre: p.nombre,
  });
  const coinciden = activos.filter((p) => fechaDentroDeParcial(p, fecha));
  if (coinciden.length === 0) return { caso: "sin_parcial" };
  if (coinciden.length > 1) {
    return { caso: "conflicto", parciales: coinciden.map(resumir) };
  }
  return { caso: "en_parcial", parcial: resumir(coinciden[0]!) };
}

export type DiaEtiquetado = { fecha: string; etiqueta: EtiquetaParcial };

/** Etiqueta todos los días (una sola pasada en memoria, sin consultas). */
export function etiquetarDiasConParcial(
  dias: { fecha: string }[],
  parciales: ParcialAsistencia[],
): DiaEtiquetado[] {
  return dias.map((d) => ({
    fecha: d.fecha,
    etiqueta: etiquetarFechaConParcial(parciales, d.fecha),
  }));
}

export type ResumenPorParcial = {
  parcial: {
    id: string;
    numero: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  };
  asistencias: number;
  faltas: number;
  pendientes: number;
  sinClase: number;
  /** % de asistencia solo sobre clases registradas; pendientes fuera del denominador. */
  porcentaje: number;
};

export type ResultadoResumenPorParcial = {
  resumenes: ResumenPorParcial[];
  /** Fechas en parciales solapados (anomalía): se reportan, no se cuentan 2 veces. */
  conflictos: { fecha: string; parciales: ParcialIdResumen[] }[];
  /** Días que no caen en ningún parcial: se listan, nunca se asignan. */
  diasSinParcial: string[];
};

/**
 * Resumen de asistencia POR PARCIAL (derivado, nunca almacenado).
 *
 * - Cada parcial activo recibe una entrada (un parcial sin días de clase
 *   queda en cero, sin lanzar excepción).
 * - Cada día se etiqueta contra los parciales; los conflictos se reportan y
 *   el día no se cuenta en ningún parcial; los días sin parcial se listan.
 */
export function resumenAsistenciaPorParcial(
  dias: DiaResumenAsistencia[],
  parciales: ParcialAsistencia[],
): ResultadoResumenPorParcial {
  const activos = parcialesActivos(parciales).sort((a, b) => a.numero - b.numero);
  const mapa = new Map<string, ResumenPorParcial>();
  for (const p of activos) {
    mapa.set(p.id, {
      parcial: {
        id: p.id,
        numero: p.numero,
        nombre: p.nombre,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
      },
      asistencias: 0,
      faltas: 0,
      pendientes: 0,
      sinClase: 0,
      porcentaje: 0,
    });
  }

  const conflictos: ResultadoResumenPorParcial["conflictos"] = [];
  const diasSinParcial: string[] = [];
  for (const d of dias) {
    const etiqueta = etiquetarFechaConParcial(activos, d.fecha);
    if (etiqueta.caso === "sin_parcial") {
      diasSinParcial.push(d.fecha);
      continue;
    }
    if (etiqueta.caso === "conflicto") {
      conflictos.push({ fecha: d.fecha, parciales: etiqueta.parciales });
      continue;
    }
    const r = mapa.get(etiqueta.parcial.id);
    if (!r) continue;
    if (d.estado === "asistio") r.asistencias++;
    else if (d.estado === "falta") r.faltas++;
    else if (d.estado === "pendiente") r.pendientes++;
    else r.sinClase++;
  }

  const resumenes = [...mapa.values()].map((r) => {
    const total = r.asistencias + r.faltas;
    return {
      ...r,
      porcentaje: total === 0 ? 0 : Math.round((r.asistencias / total) * 100),
    };
  });

  return { resumenes, conflictos, diasSinParcial };
}
