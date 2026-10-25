/**
 * boleta.ts — lecturas y escrituras de la boleta generada (PROMPT X, 2026-10-24).
 *
 * La boleta NO se guarda. Aquí se JUNTA lo que ya existe —el alumno, su
 * inscripción, las materias de su grupo, la nota «promedio» que subió cada
 * profesor y su asistencia del parcial— y lo arma `boleta-puro.ts`. Lo único que
 * se escribe es el interruptor del directivo, `boletas_activacion`, y se escribe
 * por la RPC `activar_boleta` (exclusiva por alcance, en una transacción).
 *
 * No autoriza: quien llama ya pasó `exigir()` y, para la vista, decidió el alcance
 * con `resolverAccesoAlumno` + `alcanceVistaBoleta`.
 *
 * ── Si el SQL no está aplicado ─────────────────────────────────────────────
 * Sin la tabla, PostgREST responde PGRST205 (y PGRST202 sin la función). La vista
 * del personal se sigue armando —no necesita activaciones— y la de la familia
 * dice que no está disponible. Activar responde qué archivo falta ejecutar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buscarAlumnoPorCurp, nombreCompletoAlumno } from "../alumno/alumnos.ts";
import { leerNumeroControl } from "../alumno/numero-control.ts";
import { obtenerCurpsInscritasGrupo } from "../asistencia/asistencia-configuracion.ts";
import { obtenerEstadosAsistenciaAlumno } from "../asistencia/asistencia-estados.ts";
import { resumenAsistenciaPorParcial } from "../asistencia/asistencia-parcial.ts";
import { resolverIdentidadAlumnoInscripcion } from "../asistencia/asistencias.ts";
import { listarGruposPeriodoAdmin } from "../catalogo/inscripciones-borrador.ts";
import { resolverOperativoConParciales } from "../ciclo/evaluaciones.ts";
import { materiasDelAlumno, promediosDeAlumno } from "../materia/calificaciones.ts";
import { TABLA_BOLETAS_ACTIVACION } from "../tables.ts";
import {
  activacionQueAplica,
  armarBoleta,
  AVISO_BOLETA_NO_DISPONIBLE,
  elegirParcialBoleta,
  etiquetaActivacion,
  etiquetaGrupoBoleta,
  gradosDelCiclo,
  ordenarAlumnosBoleta,
  ordenarGruposBoleta,
  validarActivacion,
  type ActivacionBoleta,
  type AlcanceBoleta,
  type AlcanceVista,
  type BoletaArmada,
  type EntradaActivacion,
  type GrupoBoleta,
  type ParcialBoleta,
} from "./boleta-puro.ts";
import { nombresDeAlumnos } from "./constancia.ts";
import { hoyEnElPlantel } from "./hora-plantel-puro.ts";

const SQL_PENDIENTE =
  "Falta aplicar supabase/crear-boletas-activacion.sql en Supabase: sin esa tabla no se pueden activar boletas.";

/** ¿El error es «esa tabla / esa función no existe»? (el SQL sin aplicar). */
function esEsquemaPendiente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883";
}

/* ── Activaciones ───────────────────────────────────────────────────────── */

type FilaActivacion = {
  id: string;
  evaluacion_id: string;
  alcance: AlcanceBoleta;
  grado: string | null;
  grupo_id: string | null;
  activada_en: string;
};

/**
 * Activaciones VIGENTES del ciclo. `esquema: false` = la tabla todavía no existe;
 * se dice aparte de «no hay ninguna» porque piden cosas distintas a quien mira.
 */
