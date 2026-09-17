import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_HORARIO_SEMANAL } from "../tables";
import { analizarImportacionHorario } from "./horario-importar-validacion";
import type {
  AnalisisImportacionHorario,
  ContextoImportacionHorario,
  PreviewImportacionHorario,
  ResultadoAplicarHorario,
} from "./horario-importar";

/**
 * HORARIO SEMANAL · IMPORTACIÓN · PREVIEW, APLICACIÓN Y PLANTILLA.
 *
 * Convierte el análisis en el contrato de preview de la UI, aplica la
 * importación con reemplazo-diferenciado por periodo (idempotente) y genera la
 * plantilla .xlsx de referencia.
 *
 * Tercera de las tres partes del antiguo `lib/escolar/horario/horario-importar.ts`
 * (PROMPT E · R-3); `horario-importar.ts` re-exporta las tres.
 */


/* ---------------------------------------------------------------------------
 * PREVIEW Y APLICACIÓN
 * ------------------------------------------------------------------------- */

/** Convierte el análisis completo en el contrato de preview de la UI. */
export function analisisAPreview(
  analisis: AnalisisImportacionHorario,
): PreviewImportacionHorario {
  if (!analisis.ok) {
    return {
      ok: false,
      error: analisis.error,
      periodoNombre: analisis.periodoNombre,
      periodoId: analisis.periodoId,
      hojaDetalle: "",
      columnasDetectadas: [],
      columnasFaltantes: [],
      totalFilasArchivo: 0,
      filasValidas: 0,
      filasRechazadas: 0,
      gruposEncontrados: [],
      materiasVinculadasCatalogo: 0,
      materiasSinVinculo: 0,
      profesoresEncontrados: [],
      nuevas: 0,
      actualizables: 0,
      sinCambios: 0,
      aEliminar: 0,
      erroresPorFila: [],
      advertencias: [],
      bloqueaEscritura: true,
    };
  }
  return {
    ok: true,
    periodoNombre: analisis.periodoNombre,
    periodoId: analisis.periodoId,
    hojaDetalle: analisis.hojaDetalle,
    columnasDetectadas: [],
    columnasFaltantes: analisis.columnasFaltantes,
    totalFilasArchivo: analisis.totalFilasArchivo,
    filasValidas: analisis.filasValidas,
    filasRechazadas: analisis.filasRechazadas,
    gruposEncontrados: analisis.gruposEncontrados,
    materiasVinculadasCatalogo: analisis.materiasVinculadas,
    materiasSinVinculo: analisis.materiasSinVinculo,
    profesoresEncontrados: analisis.profesoresEncontrados,
    nuevas: analisis.nuevas,
    actualizables: analisis.actualizables,
    sinCambios: analisis.sinCambios,
    aEliminar: analisis.aEliminar,
    erroresPorFila: analisis.erroresPorFila,
    advertencias: analisis.advertencias,
    bloqueaEscritura: analisis.bloqueaEscritura,
  };
}

/**
 * Preview de la importación SIN escribir. Solo directivo (validado en la
 * Server Action). Devuelve el reporte completo: válidas, nuevas,
 * actualizables, sin cambios, a eliminar, rechazadas y errores por fila.
 */
export async function previsualizarImportacionHorario(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoImportacionHorario,
): Promise<PreviewImportacionHorario> {
  const analisis = await analizarImportacionHorario(supabase, file, ctx);
  return analisisAPreview(analisis);
}

const TAMANO_LOTE = 100;

/**
 * Aplica la importación (reemplazo-diferenciado por periodo):
 *   1) re-analiza el archivo (no confía en el preview del cliente);
 *   2) elimina por lotes los bloques actuales del periodo que el archivo ya no
 *      contiene (nunca DELETE masivo ciego);
 *   3) UPSERT por lotes todas las filas del archivo (clave natural).
 *
 * Idempotencia: re-subir el mismo archivo produce nuevas=0, actualizables=0 y
 * sinCambios=total; no se generan duplicados ni filas huérfanas.
 * Solo directivo (validado en la Server Action).
 */
