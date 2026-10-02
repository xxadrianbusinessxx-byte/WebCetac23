-- ============================================================================
-- HISTORIAL DEL SEGUIMIENTO MÉDICO — quién lo editó y cuándo.
-- Proyecto: mi-web-escolar (AulaNube / CETAC).  Ejecutar en: Supabase SQL Editor.
-- Fecha: 2026-10-01
--
-- ADITIVO: una tabla nueva y una función nueva. No toca columnas existentes, no
-- borra nada, no migra datos. Idempotente (se puede ejecutar dos veces).
--
-- Pantallas: Perfil › Seguimiento médico (padre o tutor) y Alumnos › Seguimiento
-- médico (Administración escolar). Dirección puede editar según el servidor,
-- pero hoy no tiene pantalla que lo abra.
--
-- QUÉ RESUELVE
--   1. Cada edición del seguimiento médico deja una fila: quién (rol, id y
--      nombre), cuándo, y qué campos cambiaron con su valor antes y después.
--      SOLO el seguimiento médico: «Información personal» se guarda por la
--      misma función y NO deja historial.
--   2. El guardado deja de fingir: hoy es un `update ... where CURP = …` que,
--      si el alumno no tiene fila en ETIQUETAS PERSONALES, no toca nada y
--      responde bien. Medido el 2026-10-01 (diag-seguimiento-medico.mjs):
--      144 de 472 alumnos no tienen fila. La función la crea vacía si falta.
--
-- DECISIONES
--   · ATÓMICO (ORDEN §5): el dato y su historial se escriben en UNA transacción.
--     Si el historial no se puede escribir, el dato tampoco se guarda. El valor
--     «antes» se lee con la fila bloqueada (FOR UPDATE): dos ediciones a la vez
--     no pueden registrar un «antes» falso.
--   · QUÉ CAMPOS SE AUDITAN lo decide TypeScript (`CAMPOS_SEGUIMIENTO_MEDICO` en
--     lib/escolar/alumno/grupos-campos-personales.ts) y llega en
--     `p_campos_auditados`. Aquí no se repite la lista: solo se compara.
--   · Un valor vacío o con solo espacios cuenta como «sin dato» (null), igual que
--     `patchCamposPersonales`. Pasar de '' a null no es un cambio.
--   · Si no cambió ningún campo médico, no se escribe historial.
--   · IDENTIDAD DEL EDITOR: padre por `tutores.id` (uuid); dirección y
--     administración por `PROFESORES.ID`, NUNCA por CLAVE (16 de 20 profesores
--     comparten la misma). Sin FK, como el resto de columnas de autor
--     (`creado_por`, `resuelta_por`…). El nombre se guarda tal como era al
--     editar: el historial sigue legible aunque la persona cambie de nombre.
--   · SOLO SE AÑADE: RLS deja leer e insertar, no actualizar ni borrar. Es más
--     estricto que el resto del sistema a propósito: un historial que se puede
--     reescribir no es un historial.
--
-- ANTES DE EJECUTAR (solo lectura): la función corre con los permisos de la
-- app (clave pública) y necesita poder INSERTAR en ETIQUETAS PERSONALES para
-- crear la fila de los alumnos que no la tienen. Comprueba que hay una política
-- que lo permite (cmd = ALL o INSERT), o que RLS está desactivado:
--
--   select relrowsecurity from pg_class where oid = 'public."ETIQUETAS PERSONALES"'::regclass;
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename = 'ETIQUETAS PERSONALES';
--
-- Si RLS está activo y NO hay ninguna política ALL/INSERT, no ejecutes este
-- archivo todavía y avisa: guardar a un alumno sin fila fallaría con
-- «new row violates row-level security policy».
-- ============================================================================

