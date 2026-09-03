import type { SupabaseClient } from "@supabase/supabase-js";
import { diaSemanaDesdeFecha, type DiaSemana } from "./calendario";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  normalizarTextoCatalogo,
  obtenerInscripcionActiva,
  type CarreraRow,
  type GrupoRow,
  type PeriodoRow,
} from "./catalogo-academico";
import {
  TABLA_CARRERAS,
  TABLA_GRUPOS,
  TABLA_HORARIO_SEMANAL,
  TABLA_PERIODOS,
} from "./tables";

/**
 * HORARIO SEMANAL OFICIAL — Módulo de dominio y lectura (FASE HORARIO).
 *
 * El horario responde SOLO a la pregunta: «¿qué clases están programadas para
 * este grupo en este día?». NO es asistencia. `clases_impartidas` y
 * `asistencia_alumnos` siguen registrando lo que realmente ocurrió.
 *
 * FUENTE ÚNICA DE VERDAD:
 *   ALUMNO → inscripción activa → grupo → horario del grupo (este módulo).
 *   PROFESOR → asignaciones (asignaciones_profesor) → grupo/materia → horario.
 *   FECHA → día de semana → horario → bloques programados.
 *
 * Reglas de este módulo:
 *   - No consulta por alumno (el alumno NO tiene copia del horario).
 *   - No consulta materia por materia: lee el horario del grupo en una consulta.
 *   - No guarda el «número de clases por día»: se deriva contando bloques.
 *   - «Sin profesor asignado» = profesor_clave/profesor_nombre NULL. Nunca se
 *     convierte en un profesor real.
 *   - Este módulo es de LECTURA PURA + REPOSITORIO. La escritura (importación
 *     de Excel) vive en `./horario-importar.ts` y las Server Actions en
 *     `app/actions/horario.ts`.
 */

/** Días de clase de la semana (lunes..viernes). */
export const DIAS_CLASE_SEMANA: readonly DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
];

export type HorarioBloqueRow = {
  id: string;
  periodo_id: string;
  grupo_id: string;
  dia_semana: DiaSemana;
  hora_inicio: string; // "HH:MM[:SS]"
  hora_fin: string;
  materia_clave: string;
  materia_nombre: string;
  materia_id: string | null;
  tipo_clase: string;
  profesor_clave: string | null;
  profesor_nombre: string | null;
  fila_origen: number | null;
  creado_por: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** Grupo resuelto para consultas de horario (identidad + carrera legible). */
export type GrupoHorarioResuelto = {
  grupoId: string;
  grado: string;
  grupo: string;
  carreraClave: string; // "" = sin carrera (tronco común)
  carreraNombre: string;
  periodoId: string;
  periodoNombre: string;
};

/** Resultado de una consulta de horario de grupo. */
export type HorarioGrupoConsulta = {
  grupo: GrupoHorarioResuelto;
  bloques: HorarioBloqueRow[];
};


/* ---------------------------------------------------------------------------
 * NORMALIZACIÓN DE CAMPOS DEL HORARIO (puras, sin I/O)
 * ------------------------------------------------------------------------- */

const ROMANO_FINAL = /(?:\s)(I{1,3}|IV|V|VI|VII|VIII|IX|X)\s*$/;

/** Clave estable de una materia dentro del horario (texto oficial normalizado). */
export function materiaClaveHorario(nombre: string): string {
  return normalizarTextoCatalogo(nombre ?? "");
}

/**
 * Claves de equivalencia de una materia contra el catálogo académico.
 * Devuelve el nombre completo normalizado y, cuando aplica, el nombre sin el
 * sufijo romano de grado (p. ej. "INGLES V" → también "INGLES"). No se elimina
 * el sufijo en módulos/submódulos (ahí el romano es parte de la identidad).
 */
export function clavesEquivalenciaMateria(nombre: string): string[] {
  const completa = materiaClaveHorario(nombre);
  if (!completa) return [];
  const candidatas = [completa];
  const esModulo = /MODULO|SUBMODULO/.test(completa);
  if (!esModulo && ROMANO_FINAL.test(completa)) {
    candidatas.push(completa.replace(ROMANO_FINAL, ""));
  }
  return [...new Set(candidatas)];
}

/** Normaliza el valor del día de la semana del archivo → clave interna. */
export function normalizarDiaSemanaHorario(valor: unknown): DiaSemana | null {
  if (valor == null) return null;
  const t = normalizarTextoCatalogo(String(valor));
  const mapa: Record<string, DiaSemana> = {
    LUNES: "lunes",
    MARTES: "martes",
    MIERCOLES: "miercoles",
    JUEVES: "jueves",
    VIERNES: "viernes",
    SABADO: "sabado",
    DOMINGO: "domingo",
    MONDAY: "lunes",
    TUESDAY: "martes",
    WEDNESDAY: "miercoles",
    THURSDAY: "jueves",
    FRIDAY: "viernes",
  };
  return mapa[t] ?? null;
}

/**
 * Convierte una celda de hora del archivo a minutos desde 00:00.
 * Acepta "07:30", "7:30", "07:30:00" y seriales numéricos de Excel.
 */
export function horaAMinutos(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0 || valor >= 1) return null;
    return Math.round(valor * 24 * 60);
  }
  const t = String(valor).trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const seg = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || seg > 59) return null;
  return h * 60 + min;
}

