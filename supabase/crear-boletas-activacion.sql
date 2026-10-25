-- ============================================================================
-- BOLETA GENERADA — qué parcial tiene la boleta ACTIVADA y para quién.
-- Proyecto: mi-web-escolar (CETAC)
-- Ejecutar en: Supabase SQL Editor.  Fecha: 2026-10-24  ·  PROMPT X, Parte A
--
-- ADITIVO Y REVERSIBLE: una tabla nueva y una función nueva, IF NOT EXISTS /
-- CREATE OR REPLACE. No toca calificaciones, periodos_evaluacion ni grupos.
-- Idempotente: se puede ejecutar dos veces.
--
-- La boleta NO se guarda: se arma en el navegador al leer, con las notas que hay
-- en ese momento (decisión del responsable). Lo único que necesita persistir es
-- el interruptor del directivo: «la boleta del Parcial 2 está activada para todo
-- el plantel / el grado 2DO / el grupo 2DO A · RH». Sin esta fila, el sistema no
-- tiene cómo saber si se la enseña al alumno.
--
-- Desactivar NO borra: pone activa = false y sella quién y cuándo. Así queda el
-- historial de qué se enseñó y en qué fechas.
--
-- IDENTIDADES: ciclo por periodos.id (R5); parcial por periodos_evaluacion.id;
-- grupo por grupos.id (la letra se repite entre carreras); quien activa por
-- PROFESORES.ID, bigint sin FK, igual que portada_carreras.actualizado_por.
-- RLS: permisiva, como el resto. Autoriza exigir("boleta.activar").
-- ============================================================================

create table if not exists public.boletas_activacion (
  id              uuid primary key default gen_random_uuid(),
  periodo_id      uuid not null references public.periodos(id) on delete cascade,
  evaluacion_id   uuid not null references public.periodos_evaluacion(id) on delete cascade,
  alcance         text not null check (alcance in ('plantel', 'grado', 'grupo')),
  grado           text check (grado is null or char_length(grado) between 1 and 20),
  grupo_id        uuid references public.grupos(id) on delete cascade,
  activa          boolean not null default true,
  activada_por    bigint,
  activada_en     timestamptz not null default now(),
  desactivada_por bigint,
  desactivada_en  timestamptz,
  -- Cada alcance lleva exactamente su dato, y ninguno de los otros.
  constraint boletas_activacion_alcance_coherente check (
    (alcance = 'plantel' and grado is null     and grupo_id is null)
    or (alcance = 'grado' and grado is not null and grupo_id is null)
    or (alcance = 'grupo' and grupo_id is not null and grado is null)
  ),
  -- Una fila activa no tiene fecha de cierre; una cerrada, sí.
  constraint boletas_activacion_cierre check (activa = (desactivada_en is null))
);

comment on table public.boletas_activacion is
  'Boleta generada: qué parcial tiene la boleta activada y para quién (plantel, grado o grupo). La boleta no se guarda. PROMPT X, 2026-10-24.';

-- Una sola activación VIGENTE por alcance dentro de un ciclo. Activar el mismo
-- alcance con otro parcial pasa por activar_boleta(), que cierra la anterior.
create unique index if not exists ux_boletas_activacion_vigente
  on public.boletas_activacion (periodo_id, alcance, coalesce(grado, ''), coalesce(grupo_id::text, ''))
  where activa;

create index if not exists ix_boletas_activacion_periodo_activa
  on public.boletas_activacion (periodo_id)
  where activa;

alter table public.boletas_activacion enable row level security;
drop policy if exists boletas_activacion_all on public.boletas_activacion;
create policy boletas_activacion_all on public.boletas_activacion for all using (true) with check (true);

-- ----------------------------------------------------------------------------
-- activar_boleta: cierra la vigente del MISMO alcance (si la hay) y abre la
-- nueva, en una sola transacción. Va en PL/pgSQL y no en TypeScript porque es
-- exclusiva (ORDEN §5): dos escrituras sueltas podrían dejar el alcance sin
-- boleta si la segunda falla, o chocar con el índice único si dos llegan a la vez.
--
-- Valida que el parcial y el grupo sean del ciclo que se indica. La coherencia
-- alcance↔campos la vuelve a imponer el CHECK de la tabla.
-- ----------------------------------------------------------------------------
create or replace function public.activar_boleta(
  p_periodo    uuid,
  p_evaluacion uuid,
  p_alcance    text,
  p_grado      text,
  p_grupo      uuid,
  p_por        bigint
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.periodos_evaluacion e
    where e.id = p_evaluacion and e.periodo_id = p_periodo
  ) then
    raise exception 'El parcial no pertenece al ciclo indicado.' using errcode = '22023';
  end if;

  if p_grupo is not null and not exists (
    select 1 from public.grupos g
    where g.id = p_grupo and g.periodo_id = p_periodo
  ) then
    raise exception 'El grupo no pertenece al ciclo indicado.' using errcode = '22023';
  end if;

  update public.boletas_activacion
     set activa = false,
         desactivada_por = p_por,
         desactivada_en = now()
   where activa
     and periodo_id = p_periodo
     and alcance = p_alcance
     and coalesce(grado, '') = coalesce(p_grado, '')
     and coalesce(grupo_id::text, '') = coalesce(p_grupo::text, '');

  insert into public.boletas_activacion (periodo_id, evaluacion_id, alcance, grado, grupo_id, activada_por)
  values (p_periodo, p_evaluacion, p_alcance, p_grado, p_grupo, p_por)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.activar_boleta(uuid, uuid, text, text, uuid, bigint) is
  'PROMPT X: activa la boleta de un parcial para un alcance, cerrando la vigente del mismo alcance en la misma transacción.';

-- PostgREST cachea el esquema: sin esto la tabla y la función dan 404 (PGRST205 /
-- PGRST202) hasta el siguiente recargado.
notify pgrst, 'reload schema';
