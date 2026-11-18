-- agregar-unicidad-dueno-materia.sql — 2026-11-17
--
-- POR QUÉ. Desde 2026-11-17 la propiedad de una materia de grupo vive SOLO en
-- asignaciones_profesor y la asigna el técnico (subir asistencia ya no la da).
-- Una materia tiene UN dueño activo: asignarla a otro profesor lo reemplaza (el
-- anterior pasa a activo = false, con su `hasta`; nunca se borra). El código lo
-- cumple (`planAsignarMateria`, lib/escolar/catalogo/asignacion-materia-puro.ts),
-- pero la exclusividad la impone la base (ORDEN §5: lo exclusivo va en SQL):
-- si dos técnicos asignan la misma materia a la vez, uno de los dos falla en vez
-- de dejar dos dueños.
--
-- Índice PARCIAL: solo cuenta las filas activas. Las inactivas son historial y
-- puede haber muchas. No se usa en ningún `onConflict` (PostgREST no infiere un
-- parcial), solo como restricción.
--
-- Aditivo y reversible. No borra ni cambia ninguna fila. Si alguna materia tiene
-- ya dos dueños activos, se detiene sin crear nada: hay que decidir a mano cuál
-- se queda (Técnico › Asignaciones › desactivar).
-- Medido al escribirlo (2026-11-17): 0 asignaciones activas.
--
-- Revertir:
--   DROP INDEX IF EXISTS public.asignaciones_profesor_un_dueno_activo_uidx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.asignaciones_profesor
    WHERE activo IS TRUE
    GROUP BY grupo_materia_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay materias con más de un dueño activo en asignaciones_profesor. Desactiva los sobrantes antes de crear la unicidad; no se creó nada.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_profesor_un_dueno_activo_uidx
  ON public.asignaciones_profesor (grupo_materia_id)
  WHERE activo IS TRUE;
