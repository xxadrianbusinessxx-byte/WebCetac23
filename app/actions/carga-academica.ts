"use server";

/**
 * C3.1 — Server Actions de CARGA MASIVA (ALUMNOS + PERTENENCIA ACADÉMICA).
 *
 * SEGURIDAD:
 *  - Solo capacidad directivo (exigir + cookie firmada).
 *  - Usa `createClient()` del servidor (public key + cookies). NUNCA
 *    service_role desde una Server Action de carga.
 *  - La preview (actionPrevisualizarCargaAcademica) es SOLO LECTURA.
 *  - La aplicación (actionAplicarCargaAcademica) requiere el archivo, un mapeo
 *    válido y el contexto; internamente vuelve a generar la preview y bloquea
 *    la escritura si hay estados que la impiden.
 */
import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import {
  aplicarCargaAcademica,
  listarCatalogoReconocimiento,
  previsualizarCargaAcademica,
  type CatalogoReconocimiento,
  type ContextoAcademico,
  type GrupoReconocimiento,
  type PreviewCargaAcademica,
  type ResultadoAplicarCarga,
} from "@/lib/escolar/catalogo/carga-academica";
import { mapeoRosterValido, type MapeoRoster } from "@/lib/escolar/materia/mapeo-columnas";

/**
 * Los tipos del catálogo de reconocimiento viven en la capa de dominio
 * (`lib/escolar/catalogo/carga-academica.ts`); se re-exportan aquí para no
 * romper los imports existentes de la UI.
 */
export type { CatalogoReconocimiento, GrupoReconocimiento };

function extraerMapeoOError(
  formData: FormData,
): { mapeo?: MapeoRoster; error?: string } {
  const raw = formData.get("mapeo");
  if (typeof raw !== "string" || !raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "El mapeo de columnas enviado no es válido." };
  }
  if (!mapeoRosterValido(parsed, 100)) {
    return { error: "El mapeo de columnas enviado no es válido." };
  }
  return { mapeo: parsed as MapeoRoster };
}

function extraerContexto(formData: FormData): ContextoAcademico | undefined {
  const periodoId = String(formData.get("periodoId") ?? "").trim();
  const periodoNombre = String(formData.get("periodoNombre") ?? "").trim();
  const grado = String(formData.get("grado") ?? "").trim();
  const grupo = String(formData.get("grupo") ?? "").trim();
  const carrera = String(formData.get("carrera") ?? "").trim();
  // F3: `periodoId` presente → flujo nuevo (destino por id). `periodoId`
  // ausente → flujo legacy (destino por periodoNombre/ciclo operativo).
  // NO se convierte `periodoId → periodoNombre → ciclo operativo`.
  if (!periodoId && !periodoNombre) return undefined;
  return { periodoNombre, periodoId: periodoId || undefined, grado, grupo, carrera };
}

function archivoDeFormData(formData: FormData): File | null {
  const archivo = formData.get("archivo");
  return archivo instanceof File && archivo.size > 0 ? archivo : null;
}

function previewError(error: string): PreviewCargaAcademica {
  return {
    ok: false,
    error,
    mapeo: { curp: -1, nombre: -1, pApellido: -1, sApellido: -1, grado: -1, grupo: -1, carrera: -1 },
    periodoUtilizado: null,
    alumnos: {
      totalFilas: 0,
      curpsValidas: 0,
      curpsAusentes: 0,
      curpsDuplicadas: 0,
      alumnosNuevos: 0,
      alumnosExistentes: 0,
      alumnosSinCambios: 0,
      camposCompletados: 0,
    },
    academico: {
      sinDatosAcademicos: 0,
      nuevasInscripciones: 0,
      sinCambio: 0,
      cambiosDeGrupo: 0,
      gruposInexistentes: 0,
      ambiguos: 0,
      conflictosAcademicos: 0,
    },
    bloqueaEscritura: false,
    detalle: [],
  };
}

function applyError(error: string): ResultadoAplicarCarga {
  return {
    ok: false,
    error,
    alumnos: { agregados: 0, completados: 0, yaExistentesSinCambios: 0, omitidos: 0, duplicados: 0 },
    inscripciones: { nuevas: 0, cambiosDeGrupo: 0, errores: 0, erroresDetalle: [] },
  };
}

/** Preview de la carga (SOLO LECTURA). Rol: directivo. */
export async function actionPrevisualizarCargaAcademica(
  formData: FormData,
): Promise<PreviewCargaAcademica> {
  const g = await exigir("carga_academica.aplicar");
  if (!g.ok) {
    return previewError("Solo directivos pueden previsualizar la carga académica.");
  }
  const archivo = archivoDeFormData(formData);
  if (!archivo) {
    return previewError("Selecciona un archivo válido.");
  }
  const { mapeo, error } = extraerMapeoOError(formData);
  if (error) return previewError(error);
  const contexto = extraerContexto(formData);
  const supabase = await createClient();
  return previsualizarCargaAcademica(supabase, archivo, { mapeo, contexto });
}

/** Aplica la carga (requiere confirmación implícita por rol y preview limpia). Rol: directivo. */
export async function actionAplicarCargaAcademica(
  formData: FormData,
): Promise<ResultadoAplicarCarga> {
  const g = await exigir("carga_academica.aplicar");
  if (!g.ok) {
    return applyError("Solo directivos pueden aplicar la carga académica.");
  }
  const archivo = archivoDeFormData(formData);
  if (!archivo) {
    return applyError("Selecciona un archivo válido.");
  }
  const { mapeo, error } = extraerMapeoOError(formData);
  if (error) return applyError(error);
  const contexto = extraerContexto(formData);
  const supabase = await createClient();
  return aplicarCargaAcademica(supabase, archivo, { mapeo, contexto });
}

/**
 * C4.19 — Catálogo REAL para el bloque «Reconocimiento académico de alumnos»
 * (solo rol directivo). La consulta vive en la capa de dominio
 * (`listarCatalogoReconocimiento`); aquí solo se valida la capacidad.
 */
export async function actionListarCatalogoReconocimiento(): Promise<
  CatalogoReconocimiento | { ok: false; error: string }
> {
  const g = await exigir("materia.ver_catalogo");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }
  const supabase = await createClient();
  return listarCatalogoReconocimiento(supabase);
}
