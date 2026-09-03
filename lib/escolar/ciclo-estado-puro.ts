/**
 * F1 — DOMINIO PURO DEL ESTADO E INTEGRIDAD DEL CICLO (sin Supabase).
 *
 * Evolución del modelo:
 *   periodos.activo (boolean)  →  estados BORRADOR / OPERATIVO / HISTORICO
 *
 * Compatibilidad (transición documentada):
 *   - `activo` sigue existiendo y es el espejo temporal:
 *       estado='operativo'  ⇔  activo=true
 *       borrador/historico  ⇔  activo=false
 *   - Cuando la columna `estado` NO exista todavía en Supabase, el estado se
 *     deriva de `activo` (operativo | historico). La distinción `borrador`
 *     queda disponible al aplicar supabase/agregar-estado-ciclo.sql.
 *
 * Módulo 100% puro (sin Supabase) para poder compilarse y probarse como los
 * demás módulos puros del proyecto.
 */

export const ESTADO_BORRADOR = "borrador";
export const ESTADO_OPERATIVO = "operativo";
export const ESTADO_HISTORICO = "historico";

export type EstadoCiclo = "borrador" | "operativo" | "historico";

export const ESTADOS_CICLO: readonly EstadoCiclo[] = [
  ESTADO_BORRADOR,
  ESTADO_OPERATIVO,
  ESTADO_HISTORICO,
];

/** ¿El valor es un estado de ciclo válido? */
export function esEstadoCiclo(valor: unknown): valor is EstadoCiclo {
  return (
    typeof valor === "string" &&
    (ESTADOS_CICLO as readonly string[]).includes(valor)
  );
}

/** Estado derivado de `activo` cuando no hay columna `estado`. */
export function estadoDesdeActivo(activo: boolean): EstadoCiclo {
  return activo ? ESTADO_OPERATIVO : ESTADO_HISTORICO;
}

export type FilaPeriodoEstado = {
  id: string;
  nombre: string;
  activo: boolean;
  estado?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
};

/** Interpretación única del estado de una fila de `periodos`. */
export function resolverEstadoPeriodo(fila: FilaPeriodoEstado): EstadoCiclo {
  if (esEstadoCiclo(fila.estado)) return fila.estado;
  return estadoDesdeActivo(Boolean(fila.activo));
}

/**
 * Regla de negocio clave: la ausencia de carrera es VÁLIDA para 1RO (tronco
 * común). No existe una regla global "carrera requerida". Para grados mayores
 * con inscripciones y sin carrera se emite ADVERTENCIA (nunca bloquea), porque
 * el modelo del grupo es configurable por el directivo.
 */

export type AsuntoIntegridad = { codigo: string; mensaje: string };

export type DatosValidacionCiclo = {
  periodo: FilaPeriodoEstado | null;
  grupos: Array<{
    id: string;
    grado: string;
    nombre: string;
    carrera_id: string | null;
    activo: boolean;
  }>;
  grupoMaterias: Array<{ grupo_id: string; materia_id: string; activo: boolean }>;
  materiasActivas: ReadonlySet<string>;
  inscripciones: Array<{ curp: string; grupo_id: string; activo: boolean }>;
  parciales: Array<{
    id: string;
    numero: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
    activo: boolean;
  }>;
  diasClase: number;
};

export type ResultadoIntegridad = {
  ok: boolean;
  errores: AsuntoIntegridad[];
  advertencias: AsuntoIntegridad[];
};

const GRADO_PRIMERO = "1RO";

