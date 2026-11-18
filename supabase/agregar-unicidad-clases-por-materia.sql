-- agregar-unicidad-clases-por-materia.sql — 2026-11-17
--
-- POR QUÉ. Subir asistencia dejó de dar la propiedad de la materia: ahora la
-- captura el profesor, el directivo o Servicio Escolar, y la propiedad solo la
-- asigna el técnico (asignaciones_profesor). Si dos personas capturan la MISMA
-- materia el MISMO día, tienen que escribir la misma fila, no dos. Hasta hoy la
-- clave de conflicto llevaba `profesor_id` dentro, y eso era lo que permitía el
-- duplicado (lo evitaba el traspaso, que ya no existe en la subida).
--
-- La clave natural:
--   · asistencia_alumnos (curp, grupo_materia_id, fecha) — YA existe:
--     asistencia_alumnos_curp_gm_fecha_uidx (agregar-indices-asistencia.sql).
--   · clases_impartidas (grupo_materia_id, fecha) — la añade ESTE archivo.
--     La materia de grupo ya implica grado y grupo.
--
-- Índice COMPLETO, no parcial: PostgREST no infiere un índice parcial en un
-- upsert (`onConflict`) y respondería 42P10. Las filas legacy con
-- grupo_materia_id NULL no chocan entre sí (NULL es distinto de NULL).
--
-- Aditivo y reversible. No borra ni cambia ninguna fila. Si hubiera duplicados
-- por (materia, día), se detiene sin crear nada: hay que revisarlos a mano.
-- Medido al escribirlo (2026-11-17): clases_impartidas = 0 filas.
--
-- Revertir:
--   DROP INDEX IF EXISTS public.clases_impartidas_gm_fecha_uidx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clases_impartidas
    WHERE grupo_materia_id IS NOT NULL
    GROUP BY grupo_materia_id, fecha
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'clases_impartidas tiene filas duplicadas por (grupo_materia_id, fecha). Revísalas antes de crear la unicidad; no se creó nada.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clases_impartidas_gm_fecha_uidx
  ON public.clases_impartidas (grupo_materia_id, fecha);
