/**
 * SERVICIO / REPOSITORIO DEL MÓDULO ETIQUETAS DINÁMICAS — alumno_etiquetas
 * (FASE 2 · PASO 3)
 *
 * Frontera de datos del módulo: TODO el acceso a la tabla `alumno_etiquetas`
 * pasa por este archivo. Los consumidores (Server Actions → perfil) NUNCA
 * deben hacer `supabase.from("alumno_etiquetas")` directamente; así el módulo
 * puede reemplazarse sin reescribir el perfil (filosofia.estructural §1–§3).
 *
 * RESPONSABILIDAD: SOLO reglas del módulo (validación de etiquetas) +
 * persistencia. NO decide autorización: no usa obtenerSesionPortal() ni roles.
 * La capa de Server Actions valida sesión/rol/alumno objetivo/relación ANTES
 * de llamar a este servicio (filosofia.estructural §7).
 *
 * Convenciones: recibe `SupabaseClient` como parámetro (mismo patrón que
 * lib/escolar/catalogo-academico.ts y lib/escolar/asistencias.ts). Los errores
 * se devuelven estructurados ({ ok, error }) sin mensajes crudos de Supabase.
 *
 * NO implementa importación Excel: esa responsabilidad pertenece al módulo de
 * importación, que tras leer/normalizar/identificar columnas invocará
 * `guardarEtiquetasDinamicas` / `guardarEtiquetaDinamica`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_ETIQUETAS_POR_ALUMNO,
  normalizarTituloEtiqueta,
  validarConjuntoEtiquetas,
  validarCurpEtiqueta,
  validarEtiquetaNucleo,
  validarOrdenEtiqueta,
  type AlumnoEtiquetaRow,
  type EtiquetaAlumno,
} from "./etiquetas-dinamicas";
import { TABLA_ALUMNO_ETIQUETAS } from "./tables";

/** Resultado estructurado del módulo (patrón { ok, error } del proyecto). */
export type ResultadoEtiquetas<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Error amigable: no se exponen mensajes crudos de Supabase al usuario. */
function errorOperacion(accion: string, detalle: unknown): { ok: false; error: string } {
  const mensaje = detalle instanceof Error ? detalle.message : String(detalle);
  console.error(`[etiquetas-dinamicas] ${accion}:`, mensaje);
  return { ok: false, error: `No se pudo ${accion}. Intenta de nuevo.` };
}

/* ---------------------------------------------------------------------------
 * LECTURA
 * ------------------------------------------------------------------------- */

/**
 * Etiquetas de un alumno, ordenadas por `orden ASC, created_at ASC`.
 * Nunca se depende del orden físico de PostgreSQL.
 */
export async function obtenerEtiquetasDinamicas(
  supabase: SupabaseClient,
  curp: string,
): Promise<AlumnoEtiquetaRow[]> {
  const curpValida = validarCurpEtiqueta(curp);
  if (!curpValida.ok) return [];

  const { data, error } = await supabase
    .from(TABLA_ALUMNO_ETIQUETAS)
    .select("*")
    .eq("curp", curpValida.curp)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as AlumnoEtiquetaRow[];
}

/**
 * Etiquetas de VARIOS alumnos en UNA sola consulta (`WHERE curp IN (...)`),
 * agrupadas por CURP para facilitar listados/importaciones/reportes sin N+1.
 * Devuelve un Map con las mismas garantías de orden de la lectura individual.
 */
