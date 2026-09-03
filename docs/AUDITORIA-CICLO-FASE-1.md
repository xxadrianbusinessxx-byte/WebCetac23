# FASE 1 — IDENTIDAD ÚNICA DEL CICLO (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03
Regla: identidad = `periodos.id`; estado operativo = `periodos.estado='operativo'`.
No se creó `vigente`. No se modificó semántica de `activo` en entidades hijas.

## 1. Alcance
Migrar los lectores de CICLO GLOBAL ("el ciclo actual/operativo") de `activo=true`
a la autoridad `estado='operativo'` con fallback legacy explícito. F5–F9 NO se tocaron.

## 2. Clasificación de cada uso encontrado

| Archivo | Uso | Clasificación | Cambio |
|---|---|---|---|
| `lib/escolar/ciclo-estado.ts` (nuevo helper) | resolver ciclo global | A → centralizado | ✅ IMPLEMENTADO: `obtenerCicloOperativoGlobal()` reutiliza `listarPeriodos()` (esquema detectado); estado primario, fallback legacy explícito, error ante >1 OPERATIVO o >1 activo legacy |
| `app/actions/asistencias.ts:778` `actionObtenerCicloActual` | `select nombre eq activo limit 1` | A | ✅ IMPLEMENTADO: usa helper (Caso1–5 en suite) |
| `app/actions/carga-academica.ts:176` catálogo reconocimiento | `select id,nombre eq activo` | A | ✅ IMPLEMENTADO: helper; lista vacía si no hay operativo; error si conflicto |
| `app/configuracion/page.tsx:24` contexto de carga | `select nombre eq activo` | A | ✅ IMPLEMENTADO: helper; nombres = operativo (o ninguno) |
| `lib/escolar/asistencias.ts:318` contexto asistencia | `select * eq activo limit 1` | A | ✅ IMPLEMENTADO: helper |
| `lib/escolar/carga-academica.ts:257` `cargarIndiceGrupos` | `by nombre eq activo` | A | ✅ IMPLEMENTADO: operativo por `estado` (fallback sin columna a `activo`) |
| `lib/escolar/semestres.ts:225` `listarSemestresOferta` | `select id,nombre eq activo` | A | ✅ IMPLEMENTADO: helper; la oferta se limita al único operativo |
| `ciclo-estado.ts` activación/desactivación/`sincronizarInscripcionesOperativo` | escritura `activo` + flags hijas | C/B | ✅ SIN CAMBIO (compatibilidad + semántica de hijas) |
| `grupos/grupo_materias/inscripciones/periodos_evaluacion/semestres/tutor_alumnos/asignaciones/config.clases.activo` | estado local de la relación | B | ✅ NO MIGRADO (correcto) |
| RPC `obtener_perfil_alumno` (`supabase/crear-rpc-obtener-perfil-alumno.sql`) | resuelve grupo solo si periodo `activo` | A | ⏸ PENDIENTE (SQL real; requiere edición + ejecución en Supabase) |
| `supabase/agregar-periodo-vigente.sql` | concepto `vigente` | — | 🚫 NO USADO (sigue sin ejecutar; no se crea) |

## 3. Implementación

- **Nuevo (1 helper, única infraestructura):** `obtenerCicloOperativoGlobal(supabase)` en
  `lib/escolar/ciclo-estado.ts`, construido sobre `listarPeriodos()` (detección de
  esquema existente). Resolución: `estado='operativo'` → si ninguno, fallback
  explícito `activo=true`; >1 en cualquiera de los dos → ERROR (sin elección
  arbitraria); 0 → `{periodo:null}` controlado.
- **Archivos modificados:** los 6 lectores globales (tabla superior) + tipos.
- **Archivos nuevos:** `scripts/test-auditoria-ciclo-f1.mjs`, casos F1 añadidos a
  `scripts/test-ciclo-estado.mjs`.

## 4. Fallback existente
`via: "fallback_activo"` se devuelve de forma explícita (test caso2) solo cuando:
(a) no existe la columna `estado` (esquema legacy) o (b) existe pero no hay ningún
OPERATIVO. No oculta inconsistencias: si hay dos activos legacy sin operativo → ERROR.

## 5. Tests

```text
test-auditoria-ciclo-f1.mjs         16/16 PASS  (sin consultas legacy periodos.activo,
                                                helper central único, sin vigente,
                                                activo de hijas conservado)
test-ciclo-estado.mjs               33/33 PASS  (28 previos + 5 casos F1: operativo,
                                                legacy fallback, estado>activo,
                                                2×OPERATIVO→error, sin ciclo→null)
npx tsc --noEmit                    PASS (exit 0)
```

## 6. Riesgos restantes
1. RPC `obtener_perfil_alumno` (SQL real) sigue resolviendo por `activo`: PENDIENTE
   hasta editar y ejecutar su SQL en Supabase (no ejecutable desde este entorno).
2. Comportamiento ante `0 ciclos OPERATIVO`: cada consumidor degrada a vacío/null
   (contrato existente preservado), salvo que el directivo corrija.
3. La activación TS sigue escribiendo `activo` como espejo (F8 mantendrá la sincronía).

## 7. Archivos fuera de F1 (no tocados)
`ciclo-estado.ts` (parte activación/inscripciones), calendario completo (F5),
activación RPC (F8), asistencia/backfill (F9), Excel académico/alumnos (F2/F3),
UI parciales (F4), horario (F6), validación consolidada (F7).

SQL real: **NO EJECUTADO** (ninguna sentencia en esta fase).
