-- ============================================================================
-- CUENTA GENÉRICA DE DIRECTIVO — perfiles de visualización (2026-11-12, PROMPT AC)
-- Proyecto: mi-web-escolar (AulaNube / CETAC 23)
--
-- Una fila normal de PROFESORES, como PROFESOR (19), TECNICO (21),
-- ADMINISTRACION ESCOLAR (22) y SERVICIO ESCOLAR (23): sin segundo camino de
-- autenticación (R6). ADMIN (13) también tiene Permisos 'Directivo', pero es
-- la cuenta de administración del sitio; esta es la de VER el portal como
-- directivo, y se puede desactivar sin tocar aquella.
--
-- Se crea con una CLAVE ALEATORIA que nadie conoce (precedente: 5dad222). La
-- clave real se pone desde la app: un directivo entra a Personas › Profesores ›
-- Reponer clave. Nunca por chat ni en un documento.
--
-- Administración escolar NO lleva cuenta nueva: se reusa la 22.
--
-- Idempotente: si ya existe una cuenta llamada 'DIRECTIVO', no hace nada.
-- ============================================================================

insert into "PROFESORES" ("NOMBRE/PROFESOR/DIRECTIVO", "CLAVE", "Permisos", debe_cambiar_credenciales)
select 'DIRECTIVO', md5(random()::text || clock_timestamp()::text), 'Directivo', true
where not exists (
  select 1 from "PROFESORES"
  where upper(trim("NOMBRE/PROFESOR/DIRECTIVO")) = 'DIRECTIVO'
);

-- Verificación (una fila, Permisos 'Directivo', debe_cambiar_credenciales true):
-- select "ID", "NOMBRE/PROFESOR/DIRECTIVO", "Permisos", debe_cambiar_credenciales
--   from "PROFESORES" where upper(trim("NOMBRE/PROFESOR/DIRECTIVO")) = 'DIRECTIVO';
