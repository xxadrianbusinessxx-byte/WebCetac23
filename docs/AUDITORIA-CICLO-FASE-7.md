# FASE 7 — VALIDACIÓN INTEGRAL DEL CICLO (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## Estado: PASS

## 1. Auditoría (contrato único detectado, sin duplicar)
El repositorio YA tiene una validación integral de servidor: `validarIntegridadCiclo()`
(lib/escolar/ciclo-estado.ts) que consulta por `periodo_id` grupos/grupo_materias/
materias/inscripciones/parciales y días de clase del calendario, y devuelve
`{ ok, errores[], advertencias[] }`. `resumenCicloParaAdmin()`/`actionDetalleCicloAdmin`
agregan los conteos que la UI muestra. `PasoValidacion` ya consume ese resultado y
decide `Puede activarse` / `NO puede activarse`.

| Dominio | Función actual | Fuente | periodo_id | Bloquea | Advertencia | UI | Activación |
|---|---|---|---|---|---|---|---|
| periodo (existe/no histórico) | `consultarPeriodo` + RPC | ciclo-estado / SQL | sí | sí (RPC) | — | detalle | RPC + previa F7 |
| grupos | `validarIntegridadCiclo` | ciclo-estado | sí | sí | — | detalle | previa + RPC |
| grupo_materias/materias | `validarIntegridadCiclo` | ciclo-estado | vía grupo | sí | — | detalle | previa + RPC |
| inscripciones/alumnos | `validarIntegridadCiclo` | ciclo-estado | vía grupo | sí | — | detalle | previa + RPC |
| evaluaciones (parciales) | conteo | ciclo-estado | sí | no (informativo hoy) | sí | detalle | — |
| calendario (días de clase) | `contarDiasClaseDePeriodo` | calendario/ciclo-estado | sí | no hoy | sí | detalle | — |
| horario | `validarIntegridadCiclo` (F6.1) | ciclo-estado | sí | errores de horario | `sin_horario` | detalle | previa + RPC |
| fechas del ciclo | `crearCicloBorrador`/rango | evaluaciones | sí | al crear/guardar | — | PasoDatos | — |

**Duplicaciones:** no existen `validarCicloCompleto/validarCiclo/puedeActivarCiclo/
esCicloValido/checkCiclo/validarAntesDeActivar` (verificado). La única autoridad es
`validarIntegridadCiclo` (+ su capa pura `validarIntegridadCicloPura`). No se creó un
segundo sistema: se reutilizó el contrato existente.

## 2. Contrato (coordinado, anclado a periodoId)
```text
validarIntegridadCiclo(periodoId)
  → { ok, errores: [{codigo, mensaje}...], advertencias: [...] }
  + actionDetalleCicloAdmin → detalle { ok, errores, advertencias, conteos, activo }  ← UI
  + validación previa en setActivoCiclo antes de la RPC                               ← activación
  + invariantes críticas RAISE en activar_ciclo_operativo (grupos/materias/alumnos/histórico)
```
No se renombraron APIs públicas (regla “reutilizar”); se documentó como contrato único.

## 3. Bloqueadores (según código/modelo actual)
Ciclo inexistente · histórico · sin grupos · sin materia activa por grupo ·
sin inscripciones con alumnos. Todos protegidos por la RPC (RAISE) y la previa TS
los devuelve con mensajes amigables.

## 4. Advertencias (no bloquean)
Conteos informativos de parciales/días de clase hoy no bloquean la activación
(estructura actual TS; decisión documentada, no se convirtieron arbitrariamente en
bloqueadores).

## 5. Integración
UI: `CicloConfigurador → PasoValidacion` (servidor vía `actionDetalleCicloAdmin`) →
✅/⚠️/❌ según `d.ok`+`d.errores`+`d.advertencias`; botón deshabilitado si `!d.ok || d.activo`.
Activación: `setActivoCiclo(true)` ejecuta **primero** `validarIntegridadCiclo` (mensajes
amigables) y solo si `ok` llama a `activarCicloOperativoAtomico` → RPC (invariantes de
seguridad independientes de la UI). Las advertencias no bloquean.

## 6. Cambios realizados
- `lib/escolar/evaluaciones.ts`: en `setActivoCiclo` (rama activar) se añade la
  validación previa amigable antes de la RPC (import + branch); la RPC conserva sus invariantes.
- Sin cambios en `PasoValidacion`, `actionDetalleCicloAdmin` ni `validarIntegridadCiclo`
  (ya eran el contrato); no se tocaron F0/F1/F5/F8.

## 7. Tests
```text
test-auditoria-ciclo-f7.mjs     15/15 PASS
test-auditoria-ciclo-f8.mjs     15/15 PASS (regresión)
test-ciclo-estado.mjs           33/33 PASS (regresión)
test-activacion-ciclo-f8.mjs     5/5  PASS (regresión)
npx tsc --noEmit                PASS (exit 0)
```
Tests in-memory/estáticos (no prueban PostgreSQL real).

## 8. SQL real
- SQL PREPARADO: ninguno nuevo en F7.
- SQL EJECUTADO: ninguno (la RPC mejorada de F8 sigue SIN desplegar; al aplicarla,
  la previa TS + invariantes RPC quedan activas en producción).

## 9. Riesgos pendientes
1. RPC F8 mejorada sin desplegar en Supabase.
2. Horario integrado a la validación en F6.1 (reglas según DDL versionado; confirmar esquema real en el despliegue).
3. Parciales/calendario como advertencias: si el producto exige que bloqueen,
  deberá decidirse en F4/F6 sin tocar F7.
4. La UI no valida el caso “alumno sin inscripción del periodo” (F3).
