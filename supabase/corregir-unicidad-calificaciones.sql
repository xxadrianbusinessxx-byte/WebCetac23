-- ============================================================================
-- MIGRACIÓN OPCIÓN B · CORRECCIÓN: las claves de unicidad que PostgREST sí ve
-- Proyecto: mi-web-escolar (AulaNube / CETAC).  Fecha: 2026-10-01
-- Ejecutar en: Supabase SQL Editor.  IDEMPOTENTE.  Después de
--   `crear-calificaciones-normalizadas.sql`, que es el que corrige.
--
-- ── Qué estaba mal, medido ─────────────────────────────────────────────────
-- `crear-calificaciones-normalizadas.sql` declaró la unicidad con ÍNDICES:
--     ux_calificaciones_identidad  → de EXPRESIÓN: coalesce(clave_columna, '')
--     ux_nombres_visibles_gm       → PARCIAL: where grupo_materia_id is not null
--     ux_mapeo_columnas_gm         → PARCIAL: ídem
--
-- PostgreSQL no infiere ninguno de los dos tipos desde un `ON CONFLICT (cols)`
-- a secas, y eso es exactamente lo que PostgREST genera con `on_conflict=`.
-- Probado contra la base el 2026-10-01: los tres upserts del código
-- (`guardarCalificaciones`, `calificarActividad`, `guardarAlias`) devuelven
--     42P10  there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
-- y no escriben nada. Es decir: la escritura del modelo B no funcionaba.
--
-- ── El arreglo ─────────────────────────────────────────────────────────────
-- Restricciones UNIQUE normales sobre columnas, que es lo único que la
-- inferencia de `ON CONFLICT` reconoce siempre.
--
-- · El índice parcial sobraba: una restricción UNIQUE ya admite varios NULL
--   (en PostgreSQL los NULL no son iguales entre sí), así que las filas sin
--   puente siguen sin chocar.
--
-- · El `coalesce` existía para que dos notas con `clave_columna` nula no se
--   duplicaran. Se consigue lo mismo, y de forma inferible, haciendo la columna
--   NOT NULL con '' por defecto. Todo escritor del código la rellena ya (el
--   encabezado del Excel, o la columna de la actividad), y la tabla tiene CERO
--   filas: es el momento más barato que va a haber para cambiarla.
--
-- · `materias_nombres_visibles.materia_id` y `materias_mapeo_columnas.materia_id`
--   dejan de ser NOT NULL. Guardan el nombre de la tabla física, y una materia
--   dada de alta con el modelo nuevo NO tiene tabla física (12 de las 253
--   parejas ya no la tienen). Sin esto, el alias de esas materias no se podría
--   guardar nunca. Los NULL no chocan con la unicidad que ya tiene `materia_id`.
--
-- · `grupo_materias.tabla_legacy` pasa a ser única. Hoy lo es de hecho (241
--   valores, ninguno repetido, medido); `grupoMateriaDesdeTablaLegacy` depende
--   de ello, y un duplicado futuro la haría devolver null en silencio.
-- ============================================================================

-- ── 1. calificaciones ──────────────────────────────────────────────────────
drop index if exists public.ux_calificaciones_identidad;

update public.calificaciones set clave_columna = '' where clave_columna is null;
alter table public.calificaciones alter column clave_columna set default '';
alter table public.calificaciones alter column clave_columna set not null;

alter table public.calificaciones drop constraint if exists uq_calificaciones_identidad;
alter table public.calificaciones
  add constraint uq_calificaciones_identidad
  unique (grupo_materia_id, curp, tipo, clave_columna);

-- ── 2. el puente: alias y mapeo, uno por pareja ────────────────────────────
drop index if exists public.ux_nombres_visibles_gm;
alter table public.materias_nombres_visibles drop constraint if exists uq_nombres_visibles_gm;
alter table public.materias_nombres_visibles
  add constraint uq_nombres_visibles_gm unique (grupo_materia_id);
alter table public.materias_nombres_visibles alter column materia_id drop not null;

drop index if exists public.ux_mapeo_columnas_gm;
alter table public.materias_mapeo_columnas drop constraint if exists uq_mapeo_columnas_gm;
alter table public.materias_mapeo_columnas
  add constraint uq_mapeo_columnas_gm unique (grupo_materia_id);
alter table public.materias_mapeo_columnas alter column materia_id drop not null;

-- ── 3. la llave del puente con la identidad vieja ──────────────────────────
alter table public.grupo_materias drop constraint if exists uq_grupo_materias_tabla_legacy;
alter table public.grupo_materias
  add constraint uq_grupo_materias_tabla_legacy unique (tabla_legacy);

-- ── 4. Verificación (solo lectura) ─────────────────────────────────────────
-- Las cuatro restricciones tienen que aparecer, y ningún índice ux_* viejo:
--   select conrelid::regclass tabla, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname in ('uq_calificaciones_identidad','uq_nombres_visibles_gm',
--                      'uq_mapeo_columnas_gm','uq_grupo_materias_tabla_legacy');
--
--   select indexname from pg_indexes
--    where indexname in ('ux_calificaciones_identidad','ux_nombres_visibles_gm',
--                        'ux_mapeo_columnas_gm');          -- debe dar 0 filas
--
-- La prueba que de verdad importa la hace el código, no este archivo:
--   node scripts/migrar-ensayo-modelo-b.mjs           (en seco: solo lee)
--   node scripts/migrar-ensayo-modelo-b.mjs --apply   (escribe una CURP centinela y la borra)
