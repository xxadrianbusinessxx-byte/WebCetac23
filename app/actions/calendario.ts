"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  contarDiasLaborables,
  eliminarDiaCalendario,
  establecerCalendarioBase,
  guardarDiaCalendario,
  listarCiclosEscolares,
  obtenerCalendarioEscolar,
  type DiaCalendarioRow,
} from "@/lib/escolar/calendario";
import type { TipoDiaCalendario } from "@/lib/escolar/tables";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions del CALENDARIO ESCOLAR (Bloque 5A).
 *
 * Reglas de seguridad:
 *  - ESCRITURA (guardar, eliminar, establecer base): SOLO rol `directivo`.
 *  - LECTURA (obtener calendario, listar ciclos): cualquier sesión válida
 *    (los profesores/alumnos/padres lo leerán en bloques posteriores).
 */

/** Obtiene los días registrados de un ciclo escolar (lectura). */
export async function actionObtenerCalendario(
  ciclo: string,
): Promise<DiaCalendarioRow[]> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return [];
  const supabase = await createClient();
  return obtenerCalendarioEscolar(supabase, ciclo);
}

/** Lista los ciclos escolares existentes (lectura). */
export async function actionListarCiclosEscolares(): Promise<string[]> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return [];
  const supabase = await createClient();
  return listarCiclosEscolares(supabase);
}

/**
 * Previsualiza cuántos días laborables (lunes a viernes) se generarían para un
 * rango, SIN escribir nada. Solo directivos.
 */
export async function actionPrevisualizarCalendarioBase(
  inicio: string,
  fin: string,
): Promise<{ ok: true; dias: number } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden configurar el calendario." };
  }

  const ini = new Date(`${inicio}T00:00:00`);
  const finD = new Date(`${fin}T00:00:00`);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(finD.getTime())) {
    return { ok: false, error: "El rango de fechas no es válido." };
  }
  if (ini.getTime() > finD.getTime()) {
    return { ok: false, error: "La fecha inicial no puede ser posterior a la final." };
  }

  return { ok: true, dias: contarDiasLaborables(ini, finD) };
}

/**
 * Establece la base del calendario: marca los lunes a viernes del rango como
 * `clase` mediante UPSERT. Solo directivos.
 */
export async function actionEstablecerCalendarioBase(
  ciclo: string,
  inicio: string,
  fin: string,
): Promise<{ ok: true; generados: number } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden configurar el calendario." };
  }

  const supabase = await createClient();
  return establecerCalendarioBase(supabase, {
    ciclo,
    inicio,
    fin,
    creadoPor: sesion.nombre ?? sesion.matricula,
  });
}

/**
 * Guarda (UPSERT) un día del calendario. Si ya existe (ciclo, fecha), lo
 * actualiza; nunca crea duplicados. Solo directivos.
 */
export async function actionGuardarDiaCalendario(
  ciclo: string,
  fecha: string,
  tipo: TipoDiaCalendario,
  descripcion?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden modificar el calendario." };
  }

  const supabase = await createClient();
  return guardarDiaCalendario(supabase, {
    ciclo,
    fecha,
    tipo,
    descripcion,
    creadoPor: sesion.nombre ?? sesion.matricula,
  });
}

/**
 * Elimina un día del calendario (revierte una excepción). Solo directivos.
 */
export async function actionEliminarDiaCalendario(
  ciclo: string,
  fecha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden modificar el calendario." };
  }

  const supabase = await createClient();
  return eliminarDiaCalendario(supabase, ciclo, fecha);
}
