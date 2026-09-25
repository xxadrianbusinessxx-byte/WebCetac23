-- ============================================================================
-- SOLICITUD DE CONSTANCIA DE ESTUDIOS DESDE EL PERFIL (2026-09-25)
-- Proyecto: mi-web-escolar (AulaNube / CETAC 23)
--
-- Alumno y tutor piden la constancia desde su perfil, como piden una cita:
-- ASUNTO, MOTIVO y el DÍA en que pasarán a recogerla. Administración escolar la
-- acepta o la rechaza y, cuando la entrega, la marca como entregada.
--
-- La tabla `solicitudes_constancia` ya existía (crear-tablas-uis-pendientes.sql)
-- con `tipo` y `observaciones`; no tenía dónde guardar asunto, motivo, día de
-- recogida ni quién la pidió. Se añaden sin tocar lo que hay: columnas nullables
-- (ORDEN §5). `tipo` sigue siendo obligatorio y la app escribe «estudios».
--
-- ADITIVO e idempotente.
-- ============================================================================

alter table solicitudes_constancia add column if not exists asunto text;
alter table solicitudes_constancia add column if not exists motivo text;
alter table solicitudes_constancia add column if not exists fecha_recogida date;
-- Quién la pidió: el propio alumno o su tutor, y su identificador de sesión
-- (CLAVE del alumno o matrícula del tutor). Para que Administración sepa a quién
-- se le entrega.
alter table solicitudes_constancia add column if not exists solicitada_por text;
alter table solicitudes_constancia add column if not exists solicitante text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'solicitudes_constancia_solicitada_por_check'
  ) then
    alter table solicitudes_constancia
      add constraint solicitudes_constancia_solicitada_por_check
      check (solicitada_por is null or solicitada_por in ('alumno', 'tutor'));
  end if;
end $$;

-- La lista de Administración se ordena por día de recogida.
create index if not exists solicitudes_constancia_recogida_idx
  on solicitudes_constancia (periodo_id, fecha_recogida);

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFICACIÓN:
--   select id, curp, asunto, motivo, fecha_recogida, solicitada_por, estado
--   from solicitudes_constancia order by created_at desc limit 5;
-- ============================================================================