export async function leerActivacionesVigentes(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<{ esquema: boolean; activas: ActivacionBoleta[] }> {
  const { data, error } = await supabase
    .from(TABLA_BOLETAS_ACTIVACION)
    .select("id, evaluacion_id, alcance, grado, grupo_id, activada_en")
    .eq("periodo_id", periodoId)
    .eq("activa", true)
    .order("activada_en", { ascending: false });
  if (error) return { esquema: !esEsquemaPendiente(error), activas: [] };
  return {
    esquema: true,
    activas: ((data ?? []) as FilaActivacion[]).map((f) => ({
      id: f.id,
      evaluacionId: f.evaluacion_id,
      alcance: f.alcance,
      grado: f.grado,
      grupoId: f.grupo_id,
      activadaEn: f.activada_en,
    })),
  };
}

export type GrupoParaBoleta = GrupoBoleta & { etiqueta: string };

export type VigenteParaDirectivo = {
  id: string;
  alcance: AlcanceBoleta;
  grado: string | null;
  grupoId: string | null;
  evaluacionId: string;
  rotulo: { parcial: string; alcance: string; desde: string };
};

export type ContextoActivacionBoletas =
  | {
      ok: true;
      periodo: { id: string; nombre: string };
      parciales: ParcialBoleta[];
      grupos: GrupoParaBoleta[];
      grados: string[];
      vigentes: VigenteParaDirectivo[];
      /** false = el SQL no está aplicado: se puede consultar, no activar. */
      esquema: boolean;
    }
  | { ok: false; error: string };

/** Ciclo operativo con sus parciales, sus grupos y las activaciones vigentes. */
async function cicloDeBoletas(supabase: SupabaseClient) {
  const operativo = await resolverOperativoConParciales(supabase);
  if (!operativo.ok) return { ok: false as const, error: operativo.error };
  const lista = await listarGruposPeriodoAdmin(supabase, operativo.periodoId);
  if (!lista.ok) return { ok: false as const, error: lista.error ?? "No se pudieron leer los grupos del ciclo." };
  const grupos = ordenarGruposBoleta(
    (lista.grupos ?? [])
      .filter((g) => g.activo)
      .map((g) => ({ id: g.id, grado: g.grado, grupo: g.grupo, carreraClave: g.carreraClave ?? "" })),
  );
  const parciales: ParcialBoleta[] = [...operativo.parciales]
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({ id: p.id, numero: p.numero, nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin }));
  return {
    ok: true as const,
    periodo: { id: operativo.periodoId, nombre: operativo.periodoNombre },
    parciales,
    grupos,
  };
}

export async function contextoActivacionBoletas(supabase: SupabaseClient): Promise<ContextoActivacionBoletas> {
  const ciclo = await cicloDeBoletas(supabase);
  if (!ciclo.ok) return ciclo;
  const { esquema, activas } = await leerActivacionesVigentes(supabase, ciclo.periodo.id);
  return {
    ok: true,
    periodo: ciclo.periodo,
    parciales: ciclo.parciales,
    grupos: ciclo.grupos.map((g) => ({ ...g, etiqueta: etiquetaGrupoBoleta(g) })),
    grados: gradosDelCiclo(ciclo.grupos),
    vigentes: activas.map((a) => ({
      id: a.id,
      alcance: a.alcance,
      grado: a.grado,
      grupoId: a.grupoId,
      evaluacionId: a.evaluacionId,
      rotulo: etiquetaActivacion(a, ciclo),
    })),
    esquema,
  };
}

export type ResultadoActivacion = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Activa la boleta de un parcial para un alcance. El ciclo lo pone el servidor;
 * la coherencia alcance↔campos la decide `validarActivacion` antes de escribir.
 * `por` es `PROFESORES.ID` de la sesión.
 */
export async function activarBoleta(
  supabase: SupabaseClient,
  entrada: EntradaActivacion,
  por: number | null,
): Promise<ResultadoActivacion> {
  const ciclo = await cicloDeBoletas(supabase);
  if (!ciclo.ok) return ciclo;
  const v = validarActivacion(entrada, ciclo);
  if (!v.ok) return v;

  const { error } = await supabase.rpc("activar_boleta", {
    p_periodo: ciclo.periodo.id,
    p_evaluacion: v.datos.evaluacionId,
    p_alcance: v.datos.alcance,
    p_grado: v.datos.grado,
    p_grupo: v.datos.grupoId,
    p_por: por,
  });
  if (error) {
    if (esEsquemaPendiente(error)) return { ok: false, error: SQL_PENDIENTE };
    if (error.code === "23505") {
      return { ok: false, error: "Otra activación de ese mismo alcance se guardó a la vez. Recarga y vuelve a intentarlo." };
    }
    return { ok: false, error: error.message || "No se pudo activar la boleta." };
  }
  const parcial = ciclo.parciales.find((p) => p.id === v.datos.evaluacionId)?.nombre ?? "El parcial";
  return { ok: true, mensaje: `${parcial}: boleta activada.` };
}

