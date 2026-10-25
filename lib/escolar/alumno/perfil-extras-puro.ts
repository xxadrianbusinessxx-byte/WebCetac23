/**
 * perfil-extras-puro.ts — MÓDULO PURO. PROMPT Z.
 *
 * Lee de la respuesta de la RPC `obtener_perfil_alumno` v2 los tres datos del
 * perfil que antes costaban tres consultas aparte (número de control, etiquetas
 * dinámicas y contacto del tutor principal). Si la respuesta no es v2 (el SQL de
 * `supabase/crear-rpc-obtener-perfil-alumno.sql` aún sin aplicar), devuelve null
 * y quien llama consulta como antes: el perfil nunca depende de que la v2 exista.
 *
 * Mismas reglas que las lecturas a las que sustituye:
 *   · número de control: recortado; vacío = null (`leerNumeroControl`);
 *   · etiquetas: las filas tal cual, ya ordenadas por la RPC (`obtenerEtiquetasDinamicas`);
 *   · tutor: nombre + apellidos, teléfono y correo (`nombreCompletoTutor`).
 */
import type { AlumnoEtiquetaRow } from "./etiquetas-dinamicas.ts";

export type ContactoTutorPerfil = {
  nombre: string;
  telefono: string | null;
  correo: string | null;
};

export type ExtrasPerfil = {
  etiquetasDinamicas: AlumnoEtiquetaRow[];
  tutorContacto: ContactoTutorPerfil | null;
  numeroControl: string | null;
};

type TutorV2 = {
  nombre?: string | null;
  apellidos?: string | null;
  telefono?: string | null;
  correo?: string | null;
};

/** Número de control como lo devuelve `leerNumeroControl`: recortado, o null. */
export function numeroControlLeido(valor: unknown): string | null {
  const v = typeof valor === "string" ? valor.trim() : "";
  return v ? v : null;
}

/** Contacto del tutor como lo arma el perfil (`nombreCompletoTutor` + teléfono y correo). */
export function contactoTutor(t: TutorV2 | null | undefined): ContactoTutorPerfil | null {
  if (!t) return null;
  return {
    nombre: [t.nombre, t.apellidos].filter(Boolean).join(" ").trim(),
    telefono: t.telefono ?? null,
    correo: t.correo ?? null,
  };
}

/** Los extras de una respuesta v2; null si la RPC aplicada es la v1. */
export function extrasDesdeRpcPerfil(rpc: unknown): ExtrasPerfil | null {
  if (!rpc || typeof rpc !== "object") return null;
  const r = rpc as {
    perfil_v?: unknown;
    numero_control?: unknown;
    etiquetas_dinamicas?: unknown;
    tutor_principal?: TutorV2 | null;
  };
  if (typeof r.perfil_v !== "number" || r.perfil_v < 2) return null;
  return {
    etiquetasDinamicas: Array.isArray(r.etiquetas_dinamicas) ? (r.etiquetas_dinamicas as AlumnoEtiquetaRow[]) : [],
    tutorContacto: contactoTutor(r.tutor_principal),
    numeroControl: numeroControlLeido(r.numero_control),
  };
}
