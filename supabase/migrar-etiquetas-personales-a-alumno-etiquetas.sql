-- ============================================================================
-- MIGRACIÓN — Pares EMPTY1-6 de "ETIQUETAS PERSONALES" → alumno_etiquetas
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (DESPUÉS de crear-tabla-alumno-etiquetas.sql)
--
-- Mapeo (copia SEGURA, no destructiva):
--   EMPTY1 (título) + EMPTY4 (valor)  → orden 1
--   EMPTY2 (título) + EMPTY5 (valor)  → orden 2
--   EMPTY3 (título) + EMPTY6 (valor)  → orden 3
--
-- Reglas:
--   · SOLO se copia un par cuando el título o el valor NO están vacíos.
--   · Si el título está vacío pero el valor existe, se usa el título por
--     defecto «Etiqueta N» (mismo criterio de presentación actual del perfil:
--     etiquetasVaciasDesdeFila usa «Etiqueta 1..3» como fallback).
--   · NO se migran GRADO, GRUPO, CARRERA, GENERO, CORREO, CELULAR,
--     TIPO DE SANGRE, ALERGIAS, LENTES, ENFERMEDAD CRONICA, SALUD MENTAL,
--     NECESIDAD PSICOLOGICA, PESO, TALLA, VACUNACION ni COMENTARIO PERSONAL:
--     son CAMPOS DEFINIDOS del modelo de datos personales y permanecen en
--     "ETIQUETAS PERSONALES".
--   · NO se borran las columnas EMPTY1..EMPTY6 (regla legacy: migrar, verificar,
--     cambiar consumidores y solo después eliminar si es seguro).
--   · IDEMPOTENTE: ON CONFLICT DO NOTHING. Re-ejecutar no duplica ni
--     sobrescribe filas ya migradas. Si se corrige un valor origen y se desea
--     re-sincronizar, se puede eliminar el destino antes de re-ejecutar.
--   · Si dos pares del MISMO alumno generan el mismo título normalizado, gana
--     el de menor `orden` (el segundo queda ignorado por el índice único).
-- ============================================================================

WITH origen AS (
  SELECT
    btrim(e."CURP") AS curp,
    p.orden,
    btrim(CASE p.orden
      WHEN 1 THEN e."EMPTY1"
      WHEN 2 THEN e."EMPTY2"
      WHEN 3 THEN e."EMPTY3"
    END) AS titulo_raw,
    btrim(COALESCE(CASE p.orden
      WHEN 1 THEN e."EMPTY4"
      WHEN 2 THEN e."EMPTY5"
      WHEN 3 THEN e."EMPTY6"
    END, '')) AS valor
  FROM "ETIQUETAS PERSONALES" e
  CROSS JOIN (VALUES (1), (2), (3)) AS p(orden)
)
INSERT INTO public.alumno_etiquetas (curp, titulo, valor, orden)
SELECT
  curp,
  COALESCE(NULLIF(titulo_raw, ''), 'Etiqueta ' || orden) AS titulo,
  valor,
  orden
FROM origen
WHERE curp <> ''
  AND (titulo_raw <> '' OR valor <> '')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICACIÓN tras ejecutar:
--   1) Cuántas filas se migraron:
--        SELECT count(*) FROM public.alumno_etiquetas;
--   2) Ningún campo académico debe haber llegado a alumno_etiquetas:
--        SELECT count(*) FROM public.alumno_etiquetas
--        WHERE lower(titulo) IN ('grado', 'grupo', 'carrera');
--   3) Los pares EMPTY de origen siguen intactos:
--        SELECT "CURP", "EMPTY1", "EMPTY4" FROM "ETIQUETAS PERSONALES" LIMIT 5;
-- ============================================================================
