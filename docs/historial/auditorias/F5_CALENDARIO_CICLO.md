# F5 — Calendario y evaluaciones por periodo

## Cambios
- `supabase/agregar-periodo-id-calendario.sql` (PREPARADO): añade
  `calendario_escolar.periodo_id` (aditivo), backfill por **nombre exacto
  normalizado** (nunca adivina; huérfanos/ambiguos quedan con `NULL`), índice y
  UNIQUE parcial `(periodo_id, fecha)`.
- `lib/escolar/calendario.ts`:
  - `verificarColumnaPeriodoIdCalendario()` — detecta si el esquema F5 existe.
  - `obtenerCalendarioDePeriodo(periodoId, nombre)` — por `periodo_id` cuando
    existe; fallback texto legacy por nombre exacto.
  - `contarDiasClaseDePeriodo()` — conteo usado por la validación F1/F4.
  - `planBackfillCalendario()` (puro) — plan match / sin_match / ambiguo.
- `lib/escolar/ciclo-estado.ts` → `validarIntegridadCiclo` ahora cuenta los
  días de clase por PERIODO (schema-aware) en lugar de consulta textual directa.

## Decisiones
- `periodo_id` es la referencia estructural del calendario.
- El texto `ciclo_escolar` se conserva como compatibilidad (no se borra).
- La resolución fecha→ciclo→parcial ya vive en `evaluaciones.ts`
  (`resolverCicloEvaluacionPorFecha/Local`) por `periodo_id`; no se duplicó.

## Pruebas F5 (`scripts/test-ciclo-calendario.mjs`, 4/4)
Match por nombre exacto · normalización · huérfano detectado · ambiguo
detectado (nunca se decide por nosotros).

## SQL pendiente (manual)
`supabase/agregar-periodo-id-calendario.sql` (junto a F1/F4).
