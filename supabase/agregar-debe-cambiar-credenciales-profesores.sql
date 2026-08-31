-- ============================================================================
-- FLAG DE CAMBIO FORZADO DE CREDENCIALES PARA PROFESORES/DIRECTIVOS — BLOQUE 9
-- (PIEZA 5)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Permitir que la administración fuerce a un profesor/directivo a cambiar
--   su clave en el próximo inicio de sesión. La clave se sigue almacenando en
--   TEXTO PLANO en `CLAVE` (igual que hoy); este flag SOLO controla el flujo
--   de cambio forzado, NO migra el almacenamiento.
--
-- SEMÁNTICA:
--   · DEFAULT false es INTENCIONAL: no se debe bloquear a los profesores
--     actuales al desplegar esto. El directivo activa el flag por profesor
--     (desde su panel) cuando decida forzar el cambio.
--   · true = en el siguiente login el portal exige cambiar la clave antes de
--     mostrar el panel. El cambio exitoso (actionCambiarClaveProfesor) pone
--     el flag en false automáticamente.
--
-- Aditivo e idempotente: seguro de re-ejecutar.
-- ============================================================================

ALTER TABLE "PROFESORES"
  ADD COLUMN IF NOT EXISTS debe_cambiar_credenciales boolean
  NOT NULL DEFAULT false;
