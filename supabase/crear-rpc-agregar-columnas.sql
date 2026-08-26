-- ============================================================================
-- AGREGAR COLUMNAS (sin eliminar) — BLOQUE 7C.2
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Usado por el modo «Actualizar / agregar avance» de calificaciones.
--   A diferencia de `escolar_sync_columns` (que ELIMINA columnas ausentes),
--   esta función SOLO AGREGA las columnas faltantes con `ADD COLUMN IF NOT
--   EXISTS`. Así un Excel de avance parcial NO borra las columnas que no
--   aparecen en el archivo.
--
-- SEGURIDAD:
--   · CREATE OR REPLACE (idempotente, seguro de re-ejecutar).
--   · Conserva id, alumno_nombre y actualizado (nunca se agregan como datos).
--   · No toca tablas de calificaciones ni el esquema de `escolar_sync_columns`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.escolar_agregar_columnas(
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
  preservar constant text[] := ARRAY['id', 'alumno_nombre', 'actualizado'];
BEGIN
  IF nombre_tabla IS NULL OR nombre_tabla = '' THEN
    RETURN;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.escolar_agregar_columnas(text, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.escolar_agregar_columnas(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escolar_agregar_columnas(text, text[]) TO service_role;