/** Formatea minutos desde 00:00 a "HH:MM". */
export function minutosAHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Normaliza el texto visible de hora del archivo → "HH:MM" (o ""). */
export function normalizarHoraVisible(valor: unknown): string {
  const min = horaAMinutos(valor);
  return min === null ? "" : minutosAHora(min);
}

/** Duración en minutos de un bloque (derivada; nunca se almacena). */
export function duracionMinutos(horaInicio: string, horaFin: string): number {
  const a = horaAMinutos(horaInicio);
  const b = horaAMinutos(horaFin);
  if (a === null || b === null) return 0;
  return Math.max(b - a, 0);
}

/** Normaliza el tipo de clase del archivo al vocabulario interno. */
export function normalizarTipoClaseHorario(valor: unknown): string {
  const t = normalizarTextoCatalogo(
    valor == null ? "" : String(valor),
  ).toLowerCase();
  if (!t) return "academica";
  if (t === "modulo tecnico" || t.includes("modulo")) return "modulo tecnico";
  if (t === "academica" || t === "academico") return "academica";
  if (t === "taller") return "taller";
  if (t === "tutoria") return "tutoria";
  return "otro";
}

/** Etiqueta legible para un tipo de clase almacenado. */
export function etiquetaTipoClase(tipo: string): string {
  const t = normalizarTextoCatalogo(tipo ?? "").toLowerCase();
  if (t === "modulo tecnico") return "Módulo técnico";
  if (t === "academica" || t === "academico") return "Académica";
  if (t === "taller") return "Taller";
  if (t === "tutoria") return "Tutoría";
  return tipo || "—";
}

/** Texto visible del profesor ("" cuando no hay profesor asignado). */
export function profesorVisibleDelBloque(
  bloque: Pick<HorarioBloqueRow, "profesor_nombre" | "profesor_clave">,
): string {
  if (bloque.profesor_nombre) return bloque.profesor_nombre;
  if (bloque.profesor_clave) return bloque.profesor_clave;
  return "Sin profesor asignado";
}


/* ---------------------------------------------------------------------------
 * REPOSITORIO — RESOLUCIÓN DE PERIODO / GRUPO (sin N+1)
 * ------------------------------------------------------------------------- */

export type GrupoConCarrera = {
  id: string;
  grado: string;
  nombre: string;
  carreraId: string | null;
  carreraClave: string;
  carreraNombre: string;
};

/**
 * Grupos de un periodo con su carrera resuelta (2 consultas como máximo).
 * CARRERA_CLAVE = "" significa grupo sin carrera (tronco común / 1°).
 */
export async function obtenerGruposConCarreraDePeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<GrupoConCarrera[]> {
  const { data: grupos, error: e1 } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, grado, nombre, carrera_id")
    .eq("periodo_id", periodoId);
  if (e1 || !grupos) return [];
  const filasGrupos = grupos as Pick<
    GrupoRow,
    "id" | "grado" | "nombre" | "carrera_id"
  >[];

  const carreraIds = [
    ...new Set(
      filasGrupos.map((g) => g.carrera_id).filter((x): x is string => Boolean(x)),
    ),
  ];
  const carreraPorId = new Map<string, CarreraRow>();
  if (carreraIds.length > 0) {
    const { data: carreras, error: e2 } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .in("id", carreraIds);
    if (!e2 && carreras) {
      for (const c of carreras as CarreraRow[]) carreraPorId.set(c.id, c);
    }
  }

  return filasGrupos.map((g) => {
    const carrera = g.carrera_id ? carreraPorId.get(g.carrera_id) : undefined;
    return {
      id: g.id,
      grado: g.grado,
      nombre: g.nombre,
      carreraId: g.carrera_id,
      carreraClave: carrera ? normalizarCarreraCatalogo(carrera.clave) : "",
      carreraNombre: carrera?.nombre?.trim() || carrera?.clave || "",
    };
  });
}

export function buscarGrupoEnLista(
  lista: GrupoConCarrera[],
  grado: string,
  grupo: string,
  carreraClave: string,
): GrupoConCarrera | null {
  const g = normalizarGradoCatalogo(grado);
  const gr = normalizarGrupoCatalogo(grupo);
  const c = normalizarCarreraCatalogo(carreraClave);
  for (const item of lista) {
    if (
      normalizarGradoCatalogo(item.grado) === g &&
      normalizarGrupoCatalogo(item.nombre) === gr &&
      normalizarCarreraCatalogo(item.carreraClave) === c
    ) {
      return item;
    }
  }
  return null;
}

export async function obtenerPeriodoPorNombre(
  supabase: SupabaseClient,
  nombre: string,
): Promise<PeriodoRow | null> {
  const n = normalizarTextoCatalogo(nombre);
  if (!n) return null;
  const { data, error } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre, activo, created_at, updated_at")
    .eq("nombre", n)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PeriodoRow;
}

/** Busca el grupo (dentro de un periodo) por su identidad académica. */
export async function resolverGrupoHorarioPorIdentidad(
  supabase: SupabaseClient,
  input: {
    periodoId: string;
    grado: string;
    grupo: string;
    carreraClave: string;
  },
): Promise<GrupoConCarrera | null> {
  const lista = await obtenerGruposConCarreraDePeriodo(supabase, input.periodoId);
  return buscarGrupoEnLista(lista, input.grado, input.grupo, input.carreraClave);
}

/* ---------------------------------------------------------------------------
 * REPOSITORIO — LECTURA DE BLOQUES DEL HORARIO
 * ------------------------------------------------------------------------- */

export type FiltroHorarioGrupo = {
  periodoId: string;
  grupoId: string;
  dia?: DiaSemana | null;
};

const ORDEN_DIA: Record<string, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6,
};

/** Bloques del horario de un grupo (1 consulta). Ordenados por día + hora. */
export async function obtenerBloquesHorario(
  supabase: SupabaseClient,
  filtro: FiltroHorarioGrupo,
): Promise<HorarioBloqueRow[]> {
  let q = supabase
    .from(TABLA_HORARIO_SEMANAL)
    .select("*")
    .eq("periodo_id", filtro.periodoId)
    .eq("grupo_id", filtro.grupoId);
  if (filtro.dia) q = q.eq("dia_semana", filtro.dia);
  const { data, error } = await q;
  if (error || !data) return [];
  const filas = (data as HorarioBloqueRow[]).sort((a, b) => {
    const da = ORDEN_DIA[a.dia_semana] ?? 99;
    const db = ORDEN_DIA[b.dia_semana] ?? 99;
    if (da !== db) return da - db;
    const ha = horaAMinutos(a.hora_inicio) ?? 0;
    const hb = horaAMinutos(b.hora_inicio) ?? 0;
    if (ha !== hb) return ha - hb;
    return a.materia_clave.localeCompare(b.materia_clave, "es");
  });
  return filas;
}


/* ---------------------------------------------------------------------------
 * CONSULTAS DE ALTO NIVEL (grupo / alumno)
 * ------------------------------------------------------------------------- */

