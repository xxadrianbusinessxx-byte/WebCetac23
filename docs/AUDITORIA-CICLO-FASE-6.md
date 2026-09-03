# FASE 6 — HORARIO POR PERIODO (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## Estado: PENDIENTE (sin maquillar)
Auditoría completada y test de auditoría PASS. La integración del horario dentro
de `validarIntegridadCiclo(periodoId)` NO se implementó en esta sesión: requiere
definir reglas de conflicto/duplicado contra el esquema real de `horario_semanal`
(filas/columnas de bloque) que no pueden validarse en este entorno sin riesgo de
inventar comportamiento. Se documenta exactamente qué falta.

## 1. Mapa del sistema de horario
| Componente | Fuente | Identidad | periodo_id | Grupo | Materia | Profesor | Día/Hora |
|---|---|---|---|---|---|---|---|
| lectura | `lib/escolar/horario-semanal.ts` | `horario_semanal` versionado por `(periodo_id, grupo_id)` + helpers legacy por `obtenerPeriodoPorNombre` (consumidores antiguos) | ✅ | ✅ | ✅ (derivada) | ✅ (asignaciones/roster F6 previo) | ✅ bloques |
| escritura/importación | `supabase/crear-horario-semanal.sql` + importador existente | `periodo_id` | ✅ | ✅ | ✅ | ✅ | ✅ |
| UI | `HorarioEscolarPanel` | `periodoIdInicial` | ✅ | ✅ | ✅ | ✅ | ✅ |
| validación | `validarIntegridadCiclo` (F7) | **sin fila horario todavía** | — | — | — | — | ❌ PENDIENTE |
| legacy | `configuracion_clases_profesor` | deprecated (FASE HORARIO) | ❌ | — | — | — | — |

## 2. Aislamiento (evidencia)
**Caso A con matices:** `horario_semanal` está versionado por `(periodo_id,
grupo_id)` (SQL + docs HORARIO_SEMANAL_MODULO). Existen rutas legacy de consulta
que resuelven el periodo por NOMBRE (`obtenerPeriodoPorNombre`) para consumidores
que no tienen `periodoId` (plantillas/profesor); clasificadas LEGACY (no se
eliminan; no se usan en el nuevo flujo del wizard).

## 3. UI → CicloConfigurador
`PasoHorario` entrega `periodoIdInicial={periodoId}` a `HorarioEscolarPanel`
(verificado en test). El panel NO usa `ciclo_escolar` como identidad.

## 4. Conflictos (reglas del modelo a confirmar en siguiente paso)
Bloques por `(grupo, día, hora)`; conflicto real = mismo grupo/profesor con
solape. Los detalles de la UNIQUE y campos exactos de `horario_semanal` (materia/
profesor/día/hora) deben verificarse contra el esquema desplegado antes de
codificarlos como BLOQUEADORES.

## 5. Validación (integración pendiente en el contrato F7)
Falta añadir, dentro de `validarIntegridadCiclo(periodoId)`:
- advertencia `sin_horario` cuando el periodo no tiene bloques (no bloquea hoy);
- error de integridad si filas del periodo referencian un grupo inexistente;
- (decisión posterior) conflicto de grupo/profesor según la UNIQUE real.
Esto requiere leer el esquema real (SQL Editor/read-only) para no inventar reglas.

## 6. Tests
```text
test-auditoria-ciclo-f6.mjs     X/X PASS  (estáticos: UI periodoId, aislamiento,
                                          sin 2ª autoridad, estado honesto)
```
Sin tests de conflicto funcionales: no se inventan reglas sobre el esquema.

## 7. SQL real
SQL PREPARADO: ninguno. SQL EJECUTADO: NO (ninguno en esta sesión).

## 8. Riesgos pendientes
1. Integración horario → `validarIntegridadCiclo` (requiere ver esquema real).
2. Reglas de conflicto/duplicado sin confirmar contra el SQL desplegado.
3. Rutas legacy por nombre coexisten (controladas para consumidores antiguos).