export async function obtenerEtiquetasDinamicasPorCurps(
  supabase: SupabaseClient,
  curps: readonly string[],
): Promise<Map<string, AlumnoEtiquetaRow[]>> {
  const unicos = [
    ...new Set(
      curps
        .map((c) => {
          const v = validarCurpEtiqueta(c);
          return v.ok ? v.curp : "";
        })
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const resultado = new Map<string, AlumnoEtiquetaRow[]>();
  if (unicos.length === 0) return resultado;

  const { data, error } = await supabase
    .from(TABLA_ALUMNO_ETIQUETAS)
    .select("*")
    .in("curp", unicos)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return resultado;
  for (const fila of data as AlumnoEtiquetaRow[]) {
    const lista = resultado.get(fila.curp);
    if (lista) lista.push(fila);
    else resultado.set(fila.curp, [fila]);
  }
  return resultado;
}

/* ---------------------------------------------------------------------------
 * CREAR / ACTUALIZAR (operación única)
 * ------------------------------------------------------------------------- */

/**
 * Crea o actualiza UNA etiqueta de un alumno.
 *  · Si el título (normalizado sin acentos) ya existe → actualiza esa fila
 *    (título presentado, valor y orden).
 *  · Si es nuevo → valida el límite de 20 antes de insertar.
 * La BD añade la red de seguridad del límite vía trigger (ver SQL del módulo).
 */
export async function guardarEtiquetaDinamica(
  supabase: SupabaseClient,
  curp: string,
  etiqueta: EtiquetaAlumno,
): Promise<ResultadoEtiquetas<AlumnoEtiquetaRow>> {
  const curpValida = validarCurpEtiqueta(curp);
  if (!curpValida.ok) return { ok: false, error: curpValida.error };

  const nucleo = validarEtiquetaNucleo(etiqueta);
  if (!nucleo.ok) return { ok: false, error: nucleo.errores.join(" · ") };
  const orden = validarOrdenEtiqueta(etiqueta.orden);
  if (!orden.ok) return { ok: false, error: orden.error };

  const existentes = await obtenerEtiquetasDinamicas(supabase, curpValida.curp);
  const normNuevo = normalizarTituloEtiqueta(nucleo.nucleo.titulo);
  const coincidencia = existentes.find(
    (f) => normalizarTituloEtiqueta(f.titulo) === normNuevo,
  );

  if (coincidencia) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNO_ETIQUETAS)
      .update({
        titulo: nucleo.nucleo.titulo,
        valor: nucleo.nucleo.valor,
        orden: orden.orden,
      })
      .eq("id", coincidencia.id)
      .eq("curp", curpValida.curp)
      .select()
      .maybeSingle();
    if (error) return errorOperacion("actualizar la etiqueta", error);
    return { ok: true, data: data as AlumnoEtiquetaRow };
  }

  if (existentes.length >= MAX_ETIQUETAS_POR_ALUMNO) {
    return {
      ok: false,
      error: `Límite de ${MAX_ETIQUETAS_POR_ALUMNO} etiquetas por alumno alcanzado.`,
    };
  }

  const { data, error } = await supabase
    .from(TABLA_ALUMNO_ETIQUETAS)
    .insert({
      curp: curpValida.curp,
      titulo: nucleo.nucleo.titulo,
      valor: nucleo.nucleo.valor,
      orden: orden.orden,
    })
    .select()
    .maybeSingle();
  if (error) return errorOperacion("crear la etiqueta", error);
  return { ok: true, data: data as AlumnoEtiquetaRow };
}

/* ---------------------------------------------------------------------------
 * GUARDADO EN BLOQUE (conjunto completo de un alumno)
 * ------------------------------------------------------------------------- */

/**
 * Guarda el CONJUNTO COMPLETO de etiquetas de un alumno (semántica de
 * reemplazo controlado: lo que no esté en la lista se elimina). Será la base
 * del botón GUARDAR del perfil.
 *
 * Reglas:
 *  · 0–20 etiquetas; títulos válidos; sin duplicados normalizados.
 *  · El `orden` recibido se valida (entero ≥ 0) pero el orden FINAL se
 *    reasigna a 0..n-1 según la posición del array (la UI envía la lista ya
 *    ordenada; se garantiza un orden contiguo y determinista).
 *  · Toda validación ocurre ANTES de escribir; si falla, no se escribe nada.
 *  · Aplicación: primero borra lo ausente, luego actualiza y finalmente
 *    inserta. No es atómica (sin transacción multi-query): un fallo de BD
 *    intermedio puede dejar estado parcial; se reporta y la BD (trigger +
 *    índices) mantiene las invariantes por fila.
 */