/** Resuelve grupo + horario completo a partir de la identidad académica. */
export async function consultarHorarioGrupoPorIdentidad(
  supabase: SupabaseClient,
  input: {
    ciclo: string;
    grado: string;
    grupo: string;
    carrera: string;
  },
): Promise<HorarioGrupoConsulta | null> {
  const periodo = await obtenerPeriodoPorNombre(supabase, input.ciclo);
  if (!periodo) return null;
  const grupoEncontrado = await resolverGrupoHorarioPorIdentidad(supabase, {
    periodoId: periodo.id,
    grado: input.grado,
    grupo: input.grupo,
    carreraClave: input.carrera,
  });
  if (!grupoEncontrado) return null;
  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId: periodo.id,
    grupoId: grupoEncontrado.id,
  });
  return {
    grupo: {
      grupoId: grupoEncontrado.id,
      grado: grupoEncontrado.grado,
      grupo: grupoEncontrado.nombre,
      carreraClave: grupoEncontrado.carreraClave,
      carreraNombre: grupoEncontrado.carreraNombre,
      periodoId: periodo.id,
      periodoNombre: periodo.nombre,
    },
    bloques,
  };
}

/** Resultado del horario de un alumno (sin copiar nada al alumno). */
export type HorarioAlumnoConsulta = {
  grupo: GrupoHorarioResuelto;
  curp: string;
  bloques: HorarioBloqueRow[];
};

/**
 * Horario semanal del grupo del alumno, derivado desde su inscripción ACTIVA:
 *
 *   CURP → inscripción activa → grupo → periodo → horario del grupo.
 *
 * Devuelve null si el alumno no tiene inscripción activa o el grupo/periodo no
 * existen. NO consulta alumno por alumno en el horario (una sola lectura del
 * grupo; el horario nunca se copia al alumno).
 */
export async function consultarHorarioAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<HorarioAlumnoConsulta | null> {
  const c = curp.trim().toUpperCase();
  if (!c) return null;

  const inscripcion = await obtenerInscripcionActiva(supabase, c);
  if (!inscripcion) return null;

  const { data: grupoRow, error: eG } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, periodo_id, grado, nombre, carrera_id")
    .eq("id", inscripcion.grupo_id)
    .maybeSingle();
  if (eG || !grupoRow) return null;

  const { data: periodoRow, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", grupoRow.periodo_id)
    .maybeSingle();
  if (eP || !periodoRow) return null;

  let carreraClave = "";
  let carreraNombre = "";
  if (grupoRow.carrera_id) {
    const { data: carreraRow, error: eC } = await supabase
      .from(TABLA_CARRERAS)
      .select("clave, nombre")
      .eq("id", grupoRow.carrera_id)
      .maybeSingle();
    if (!eC && carreraRow) {
      carreraClave = normalizarCarreraCatalogo(String(carreraRow.clave));
      carreraNombre = carreraRow.nombre?.trim() || carreraRow.clave;
    }
  }

  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId: grupoRow.periodo_id,
    grupoId: grupoRow.id,
  });

  return {
    curp: c,
    grupo: {
      grupoId: grupoRow.id,
      grado: grupoRow.grado,
      grupo: grupoRow.nombre,
      carreraClave,
      carreraNombre,
      periodoId: grupoRow.periodo_id,
      periodoNombre: periodoRow.nombre,
    },
    bloques,
  };
}

/** Bloques de un grupo para una fecha concreta (día de semana derivado). */
export function bloquesDeGrupoEnFecha(
  bloques: HorarioBloqueRow[],
  fecha: string,
): HorarioBloqueRow[] {
  const dia = diaSemanaDesdeFecha(fecha);
  return bloques
    .filter((b) => b.dia_semana === dia)
    .sort(
      (a, b) =>
        (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0),
    );
}

/** Conteo derivado de bloques del grupo por día (nunca se almacena). */
export function totalBloquesGrupoPorDia(
  bloques: HorarioBloqueRow[],
): Partial<Record<DiaSemana, number>> {
  const conteo: Partial<Record<DiaSemana, number>> = {};
  for (const b of bloques) {
    conteo[b.dia_semana] = (conteo[b.dia_semana] ?? 0) + 1;
  }
  return conteo;
}