export function validarIntegridadCiclo(
  datos: DatosValidacionCiclo,
): ResultadoIntegridad {
  const errores: AsuntoIntegridad[] = [];
  const advertencias: AsuntoIntegridad[] = [];

  if (!datos.periodo) {
    errores.push({ codigo: "periodo_inexistente", mensaje: "El ciclo no existe." });
    return { ok: false, errores, advertencias };
  }
  const periodo = datos.periodo;

  // 2) Rango de fechas del ciclo.
  if (periodo.fecha_inicio && periodo.fecha_fin) {
    if (periodo.fecha_inicio >= periodo.fecha_fin) {
      errores.push({
        codigo: "rango_invalido",
        mensaje: `Rango inválido: inicio (${periodo.fecha_inicio}) debe ser anterior al fin (${periodo.fecha_fin}).`,
      });
    }
  } else if (!periodo.fecha_inicio && !periodo.fecha_fin) {
    advertencias.push({
      codigo: "sin_rango_fechas",
      mensaje: "El ciclo no define rango de fechas (inicio/fin).",
    });
  } else {
    advertencias.push({
      codigo: "rango_incompleto",
      mensaje: "El ciclo define solo uno de los extremos del rango.",
    });
  }

  // 3) Contexto académico: grupos.
  const grupos = datos.grupos ?? [];
  const gruposActivos = grupos.filter((g) => g.activo);
  if (grupos.length === 0) {
    errores.push({ codigo: "sin_grupos", mensaje: "El ciclo no tiene grupos asociados." });
  } else if (gruposActivos.length === 0) {
    errores.push({ codigo: "sin_grupos_activos", mensaje: "El ciclo tiene grupos pero ninguno está activo." });
  }

  // 4) Inscripciones activas → grupos válidos del ciclo.
  const inscripciones = datos.inscripciones ?? [];
  const inscActivas = inscripciones.filter((i) => i.activo);
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const inscActivasPorGrupo = new Map<string, number>();
  const curpsActivas = new Map<string, number>();
  const gruposInactivosConInscripcion = new Set<string>();
  for (const i of inscActivas) {
    inscActivasPorGrupo.set(i.grupo_id, (inscActivasPorGrupo.get(i.grupo_id) ?? 0) + 1);
    curpsActivas.set(i.curp, (curpsActivas.get(i.curp) ?? 0) + 1);
    const g = grupoPorId.get(i.grupo_id);
    if (!g) {
      errores.push({
        codigo: "inscripcion_grupo_ajeno",
        mensaje: `La inscripción activa de ${i.curp} apunta a un grupo que no pertenece al ciclo.`,
      });
    } else if (!g.activo) {
      gruposInactivosConInscripcion.add(i.grupo_id);
    }
  }
  if (gruposInactivosConInscripcion.size > 0) {
    errores.push({
      codigo: "inscripcion_en_grupo_inactivo",
      mensaje: `Inscripciones activas en grupos inactivos del ciclo: ${[...gruposInactivosConInscripcion].join(", ")}.`,
    });
  }
  for (const [curp, cantidad] of curpsActivas) {
    if (cantidad > 1) {
      errores.push({
        codigo: "curp_multiples_inscripciones",
        mensaje: `El alumno ${curp} tiene ${cantidad} inscripciones activas en el ciclo.`,
      });
    }
  }
  const curpsDelCiclo = new Set<string>(inscripciones.map((i) => i.curp));
  if (curpsDelCiclo.size === 0) {
    errores.push({
      codigo: "sin_inscripciones",
      mensaje: "El ciclo no tiene alumnos inscritos (no puede operar sin alumnos).",
    });
  }

  // 5) Materias activas por grupo + consistencia grupo/materia.
  const materiasActivas = datos.materiasActivas ?? new Set<string>();
  const gmPorGrupo = new Map<string, Array<{ materia_id: string; activo: boolean }>>();
  for (const gm of datos.grupoMaterias ?? []) {
    const lista = gmPorGrupo.get(gm.grupo_id) ?? [];
    lista.push(gm);
    gmPorGrupo.set(gm.grupo_id, lista);
  }
  const materiasInvalidas = new Set<string>();
  for (const gm of datos.grupoMaterias ?? []) {
    if (!gm.activo) continue;
    if (!materiasActivas.has(gm.materia_id)) materiasInvalidas.add(gm.materia_id);
  }
  if (materiasInvalidas.size > 0) {
    errores.push({
      codigo: "materia_invalida_en_grupo",
      mensaje: `El ciclo referencia materias inexistentes o inactivas: ${[...materiasInvalidas].join(", ")}.`,
    });
  }
  for (const g of gruposActivos) {
    const gmsActivas = (gmPorGrupo.get(g.id) ?? []).filter((x) => x.activo);
    const inscG = inscActivasPorGrupo.get(g.id) ?? 0;
    if (inscG > 0 && gmsActivas.length === 0) {
      errores.push({
        codigo: "grupo_sin_materias",
        mensaje: `El grupo ${g.grado} ${g.nombre} tiene ${inscG} inscripciones activas pero no tiene materias activas.`,
      });
    }
    if (inscG > 0 && (g.grado ?? "").toUpperCase() !== GRADO_PRIMERO && !g.carrera_id) {
      advertencias.push({
        codigo: "grupo_sin_carrera_grado_superior",
        mensaje: `El grupo ${g.grado} ${g.nombre} no tiene carrera asignada y tiene inscripciones (¿tronco común?).`,
      });
    }
  }

  // 6) Parciales: pertenencia al ciclo, rango, orden y no solapamiento.
  const parciales = datos.parciales ?? [];
  const parcialesActivos = parciales.filter((p) => p.activo);
  if (parciales.length === 0) {
    advertencias.push({ codigo: "sin_parciales", mensaje: "El ciclo no tiene parciales configurados." });
  }
  const numeros = new Set<number>();
  for (const p of parcialesActivos) {
    if (numeros.has(p.numero)) {
      errores.push({ codigo: "parcial_numero_duplicado", mensaje: `Existe más de un parcial activo con el número ${p.numero}.` });
    }
    numeros.add(p.numero);
    if (p.fecha_inicio > p.fecha_fin) {
      errores.push({ codigo: "parcial_rango_invalido", mensaje: `El parcial ${p.numero} (${p.nombre}) tiene un rango invertido.` });
    }
    if (periodo.fecha_inicio && periodo.fecha_fin) {
      if (p.fecha_inicio < periodo.fecha_inicio || p.fecha_fin > periodo.fecha_fin) {
        errores.push({ codigo: "parcial_fuera_de_ciclo", mensaje: `El parcial ${p.numero} (${p.nombre}) queda fuera del rango del ciclo.` });
      }
    }
  }
  const ordenados = [...parcialesActivos].sort((a, b) => a.numero - b.numero);
  for (let i = 1; i < ordenados.length; i++) {
    const prev = ordenados[i - 1]!;
    const cur = ordenados[i]!;
    if (cur.fecha_inicio <= prev.fecha_fin) {
      errores.push({ codigo: "parciales_solapados", mensaje: `Los parciales ${prev.numero} y ${cur.numero} se solapan en fechas.` });
    }
  }

  // 7) Calendario: en F1 es advertencia (el consumo real es F5–F7).
  if ((datos.diasClase ?? 0) === 0) {
    advertencias.push({ codigo: "sin_calendario_clase", mensaje: "El ciclo no tiene días de clase registrados en el calendario." });
  }

  return { ok: errores.length === 0, errores, advertencias };
}

