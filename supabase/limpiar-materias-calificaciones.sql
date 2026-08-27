-- C4.24 — LIMPIEZA DE DATOS DE MATERIAS Y CALIFICACIONES FINALES.
--
-- Vacía (DELETE de todas las filas) las tablas físicas de materia y las
-- tablas de "REGISTRO DE CALIFICACIONES FINALES". NO borra la estructura
-- (columnas) ni toca: catálogo (grupos, carreras, periodos), grupo_materias,
-- materias, materias_nombres_visibles, inscripciones_alumno, aliases.
--
-- Cómo se identifican las tablas:
--   1) grupo_materias.tabla_legacy  → cada materia del catálogo académico.
--   2) information_schema: tablas con nombre ILIKE '%REGISTRO DE CALIFICACIONES FINALES%'.
--   3) information_schema: tablas huérfanas cuyo nombre inicia con un grado
--      (1RO|2DO|3RO|4TO|5TO|6TO) que no estén en grupo_materias.
--
-- Ejecutar en Supabase → SQL Editor. Aplica SOLO a datos (filas).

DO $$
DECLARE
  t text;
  n int;
BEGIN
  -- 1) Materias del catálogo académico.
  FOR t IN
    SELECT DISTINCT tabla_legacy FROM public.grupo_materias
    WHERE tabla_legacy IS NOT NULL AND tabla_legacy <> ''
  LOOP
    EXECUTE format('DELETE FROM %I', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Materia vaciada: % (filas: %)', t, n;
  END LOOP;

  -- 2) Registros de calificaciones finales.
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ILIKE '%REGISTRO DE CALIFICACIONES FINALES%'
  LOOP
    EXECUTE format('DELETE FROM %I', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Registro final vaciado: % (filas: %)', t, n;
  END LOOP;

  -- 3) Tablas huérfanas de materia (empiezan con un grado y no están en
  --    grupo_materias; por si quedaron de cargas legacy).
  FOR t IN
    SELECT c.table_name
    FROM information_schema.tables c
    WHERE c.table_schema = 'public'
      AND c.table_name ~* '^(1RO|2DO|3RO|4TO|5TO|6TO) '
      AND c.table_name NOT IN (
        SELECT DISTINCT tabla_legacy FROM public.grupo_materias
        WHERE tabla_legacy IS NOT NULL AND tabla_legacy <> ''
      )
      AND c.table_name NOT ILIKE '%REGISTRO DE CALIFICACIONES FINALES%'
  LOOP
    EXECUTE format('DELETE FROM %I', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Materia huerfana vaciada: % (filas: %)', t, n;
  END LOOP;
END $$;
