-- ============================================================================
-- RECURSOS POR MATERIA — una columna, no un sistema nuevo
-- Proyecto: mi-web-escolar (AulaNube / CETAC).  Fecha: 2026-09-17
-- Ejecutar en: Supabase SQL Editor.  Aditivo e idempotente.
--
-- ── Por qué una columna y no unas tablas `recursos` ────────────────────────
-- «Materias › Recursos» es, palabra por palabra, lo que ya hace Documentos:
-- archivos, en carpetas, con permisos. Crear `recursos` / `recursos_carpetas`
-- habría sido un camino paralelo a `CARPETAS` / `DOCUMENTOS` / `PERMISOS
-- CARPETAS` —la R6 que este repo persigue— y las dos mitades habrían divergido
-- en cuanto alguien arreglara una sola.
--
-- Lo único que le faltaba al sistema de documentos era saber que una carpeta
-- pertenece a una materia. Eso es esta columna.
--
-- NULLABLE a propósito: una carpeta sin `materia_interna` es institucional, que
-- es lo que son TODAS las que existen hoy. Ninguna fila cambia de significado
-- al aplicar esto.
--
-- `materia_interna` guarda el `idInterno` —el nombre de la tabla física—, que
-- es la identidad real de una materia en este sistema (GLOSARIO), y NUNCA el
-- nombre visible. Sin FK porque la «tabla de materias» son 384 tablas físicas
-- distintas: ese es el problema estructural nº3, y esta columna no lo repara.
-- ============================================================================

alter table public."CARPETAS"
  add column if not exists materia_interna text;

comment on column public."CARPETAS".materia_interna is
  'idInterno de la materia a la que pertenece la carpeta (Materias › Recursos). NULL = carpeta institucional (Contenido › Documentos).';

-- El índice sirve al filtro que hace la pantalla: «las carpetas de ESTA
-- materia». Parcial porque las institucionales (NULL) no se filtran por aquí y
-- son la mayoría.
create index if not exists ix_carpetas_materia
  on public."CARPETAS"(materia_interna)
  where materia_interna is not null;
