-- Ejecutar en Supabase → SQL Editor (reemplaza la función si ya existía).
-- Sincroniza columnas del Excel: agrega las nuevas y elimina las que ya no vienen en el archivo.
CREATE OR REPLACE FUNCTION public.escolar_sync_columns(
  nombre_tabla text,
  nombres_columnas text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col text;
  col_existente text;
  -- Siempre: id, alumno_nombre. actualizado = marca de tiempo automática.
  preservar constant text[] := ARRAY['id', 'alumno_nombre', 'actualizado', 'created_at'];
BEGIN
  IF nombre_tabla IS NULL OR nombre_tabla = '' THEN
    RETURN;
  END IF;

  -- Eliminar columnas de datos que ya no están en el nuevo Excel
  FOR col_existente IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = nombre_tabla
  LOOP
    IF lower(col_existente) = ANY (
      SELECT lower(unnest) FROM unnest(preservar)
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(nombres_columnas) AS n(c)
      WHERE lower(trim(n.c)) = lower(col_existente)
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I DROP COLUMN IF EXISTS %I',
      nombre_tabla,
      col_existente
    );
  END LOOP;

  -- Agregar columnas del nuevo archivo
  FOREACH col IN ARRAY nombres_columnas
  LOOP
    col := trim(col);
    IF col = '' THEN CONTINUE; END IF;
    IF lower(col) = ANY (SELECT lower(unnest) FROM unnest(preservar)) THEN CONTINUE; END IF;

    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I text',
      nombre_tabla,
      col
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.escolar_sync_columns(text, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.escolar_sync_columns(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escolar_sync_columns(text, text[]) TO service_role;
