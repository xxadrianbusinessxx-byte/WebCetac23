# INFORME — Ciclo global + plantillas y asistencias POR PARCIAL

Fecha: 2026-09-03 · Ejecutado según `docs/PROMPT_CLINE_CICLO_GLOBAL_PARCIALES.md`
(sin push, sin tocar Supabase con escritura: el SQL sigue preparado en `supabase/`).

### Implementado
- **Núcleo puro por parcial** (`lib/escolar/asistencia-parcial.ts`): rangos
  inclusivos, etiquetado de fechas (`en_parcial` / `sin_parcial` / `conflicto`),
  `resumenAsistenciaPorParcial` (pendientes fuera del denominador), re-exportada
  desde `asistencias.ts`.
- **Plantilla POR PARCIAL**: `generarPlantillaAsistencia` lee el calendario POR
  PERIODO (ruta F5) y acota las fechas al rango del parcial elegido; el nombre
  de archivo incluye `_parcial<N>`; si el parcial no tiene días de clase da
  error accionable (distingue "sin calendario" de "rango del parcial").
- **Subida valida el parcial** (`analizarPlantillaAsistencia`): detecta columnas
  fuera del rango y las rechaza con ejemplos; los PENDIENTES se calculan solo
  dentro del parcial. Claves naturales y UPSERT sin cambios (re-subir no duplica).
- **El ciclo dejó de elegirse**: `actionListarGruposAsistencia` devuelve el
  periodo OPERATIVO + sus parciales activos (ya no une `listarCiclosEscolares`).
  El panel del profesor muestra el ciclo como indicador de solo lectura y un
  selector nuevo de Parcial.
- **Server Actions con autoridad de servidor**: descargar/previsualizar/
  confirmar resuelven el operativo con `obtenerCicloOperativoGlobal`, validan
  que el `evaluacionId` pertenezca a ESE periodo (parcial de otro periodo =
  error) y ya no reciben `ciclo` del cliente.
- **Alumno/tutor/profesor con el mismo ciclo global**: la acción de estados
  resuelve el ciclo, la inscripción ACTIVA de la CURP y los parciales en el
  servidor; el calendario del alumno muestra ciclo + grupo (read-only) y un
  desglose por parcial. `perfil-client` dejó de pasar identidad desde
  ETIQUETAS PERSONALES.
- **Diagnóstico read-only** `scripts/diag-calendario-periodo.mjs`.
- Rutas de calendario por texto marcadas `@deprecated`.

### Archivos principales
- Nuevos: `lib/escolar/asistencia-parcial.ts`, `scripts/test-asistencia-parciales.mjs`,
  `scripts/diag-calendario-periodo.mjs`.
- Modificados: `lib/escolar/asistencias.ts`, `app/actions/asistencias.ts`,
  `app/components/asistencias-panel.tsx`, `app/components/calendario-asistencia-alumno.tsx`,
  `app/perfil/perfil-client.tsx`, `app/tutor/tutor-client.tsx`,
  `app/components/buscador-alumno-profesor.tsx`, `lib/escolar/calendario.ts`.

### Arquitectura
El parcial es DERIVADO y no columna: sin `parcial_id` en `asistencia_alumnos` ni
`clases_impartidas`. La fecha resuelve ciclo→parcial en memoria
(`periodos_evaluacion` del operativo). El recorte de plantilla es un filtro de
rango sobre el calendario del periodo; el resumen por parcial es una función
pura sobre los estados derivados ya calculados.

### Seguridad
- Ciclo y parcial resueltos SIEMPRE en servidor desde el catálogo; un
  `evaluacionId` de otro periodo → error, no se usa.
- `profesor_clave` sigue viniendo de `sesion.matricula`.
- Roles sin cambio: plantilla/preview/confirmar = maestro|directivo; alumno solo
  su CURP; tutor solo CURPs de `listarCurpsDeTutor`; maestro validado con
  `profesorImparteEnGrupo` sobre la inscripción resuelta.