export async function aplicarImportacionHorario(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoImportacionHorario,
): Promise<ResultadoAplicarHorario> {
  const analisis = await analizarImportacionHorario(supabase, file, ctx);
  const periodoNombre = ctx.periodoNombre.trim().toUpperCase();

  if (!analisis.ok || analisis.bloqueaEscritura) {
    return {
      ok: false,
      error:
        analisis.error ??
        "La importación tiene errores que bloquean la escritura. Revisa el reporte.",
      periodoNombre,
      aplicadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      sinCambios: 0,
      rechazadas: analisis.filasRechazadas,
      erroresDetalle: analisis.erroresPorFila
        .slice(0, 20)
        .map((r) => `Fila ${r.filaOrigen}: ${r.errores.join("; ")}`),
    };
  }

  // 1) Eliminar bloques del periodo que el archivo ya no contiene.
  let eliminadas = 0;
  for (let i = 0; i < analisis.idsAEliminar.length; i += TAMANO_LOTE) {
    const lote = analisis.idsAEliminar.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_HORARIO_SEMANAL)
      .delete()
      .in("id", lote);
    if (error) {
      return {
        ok: false,
        error: `No se pudo limpiar el horario anterior: ${error.message}`,
        periodoNombre,
        aplicadas: 0,
        actualizadas: 0,
        eliminadas,
        sinCambios: 0,
        rechazadas: 0,
        erroresDetalle: [],
      };
    }
    eliminadas += lote.length;
  }

  // 2) UPSERT de todas las filas del archivo (clave natural).
  for (let i = 0; i < analisis.filasParaEscribir.length; i += TAMANO_LOTE) {
    const lote = analisis.filasParaEscribir.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_HORARIO_SEMANAL)
      .upsert(lote, {
        onConflict: "periodo_id,grupo_id,dia_semana,hora_inicio,materia_clave",
      });
    if (error) {
      return {
        ok: false,
        error: `Error al guardar el horario: ${error.message}`,
        periodoNombre,
        aplicadas: 0,
        actualizadas: 0,
        eliminadas,
        sinCambios: 0,
        rechazadas: 0,
        erroresDetalle: [],
      };
    }
  }

  return {
    ok: true,
    periodoNombre,
    aplicadas: analisis.nuevas,
    actualizadas: analisis.actualizables,
    eliminadas,
    sinCambios: analisis.sinCambios,
    rechazadas: analisis.filasRechazadas,
    erroresDetalle: [],
  };
}

/* ---------------------------------------------------------------------------
 * PLANTILLA DE DESCARGA (referencia oficial para mantener el archivo al día)
 * ------------------------------------------------------------------------- */

/**
 * Genera una plantilla .xlsx (base64) con la ESTRUCTURA OFICIAL del horario:
 * las mismas columnas del archivo «Horario Completo» de referencia
 * (things/CETAC23_Horario_Ago2026-Ene2027 (1).xlsx) y dos filas de ejemplo.
 * El directivo la descarga, la conserva y la vuelve a subir cuando necesite
 * actualizar el horario. La importación es idempotente por clave natural.
 */
export async function plantillaHorarioParaDescarga(): Promise<{
  base64: string;
  nombreArchivo: string;
}> {
  const encabezados = [
    "Carrera",
    "Grado",
    "Grupo",
    "Grado-Grupo",
    "Día",
    "Hora inicio",
    "Hora fin",
    "Duración (min)",
    "Materia",
    "Profesor",
    "Tipo de clase",
  ];
  const filas: (string | number)[][] = [
    encabezados,
    [
      "Sin carrera (tronco común)",
      "1°",
      "A",
      "1°A",
      "Lunes",
      "07:30",
      "08:20",
      50,
      "Lengua y Comunicación I",
      "Sin profesor asignado",
      "Académica",
    ],
    [
      "MC",
      "3°",
      "A",
      "3°A",
      "Lunes",
      "07:30",
      "08:20",
      50,
      "Taller de vivero",
      "Sin profesor asignado",
      "Taller",
    ],
  ];
  return {
    base64: await (async () => {
      const { matrizAXlsxBase64: aoa } = await import("../exportar-xlsx");
      return aoa(filas, "Horario Completo", [26, 7, 7, 9, 11, 12, 12, 15, 48, 26, 16]);
    })(),
    nombreArchivo: "plantilla_horario_semanal.xlsx",
  };
}

