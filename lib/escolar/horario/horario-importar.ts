/**
 * HORARIO SEMANAL — IMPORTACIÓN DE EXCEL (FASE HORARIO) — VOCABULARIO Y FACHADA.
 *
 * Pipeline (respeta la arquitectura de importaciones del proyecto):
 *
 *   lectura → normalización → identificación de columnas → validación
 *     → preview → aplicación
 *
 * Idempotente por clave natural (periodo_id, grupo_id, dia_semana,
 * hora_inicio, materia_clave) con reemplazo-diferenciado por periodo:
 * re-subir el MISMO archivo → 0 cambios (sin duplicados); subir un archivo
 * corregido → solo cambian/eliminan las filas que difieren.
 *
 * Reglas:
 *   - La fuente oficial es la hoja de DETALLE. La hoja «Resumen Clases por
 *     Día» (si existe) se usa SOLO como validación cruzada derivada; nunca se
 *     persiste ni se convierte en fuente de verdad.
 *   - «Sin profesor asignado» NO se convierte en un profesor: queda NULL.
 *   - El vínculo `materia_id` con el catálogo es best-effort: si el nombre no
 *     resuelve de forma única, la fila se importa con su texto oficial.
 *   - Errores estructurales (grupo inexistente en el periodo, día/hora
 *     inválidos, duplicados, solapamientos) BLOQUEAN la escritura y se
 *     muestran antes de aplicar, con reporte por fila.
 */

/* ---------------------------------------------------------------------------
 * TIPOS
 * ------------------------------------------------------------------------- */

/** Fila de detalle ya normalizada del archivo (antes de resolver catálogo). */
export type FilaHorarioNormalizada = {
  filaOrigen: number; // número de fila real dentro de la hoja
  carreraOriginal: string;
  gradoOriginal: string;
  grupoOriginal: string;
  gradoGrupoOriginal: string;
  dia: string | null; // clave interna: lunes..viernes
  horaInicio: string; // "HH:MM" o ""
  horaFin: string;
  duracionDeclarada: number | null; // columna opcional (min)
  materia: string;
  materiaClave: string;
  profesor: string; // "" = sin profesor asignado
  tipoClase: string; // normalizado (academica | taller | ...)
  errores: string[];
};

/** Columnas detectadas en la hoja de detalle (índices de columna). */
export type ColumnasHorarioDetectadas = {
  idxCarrera: number;
  idxGrado: number;
  idxGrupo: number;
  idxGradoGrupo: number;
  idxDia: number;
  idxHoraInicio: number;
  idxHoraFin: number;
  idxDuracion: number;
  idxMateria: number;
  idxProfesor: number;
  idxTipoClase: number;
};

/** Estado de una fila frente a lo ya importado (diff). */
export type EstadoFilaHorario =
  | "valida_nueva"
  | "valida_actualizable"
  | "valida_sin_cambio"
  | "rechazada";

export type FilaReporteHorario = {
  filaOrigen: number;
  estado: EstadoFilaHorario;
  grupoLegible: string; // ej. "3RO · A · MC"
  dia: string;
  horaInicio: string;
  horaFin: string;
  materia: string;
  profesor: string;
  errores: string[];
};

export type PreviewImportacionHorario = {
  ok: boolean;
  error?: string;
  periodoNombre: string;
  periodoId: string | null;
  hojaDetalle: string;
  columnasDetectadas: string[];
  columnasFaltantes: string[];
  totalFilasArchivo: number;
  filasValidas: number;
  filasRechazadas: number;
  gruposEncontrados: string[];
  materiasVinculadasCatalogo: number;
  materiasSinVinculo: number;
  profesoresEncontrados: string[];
  nuevas: number;
  actualizables: number;
  sinCambios: number;
  aEliminar: number;
  erroresPorFila: FilaReporteHorario[];
  advertencias: string[];
  /** true = no debe aplicarse (errores estructurales o columnas faltantes). */
  bloqueaEscritura: boolean;
};

export type ResultadoAplicarHorario = {
  ok: boolean;
  error?: string;
  periodoNombre: string;
  aplicadas: number;
  actualizadas: number;
  eliminadas: number;
  sinCambios: number;
  rechazadas: number;
  erroresDetalle: string[];
};

/** Fila lista para escribir en `horario_semanal`. */
export type FilaHorarioParaEscribir = {
  periodo_id: string;
  grupo_id: string;
  dia_semana: string;
  hora_inicio: string;
  hora_fin: string;
  materia_clave: string;
  materia_nombre: string;
  materia_id: string | null;
  tipo_clase: string;
  profesor_clave: null;
  profesor_nombre: string | null;
  fila_origen: number;
  creado_por: string | null;
};



/* ---------------------------------------------------------------------------
 * PROMPT E · R-3 — este archivo tenía 1 267 líneas y hacía tres cosas. Se
 * partió por responsabilidad; las tres partes se re-exportan aquí para que
 * ningún import existente se rompa (§10):
 *
 *   · ./horario-importar-lectura.ts    — leer el Excel (columnas, filas, hojas)
 *   · ./horario-importar-validacion.ts — validar dentro del archivo y contra el catálogo
 *   · ./horario-importar-aplicar.ts    — preview, aplicación y plantilla
 * ------------------------------------------------------------------------- */

export * from "./horario-importar-lectura";
export * from "./horario-importar-validacion";
export * from "./horario-importar-aplicar";
