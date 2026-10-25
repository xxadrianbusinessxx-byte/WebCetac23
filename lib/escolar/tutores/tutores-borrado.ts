import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarAlumnoPorTexto, nombreCompletoAlumno } from "../alumno/alumnos.ts";
import type { AlumnoRow } from "../types.ts";
import { TABLA_ALUMNOS, TABLA_TUTORES, TABLA_TUTOR_ALUMNOS } from "../tables.ts";
import { SELECT_TUTOR } from "./tutores-credenciales.ts";
import type { TutorRow } from "./tutores-types.ts";
import {
  avisosQuitarTutor,
  bloqueosBorrarRosterTutores,
  confirmacionRosterCorrecta,
  confirmacionRosterEsperada,
  tutorQuedaHuerfano,
  validarDatosTutor,
  type ContextoRosterTutores,
  type DatosTutorEditables,
} from "./tutores-borrado-puro.ts";

/**
 * tutores-borrado.ts — editar, quitar y vaciar el roster de TUTORES. 2026-10-25.
 *
 * Es la simetría que le faltaba al rol técnico: el roster de ALUMNOS se puede
 * cargar, dar de baja uno a uno (`roster-borrado.ts`) y borrar entero
 * (`borrar-paso.ts`); el de TUTORES solo se podía crecer (crear y generar).
 *
 * Patrón del repo, el mismo de la baja de alumno: **previsualizar → confirmar**,
 * y la baja es SIEMPRE lógica (`activo = false`). Ninguna función de este archivo
 * borra una fila: el registro se conserva para auditoría y volver a vincular
 * deshace la operación. Las decisiones que no necesitan la base —qué avisa cada
 * borrado, qué dato de tutor es válido— viven en `./tutores-borrado-puro.ts`.
 */

export type PreviewQuitarTutor = {
  curpAlumno: string;
  nombreAlumno: string | null;
  /** `null` si el alumno no tiene ningún tutor activo. */
  tutor: {
    id: string;
    claveTutor: string;
    nombre: string | null;
    usuario: string | null;
    /** Ya cambió su contraseña inicial: la cuenta está en uso. */
    yaEntro: boolean;
  } | null;
  /** Otros alumnos del mismo tutor, que conservarán la cuenta. */
  otrosAlumnos: { curp: string; nombre: string }[];
  /** La cuenta se quedará sin alumnos y se desactivará. */
  quedaHuerfano: boolean;
  avisos: string[];
};

/** Nombre completo del alumno por CURP, o `null` si no está en ALUMNOS. */
async function nombreAlumno(supabase: SupabaseClient, curp: string): Promise<string | null> {
  const { data } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
    .eq("CURP", curp)
    .limit(1);
  const fila = data?.[0] as AlumnoRow | undefined;
  return fila ? nombreCompletoAlumno(fila) || null : null;
}

/**
 * Qué pasa si se le quita el tutor a este alumno. No escribe nada.
 * Un alumno sin tutor devuelve `tutor: null` y la UI lo dice en vez de ofrecer
 * un botón que no haría nada.
 */
export async function previsualizarQuitarTutor(
  supabase: SupabaseClient,
  curpAlumno: string,
): Promise<PreviewQuitarTutor> {
  const curp = curpAlumno.trim().toUpperCase();
  const vacio: PreviewQuitarTutor = {
    curpAlumno: curp,
    nombreAlumno: null,
    tutor: null,
    otrosAlumnos: [],
    quedaHuerfano: false,
    avisos: [],
  };
  if (!curp) return vacio;

  const nombre = await nombreAlumno(supabase, curp);

  const { data: rel } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("tutor_id")
    .eq("curp_alumno", curp)
    .eq("activo", true)
    .order("tipo_relacion", { ascending: true }) // 'principal' < 'secundario'
    .limit(1);
  const tutorId = (rel?.[0] as { tutor_id?: string } | undefined)?.tutor_id;
  if (!tutorId) return { ...vacio, nombreAlumno: nombre };

  const { data: filaTutor } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .eq("id", tutorId)
    .limit(1);
  const tutor = filaTutor?.[0] as TutorRow | undefined;

  // Todos los alumnos activos de ese tutor: el de la consulta y los demás.
  const { data: suyos } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("curp_alumno")
    .eq("tutor_id", tutorId)
    .eq("activo", true);
  const curpsDelTutor = (suyos ?? []).map((r) => String((r as { curp_alumno: string }).curp_alumno).toUpperCase());
  const otrosCurps = curpsDelTutor.filter((c) => c !== curp);

  const otrosAlumnos: { curp: string; nombre: string }[] = [];
  if (otrosCurps.length > 0) {
    const { data: filas } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .in("CURP", otrosCurps);
    const porCurp = new Map<string, string>();
    for (const f of (filas ?? []) as AlumnoRow[]) {
      porCurp.set(String(f.CURP ?? "").trim().toUpperCase(), nombreCompletoAlumno(f));
    }
    for (const c of otrosCurps) otrosAlumnos.push({ curp: c, nombre: porCurp.get(c) ?? c });
  }

  const ctx = {
    tieneTutor: true,
    alumnosDelTutor: curpsDelTutor.length,
    tutorYaEntro: tutor ? tutor.debe_cambiar_credenciales === false : false,
  };

  return {
    curpAlumno: curp,
    nombreAlumno: nombre,
    tutor: tutor
      ? {
          id: tutor.id,
          claveTutor: tutor.clave_tutor,
          nombre: [tutor.nombre, tutor.apellidos].filter(Boolean).join(" ").trim() || null,
          usuario: tutor.usuario,
          yaEntro: ctx.tutorYaEntro,
        }
      : null,
    otrosAlumnos,
    quedaHuerfano: tutorQuedaHuerfano(ctx),
    avisos: avisosQuitarTutor(ctx),
  };
}