-- ── 1. LA TABLA ────────────────────────────────────────────────────────────
-- Una fila por edición (no por campo): es lo que se lee —«el 01/10 a las 10:31
-- el padre cambió Alergias y Peso»—. `campos` repite las claves de `cambios`
-- como text[] para poder filtrar por campo sin abrir el jsonb.
create table if not exists public.seguimiento_medico_historial (
  id                 bigint generated always as identity primary key,
  curp               text not null,
  editor_rol         text not null
                     check (editor_rol in ('tutor','directivo','administracion')),
  editor_profesor_id bigint,
  editor_tutor_id    uuid,
  editor_nombre      text,
  campos             text[] not null check (cardinality(campos) > 0),
  -- [{"campo": "ALERGIAS", "antes": null, "despues": "Penicilina"}, …]
  cambios            jsonb not null check (jsonb_typeof(cambios) = 'array'),
  editado_at         timestamptz not null default now(),
  -- Exactamente un identificador, y el que corresponde al rol.
  constraint seguimiento_medico_historial_editor_check check (
       (editor_rol = 'tutor'
          and editor_tutor_id is not null and editor_profesor_id is null)
    or (editor_rol in ('directivo','administracion')
          and editor_profesor_id is not null and editor_tutor_id is null)
  )
);

-- La consulta de la pantalla: el historial de UN alumno, lo más reciente primero.
create index if not exists ix_seguimiento_medico_historial_curp
  on public.seguimiento_medico_historial (curp, editado_at desc, id desc);
-- Auditoría inversa: ¿qué editó esta persona?
create index if not exists ix_seguimiento_medico_historial_tutor
  on public.seguimiento_medico_historial (editor_tutor_id, editado_at desc)
  where editor_tutor_id is not null;
create index if not exists ix_seguimiento_medico_historial_profesor
  on public.seguimiento_medico_historial (editor_profesor_id, editado_at desc)
  where editor_profesor_id is not null;

-- ── 2. RLS: leer e insertar, nunca reescribir ──────────────────────────────
alter table public.seguimiento_medico_historial enable row level security;
drop policy if exists seguimiento_medico_historial_select on public.seguimiento_medico_historial;
create policy seguimiento_medico_historial_select
  on public.seguimiento_medico_historial for select using (true);
drop policy if exists seguimiento_medico_historial_insert on public.seguimiento_medico_historial;
create policy seguimiento_medico_historial_insert
  on public.seguimiento_medico_historial for insert with check (true);
revoke update, delete, truncate on public.seguimiento_medico_historial from anon, authenticated;
-- El id sale de la secuencia de la columna identidad: que la app pueda usarla
-- no depende de los privilegios por defecto del proyecto.
do $BLOQUE$
begin
  execute format('grant usage, select on sequence %s to anon, authenticated',
                 pg_get_serial_sequence('public.seguimiento_medico_historial', 'id'));
end
$BLOQUE$;

-- ── 3. LA FUNCIÓN: guardar los campos personales y su historial ────────────
-- p_patch trae SOLO las claves que se escriben (de los 14 campos personales:
-- lo arma `patchCamposPersonales`); null = vaciar el campo. Las claves que no
-- vienen conservan su valor.
create or replace function public.guardar_campos_personales_alumno(
  p_curp               text,
  p_patch              jsonb,
  p_campos_auditados   text[],
  p_editor_rol         text,
  p_editor_profesor_id bigint,
  p_editor_tutor_id    uuid,
  p_editor_nombre      text
)
returns jsonb
language plpgsql
as $$
declare
  v_curp    text := upper(btrim(coalesce(p_curp, '')));
  v_fila    public."ETIQUETAS PERSONALES";
  v_antes   jsonb;
  v_despues jsonb;
  v_campo   text;
  v_a       text;
  v_d       text;
  v_campos  text[] := '{}';
  v_cambios jsonb := '[]'::jsonb;
  v_hist_id bigint;
