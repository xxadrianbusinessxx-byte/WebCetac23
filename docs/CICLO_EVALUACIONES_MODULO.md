# Módulo CICLO ESCOLAR + PERIODOS DE EVALUACIÓN (FASE CICLO)

## Modelo

```
periodos (ciclo escolar: 2026-2027)
  ├── fecha_inicio / fecha_fin   (aditivo, OPCIONAL: rango del ciclo)
  └── periodos_evaluacion        (parciales configurables)
        ├── numero   (orden explícito y estable)
        ├── nombre   (presentación, ej. "Parcial 1")
        ├── fecha_inicio / fecha_fin
        └── activo
```

- Un parcial pertenece inequívocamente a un ciclo (`periodo_id` FK).
- La cantidad de parciales es CONFIGURABLE (no hay 3 fijo).
- Identidad por IDs; nunca se usan strings compuestos tipo
  `"2026-2027 - Parcial 1"`.
- `horario_semanal` NO conoce parciales: sigue versionado por `periodo_id`.
- Históricos: nunca DELETE; desactivar = `activo=false`.

## Resolución de fecha (centralizada)

`lib/escolar/evaluaciones.ts`:

- Pura (sin DB): `resolverCicloEvaluacionLocal(fecha, periodos, evalsPorPeriodo)`
  y `resolverEvaluacionPorFechaLocal(fecha, evaluaciones)`.
- Con DB (sin N+1):
  - `resolverEvaluacionEnPeriodoPorFecha(supabase, periodoId, fecha)` → 1 consulta.
  - `resolverCicloEvaluacionPorFecha(supabase, fecha)` → 2 consultas
    (periodos + evaluaciones activas) y resuelve en memoria.

Regla determinista:

1. Si un ciclo tiene RANGO explícito que contiene la fecha → ese ciclo; dentro
   de él se busca el parcial (puede dar `evaluacion: null` = día del ciclo sin
   parcial).
2. Si ningún ciclo tiene rango, se acepta un ciclo cuyo PARCIAL contenga la
   fecha (permite ciclos sin rango).
3. Se prefiere el ciclo ACTIVO.

Validaciones server-side al guardar: fechas ISO `YYYY-MM-DD`, `inicio <= fin`,
duplicados de `numero` y `nombre` por ciclo, y NO solapamiento de rangos
(constraint opcional con `btree_gist` + validación en servicio).

## SQL preparado (NO ejecutado)

`supabase/crear-periodos-evaluacion.sql`:

- Columnas aditivas en `periodos` (`fecha_inicio`, `fecha_fin`) + CHECK.
- Tabla `periodos_evaluacion` con UNIQUE `(periodo_id, numero)` y
  `(periodo_id, nombre)`, CHECK de rango, índices para consulta por ciclo y por
  fecha (`periodo_id, fecha_inicio, fecha_fin`), no-solapamiento opcional
  (EXCLUDE + btree_gist), trigger `updated_at` y RLS — todo idempotente
  (patrones `IF NOT EXISTS` / `DROP POLICY` / DO ... pg_policies).

## UI del directivo

`app/components/ciclo-evaluaciones-admin.tsx` (en `/configuracion`):

- Crear ciclo (nombre + rango opcional).
- Activar/desactivar ciclo (históricos conservados).
- Guardar rango del ciclo.
- Parciales por ciclo: agregar (número siguiente automático), editar nombre /
  número / inicio / cierre, guardar y activar/desactivar.

Server Actions: `app/actions/evaluaciones.ts` (todas con rol directivo).

## Horario + parciales

La importación de horario sigue seleccionando el ciclo (`periodo_id`). Si el
archivo contiene explícitamente un ciclo (`20XX-20XX`), se detecta y debe
coincidir con el ciclo seleccionado; si NO coincide, la importación se BLOQUEA
(nunca se mezclan horarios de ciclos en silencio). Si no hay ciclo detectable,
manda el ciclo seleccionado por el directivo (nada de constantes hardcodeadas).

## Hallazgos de auditoría

- `academico_semestres` NO es un periodo de evaluación: modela oferta por
  semestre de grado (1RO→1 … 6TO→6). No se tocó.
- «parcial» en calificaciones (`columnaParciales`, `Parcial 1…`) es una
  categoría de columnas de los Excel de materia, sin fechas ni identidad
  temporal; no se reutilizó como estructura.
- `calendario_escolar` (ciclo_escolar texto + fechas por día) sigue siendo la
  autoridad de días/hábiles; `periodos.fecha_inicio/fin` son un RANGO
  administrativo opcional (no reemplazan el calendario por día).
- No se agregó `parcial_id` a asistencias/clases: la fecha resuelve el parcial
  de forma determinista cuando se necesita.

## Archivos

| Archivo | Rol |
| --- | --- |
| `supabase/crear-periodos-evaluacion.sql` | DDL idempotente (PREPARADO, no ejecutado) |
| `lib/escolar/tables.ts` / `tablas-supabase.ts` | Constante + exclusión de descubrimiento |
| `lib/escolar/evaluaciones.ts` | Tipos, validación, resolución pura y repositorio |
| `app/actions/evaluaciones.ts` | Server Actions (solo directivo) |
| `app/components/ciclo-evaluaciones-admin.tsx` | Panel directivo |
| `lib/escolar/horario-importar.ts` | Detección/validación del ciclo del archivo |
| `scripts/test-evaluaciones.mjs` | Pruebas puras (26 casos) |
