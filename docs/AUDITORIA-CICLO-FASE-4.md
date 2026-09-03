# FASE 4 — PARCIALES / EVALUACIONES EN CICLOCONFIGURADOR (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03 · Estado: PASS

## Modelo (VERIFICADO EN CÓDIGO + DDL VERSIONADO)
`periodos_evaluacion`: `id` PK, `periodo_id` FK → periodos, `numero`, `nombre`,
`fecha_inicio`, `fecha_fin`, `activo`. DDL en `supabase/crear-periodos-evaluacion.sql`
(no se validó contra el SQL productivo; NO VERIFICADO EN SQL PRODUCTIVO).
Identidad del nuevo flujo: **`periodo_id`** (nunca nombre de ciclo).

## UI integrada (CAMBIOS REALIZADOS)
`paso-evaluacion.tsx` (reutiliza las actions existentes; sin CRUD paralelo):
- listado filtrado por `periodo_id`;
- **edición** por fila (nombre, inicio, fin) vía `actionGuardarEvaluacion(id,…)`;
- **desactivar** por fila vía `actionSetActivoEvaluacion(periodoId, id, false)`
  (nunca DELETE, coherente con el modelo);
- estado visible activo/inactivo; “Agregar parcial” conservado.

## Aislamiento entre ciclos
Cada operación recibe/lee con `periodo_id`; el listado se filtra por `c.periodo.id
=== periodoId`. Crear/actualizar/desactivar de A nunca toca B (mismo mecanismo que
guardarPeriodoEvaluacion, anclado a periodoId). Cubierto por diseño + acciones reales.

## Reglas de fechas (auditadas, no inventadas)
El dominio `guardarPeriodoEvaluacion` (existente) valida fechas/orden/solapamiento
(inicio<=fin, conflicto temporal, orden estable por `numero`). F4 no añadió reglas
nuevas: se reutilizó la validación existente del servidor.

## Integración con validación (contrato único F7)
`validarIntegridadCiclo(periodoId)` ya incluye parciales (no bloqueantes). F4 añadió:
- `conteos.evaluaciones` (alias de parciales activos/total del periodo);
- advertencia `sin_evaluaciones` cuando el periodo no tiene parciales (**no bloquea**).

## Activación (F8 intacta)
`setActivoCiclo(true)` → `validarIntegridadCiclo` → `activarCicloOperativoAtomico` → RPC.
Errores siguen bloqueando; las advertencias (incl. `sin_evaluaciones`) no.

## Tests
```
test-auditoria-ciclo-f4.mjs   20/20 PASS
test-auditoria-ciclo-f5.mjs   20/20 PASS  test-auditoria-ciclo-f6.mjs 17/17 PASS
test-auditoria-ciclo-f7.mjs   15/15 PASS  test-auditoria-ciclo-f8.mjs 15/15 PASS
test-ciclo-estado.mjs         33/33 PASS
npx tsc --noEmit              PASS (exit 0)
```
## SQL real
**NO EJECUTADO** (ningún cambio estructural; sin acceso SQL Editor).
## Legacy
`ciclo_escolar` no se usa en el nuevo flujo del paso; consumidores legacy de
evaluaciones no se tocaron (identificados como LEGACY).
## Riesgos restantes
1. Confirmar DDL desplegado de `periodos_evaluacion` (lectura) en despliegue.
2. Reglas de fechas dependen del dominio existente (no re-verificadas contra
   Supabase real en esta sesión).
3. Pendiente F9/F10: SQL productivo y verificación de integridad real.
