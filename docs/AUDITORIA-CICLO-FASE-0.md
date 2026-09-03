# FASE 0 — MAPA DEL SISTEMA EXISTENTE (CicloConfigurador)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03
Método: lectura real de archivos (no memoria). No se modificó código en esta fase.

## 1. Mapa funcional UI → Action → Domain → DB

| Función | UI | Action | Domain | DB | Identidad | Legacy | Estado |
|---|---|---|---|---|---|---|---|
| Crear ciclo (BORRADOR) | `ciclo-configurador/index.tsx` | `actionCrearCicloEscolar` | `crearCicloBorrador` (lib/evaluaciones.ts) | `periodos` INSERT | `periodos.id` | — | OK. 2ª vía `actionCrearCicloConContexto` (orquestador) NO usada por wizard → duplicidad |
| Fechas inicio/fin | `paso-datos.tsx` | `actionGuardarRangoCiclo` | `guardarRangoCiclo` (evaluaciones.ts) | `periodos.fecha_*` | UPDATE por `periodo_id` | — | OK |
| Académico (clonar estructura) | `paso-academico.tsx` (pega `periodo_id` origen) | `actionClonarContextoAcademico` | `clonarContextoAcademico` (contexto-ciclo.ts) | `grupos`, `grupo_materias` | `periodo_id` destino/origen | — | OK parcial: solo clonar; sin alta individual ni Excel |
| Excel académico (grupos/materias) | pantallas de carga FUERA del wizard (`carga-academica`) | `app/actions/carga-academica.ts` | `lib/escolar/carga-academica.ts` (+ materias-list, grupo-parse) | `carreras`, `materias`, `grupos`, `grupo_materias`, `asignaciones_profesor` | `periodo_id` en nuevos; resolución por `periodos.activo=true` (carga-academica.ts:261) | `activo` al resolver periodo | **FALTA integrar al wizard** (F2) |
| Alumnos (manual) | `paso-alumnos.tsx` | `actionBuscarAlumnosInscripcion`, `actionListarGruposPeriodo`, `actionInscribirAlumnoEnCiclo` | `inscripciones-borrador.ts` | `ALUMNOS` (persona, sin duplicar), `inscripciones_alumno` | `inscripciones_alumno.grupo_id → grupos.periodo_id` | `inscripciones.activo` (propia) | OK manual: BORRADOR→activo=false; OPERATIVO→activa |
| Excel alumnos (masivo) | carga académica con preview (fuera del wizard) | `app/actions/carga-academica.ts` | parsers de alumnos + `inscripciones-borrador.ts` | `ALUMNOS` + `inscripciones_alumno` | idem anterior | — | **FALTA integrar al wizard** (F3: casos 1–4) |
| Evaluación (parciales) | `paso-evaluacion.tsx` | `actionListarCiclosConEvaluaciones`, `actionGuardarEvaluacion` | `evaluaciones.ts` (resolver/guardar por periodo) | `periodos_evaluacion` | `periodo_id` | — | OK datos. **FALTA UI editar/borrar/desactivar parcial** (F4) |
| Calendario | `paso-calendario.tsx` → `CalendarioEscolarPanel` | `actionObtenerCalendario`/`EstablecerBase`/`GuardarDia`/`EliminarDia` (calendario.ts) | `lib/escolar/calendario.ts` | `calendario_escolar` | **`ciclo_escolar` TEXT** (`.eq` en líneas 148, 212, 316) | TODO el flujo | **FALTA crítica** (F5): wizard descarta `periodoId` y pasa `nombreCiclo` |
| Horarios | `paso-horario.tsx` → `HorarioEscolarPanel` | `app/actions/horario.ts` | `horario-semanal.ts` | `horario_semanal` | `periodo_id` | — | OK (auditar en F6) |
| Validación | `paso-validacion.tsx` (detalle: bloqueadores/advertencias) | `actionDetalleCicloAdmin` | `validarIntegridadCiclo` (ciclo-estado) + conteos | lectura de todos los dominios | `periodo_id` | — | OK parcial: falta `validarCicloCompleto` consolidado (F7) |
| Activación | botón paso validación → `index.tsx` | `actionSetActivoCiclo(periodoId,true)` | `setActivoCiclo` → **`activarCicloOperativo` TS multi-paso** (ciclo-estado.ts:455) | `periodos.activo/estado` + inscripciones | `periodo_id` | `activo` espejo | **FALTA crítica** (F8): ningún código llama al RPC `activar_ciclo_operativo` |
| Asistencia | sin wizard (módulo propio) | `app/actions/asistencias.ts` | `asistencias.ts`, `asistencia-contexto.ts` | `clases_impartidas`, `asistencia_alumnos`, `justificaciones_asistencia` (+`periodo_id`) | columnas creadas, sin backfill | `periodos.activo` (asistencias.ts:321), plantilla `nombreCiclo` | FALTA fase 9 (matched/ambiguous/unmatched) |
| Auditoría transiciones | (server) | `actionCrearCicloConContexto` registra crear | `registrarTransicionCiclo` | `ciclo_transiciones` | `periodo_id` | — | Parcial: la vía del wizard no registra consistente |