/** Desactiva UNA activación vigente. No borra: la cierra con quién y cuándo. */
export async function desactivarBoleta(
  supabase: SupabaseClient,
  id: string,
  por: number | null,
): Promise<ResultadoActivacion> {
  if (!id.trim()) return { ok: false, error: "Elige la activación que quieres desactivar." };
  const { data, error } = await supabase
    .from(TABLA_BOLETAS_ACTIVACION)
    .update({ activa: false, desactivada_por: por, desactivada_en: new Date().toISOString() })
    .eq("id", id)
    .eq("activa", true)
    .select("id");
  if (error) {
    if (esEsquemaPendiente(error)) return { ok: false, error: SQL_PENDIENTE };
    return { ok: false, error: error.message || "No se pudo desactivar la boleta." };
  }
  if (!data || data.length === 0) return { ok: false, error: "Esa activación ya no estaba vigente." };
  return { ok: true, mensaje: "Boleta desactivada." };
}

/* ── Consultar: alumnos de un grupo ─────────────────────────────────────── */

export async function alumnosDeGrupoParaBoleta(
  supabase: SupabaseClient,
  grupoId: string,
): Promise<{ ok: true; alumnos: { curp: string; nombre: string }[] } | { ok: false; error: string }> {
  const ciclo = await cicloDeBoletas(supabase);
  if (!ciclo.ok) return ciclo;
  if (!ciclo.grupos.some((g) => g.id === grupoId)) {
    return { ok: false, error: "Ese grupo no es del ciclo operativo." };
  }
  const curps = [...(await obtenerCurpsInscritasGrupo(supabase, grupoId))];
  const nombres = await nombresDeAlumnos(supabase, curps);
  return {
    ok: true,
    alumnos: ordenarAlumnosBoleta(curps.map((curp) => ({ curp, nombre: nombres.get(curp) ?? curp }))),
  };
}

/* ── La boleta de un alumno ─────────────────────────────────────────────── */

export type VistaBoleta =
  | {
      ok: true;
      disponible: true;
      boleta: BoletaArmada;
      /** Solo el personal elige parcial; la familia ve el de la activación. */
      puedeElegirParcial: boolean;
      parciales: { id: string; nombre: string }[];
      evaluacionId: string;
      /** ¿Hay una activación que cubra a este alumno? (para el personal). */
      activada: boolean;
      /** Parcial de esa activación, si la hay y es otro que el que se enseña. */
      parcialActivado: string | null;
    }
  | { ok: true; disponible: false; mensaje: string }
  | { ok: false; error: string };

/**
 * La boleta de un alumno, armada con lo que hay ahora.
 *
 * `alcance` lo decidió quien llama (`alcanceVistaBoleta`). Para la familia el
 * parcial lo pone la activación que le toca y `evaluacionId` se IGNORA; para el
 * personal, `evaluacionId` elige (con los respaldos de `elegirParcialBoleta`).
 */
