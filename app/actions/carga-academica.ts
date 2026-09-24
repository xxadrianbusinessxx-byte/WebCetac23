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
  type PreviewCargaAcademica,
  type ResultadoAplicarCarga,
} from "@/lib/escolar/catalogo/carga-academica";
import { mapeoRosterValido, type MapeoRoster } from "@/lib/escolar/materia/mapeo-columnas";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaCargaAcademica } from "@/lib/validacion/esquemas-puro";

/**
 * Los tipos de presentación viven en la capa de dominio (`lib/escolar/catalogo/carga-academica.ts`) y la UI los
 * importa DE AHÍ, con `import type`.
 *
 * NO SE REEXPORTAN DESDE ESTE ARCHIVO, y no es estilo: un `"use server"` solo
 * puede exportar funciones async. Al compilar con Turbopack —lo que hace Vercel—
 * Next trata cada nombre de una lista `export type { … }` como si fuera una
 * Server Action y genera `registerServerReference(ElTipo, …)`: como el tipo no
 * existe en tiempo de ejecución, el módulo de acciones de `/oceano` revienta al
 * cargarse con `ReferenceError` y caen TODAS las acciones de la app con 500.
 * En `next dev --webpack` no pasa, por eso no se vio en local. Lo vigila C14.
 */

function extraerMapeoOError(mapeoRaw: string): { mapeo?: MapeoRoster; error?: string } {
  if (!mapeoRaw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(mapeoRaw);
  } catch {
    return { error: "El mapeo de columnas enviado no es válido." };
  }
  if (!mapeoRosterValido(parsed, 100)) {
    return { error: "El mapeo de columnas enviado no es válido." };
  }
  return { mapeo: parsed as MapeoRoster };
}

function contextoDe(datos: {
  periodoId: string;
  periodoNombre: string;
  grado: string;
  grupo: string;
  carrera: string;
}): ContextoAcademico | undefined {
  const { periodoId, periodoNombre, grado, grupo, carrera } = datos;
  // F3: `periodoId` presente → flujo nuevo (destino por id). `periodoId`
  // ausente → flujo legacy (destino por periodoNombre/ciclo operativo).
  // NO se convierte `periodoId → periodoNombre → ciclo operativo`.
  if (!periodoId && !periodoNombre) return undefined;
  return { periodoNombre, periodoId: periodoId || undefined, grado, grupo, carrera };
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
  const entrada = leerFormData(esquemaCargaAcademica, formData);
  if (!entrada.ok) return previewError(entrada.error);
  const { mapeo, error } = extraerMapeoOError(entrada.datos.mapeo);
  if (error) return previewError(error);
  const contexto = contextoDe(entrada.datos);
  const supabase = await createClient();
  return previsualizarCargaAcademica(supabase, entrada.datos.archivo, { mapeo, contexto });
}

/** Aplica la carga (requiere confirmación implícita por rol y preview limpia). Rol: directivo. */
export async function actionAplicarCargaAcademica(
  formData: FormData,
): Promise<ResultadoAplicarCarga> {
  const g = await exigir("carga_academica.aplicar");
  if (!g.ok) {
    return applyError("Solo directivos pueden aplicar la carga académica.");
  }
  const entrada = leerFormData(esquemaCargaAcademica, formData);
  if (!entrada.ok) return applyError(entrada.error);
  const { mapeo, error } = extraerMapeoOError(entrada.datos.mapeo);
  if (error) return applyError(error);
  const contexto = contextoDe(entrada.datos);
  const supabase = await createClient();
  return aplicarCargaAcademica(supabase, entrada.datos.archivo, { mapeo, contexto });
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
