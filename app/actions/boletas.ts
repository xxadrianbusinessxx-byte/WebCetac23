"use server";

/**
 * boletas.ts — la boleta generada (PROMPT X, 2026-10-24). Autorizar → validar →
 * delegar.
 *
 * ── Dos capacidades, y no son intercambiables ──────────────────────────────
 *   ver      `calificacion.ver` + alcance. SOBRE QUIÉN lo decide
 *            `resolverAccesoAlumno` (la fuente única, R6) y QUÉ VISTA le toca a
 *            ese modo, `alcanceVistaBoleta`: la familia (alumno, tutor) solo con
 *            activación y con el parcial de la activación; el personal
 *            (directivo, Administración escolar) siempre, eligiendo parcial. El
 *            maestro también tiene `calificacion.ver` y aquí no ve nada: es una
 *            lista BLANCA.
 *   activar  `boleta.activar`, solo directivo. El ciclo lo pone el servidor y
 *            quien activa es `PROFESORES.ID` de la sesión, nunca del cliente.
 */
import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import { resolverAccesoAlumno } from "@/lib/escolar/alumno/acceso-alumno";
import {
  activarBoleta,
  alumnosDeGrupoParaBoleta,
  boletaDeAlumno,
  contextoActivacionBoletas,
  desactivarBoleta,
  type ContextoActivacionBoletas,
  type ResultadoActivacion,
  type VistaBoleta,
} from "@/lib/escolar/administracion/boleta";
import { alcanceVistaBoleta } from "@/lib/escolar/administracion/boleta-puro";
import { leerEntrada } from "@/lib/validacion/leer-form-data";
import {
  esquemaActivarBoleta,
  esquemaBoletaAlumno,
  esquemaDesactivarBoleta,
  esquemaGrupoBoleta,
} from "@/lib/validacion/esquemas-puro";

const SIN_PERMISO_ACTIVAR = "No tienes permiso para activar boletas.";

/** `PROFESORES.ID` de la sesión, o null si la sesión es vieja y no lo trae. */
const profesorDe = (id: unknown): number | null => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** La boleta de un alumno, armada con lo que hay ahora. Se pide cada vez que se entra. */
export async function actionBoletaAlumno(entrada: unknown): Promise<VistaBoleta> {
  const g = await exigir("calificacion.ver");
  if (!g.ok || !g.sesion) return { ok: false, error: "No tienes permiso para ver la boleta." };
  const e = leerEntrada(esquemaBoletaAlumno, entrada);
  if (!e.ok) return { ok: false, error: e.error };
  try {
    const supabase = await createClient();
    const acc = await resolverAccesoAlumno(supabase, g.sesion, e.datos.curp || null);
    if (!acc.ok) return { ok: false, error: acc.error };
    const alcance = acc.acceso.puedeLeer ? alcanceVistaBoleta(acc.acceso.modo) : null;
    if (!alcance) return { ok: false, error: "No tienes permiso para ver la boleta." };
    return await boletaDeAlumno(supabase, acc.curp, {
      alcance,
      // La familia NUNCA elige el parcial: lo pone la activación.
      evaluacionId: alcance === "personal" ? e.datos.evaluacionId || null : null,
      ahora: new Date(),
    });
  } catch (err) {
    console.error("[boletas] actionBoletaAlumno", err);
    return { ok: false, error: "No se pudo armar la boleta. Inténtalo de nuevo." };
  }
}

/** Parciales, grupos, grados y activaciones vigentes del ciclo operativo. */
export async function actionContextoActivacionBoletas(): Promise<ContextoActivacionBoletas> {
  const g = await exigir("boleta.activar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO_ACTIVAR };
  try {
    const supabase = await createClient();
    return await contextoActivacionBoletas(supabase);
  } catch (err) {
    console.error("[boletas] actionContextoActivacionBoletas", err);
    return { ok: false, error: "No se pudo leer la configuración de boletas. Inténtalo de nuevo." };
  }
}

/** Activa la boleta de un parcial para el plantel, un grado o un grupo. */
export async function actionActivarBoleta(entrada: unknown): Promise<ResultadoActivacion> {
  const g = await exigir("boleta.activar");
  if (!g.ok || !g.sesion) return { ok: false, error: SIN_PERMISO_ACTIVAR };
  const e = leerEntrada(esquemaActivarBoleta, entrada);
  if (!e.ok) return { ok: false, error: e.error };
  try {
    const supabase = await createClient();
    return await activarBoleta(supabase, e.datos, profesorDe(g.sesion.profesorId));
  } catch (err) {
    console.error("[boletas] actionActivarBoleta", err);
    return { ok: false, error: "No se pudo activar la boleta. Inténtalo de nuevo." };
  }
}

/** Desactiva una activación vigente. No borra: la cierra. */
export async function actionDesactivarBoleta(entrada: unknown): Promise<ResultadoActivacion> {
  const g = await exigir("boleta.activar");
  if (!g.ok || !g.sesion) return { ok: false, error: SIN_PERMISO_ACTIVAR };
  const e = leerEntrada(esquemaDesactivarBoleta, entrada);
  if (!e.ok) return { ok: false, error: e.error };
  try {
    const supabase = await createClient();
    return await desactivarBoleta(supabase, e.datos.id, profesorDe(g.sesion.profesorId));
  } catch (err) {
    console.error("[boletas] actionDesactivarBoleta", err);
    return { ok: false, error: "No se pudo desactivar la boleta. Inténtalo de nuevo." };
  }
}

/** Alumnos de un grupo del ciclo, para «Consultar boleta de alumno». */
export async function actionAlumnosDeGrupoBoleta(
  entrada: unknown,
): Promise<{ ok: true; alumnos: { curp: string; nombre: string }[] } | { ok: false; error: string }> {
  const g = await exigir("boleta.activar");
  if (!g.ok) return { ok: false, error: SIN_PERMISO_ACTIVAR };
  const e = leerEntrada(esquemaGrupoBoleta, entrada);
  if (!e.ok) return { ok: false, error: e.error };
  if (!e.datos.grupoId) return { ok: false, error: "Elige el grupo." };
  try {
    const supabase = await createClient();
    return await alumnosDeGrupoParaBoleta(supabase, e.datos.grupoId);
  } catch (err) {
    console.error("[boletas] actionAlumnosDeGrupoBoleta", err);
    return { ok: false, error: "No se pudieron leer los alumnos del grupo. Inténtalo de nuevo." };
  }
}