begin
  if v_curp = '' then
    raise exception 'guardar_campos_personales_alumno: falta la CURP del alumno';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'guardar_campos_personales_alumno: p_patch debe ser un objeto';
  end if;
  if not exists (select 1 from public."ALUMNOS" where "CURP" = v_curp) then
    raise exception 'guardar_campos_personales_alumno: el alumno % no existe', v_curp;
  end if;

  -- La fila de datos personales: se crea vacía si el alumno no la tiene.
  insert into public."ETIQUETAS PERSONALES" ("CURP") values (v_curp)
  on conflict ("CURP") do nothing;

  select * into v_fila
    from public."ETIQUETAS PERSONALES"
   where "CURP" = v_curp
   for update;
  v_antes := to_jsonb(v_fila);

  -- Las claves de p_patch sustituyen a las de la fila; las demás se conservan.
  v_fila := jsonb_populate_record(v_fila, p_patch);

  -- Lista fija: solo los 14 campos personales. CURP, GRADO/GRUPO/CARRERA y las
  -- etiquetas EMPTY* no se tocan aunque viniesen en p_patch.
  update public."ETIQUETAS PERSONALES" set
    "GENERO"                = v_fila."GENERO",
    "CORREO"                = v_fila."CORREO",
    "CELULAR"               = v_fila."CELULAR",
    "TIPO DE SANGRE"        = v_fila."TIPO DE SANGRE",
    "ALERGIAS"              = v_fila."ALERGIAS",
    "LENTES"                = v_fila."LENTES",
    "ENFERMEDAD CRONICA"    = v_fila."ENFERMEDAD CRONICA",
    "SALUD MENTAL"          = v_fila."SALUD MENTAL",
    "NECESIDAD PSICOLOGICA" = v_fila."NECESIDAD PSICOLOGICA",
    "PESO"                  = v_fila."PESO",
    "TALLA"                 = v_fila."TALLA",
    "VACUNACION"            = v_fila."VACUNACION",
    "EDAD"                  = v_fila."EDAD",
    "ESTATURA"              = v_fila."ESTATURA"
  where "CURP" = v_curp;

  v_despues := to_jsonb(v_fila);

  foreach v_campo in array coalesce(p_campos_auditados, '{}'::text[]) loop
    v_a := nullif(btrim(v_antes ->> v_campo), '');
    v_d := nullif(btrim(v_despues ->> v_campo), '');
    if v_a is distinct from v_d then
      v_campos  := array_append(v_campos, v_campo);
      v_cambios := v_cambios || jsonb_build_array(
        jsonb_build_object('campo', v_campo, 'antes', v_a, 'despues', v_d));
    end if;
  end loop;

  if cardinality(v_campos) > 0 then
    insert into public.seguimiento_medico_historial
      (curp, editor_rol, editor_profesor_id, editor_tutor_id, editor_nombre, campos, cambios)
    values
      (v_curp, p_editor_rol, p_editor_profesor_id, p_editor_tutor_id,
       nullif(btrim(coalesce(p_editor_nombre, '')), ''), v_campos, v_cambios)
    returning id into v_hist_id;
  end if;

  return jsonb_build_object('historial_id', v_hist_id, 'campos', to_jsonb(v_campos));
end;
$$;

-- ── Verificación (solo lectura) ────────────────────────────────────────────
-- select count(*) from public.seguimiento_medico_historial;   -- 0 recién creada
-- select indexname from pg_indexes where tablename = 'seguimiento_medico_historial';
-- select proname from pg_proc where proname = 'guardar_campos_personales_alumno';
-- select policyname, cmd from pg_policies where tablename = 'seguimiento_medico_historial';
--   → solo SELECT e INSERT.
--
-- ── Reversión (si hiciera falta) ───────────────────────────────────────────
-- Borra el historial acumulado: hacerlo solo si se decide abandonar la función.
-- drop function if exists public.guardar_campos_personales_alumno(text, jsonb, text[], text, bigint, uuid, text);
-- drop table if exists public.seguimiento_medico_historial;
