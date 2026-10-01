/**
 * horario-semanal-puro.ts — MÓDULO PURO de `horario-semanal.ts`.
 *
 * Exports sin `async` que no necesitan la base: normalización de campos del
 * horario, horas, días, atribución profesor→bloques y materias del horario.
 * Cero I/O: ni `SupabaseClient`, ni `createClient`, ni `fetch`.
 *
 * Movido desde `horario-semanal.ts` (PROMPT Q · Parte 1 · R-1) tal cual;
 * `horario-semanal.ts` re-exporta todo para que ningún import cambie de ruta.
 * Los helpers de catálogo/calendario son funciones puras de módulos que también
 * tienen lectura (reciben `SupabaseClient` por parámetro, nunca conectan al
 * cargar): este archivo corre sin base de datos.
 */
import { diaSemanaDesdeFecha, type DiaSemana } from "../ciclo/calendario.ts";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  normalizarTextoCatalogo,
} from "../catalogo/catalogo-academico.ts";

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
export type GrupoConCarrera = {
  id: string;
  grado: string;
  nombre: string;
  carreraId: string | null;
  carreraClave: string;
  carreraNombre: string;
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
