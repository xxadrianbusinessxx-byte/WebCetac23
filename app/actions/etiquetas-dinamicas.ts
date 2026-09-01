"use server";

/**
 * SERVER ACTIONS DEL MÓDULO ETIQUETAS DINÁMICAS (FASE 2)
 *
 * Autorización centralizada en lib/escolar/acceso-alumno.ts:
 *   · ALUMNO   → lectura; NUNCA escribe etiquetas ni datos personales.
 *   · TUTOR    → escritura SOLO sobre alumnos vinculados (tutor_alumnos activos).
 *   · DIRECTIVO→ administración completa + importación global.
 *   · MAESTRO  → lectura (no escribe aquí).
 *
 * La persistencia real vive en lib/escolar/etiquetas-dinamicas-servicio.ts;
 * la importación Excel en lib/escolar/importar-etiquetas.ts. Esta capa solo
 * valida la sesión/permiso y orquesta.
 */
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { resolverAccesoAlumno } from "@/lib/escolar/acceso-alumno";
import {
  actualizarOrdenEtiquetasDinamicas,
  eliminarEtiquetaDinamica,
  guardarEtiquetasDinamicas,
  obtenerEtiquetasDinamicas,
  type ResultadoEtiquetas,
} from "@/lib/escolar/etiquetas-dinamicas-servicio";
import type { AlumnoEtiquetaRow } from "@/lib/escolar/etiquetas-dinamicas";
import {
  actualizarEtiquetasPersonales,
  CAMPOS_PERSONALES_PRIMARIOS,
  patchCamposPersonales,
  type CampoPersonalPrimario,
} from "@/lib/escolar/etiquetas";
import type { EtiquetaAlumno } from "@/lib/escolar/etiquetas-dinamicas";
import {
  leerEtiquetasDesdeArchivoGlobal,
  leerEtiquetasDesdeArchivoIndividual,
} from "@/lib/escolar/importar-etiquetas";
import { TABLA_ALUMNOS } from "@/lib/escolar/tables";
import { createClient } from "@/lib/supabase/server";

const TAMANO_LOTE_CURPS = 50;

/** Error estructurado (mismo patrón { ok, error } del proyecto). */
type Err = { ok: false; error: string };

function noAutorizado(mensaje = "No tienes permiso."): Err {
  return { ok: false, error: mensaje };
}

/** Valida que la sesión tenga permiso de ESCRITURA de etiquetas para el CURP. */
async function autorizarEscrituraEtiquetas(
  curp: string,
): Promise<{ ok: true } | Err> {
  const sesion = await obtenerSesionPortal();
  const supabase = await createClient();
  const res = await resolverAccesoAlumno(supabase, sesion, curp);
  if (!res.ok) return { ok: false, error: res.error };
  if (!res.acceso.puedeEditarEtiquetas) return noAutorizado();
  return { ok: true };
}

/**
 * Guarda el conjunto completo de etiquetas de un alumno (botón GUARDAR del
 * perfil). Solo tutor (con relación) o directivo.
 */
export async function actionGuardarEtiquetasDinamicas(
  curp: string,
  etiquetas: EtiquetaAlumno[],
): Promise<ResultadoEtiquetas<AlumnoEtiquetaRow[]>> {
  const permiso = await autorizarEscrituraEtiquetas(curp);
  if (!permiso.ok) return permiso;
  const supabase = await createClient();
  return guardarEtiquetasDinamicas(supabase, curp, etiquetas);
}

/** Elimina UNA etiqueta por id + curp (autorización previa). */
export async function actionEliminarEtiquetaDinamica(
  id: string,
  curp: string,
): Promise<ResultadoEtiquetas<{ eliminadas: number }>> {
  const permiso = await autorizarEscrituraEtiquetas(curp);
  if (!permiso.ok) return permiso;
  const supabase = await createClient();
  return eliminarEtiquetaDinamica(supabase, id, curp);
}

/** Reordena todas las etiquetas de un alumno (ids en el nuevo orden). */
export async function actionReordenarEtiquetasDinamicas(
  curp: string,
  idsOrdenados: string[],
): Promise<ResultadoEtiquetas<AlumnoEtiquetaRow[]>> {
  const permiso = await autorizarEscrituraEtiquetas(curp);
  if (!permiso.ok) return permiso;
  const supabase = await createClient();
  return actualizarOrdenEtiquetasDinamicas(supabase, curp, idsOrdenados);
}

/**
 * Importación INDIVIDUAL de etiquetas desde Excel (dentro del perfil).
 * El alumno es el contexto (curp); NO se identifica al alumno en el archivo.
 * Semántica de MEZCLA: los títulos del archivo actualizan los existentes y
 * agregan los nuevos; el resto se conserva.
 */
export async function actionImportarEtiquetasIndividual(
  formData: FormData,
  curp: string,
): Promise<
  | {
      ok: true;
      resumen: { agregadas: number; actualizadas: number };
      etiquetas: AlumnoEtiquetaRow[];
    }
  | Err