/* ---------------------------------------------------------------------------
 * ATRIBUCIÓN PROFESOR → BLOQUES (asignaciones_profesor = autoridad de acceso)
 * ------------------------------------------------------------------------- */

/**
 * Materias del catálogo que el profesor tiene ASIGNADAS en un grupo concreto
 * (mismo periodo, grado, grupo y carrera). Devuelve ids de materias y claves
 * de equivalencia normalizadas para empatar contra el texto oficial.
 * Devuelve null si el profesor NO tiene asignaciones activas en ese grupo.
 */
export type MateriasProfesorEnGrupo = {
  materiaIds: Set<string>;
  claves: Set<string>;
  cantidadAsignaciones: number;
};

export async function materiasAsignadasProfesorEnGrupo(
  supabase: SupabaseClient,
  input: {
    profesorClave: string;
    ciclo: string;
    grado: string;
    grupo: string;
    carrera: string;
  },
): Promise<MateriasProfesorEnGrupo | null> {
  const clave = input.profesorClave.trim().toUpperCase();
  if (!clave) return null;

  const { resolverAsignacionesProfesor } = await import("./catalogo-academico");
  const asignaciones = await resolverAsignacionesProfesor(supabase, clave);
  if (asignaciones.length === 0) return null;

  const cicloN = normalizarTextoCatalogo(input.ciclo);
  const gradoN = normalizarGradoCatalogo(input.grado);
  const grupoN = normalizarGrupoCatalogo(input.grupo);
  const carreraN = normalizarCarreraCatalogo(input.carrera);

  const materiaIds = new Set<string>();
  const claves = new Set<string>();
  let cantidad = 0;

  for (const a of asignaciones) {
    if (!a.grupo || !a.materia || !a.periodo) continue;
    if (normalizarTextoCatalogo(a.periodo.nombre) !== cicloN) continue;
    if (normalizarGradoCatalogo(a.grupo.grado) !== gradoN) continue;
    if (normalizarGrupoCatalogo(a.grupo.nombre) !== grupoN) continue;
    const carreraAsig = a.carrera
      ? normalizarCarreraCatalogo(a.carrera.clave)
      : "";
    if (carreraAsig !== carreraN) continue;

    materiaIds.add(a.materia.id);
    for (const cand of clavesEquivalenciaMateria(a.materia.nombre ?? "")) {
      claves.add(cand);
    }
    for (const cand of clavesEquivalenciaMateria(a.materia.clave)) {
      claves.add(cand);
    }
    cantidad++;
  }

  if (cantidad === 0) return null;
  return { materiaIds, claves, cantidadAsignaciones: cantidad };
}

/** ¿Un bloque del horario pertenece a la asignación del profesor? */
export function bloquePerteneceAProfesor(
  bloque: HorarioBloqueRow,
  profesorClave: string,
  materias: MateriasProfesorEnGrupo,
): boolean {
  const clave = profesorClave.trim().toUpperCase();
  if (
    bloque.profesor_clave &&
    bloque.profesor_clave.trim().toUpperCase() === clave
  ) {
    return true;
  }
  if (bloque.materia_id && materias.materiaIds.has(bloque.materia_id)) {
    return true;
  }
  const clavesBloque = clavesEquivalenciaMateria(bloque.materia_nombre);
  for (const cand of clavesBloque) {
    if (materias.claves.has(cand)) return true;
  }
  return false;
}

/** Bloques del horario de un grupo que corresponden al profesor. */
export function bloquesDelProfesorEnGrupo(
  bloques: HorarioBloqueRow[],
  profesorClave: string,
  materias: MateriasProfesorEnGrupo,
): HorarioBloqueRow[] {
  return bloques.filter((b) =>
    bloquePerteneceAProfesor(b, profesorClave, materias),
  );
}

/** Conteo por día de la semana de los bloques del profesor. */
export function conteoProfesorPorDia(
  bloquesProfesor: HorarioBloqueRow[],
): Partial<Record<DiaSemana, number>> {
  const conteo: Partial<Record<DiaSemana, number>> = {};
  for (const b of bloquesProfesor) {
    conteo[b.dia_semana] = (conteo[b.dia_semana] ?? 0) + 1;
  }
  return conteo;
}