export type ResultadoQuitarTutor =
  | { ok: true; mensaje: string; tutorDesactivado: boolean }
  | { ok: false; error: string };

/**
 * Quita el vínculo alumno↔tutor. Desactiva la relación y, si el tutor se queda
 * sin ningún alumno, también la cuenta. No borra filas: volver a vincular al
 * alumno deshace la operación.
 */
export async function quitarTutorDeAlumno(
  supabase: SupabaseClient,
  curpAlumno: string,
): Promise<ResultadoQuitarTutor> {
  const previo = await previsualizarQuitarTutor(supabase, curpAlumno);
  if (!previo.tutor) {
    return { ok: false, error: "Ese alumno no tiene ningún tutor activo." };
  }

  const { error } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .update({ activo: false })
    .eq("curp_alumno", previo.curpAlumno)
    .eq("tutor_id", previo.tutor.id)
    .eq("activo", true);
  if (error) return { ok: false, error: `No se pudo quitar el tutor: ${error.message}` };

  let tutorDesactivado = false;
  if (previo.quedaHuerfano) {
    const { error: e2 } = await supabase
      .from(TABLA_TUTORES)
      .update({ activo: false })
      .eq("id", previo.tutor.id);
    tutorDesactivado = !e2;
  }

  const quien = previo.nombreAlumno ?? previo.curpAlumno;
  return {
    ok: true,
    tutorDesactivado,
    mensaje: tutorDesactivado
      ? `Tutor ${previo.tutor.claveTutor} quitado de ${quien}. Era su único alumno: la cuenta queda desactivada.`
      : `Tutor ${previo.tutor.claveTutor} quitado de ${quien}. La cuenta sigue activa con sus otros ${previo.otrosAlumnos.length} alumno(s).`,
  };
}

export type TutorEditableDeAlumno = {
  curpAlumno: string;
  nombreAlumno: string;
  /** `null` si ese alumno no tiene tutor activo: no hay nada que editar. */
  tutor: {
    id: string;
    claveTutor: string;
    usuario: string | null;
    datos: DatosTutorEditables;
  } | null;
};

/**
 * Busca un alumno por CURP o por nombre y devuelve, en el mismo viaje, los datos
 * editables de su tutor. Es lo que necesita el formulario de corrección: sin
 * esto habría que encadenar «buscar alumno» y «leer tutor» desde el navegador.
 */
export async function obtenerTutorEditableDeAlumno(
  supabase: SupabaseClient,
  texto: string,
): Promise<TutorEditableDeAlumno | null> {
  const alumno = await buscarAlumnoPorTexto(supabase, texto);
  if (!alumno) return null;
  const curp = String(alumno.CURP ?? "").trim().toUpperCase();

  const { data: rel } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("tutor_id")
    .eq("curp_alumno", curp)
    .eq("activo", true)
    .order("tipo_relacion", { ascending: true })
    .limit(1);
  const tutorId = (rel?.[0] as { tutor_id?: string } | undefined)?.tutor_id;
  const base = { curpAlumno: curp, nombreAlumno: nombreCompletoAlumno(alumno) };
  if (!tutorId) return { ...base, tutor: null };

  const { data: filaTutor } = await supabase
    .from(TABLA_TUTORES)
    .select(SELECT_TUTOR)
    .eq("id", tutorId)
    .limit(1);
  const t = filaTutor?.[0] as TutorRow | undefined;
  if (!t) return { ...base, tutor: null };

  return {
    ...base,
    tutor: {
      id: t.id,
      claveTutor: t.clave_tutor,
      usuario: t.usuario,
      datos: {
        nombre: t.nombre ?? "",
        apellidos: t.apellidos ?? "",
        curp: t.curp ?? "",
        telefono: t.telefono ?? "",
        correo: t.correo ?? "",
      },
    },
  };
}