> {
  const permiso = await autorizarEscrituraEtiquetas(curp);
  if (!permiso.ok) return permiso;

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return noAutorizado("Selecciona un archivo Excel válido.");
  }

  const parse = await leerEtiquetasDesdeArchivoIndividual(archivo);
  if (!parse.ok) return { ok: false, error: parse.error };

  const supabase = await createClient();
  const existentes = await obtenerEtiquetasDinamicas(supabase, curp);

  // Mezcla: mapa por título normalizado (existentes en orden; el archivo
  // actualiza valores existentes y agrega los títulos nuevos).
  const mapa = new Map<string, { titulo: string; valor: string; orden: number }>();
  existentes.forEach((f, i) =>
    mapa.set(f.titulo.trim().toUpperCase(), { titulo: f.titulo, valor: f.valor, orden: i }),
  );
  let agregadas = 0;
  let actualizadas = 0;
  for (const e of parse.etiquetas) {
    const norm = e.titulo.trim().toUpperCase();
    if (mapa.has(norm)) actualizadas++;
    else agregadas++;
    mapa.set(norm, e);
  }
  const mezcla: EtiquetaAlumno[] = [...mapa.values()].sort((a, b) => a.orden - b.orden);

  const guardado = await guardarEtiquetasDinamicas(supabase, curp, mezcla);
  if (!guardado.ok) return { ok: false, error: guardado.error };
  return { ok: true, resumen: { agregadas, actualizadas }, etiquetas: guardado.data };
}

/**
 * Importación GLOBAL de etiquetas desde Excel (Configuración, solo directivo).
 * Columnas: CURP + columnas de etiquetas. Reemplaza el conjunto de cada alumno
 * presente. Los errores por fila NO abortan el archivo completo.
 */
export async function actionImportarEtiquetasGlobal(
  formData: FormData,
): Promise<
  | {
      ok: true;
      resumen: {
        procesados: number;
        actualizados: number;
        omitidos: number;
        alumnosNoEncontrados: string[];
        errores: string[];
        duplicadosCurp: string[];
      };
    }
  | Err
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return noAutorizado("Solo directivos.");

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return noAutorizado("Selecciona un archivo Excel válido.");
  }

  const parse = await leerEtiquetasDesdeArchivoGlobal(archivo);
  if (!parse.ok) return { ok: false, error: parse.error };

  const supabase = await createClient();

  // 1) Validar existencia de alumnos (batch, sin N+1).
  const curps = parse.filas.map((f) => f.curp);
  const existentes = new Set<string>();
  for (let i = 0; i < curps.length; i += TAMANO_LOTE_CURPS) {
    const lote = curps.slice(i, i + TAMANO_LOTE_CURPS);
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP")
      .in("CURP", lote);
    if (error || !data) continue;
    for (const r of data as { CURP: string }[]) {
      existentes.add(String(r.CURP ?? "").trim().toUpperCase());
    }
  }

  // 2) Aplicar por alumno (reemplazo del conjunto). Los errores se acumulan.
  let actualizados = 0;
  let omitidos = 0;
  const alumnosNoEncontrados: string[] = [];
  const errores: string[] = [...parse.errores];

  for (const fila of parse.filas) {
    if (!existentes.has(fila.curp)) {
      alumnosNoEncontrados.push(fila.curp);
      omitidos++;
      continue;
    }
    const guardado = await guardarEtiquetasDinamicas(supabase, fila.curp, fila.etiquetas);
    if (!guardado.ok) {
      errores.push(`${fila.curp}: ${guardado.error}`);
      omitidos++;
      continue;
    }
    actualizados++;
  }

  return {
    ok: true,
    resumen: {
      procesados: parse.filas.length,
      actualizados,
      omitidos,
      alumnosNoEncontrados,
      errores,
      duplicadosCurp: parse.duplicadosCurp,
    },
  };
}

/**
 * Guarda los campos personales DEFINIDOS del alumno (edad, estatura, género,
 * sangre, alergias, contacto, etc.). Son campos ESTRUCTURADOS (no etiquetas).
 * Solo tutor (con relación activa en tutor_alumnos) o directivo. El alumno y
 * el maestro conservan SOLO lectura. La autorización nunca depende de la UI.
 */
export async function actionGuardarCamposPersonales(
  curp: string,
  campos: Partial<Record<CampoPersonalPrimario, unknown>>,
): Promise<{ ok: true } | Err> {
  const sesion = await obtenerSesionPortal();
  const supabase = await createClient();
  const res = await resolverAccesoAlumno(supabase, sesion, curp);
  if (!res.ok) return { ok: false, error: res.error };
  if (!res.acceso.puedeEditarDatosPersonales) return noAutorizado();

  // Validación server-side: strings, longitud máxima y vacíos → NULL.
  for (const campo of CAMPOS_PERSONALES_PRIMARIOS) {
    const v = campos[campo];
    if (v == null) continue;
    const t = String(v);
    if (t.length > 200) {
      return { ok: false, error: `Valor demasiado largo en «${campo}».` };
    }
  }
  const r = await actualizarEtiquetasPersonales(
    supabase,
    curp,
    patchCamposPersonales(campos),
  );
  return r;
}

