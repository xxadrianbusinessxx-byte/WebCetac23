/**
 * AUTORIZACIÓN DE ACCESO AL ALUMNO — FASE 2 (capa reutilizable)
 *
 * Centraliza la decisión «¿quién puede leer/escribir sobre este alumno?»:
 *
 *   sesión + rol + CURP objetivo + relación
 *            ↓
 *   resolverAccesoAlumno(...)  →  AccesoAlumno (permisos)
 *
 * Reglas (filosofia.estructural §7 — seguridad por servidor):
 *   · ALUMNO      → lee su propia información; NUNCA escribe (ni datos
 *                   personales ni etiquetas ni información del tutor).
 *   · TUTOR       → lee/edita SOLO alumnos vinculados activos (tutor_alumnos).
 *   · DIRECTIVO   → acceso administrativo completo (incluye importación global).
 *   · MAESTRO     → consulta SOLO alumnos de grupos donde imparte clase
 *                   (asignaciones_profesor → grupo_materias → grupos →
 *                   inscripciones_alumno). Sin escritura sobre datos
 *                   personales/etiquetas.
 *
 * El resultado NUNCA depende de query params, modo de UI ni props: se calcula
 * en el servidor con la sesión firmada y la base de datos. La UI solo consume
 * los flags para presentación.
 *
 * Este módulo NO ejecuta operaciones de datos de etiquetas: solo autoriza.
 * La persistencia vive en lib/escolar/etiquetas-dinamicas-servicio.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PortalSessionPayload } from "../auth/types";
import { normalizarCurp } from "./buscar-en-filas";
import { buscarAlumnoPorClave } from "./alumnos";
import { profesorTieneAccesoAlumno } from "./catalogo-academico";
import { listarCurpsDeTutor } from "./tutores";

/** Permisos efectivos para un alumno, calculados SIEMPRE en el servidor. */
export type AccesoAlumno = {
  /** Rol con el que se accede (presentación y semántica). */
  modo: "alumno" | "tutor" | "directivo" | "maestro";
  puedeLeer: boolean;
  /** Editar etiquetas dinámicas (alumno_etiquetas). */
  puedeEditarEtiquetas: boolean;
  /** Editar campos personales definidos (EDAD/ESTATURA/comentario). */
  puedeEditarDatosPersonales: boolean;
  /** Importar etiquetas desde Excel dentro del perfil. */
  puedeImportarEtiquetas: boolean;
  /** Importación masiva desde Configuración (solo directivo). */
  puedeImportarGlobal: boolean;
  puedeSubirFoto: boolean;
  /** true = el visitante es el propio alumno (sin delegación). */
  esPropioAlumno: boolean;
};

export type ResolucionAccesoAlumno =
  | { ok: true; acceso: AccesoAlumno; curp: string }
  | { ok: false; error: string };

function accesoDenegado(error: string): ResolucionAccesoAlumno {
  return { ok: false, error };
}

/** CURP de la sesión de alumno (directa o por matrícula/CLAVE). */
async function curpDeSesionAlumno(
  supabase: SupabaseClient,
  sesion: PortalSessionPayload,
): Promise<string | null> {
  const directa = normalizarCurp(sesion.curp ?? "");
  if (directa) return directa;
  if (sesion.matricula) {
    const a = await buscarAlumnoPorClave(supabase, sesion.matricula);
    return a?.CURP ?? null;
  }
  return null;
}

/**
 * Resuelve la autorización de acceso al alumno `curpObjetivo`.
 * Devuelve la CURP efectiva (normalizada) y los permisos del visitante.
 */
export async function resolverAccesoAlumno(
  supabase: SupabaseClient,
  sesion: PortalSessionPayload | null,
  curpObjetivo?: string | null,
): Promise<ResolucionAccesoAlumno> {
  if (!sesion) return accesoDenegado("Sesión no válida.");
  const curpSolicitada = normalizarCurp(curpObjetivo ?? "");

  if (sesion.rol === "directivo") {
    if (!curpSolicitada) {
      return accesoDenegado("Indica la CURP del alumno a consultar.");
    }
    return {
      ok: true,
      curp: curpSolicitada,
      acceso: {
        modo: "directivo",
        puedeLeer: true,
        puedeEditarEtiquetas: true,
        puedeEditarDatosPersonales: true,
        puedeImportarEtiquetas: true,
        puedeImportarGlobal: true,
        puedeSubirFoto: true,
        esPropioAlumno: false,
      },
    };
  }

  if (sesion.rol === "alumno") {
    const curpPropia = await curpDeSesionAlumno(supabase, sesion);
    if (!curpPropia) return accesoDenegado("No se pudo identificar al alumno.");
    if (curpSolicitada && curpSolicitada !== curpPropia) {
      return accesoDenegado("No tienes permiso para ver este perfil.");
    }
    return {
      ok: true,
      curp: curpPropia,
      acceso: {
        modo: "alumno",
        puedeLeer: true,
        puedeEditarEtiquetas: false,
        puedeEditarDatosPersonales: false,
        puedeImportarEtiquetas: false,
        puedeImportarGlobal: false,
        puedeSubirFoto: false,
        esPropioAlumno: true,
      },
    };
  }

  if (sesion.rol === "tutor") {
    if (!curpSolicitada) {
      return accesoDenegado("Indica la CURP del alumno.");
    }
    const curpsDeTutor = await listarCurpsDeTutor(supabase, sesion.matricula);
    const curpsNorm = curpsDeTutor.map((c) => normalizarCurp(c));
    if (!curpsNorm.includes(curpSolicitada)) {
      return accesoDenegado("No tienes relación con ese alumno.");
    }
    return {
      ok: true,
      curp: curpSolicitada,
      acceso: {
        modo: "tutor",
        puedeLeer: true,
        puedeEditarEtiquetas: true,
        puedeEditarDatosPersonales: true,
        puedeImportarEtiquetas: true,
        puedeImportarGlobal: false,
        puedeSubirFoto: true,
        esPropioAlumno: false,
      },
    };
  }

  if (sesion.rol === "maestro") {
    if (!curpSolicitada) {
      return accesoDenegado("Indica la CURP del alumno.");
    }
    const imparte = await profesorTieneAccesoAlumno(
      supabase,
      sesion.matricula,
      curpSolicitada,
    );
    if (!imparte) {
      return accesoDenegado("Solo puedes consultar alumnos de tus grupos.");
    }
    return {
      ok: true,
      curp: curpSolicitada,
      acceso: {
        modo: "maestro",
        puedeLeer: true,
        puedeEditarEtiquetas: false,
        puedeEditarDatosPersonales: false,
        puedeImportarEtiquetas: false,
        puedeImportarGlobal: false,
        puedeSubirFoto: false,
        esPropioAlumno: false,
      },
    };
  }

  return accesoDenegado("Rol sin acceso a perfiles de alumnos.");
}

