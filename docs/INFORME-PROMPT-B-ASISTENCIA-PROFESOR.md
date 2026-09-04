# INFORME — Prompt B: "Asistencia de mis alumnos" + identidad del profesor + justificación POR CLASE

Fecha: 2026-09-04 · Ejecutado según `docs/PROMPT_CLINE_B_ASISTENCIA_PROFESOR.md`
(depende de `PROMPT_CLINE_A_REPARAR_TABLA_LEGACY.md`, ya ejecutado antes).

### Implementado
- **R-1 buscador vivo**: `actionListarAlumnosGruposProfesor` ya NO usa
  `asignaciones_profesor`; resuelve el periodo OPERATIVO y lista los grupos con
  horario cargado (1 consulta a `horario_semanal`) + alumnos por grupo en
  `Promise.all`. Mensajes exactos: sin operativo / sin horario / sin grupos.
  `resolverAsignacionesProfesor` NO se borra (queda @deprecated para este uso).
- **R-2**: el buscador renderiza el `CalendarioAsistenciaAlumno` existente con
  desglose por parcial (entregado en el trabajo anterior). Sin duplicar.
- **R-3 justificación POR CLASE**:
  - `supabase/agregar-materia-justificaciones.sql` (idempotente): columna
    `materia_clave` + índice único `(curp_alumno, fecha, COALESCE(materia_clave,''))`.
  - Núcleo puro en `lib/escolar/justificaciones.ts`:
    `calcularClasesJustificadasPorDia` (dedupe, tope en faltante, día completo =
    faltante) y `materiaTieneClaseEnDia`.
  - `aplicarAsistenciaJustificada` recalcula el total APROBADO del día y FIJA el
    marcador `__JUSTIFICACION__` (nunca suma de a uno) → idempotente.
  - Solicitud (`actionSolicitarJustificacionConArchivo`): admite `maestro` y
    `directivo` con `solicitante_tipo='profesor'` y `materia_clave`; valida en el
    servidor que la materia está en el horario del grupo ESE día; guardado
    select→update/insert con clave por materia cuando el esquema ya existe y
    upsert legacy cuando no (aditivo).
  - Aprobación: marca aprobada, recalcula por clase y revierte si falla.
  - UI: el calendario del profesor muestra el selector "Clase a justificar
    (del horario del día)" y manda `materia_clave`.
- **R-4 identidad `PROFESORES.ID` (aditivo)**:
  - `supabase/agregar-profesor-id-asistencia.sql` (idempotente).
  - `confirmarAsistencias` rellena `profesor_id` en las escrituras nuevas cuando
    la columna existe (si no, todo sigue igual).
  - `profesorImparteEnGrupo` prefiere `profesor_id`; `actionAnularAsistenciaProfesor`
    acota por `profesor_id` y, si no es posible, deja constancia explícita de que
    la operación por `profesor_clave` es ambigua.

### Identidad
- Escrituras nuevas que ya llevan `profesor_id`: las 3 Server Actions del
  profesor (descargar/previsualizar/confirmar) y la anulación/consulta por
  `profesorImparteEnGrupo`.
- **NO se inventó backfill** para las 81 filas históricas con `profesor_clave`
  compartido: quedan con `profesor_id NULL` (deuda histórica documentada;
  atribuirlas sería inventar autoría, prohibido por R7/§4).

### Validación
- `npx tsc --noEmit` → 0 errores.
- `npm run lint` → 14 errores / 31 warnings (mismos preexistentes).
- `npm run build` → exit 0.
- Tests: `test-evaluaciones` 30/30 · `test-fechas` 22/22 ·
  `test-asistencia-parciales` 19/19 · `test-asistencia-contexto` 6/6 ·
  **`test-reparar-tabla-legacy` 15/15 (A)** ·
  **`test-justificacion-por-clase` 13/13 (B, nuevo)**.

Salida real de `node scripts/diag-profesor-alcance.mjs` (antes):
```text
=== PERIODO OPERATIVO: AGO2026-ENE2027 ===
1) asignaciones_profesor  -> 4 filas · 0 activas
2) horario_semanal        -> 168 bloques · 0 con profesor_clave
3) clases_impartidas      -> 81 filas · 1 solo profesor: "4321" en 2DO A RH
=== PROFESORES (calidad de CLAVE) ===
  20 filas · claves distintas: 3
  !! CLAVE="4321" compartida por 16 profesores
  !! CLAVE="8080" compartida por 3 profesores
=== justificaciones_asistencia ===
  columnas: ... (sin materia) -> hoy la justificación es POR DÍA
```
("después": requiere el SQL + la corrección de CLAVE por el directivo; Cline no
escribe en producción.)

### Pendiente (directivo — en orden)
1. Ejecutar `supabase/agregar-materia-justificaciones.sql`.
2. Ejecutar `supabase/agregar-profesor-id-asistencia.sql`.
3. Corregir las `CLAVE` duplicadas de `PROFESORES` (16 comparten "4321").
4. Decidir si algún día se poblará `horario_semanal.profesor_clave` (permitiría
   acotar de verdad "mis alumnos").
