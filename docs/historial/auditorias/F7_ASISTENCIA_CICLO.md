# F7 — Asistencia y cierre del modelo (asociación por contexto)

## Cambios
- `supabase/agregar-periodo-asistencia.sql` (PREPARADO, aditivo): columnas
  `periodo_id` (y `periodo_evaluacion_id` en clases/asistencia) en
  `clases_impartidas`, `asistencia_alumnos` y `justificaciones_asistencia`, con
  índices. Backfill NO destructivo (NULL para lo existente; se resuelve por
  fecha cuando sea seguro).
- `lib/escolar/asistencia-contexto.ts` (nuevo, puro):
  - `fechaEnPeriodo` / `clasePertenecePeriodo`
  - `validarContextoPlantilla` (una plantilla de A nunca se carga contra B)
  - `validarJustificacionContexto` (justificación de A nunca se aplica a B)
- `configuracion_clases_profesor` permanece legacy (no se reactiva).

## Pruebas (`scripts/test-asistencia-contexto.mjs`, 6/6)
Plantilla correcta/incorrecta · fecha dentro/fuera · justificación cruzada
rechazada / del mismo periodo aceptada.

## SQL pendiente (manual)
`supabase/agregar-periodo-asistencia.sql` (junto a F1/F4/F5).