export async function guardarEtiquetasDinamicas(
  supabase: SupabaseClient,
  curp: string,
  etiquetas: readonly EtiquetaAlumno[],
): Promise<ResultadoEtiquetas<AlumnoEtiquetaRow[]>> {
  const curpValida = validarCurpEtiqueta(curp);
  if (!curpValida.ok) return { ok: false, error: curpValida.error };

  // Validación completa ANTES de escribir (regla «no escribir parcialmente»).
  const validacion = validarConjuntoEtiquetas(etiquetas);
  if (!validacion.ok) return { ok: false, error: validacion.errores.join(" · ") };
  for (const item of etiquetas) {
    const orden = validarOrdenEtiqueta(item.orden);
    if (!orden.ok) return { ok: false, error: orden.error };
  }

  const existentes = await obtenerEtiquetasDinamicas(supabase, curpValida.curp);
  const porTitulo = new Map<string, AlumnoEtiquetaRow>();
  for (const fila of existentes) {
    porTitulo.set(normalizarTituloEtiqueta(fila.titulo), fila);
  }

  const actualizaciones: { id: string; titulo: string; valor: string; orden: number }[] = [];
  const inserciones: { titulo: string; valor: string; orden: number }[] = [];
  const usados = new Set<string>();

  validacion.etiquetas.forEach((nucleo, indice) => {
    const norm = normalizarTituloEtiqueta(nucleo.titulo);
    usados.add(norm);
    const existente = porTitulo.get(norm);
    if (existente) {
      actualizaciones.push({
        id: existente.id,
        titulo: nucleo.titulo,
        valor: nucleo.valor,
        orden: indice,
      });
    } else {
      inserciones.push({ titulo: nucleo.titulo, valor: nucleo.valor, orden: indice });
    }
  });

  const porEliminar: string[] = [];
  for (const [norm, fila] of porTitulo) {
    if (!usados.has(norm)) porEliminar.push(fila.id);
  }

  // 1) Eliminar lo que ya no está en el conjunto (siempre con curp de respaldo).
  if (porEliminar.length > 0) {
    const { error } = await supabase
      .from(TABLA_ALUMNO_ETIQUETAS)
      .delete()
      .in("id", porEliminar)
      .eq("curp", curpValida.curp);
    if (error) return errorOperacion("guardar las etiquetas", error);
  }

  // 2) Actualizar existentes (por id + curp).
  for (const a of actualizaciones) {
    const { error } = await supabase
      .from(TABLA_ALUMNO_ETIQUETAS)
      .update({ titulo: a.titulo, valor: a.valor, orden: a.orden })
      .eq("id", a.id)
      .eq("curp", curpValida.curp);
    if (error) return errorOperacion("guardar las etiquetas", error);
  }

  // 3) Insertar nuevas.
  if (inserciones.length > 0) {
    const { error } = await supabase
      .from(TABLA_ALUMNO_ETIQUETAS)
      .insert(inserciones.map((i) => ({ ...i, curp: curpValida.curp })));
    if (error) return errorOperacion("guardar las etiquetas", error);
  }

  return { ok: true, data: await obtenerEtiquetasDinamicas(supabase, curpValida.curp) };
}

/* ---------------------------------------------------------------------------
 * ELIMINAR
 * ------------------------------------------------------------------------- */

/**
 * Elimina UNA etiqueta usando id + curp (nunca solo por id): así una operación
 * accidental no puede borrar la etiqueta de otro alumno. El repositorio no
 * decide autorización; eso se valida antes de llegar aquí.
 */
export async function eliminarEtiquetaDinamica(
  supabase: SupabaseClient,
  id: string,
  curp: string,
): Promise<ResultadoEtiquetas<{ eliminadas: number }>> {
  const curpValida = validarCurpEtiqueta(curp);
  if (!id.trim() || !curpValida.ok) {
    return { ok: false, error: "Identificador y CURP son obligatorios." };
  }

  const { data, error } = await supabase
    .from(TABLA_ALUMNO_ETIQUETAS)
    .delete()
    .eq("id", id.trim())
    .eq("curp", curpValida.curp)
    .select("id");
  if (error) return errorOperacion("eliminar la etiqueta", error);
  return { ok: true, data: { eliminadas: (data ?? []).length } };
}

/* ---------------------------------------------------------------------------
 * REORDENAMIENTO
 * ------------------------------------------------------------------------- */

/**
 * Reordena TODAS las etiquetas de un alumno.
 * Entrada: ids en el nuevo orden (ej. [id-3, id-1, id-2] → orden 0,1,2).
 * Valida: sin ids duplicados y el conjunto EXACTO de etiquetas del CURP
 * (reordenación completa; no se aceptan ids de otro alumno ni faltantes).
 */
export async function actualizarOrdenEtiquetasDinamicas(
  supabase: SupabaseClient,
  curp: string,
  idsOrdenados: readonly string[],
): Promise<ResultadoEtiquetas<AlumnoEtiquetaRow[]>> {
  const curpValida = validarCurpEtiqueta(curp);
  if (!curpValida.ok) return { ok: false, error: curpValida.error };

  const ids = idsOrdenados.map((i) => i.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      error: "La reordenación contiene identificadores duplicados.",
    };
  }

  const existentes = await obtenerEtiquetasDinamicas(supabase, curpValida.curp);
  const idsExistentes = new Set(existentes.map((f) => f.id));
  if (ids.length !== existentes.length || ids.some((id) => !idsExistentes.has(id))) {
    return {
      ok: false,
      error: "La reordenación debe incluir exactamente todas las etiquetas del alumno.",
    };
  }
  if (ids.length === 0) return { ok: true, data: [] };

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from(TABLA_ALUMNO_ETIQUETAS)
      .update({ orden: i })
      .eq("id", ids[i])
      .eq("curp", curpValida.curp);
    if (error) return errorOperacion("reordenar las etiquetas", error);
  }

  return { ok: true, data: await obtenerEtiquetasDinamicas(supabase, curpValida.curp) };
}