/* ---------------------------------------------------------------------------
 * CONSULTA DE CONTEO OFICIAL POR FECHA (integración con asistencias)
 * ------------------------------------------------------------------------- */

/** Resultado del cálculo de clases oficiales del profesor para un grupo. */
export type ConteosHorarioProfesor = {
  /** true = el grupo tiene horario cargado para el periodo (fuente horario). */
  usaHorario: boolean;
  grupoId: string | null;
  periodoId: string | null;
  bloques: HorarioBloqueRow[];
  bloquesDelProfesor: HorarioBloqueRow[];
  /** true = hay horario del grupo pero ninguna asignación del profesor en él. */
  sinAsignacionEnGrupo: boolean;
  /** Aviso legible para la UI (null si no aplica). */
  aviso: string | null;
  /** Conteo por fecha (día de semana) según el horario. */
  conteosPorFecha: Map<string, number>;
  conteoPorDia: Partial<Record<DiaSemana, number>>;
};

/**
 * Clases oficiales (horario) del profesor en un grupo, por fecha.
 *
 * 1) Resuelve el periodo por nombre y el grupo por identidad (2-3 consultas).
 * 2) Lee UNA VEZ todos los bloques del grupo en el periodo.
 * 3) Filtra en memoria los bloques que pertenecen a las asignaciones del
 *    profesor en ese grupo (o cuyo `profesor_clave` coincide con la sesión).
 *
 * Si el grupo NO tiene horario cargado, `usaHorario = false` y el llamador
 * decide si conserva el fallback legacy (`configuracion_clases_profesor`).
 * Sin N+1: nunca consulta el horario por materia ni por alumno.
 */
export async function obtenerConteosHorarioProfesor(
  supabase: SupabaseClient,
  input: {
    profesorClave: string;
    ciclo: string;
    grado: string;
    grupo: string;
    carrera: string;
    fechas: string[];
  },
): Promise<ConteosHorarioProfesor> {
  const vacio: ConteosHorarioProfesor = {
    usaHorario: false,
    grupoId: null,
    periodoId: null,
    bloques: [],
    bloquesDelProfesor: [],
    sinAsignacionEnGrupo: false,
    aviso: null,
    conteosPorFecha: new Map(),
    conteoPorDia: {},
  };

  const periodo = await obtenerPeriodoPorNombre(supabase, input.ciclo);
  if (!periodo) return vacio;

  const grupoEncontrado = await resolverGrupoHorarioPorIdentidad(supabase, {
    periodoId: periodo.id,
    grado: input.grado,
    grupo: input.grupo,
    carreraClave: input.carrera,
  });
  if (!grupoEncontrado) return vacio;

  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId: periodo.id,
    grupoId: grupoEncontrado.id,
  });
  if (bloques.length === 0) return vacio;

  const materias = await materiasAsignadasProfesorEnGrupo(supabase, {
    profesorClave: input.profesorClave,
    ciclo: input.ciclo,
    grado: input.grado,
    grupo: input.grupo,
    carrera: input.carrera,
  });

  const bloquesDelProfesor = materias
    ? bloquesDelProfesorEnGrupo(bloques, input.profesorClave, materias)
    : bloques.filter(
        (b) =>
          b.profesor_clave &&
          b.profesor_clave.trim().toUpperCase() ===
            input.profesorClave.trim().toUpperCase(),
      );

  const conteoPorDia = conteoProfesorPorDia(bloquesDelProfesor);
  const conteosPorFecha = new Map<string, number>();
  for (const fecha of input.fechas) {
    const dia = diaSemanaDesdeFecha(fecha);
    conteosPorFecha.set(fecha, conteoPorDia[dia] ?? 0);
  }

  let aviso: string | null = null;
  if (!materias) {
    aviso =
      "El grupo tiene horario oficial, pero no tienes asignaciones activas " +
      "(asignaciones_profesor) en este grupo para este periodo. La fila " +
      "CLASES se genera vacía.";
  } else if (bloquesDelProfesor.length === 0) {
    aviso =
      "El horario oficial de este grupo no contiene materias tuyas " +
      "(según tus asignaciones del catálogo). La fila CLASES se genera vacía.";
  }

  return {
    usaHorario: true,
    grupoId: grupoEncontrado.id,
    periodoId: periodo.id,
    bloques,
    bloquesDelProfesor,
    sinAsignacionEnGrupo: !materias,
    aviso,
    conteosPorFecha,
    conteoPorDia,
  };
}