- Alumno/tutor ya no envían identidad académica (la resuelve el servidor).

### Rendimiento
- 1 consulta a `periodos_evaluacion` por vista (parciales del operativo); la
  resolución fecha→parcial es en memoria. `obtenerEstadosAsistenciaAlumno`
  conserva sus 3 consultas (+1 parciales +1 operativo). Cero N+1 por día.

### Validación
- `npx tsc --noEmit` → 0 errores (exit 0).
- `npm run lint` → 14 errores / 31 warnings (preexistentes documentados:
  patrón `react-hooks/set-state-in-effect`; sin errores nuevos).
- `npm run build` → exit 0.
- Tests puros: `test-evaluaciones` 30/30 · `test-fechas` 22/22 ·
  `test-asistencia-contexto` 6/6 · **`test-asistencia-parciales` 19/19** (nuevo).

Salida real de `node scripts/diag-calendario-periodo.mjs` (solo lectura):

```text
=== PERIODOS ===
[23c96de5] AGO2026-DIC2026  activo=false estado=borrador rango=2026-08-31 -> 2026-11-12
[93b24c43] 2026-2027         activo=false estado=historico rango=2026-08-31 -> 2026-12-11
[7f5bf67c] BORRADOR          activo=false estado=borrador rango=2026-08-31 -> 2026-12-11
[7cf5cca7] AGO2026-ENE2027   activo=true  estado=operativo rango=2026-08-31 -> 2026-12-11

=== PERIODO OPERATIVO ===
[7cf5cca7-f448-4f03-a624-8d34fba00aaf] AGO2026-ENE2027
parciales: #1 Parcial 1 31 ago-25 sep · #2 Parcial 2 28 sep-06 nov · #3 Parcial 3 09 nov-11 dic (3 activos)

=== CALENDARIO_ESCOLAR (buckets por ciclo_escolar) ===
[2026-2027]            filas=81 (periodo_id ligado=81) clase=78 descanso=3  rango 2026-08-24 -> 2026-12-14
[SEMESTRE AGO26-ENE27] filas=77 (ligado=0)             clase=73 descanso=3 festivo=1  rango 2026-08-31 -> 2026-12-15
[PRIMER PARCIAL (SEP-AGO)]  clase=19 rango 2026-08-31 -> 2026-09-25
[SEGUNDO PARCIAL (SEP-NOV)] clase=29 rango 2026-09-28 -> 2026-11-06
[TERCER PARCIAL (NOV-DIC)]  clase=24 rango 2026-11-02 -> 2026-12-11

=> AGO2026-ENE2027 (operativo) NO tiene filas de calendario: ni por periodo_id
   ni por nombre exacto. El bucket SEMESTRE AGO26-ENE27 (73 clase) cae 100% en
   los 3 parciales activos del operativo -> candidato natural para el backfill.
```

### Legacy
- `obtenerCalendarioEscolar(texto)` y `listarCiclosEscolares()` marcados
  `@deprecated` (no se borran; el panel legacy de calendario los sigue usando).
- `calendario_escolar.ciclo_escolar` texto intacto; los buckets PARCIAL legacy
  se conservan (decisión pendiente del directivo).
- El flujo nuevo nunca usa `listarCiclosEscolares` para elegir ciclo.

### Pendiente (humano/directivo — fuera del alcance de esta ejecución)
1. Cargar/backfillear el calendario del operativo `AGO2026-ENE2027` (hoy CERO
   días). Candidato: bucket `SEMESTRE AGO26-ENE27` (73 clase) o el paso
   Calendario del CicloConfigurador. Hasta entonces la descarga de plantillas
   muestra el error accionable correspondiente.
2. Confirmar los rangos de Parcial 1/2/3 en `/configuracion` (el recorte de
   plantillas depende de esos rangos).
3. Decidir el destino de los buckets legacy `... PARCIAL ...` y su solape.