export type ResultadoEditarTutor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/**
 * Corrige los datos de contacto de un tutor. Es el trabajo que hoy no tenía
 * pantalla: los 460 tutores activos se generaron automáticamente desde el
 * roster y ninguno tiene teléfono, correo ni CURP.
 *
 * NO toca credenciales (eso es `cambiarCredencialesTutor`) ni relaciones.
 */
export async function editarDatosTutor(
  supabase: SupabaseClient,
  tutorId: string,
  datos: DatosTutorEditables,
): Promise<ResultadoEditarTutor> {
  if (!tutorId) return { ok: false, error: "Falta el tutor." };
  const v = validarDatosTutor(datos);
  if (!v.ok) return { ok: false, error: v.error };

  const { error } = await supabase
    .from(TABLA_TUTORES)
    .update({ ...v.datos, updated_at: new Date().toISOString() })
    .eq("id", tutorId);
  if (error) return { ok: false, error: `No se pudieron guardar los datos: ${error.message}` };
  return { ok: true, mensaje: "Datos del tutor actualizados." };
}

export type PreviewRosterTutores = ContextoRosterTutores & {
  bloqueos: string[];
  /** Lo que hay que escribir para confirmar. Lleva dentro el número de tutores. */
  confirmacionEsperada: string;
};

/** Cuántos tutores, relaciones y alumnos toca el vaciado. No escribe nada. */
export async function previsualizarBorrarRosterTutores(
  supabase: SupabaseClient,
): Promise<PreviewRosterTutores> {
  const { count: tutoresActivos } = await supabase
    .from(TABLA_TUTORES)
    .select("id", { count: "exact", head: true })
    .eq("activo", true);

  const { count: relacionesActivas } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("id", { count: "exact", head: true })
    .eq("activo", true);

  const { data: curps } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .select("curp_alumno")
    .eq("activo", true);
  const alumnosConTutor = new Set(
    (curps ?? []).map((r) => String((r as { curp_alumno: string }).curp_alumno).toUpperCase()),
  ).size;

  const ctx: ContextoRosterTutores = {
    tutoresActivos: tutoresActivos ?? 0,
    relacionesActivas: relacionesActivas ?? 0,
    alumnosConTutor,
  };
  return {
    ...ctx,
    bloqueos: bloqueosBorrarRosterTutores(ctx),
    confirmacionEsperada: confirmacionRosterEsperada(ctx),
  };
}

export type ResultadoBorrarRosterTutores =
  | { ok: true; mensaje: string; tutores: number; relaciones: number }
  | { ok: false; error: string };

/**
 * Vacía el roster de tutores: desactiva TODAS las relaciones y TODAS las
 * cuentas. No borra ni una fila, así que «Generar automáticos» vuelve a
 * poblarlo y las cuentas viejas quedan como historial.
 *
 * La confirmación escrita lleva dentro el número de tutores de la
 * previsualización: si la cifra cambió mientras se miraba, no coincide y la
 * operación se rechaza en vez de aplicarse sobre un estado que nadie vio.
 */
export async function borrarRosterTutores(
  supabase: SupabaseClient,
  confirmacion: string,
): Promise<ResultadoBorrarRosterTutores> {
  const previo = await previsualizarBorrarRosterTutores(supabase);
  if (previo.bloqueos.length > 0) return { ok: false, error: previo.bloqueos[0] };
  if (!confirmacionRosterCorrecta(previo, confirmacion)) {
    return {
      ok: false,
      error: `Para confirmar hay que escribir «${previo.confirmacionEsperada}». Si la cifra no coincide, vuelve a previsualizar.`,
    };
  }

  const { error: eRel } = await supabase
    .from(TABLA_TUTOR_ALUMNOS)
    .update({ activo: false })
    .eq("activo", true);
  if (eRel) return { ok: false, error: `No se pudieron desactivar las relaciones: ${eRel.message}` };

  const { error: eTut } = await supabase
    .from(TABLA_TUTORES)
    .update({ activo: false })
    .eq("activo", true);
  if (eTut) return { ok: false, error: `Relaciones desactivadas, pero las cuentas no: ${eTut.message}` };

  return {
    ok: true,
    tutores: previo.tutoresActivos,
    relaciones: previo.relacionesActivas,
    mensaje: `Roster de tutores vaciado: ${previo.tutoresActivos} cuenta(s) y ${previo.relacionesActivas} vínculo(s) desactivados. No se borró ninguna fila.`,
  };
}
