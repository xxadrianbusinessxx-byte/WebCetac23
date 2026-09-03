# FASE 6 — HORARIO POR PERIODO (informe) — cierre F6.1

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## Estado: PASS (con evidencia honesta de esquema)

### Evidencia del esquema
- **VERIFICADO EN SQL REAL: NO REALIZADO.** Este entorno no tiene acceso al SQL
  Editor de Supabase (solo REST). No se ejecutó ninguna consulta DDL/estructura.
- **VERIFICADO EN CÓDIGO (DDL versionado del repo):** `supabase/
  crear-horario-semanal.sql` documenta el esquema: `periodo_id uuid NOT NULL FK →
  periodos(id) ON DELETE RESTRICT`; `grupo_id uuid NOT NULL FK → grupos(id)`;
  `dia_semana` (check lunes..viernes); `hora_inicio`/`hora_fin time` (+CHECK fin>
  inicio); `materia_clave/materia_nombre` (texto oficial); `materia_id` FK
  opcional; `profesor_nombre` y `profesor_clave` (opcional, NULL = sin profesor);
  UNIQUE natural `(periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave)`.
- **INFERIDO (razonable):** el DDL fue desplegado en fases previas (flujo de
  importación horaria usa la tabla en producción). Si al verificar contra el SQL
  Editor hubiera diferencias, debe reportarse antes de cerrar el despliegue.

## 1. Mapa del sistema
lectura/escritura/importación/UI operan por `horario_semanal` con `periodo_id` y
`grupo_id`; `configuracion_clases_profesor` sigue como legacy deprecated; el
wizard `PasoHorario → HorarioEscolarPanel(periodoIdInicial)` ya propaga `periodoId`.

## 2. Integración en validarIntegridadCiclo (F6.1)
`validarIntegridadCiclo(periodoId)` (única autoridad, contrato F7) consulta
ahora `horario_semanal` filtrado por `periodo_id = periodoId` y añade:

| Código | Severidad | Regla (demostrable) |
|---|---|---|
| `sin_horario` | ADVERTENCIA | 0 filas de horario (no bloquea; comportamiento actual) |
| `horario_grupo_invalido` | ERROR | fila del periodo con grupo que no pertenece al periodo |
| `horario_grupo_solapado` | ERROR | mismo grupo, mismo día, rangos de hora solapados, materias distintas |
| `horario_profesor_solapado` | ERROR | distinto grupo, mismo día/rango, mismo `profesor_clave` NO NULL |
| duplicado exacto | NO APLICA | imposible por la UNIQUE natural (no se inventó regla) |

El `conteos.horarios` informa el total de bloques del periodo.

## 3. Tests
```text
test-auditoria-ciclo-f6.mjs     17/17 PASS (esquema DDL, integración, reglas, aislamiento UI)
test-ciclo-estado.mjs           33/33 PASS (regresión tras tocar validarIntegridadCiclo)
test-auditoria-ciclo-f7.mjs     15/15 PASS
test-auditoria-ciclo-f8.mjs     15/15 PASS
npx tsc --noEmit                PASS (exit 0)
```
Las pruebas son estáticas/in-memory; no prueban PostgreSQL real.

## 4. SQL real
SQL PREPARADO: ninguno nuevo. SQL EJECUTADO: **NO** (sin acceso SQL Editor;
nada estructural se modificó ni se ejecutó).

## 5. Riesgos restantes
1. Confirmar el DDL desplegado contra el SQL Editor (solo lectura) antes del
   despliegue final.
2. Reglas de conflicto implementadas según el DDL versionado; si el esquema real
   difiere (p. ej. UNIQUE distinta), revisar antes de F10.
3. Filas legacy de horario con `periodo_id` pendiente de backfill: F9/F10.