export async function boletaDeAlumno(
  supabase: SupabaseClient,
  curp: string,
  opciones: { alcance: AlcanceVista; evaluacionId: string | null; ahora: Date },
): Promise<VistaBoleta> {
  const [alumno, numeroControl, identidad, operativo] = await Promise.all([
    buscarAlumnoPorCurp(supabase, curp),
    leerNumeroControl(supabase, curp),
    resolverIdentidadAlumnoInscripcion(supabase, curp),
    resolverOperativoConParciales(supabase),
  ]);
  // A la familia no se le enseña el error técnico (ciclo, inscripción): para ella
  // la boleta simplemente no está disponible. El personal sí necesita el motivo.
  const sinBoleta = (error: string): VistaBoleta =>
    opciones.alcance === "familia"
      ? { ok: true, disponible: false, mensaje: AVISO_BOLETA_NO_DISPONIBLE }
      : { ok: false, error };
  if (!alumno) return { ok: false, error: "No hay ningún alumno con esa CURP." };
  if (!operativo.ok) return sinBoleta(operativo.error);
  if (!identidad.ok) return sinBoleta(identidad.error);
  const { grado, grupo, carrera, grupoId, periodoId } = identidad.identidad;
  if (periodoId && periodoId !== operativo.periodoId) {
    return sinBoleta("La inscripción del alumno pertenece a un periodo distinto del operativo.");
  }

  const parciales: ParcialBoleta[] = [...operativo.parciales]
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({ id: p.id, numero: p.numero, nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin }));

  const { activas } = await leerActivacionesVigentes(supabase, operativo.periodoId);
  const aplica = activacionQueAplica(activas, { grado, grupoId });

  let parcial: ParcialBoleta | null;
  if (opciones.alcance === "familia") {
    // Sin activación no hay boleta; y una activación de un parcial que ya no está
    // activo en el ciclo tampoco enseña nada (no se inventa otro parcial).
    parcial = aplica ? (parciales.find((p) => p.id === aplica.evaluacionId) ?? null) : null;
    if (!parcial) return { ok: true, disponible: false, mensaje: AVISO_BOLETA_NO_DISPONIBLE };
  } else {
    parcial = elegirParcialBoleta({
      parciales,
      pedido: opciones.evaluacionId,
      activacion: aplica,
      hoy: hoyEnElPlantel(opciones.ahora),
    });
    if (!parcial) return { ok: false, error: "El ciclo operativo no tiene parciales activos." };
  }
  const elegido: ParcialBoleta = parcial;

  // PROMPT Y — UN roster para las dos cosas: el de la asistencia (todas las
  // materias, también las inactivas, para nombrar sus días) y el de la boleta
  // (solo activas, el mismo filtro `activo` que aplicaba `materiasDelAlumno(…, true)`).
  const roster = materiasDelAlumno(supabase, curp, false, [grupoId]);
  const [materias, dias] = await Promise.all([
    roster.then((todas) => todas.filter((m) => m.activo)),
    obtenerEstadosAsistenciaAlumno(supabase, {
      roster,
      curp,
      grado,
      grupo,
      carrera: carrera || undefined,
      ciclo: operativo.periodoNombre,
      periodoId: operativo.periodoId,
      profesorId: null,
      grupoId,
    }),
  ]);
  const promedios = await promediosDeAlumno(
    supabase,
    curp,
    materias.map((m) => m.grupoMateriaId),
  );
  const resumen = resumenAsistenciaPorParcial(
    dias.map((d) => ({ fecha: d.fecha, tipo: d.tipo, estado: d.estado, materias: d.materias, color: d.color })),
    operativo.parciales,
  ).resumenes.find((r) => r.parcial.id === elegido.id);

  const boleta = armarBoleta({
    nombre: nombreCompletoAlumno(alumno),
    curp: alumno.CURP,
    numeroControl,
    grado,
    grupo,
    carrera,
    parcial: elegido,
    materias: materias.map((m) => ({
      nombre: m.nombreVisible ?? m.nombre,
      promedio: promedios.get(m.grupoMateriaId) ?? null,
    })),
    asistencia: resumen ? { porcentaje: resumen.porcentaje, clasesRegistradas: resumen.clasesRegistradas } : null,
  });

  const parcialActivado = aplica ? (parciales.find((p) => p.id === aplica.evaluacionId)?.nombre ?? null) : null;
  return {
    ok: true,
    disponible: true,
    boleta,
    puedeElegirParcial: opciones.alcance === "personal",
    parciales: parciales.map((p) => ({ id: p.id, nombre: p.nombre })),
    evaluacionId: elegido.id,
    activada: Boolean(aplica),
    parcialActivado: parcialActivado && parcialActivado !== elegido.nombre ? parcialActivado : null,
  };
}