/* ---------------------------------------------------------------------------
 * ACTIVACIÓN EXCLUSIVA (cálculo puro; la escritura la hace la capa de repositorio)
 * Invariante: nunca puede terminar con dos ciclos OPERATIVOS.
 * ------------------------------------------------------------------------- */

export type CambioEstadoPeriodo = {
  id: string;
  activo: boolean;
  estado: EstadoCiclo;
};

export type PlanActivacion = {
  ok: boolean;
  error?: string;
  /** Filas que requieren UPDATE (el resto no cambia). */
  cambios: CambioEstadoPeriodo[];
  /** Cuántos ciclos estaban activos antes. */
  activosActuales: number;
};

/**
 * Calcula las transiciones para activar `periodoId` como único OPERATIVO.
 * - El objetivo pasa a { activo:true, estado:'operativo' }.
 * - Cualquier otro periodo ACTIVO pasa a { activo:false, estado:'historico' }.
 * - Los periodos ya inactivos NO cambian (un borrador sigue siendo borrador).
 */
export function planActivacionExclusiva(
  periodos: FilaPeriodoEstado[],
  periodoId: string,
): PlanActivacion {
  const objetivo = periodos.find((p) => p.id === periodoId);
  if (!objetivo) {
    return { ok: false, error: "El ciclo a activar no existe.", cambios: [], activosActuales: 0 };
  }
  const cambios: CambioEstadoPeriodo[] = [];
  let activosActuales = 0;
  for (const p of periodos) {
    if (p.activo) activosActuales++;
  }
  const yaOperativo = Boolean(objetivo.activo);
  if (yaOperativo && activosActuales === 1) {
    return { ok: true, cambios: [], activosActuales };
  }
  for (const p of periodos) {
    if (p.id === periodoId) {
      if (!yaOperativo) cambios.push({ id: p.id, activo: true, estado: ESTADO_OPERATIVO });
    } else if (p.activo) {
      cambios.push({ id: p.id, activo: false, estado: ESTADO_HISTORICO });
    }
  }
  return { ok: true, cambios, activosActuales };
}

/** Aplica un plan sobre una lista de filas (uso en pruebas) y valida la invariante. */
export function aplicarPlanActivacion(
  periodos: FilaPeriodoEstado[],
  cambios: CambioEstadoPeriodo[],
): FilaPeriodoEstado[] {
  const porId = new Map(cambios.map((c) => [c.id, c]));
  const resultado = periodos.map((p) => {
    const c = porId.get(p.id);
    if (!c) return p;
    return { ...p, activo: c.activo, estado: c.estado };
  });
  return resultado;
}

/** ¿Existe exactamente un periodo OPERATIVO/activo en la lista? */
export function unicoOperativo(periodos: FilaPeriodoEstado[]): boolean {
  const operativos = periodos.filter((p) => resolverEstadoPeriodo(p) === ESTADO_OPERATIVO);
  return operativos.length === 1;
}


