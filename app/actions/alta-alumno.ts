"use server";

/**
 * alta-alumno.ts — alta manual de UN alumno (Personas › Alumnos › Inscripciones,
 * PROMPT W, 2026-10-24). Autorizar → validar → delegar.
 *
 * Vive en su propio archivo porque `escolar.ts`, donde está la sincronización del
 * roster, está al borde del límite de líneas de C9.
 *
 * La capacidad es `alumno.cargar_roster`: dar de alta un alumno es lo que hace el
 * roster, uno a uno, y capturar el número de control EN EL ALTA va dentro de ella
 * (corregirlo después sigue siendo `alumno.editar_numero_control`). El tutor exige
 * además `tutor.crear`, con la misma `puede()` que el resto del portal.
 */
import { exigir } from "@/lib/auth/exigir";
import { puede } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import { darDeAltaAlumnoManual, obtenerContextoAltaManual } from "@/lib/escolar/alumno/alta-manual-alumno";
import {
  validarAltaManualAlumno,
  type ContextoAltaManual,
  type ResultadoAltaManual,
} from "@/lib/escolar/alumno/alta-manual-alumno-puro";
import { leerEntrada } from "@/lib/validacion/leer-form-data";
import { esquemaAltaManualAlumno } from "@/lib/validacion/esquemas-puro";

/** Ciclo operativo y grupos activos para el selector de grado y grupo. */
export async function actionContextoAltaManual(): Promise<ContextoAltaManual> {
  const g = await exigir("alumno.cargar_roster");
  if (!g.ok) return { ok: false, error: "No tienes permiso para dar de alta alumnos." };
  try {
    const supabase = await createClient();
    return await obtenerContextoAltaManual(supabase);
  } catch (err) {
    console.error("[alta-alumno] actionContextoAltaManual", err);
    return { ok: false, error: "No se pudieron leer los grupos. Inténtalo de nuevo." };
  }
}

/** Da de alta al alumno, lo inscribe en el grupo y, si se pidió, le crea tutor. */
export async function actionDarDeAltaAlumnoManual(entrada: unknown): Promise<ResultadoAltaManual> {
  const g = await exigir("alumno.cargar_roster");
  if (!g.ok) return { ok: false, error: "No tienes permiso para dar de alta alumnos." };
  const e = leerEntrada(esquemaAltaManualAlumno, entrada);
  if (!e.ok) return { ok: false, error: e.error };
  const v = validarAltaManualAlumno(e.datos);
  if (!v.ok) return v;
  if (v.datos.crearTutor && !puede(g.sesion?.rol ?? null, "tutor.crear")) {
    return { ok: false, error: "No tienes permiso para crear tutores. Desmarca la casilla." };
  }
  try {
    const supabase = await createClient();
    return await darDeAltaAlumnoManual(supabase, v.datos);
  } catch (err) {
    console.error("[alta-alumno] actionDarDeAltaAlumnoManual", err);
    return { ok: false, error: "No se pudo dar de alta al alumno. Inténtalo de nuevo." };
  }
}