## 2. Mapa de identidad (activo / estado / ciclo_escolar / periodo_id)

| Uso | Clasificación | Dónde |
|---|---|---|
| `periodos.id` + `estado` borrador/operativo/historico | CICLO-GLOBAL (autoridad objetivo) | `ciclo-estado*.ts` |
| `periodos.activo` como espejo del OPERATIVO (escritura exclusiva) | COMPATIBILIDAD | `ciclo-estado.ts`, `evaluaciones.ts` |
| `periodos.activo=true` para resolver “ciclo actual” | DEUDA (migrar a estado) | `asistencias.ts:321/779`, `carga-academica.ts:176/261`, `configuracion/page.tsx:27`, `semestres.ts:225`, RPC perfil alumno |
| `activo` en hijas (grupos, grupo_materias, inscripciones, periodos_evaluacion, semestres, asignaciones, config. profesor) | ENTIDAD-LOCAL (no sustituir) | tablas hijas |
| `calendario_escolar.ciclo_escolar` TEXT | LEGACY CONTROLADO (eliminar del flujo nuevo) | `calendario.ts:148/212/316`, panel, acciones |
| `calendario_escolar.periodo_id` (col aplicada; 81/234 ligadas) | CICLO-GLOBAL (destino F5) | SQL `agregar-periodo-id-calendario.sql` |
| `periodo_id` en horario/evaluaciones/grupos | CICLO-GLOBAL OK | `horario_semanal`, `periodos_evaluacion`, `grupos` |
| `periodo_id` en asistencia (3 tablas, sin backfill) | CICLO-GLOBAL preparado | SQL `agregar-periodo-asistencia.sql` |
| `vigente` | NO EXISTE en código | solo docs + SQL sin ejecutar |

## 3. Funcionalidades existentes que DEBEN reutilizarse
1. Máquina de estados + validación integridad (`ciclo-estado.ts` / `ciclo-estado-puro.ts`) y activación exclusiva.
2. Orquestador `crearCicloConContexto` + `registrarTransicionCiclo` (integrar al wizard, no duplicar).
3. Clonación académica (`clonarContextoAcademico`) y parsers (`materias-list.ts`, `grupo-parse.ts`, `tablas-supabase.ts`).
4. Flujo Excel de carga con preview (`app/actions/carga-academica.ts` + `lib/escolar/carga-academica.ts`) para grupos y alumnos.
5. Inscripciones por periodo (`inscripciones-borrador.ts`, `inscripciones-admin.ts`).
6. Parciales por `periodo_id` (`evaluaciones.ts`).
7. Visualizadores `CalendarioEscolarPanel` y `HorarioEscolarPanel`.
8. `asistencia-contexto.ts` (incl. `validarContextoPlantilla` para legacy→periodo).
9. RPC transaccional `activar_ciclo_operativo` (SQL aplicado en BD; falta conectarlo).
10. SQL read-only `supabase/verificar-integridad-ciclo.sql` (ya entregado).

## 4. Lista exacta de faltantes (por fase posterior)
- **F1** Migrar los 6 lectores “ciclo actual por `activo`” a `estado=operativo` con fallback; no crear `vigente`; no tocar `activo` de hijas.
- **F2** Excel académico (y alta/clonar visible) dentro del paso académico.
- **F3** Excel alumnos dentro del paso alumnos: casos 1–4, preview, conteos, confirmación, resultado verificable.
- **F4** UI parciales completa: editar/desactivar/duplicar + validación de rango dentro del ciclo y conflictos.
- **F5** Calendario por `periodo_id` de punta a punta (acciones/domain/panel); eliminar `ciclo_escolar` del flujo nuevo.
- **F6** Auditar horario (grupo→materia→profesor→día/hora) aislado por `periodo_id`.
- **F7** Consolidar `validarCicloCompleto(periodoId) → {ok, bloqueadores, advertencias, resumen}` consumido por validación y activación.
- **F8** Activar vía Server Action → validación → RPC `activar_ciclo_operativo(periodo_id)` (autoridad única, rollback, auditoría).
- **F9** Backfill asistencia clasificado `matched/ambiguous/unmatched`; nunca asignación arbitraria.
- **F10** Ejecutar `verificar-integridad-ciclo.sql` en SQL Editor (NOT RUN desde este entorno).

## 5. Orden de implementación propuesto
F1 (identidad) → F5 (calendario por periodo_id) → F8 (activación RPC única) → F7 (contrato validación) →
F2 (Excel académico) → F3 (Excel alumnos) → F4 (parciales UI) → F6 (horario) → F9 (backfill) → F10 (SQL real).

SQL real en esta fase: **NO EJECUTADO** (ninguno). No se modificó código de la rama.