/* ---------------------------------------------------------------------------
 * MATERIAS DEL HORARIO Y CONTEO POR MATERIA (FASE HORARIO)
 * ------------------------------------------------------------------------- */

export type MateriaHorarioItem = {
  clave: string;
  nombre: string;
  totalSemana: number;
  porDia: Partial<Record<DiaSemana, number>>;
};

/** Materias únicas del horario de un grupo (ordenadas por nombre). */
export function materiasDelHorario(
  bloques: HorarioBloqueRow[],
): MateriaHorarioItem[] {
  const mapa = new Map<string, MateriaHorarioItem>();
  for (const b of bloques) {
    const clave = b.materia_clave || materiaClaveHorario(b.materia_nombre);
    let item = mapa.get(clave);
    if (!item) {
      item = {
        clave,
        nombre: b.materia_nombre,
        totalSemana: 0,
        porDia: {},
      };
      mapa.set(clave, item);
    }
    item.totalSemana += 1;
    item.porDia[b.dia_semana] = (item.porDia[b.dia_semana] ?? 0) + 1;
  }
  return [...mapa.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );
}

export type ConteosHorarioMateria = {
  /** true = el grupo/periodo tiene horario cargado. */
  usaHorario: boolean;
  /** true = la materia aparece en el horario del grupo. */
  materiaEncontrada: boolean;
  aviso: string | null;
  conteosPorFecha: Map<string, number>;
};

/**
 * Conteo de bloques de UNA materia por fecha. No depende del profesor ni de
 * asignaciones: cualquier docente puede generar la plantilla de esa materia y
 * el sistema sabe cuántas clases tiene ese día (contando bloques).
 */
export async function obtenerConteosHorarioMateria(
  supabase: SupabaseClient,
  input: {
    ciclo: string;
    grado: string;
    grupo: string;
    carrera: string;
    materiaClave: string;
    fechas: string[];
  },
): Promise<ConteosHorarioMateria> {
  const vacio: ConteosHorarioMateria = {
    usaHorario: false,
    materiaEncontrada: false,
    aviso: null,
    conteosPorFecha: new Map(),
  };

  const periodo = await obtenerPeriodoPorNombre(supabase, input.ciclo);
  if (!periodo) return vacio;

  const grupoEncontrado = await resolverGrupoHorarioPorIdentidad(supabase, {
    periodoId: periodo.id,
    grado: input.grado,
    grupo: input.grupo,
    carreraClave: input.carrera,
  });
  if (!grupoEncontrado) return vacio;

  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId: periodo.id,
    grupoId: grupoEncontrado.id,
  });
  if (bloques.length === 0) return vacio;

  const clave = materiaClaveHorario(input.materiaClave);
  const coincidentes = bloques.filter((b) => {
    if (b.materia_clave === clave) return true;
    return clavesEquivalenciaMateria(b.materia_nombre).includes(clave);
  });
  if (coincidentes.length === 0) {
    return {
      usaHorario: true,
      materiaEncontrada: false,
      aviso:
        "La materia seleccionada no aparece en el horario oficial de este grupo.",
      conteosPorFecha: new Map(input.fechas.map((f) => [f, 0] as const)),
    };
  }

  const porDia = conteoProfesorPorDia(coincidentes);
  const conteosPorFecha = new Map<string, number>();
  for (const fecha of input.fechas) {
    const dia = diaSemanaDesdeFecha(fecha);
    conteosPorFecha.set(fecha, porDia[dia] ?? 0);
  }
  return {
    usaHorario: true,
    materiaEncontrada: true,
    aviso: null,
    conteosPorFecha,
  };
}


