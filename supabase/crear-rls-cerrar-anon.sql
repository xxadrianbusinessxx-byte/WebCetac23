-- ============================================================================
-- crear-rls-cerrar-anon.sql — pendiente `rls-tablas-publicas` (2026-10-25)
-- ============================================================================
-- QUÉ ARREGLA. `get_advisors security` marcaba 401 tablas de `public` sin RLS
-- (ERROR rls_disabled_in_public), entre ellas ALUMNOS, PROFESORES (con CLAVE, la
-- contraseña de login), ETIQUETAS PERSONALES (datos médicos), COMENTARIOS y
-- asistencia_alumnos; y las 31 que sí la tenían llevaban políticas `USING (true)`
-- para `public` (tutores con password_hash, tutor_credenciales_iniciales,
-- inscripciones_alumno…). Con la clave anon/publicable se leía y se escribía
-- casi todo por la API REST. Además, `escolar_agregar_columnas` y
-- `escolar_sync_columns` (SECURITY DEFINER: añaden y quitan columnas) eran
-- ejecutables por `anon`.
--
-- QUÉ HACE. Deja a `anon` (y a `authenticated`, que la app no usa) SIN ACCESO:
-- RLS activada y SIN políticas en todas las tablas de `public`. `service_role`
-- salta RLS, y desde este cambio es el único cliente de datos del servidor
-- (`lib/supabase/server.ts` → `createServiceClient()`). Quién puede ver qué lo
-- decide la app (`exigir()` y el alcance de cada rol), como ya hacía: las
-- políticas `true` no protegían nada.
--
-- PRERREQUISITO — NO EJECUTAR ANTES. Tiene que estar DESPLEGADO en Vercel el
-- commit en que `lib/supabase/server.ts` usa service_role. Con el código
-- anterior, la portada, el login y 23 de los 25 pasos medidos se quedan sin datos
-- (medido con la clave anon invalidada: `fase11-perfil`, informe
-- INFORME-RLS-CERRAR-ANON.md). Comprobación previa, en los registros de la API
-- de Supabase: tras el despliegue, las peticiones desde Vercel (AWS) a /rest/v1
-- llevan la clave `sb_secret_…` y ya no la `sb_publishable_…`.
--
-- CÓMO SE APLICA. SQL Editor, como usuario `postgres`. Se puede ejecutar entero
-- o bloque a bloque, en orden; cada bloque es idempotente (re-ejecutarlo no
-- cambia nada) y va en su propia transacción. Entre el 1 y el 2 se puede abrir
-- el sitio y comprobar que todo sigue igual.
--
-- LO QUE NO TOCA. Datos (ni una fila), columnas, los GRANT de tablas (anon
-- conserva sus privilegios, pero RLS sin políticas le deja 0 filas y rechaza
-- cada escritura), Storage (sus 6 buckets ya son privados y sin políticas) y
-- las otras RPC: son SECURITY INVOKER, así que con anon chocan contra RLS.
--
-- AVISO. Los `.sql` antiguos que crean políticas `USING (true)` o dan EXECUTE a
-- anon (crear-tablas-tutores.sql, crear-tablas-catalogo-academico.sql,
-- crear-rpc-agregar-columnas.sql…) son la memoria del esquema y no se editan;
-- RE-EJECUTAR UNO REABRE SU TABLA. Si hace falta re-ejecutarlo, después se
-- vuelve a ejecutar este. Que ningún `.sql` nuevo añada una política así lo
-- vigila C20 de `scripts/test-orden.mjs`.
-- ============================================================================


-- ── Bloque 1 · contraseñas y datos personales ──────────────────────────────
-- Credenciales (CLAVE, password_hash, hashes iniciales), datos médicos,
-- comentarios, asistencia, calificaciones, justificantes y mensajes.
begin;
do $BLOQUE$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'PROFESORES', 'ALUMNOS', 'tutores', 'tutor_credenciales_iniciales', 'tutor_alumnos',
    'ETIQUETAS PERSONALES', 'ETIQUETAS (STATUS)', 'alumno_etiquetas', 'seguimiento_medico_historial',
    'COMENTARIOS', 'COMENTARIOS PROFESORES', 'reportes_alumno',
    'asistencia_alumnos', 'asistencia_traspasos_historico', 'clases_impartidas',
    'justificaciones_asistencia', 'mensajes_justificacion', 'mensajes_internos', 'buzon_mensajes',
    'solicitudes_constancia', 'citas', 'calificaciones', 'actividad_entregas', 'inscripciones_alumno'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'bloque 1: la tabla % no existe, se salta', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
  end loop;
end
$BLOQUE$;
commit;


-- ── Bloque 2 · todas las demás tablas de public ────────────────────────────
-- Las ~384 tablas físicas de materia (llevan CURP y calificaciones), el
-- catálogo académico, el ciclo, el calendario, la portada, documentos y citas.
-- Recorre el catálogo en vez de una lista: no se puede quedar ninguna fuera.
begin;
do $BLOQUE$
declare
  r record;
  p text;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = r.relname loop
      execute format('drop policy %I on public.%I', p, r.relname);
    end loop;
  end loop;
end
$BLOQUE$;
commit;


-- ── Bloque 3 · las RPC SECURITY DEFINER, solo para service_role ────────────
-- Las dos de columnas dinámicas las llama la app (schema-tabla.ts,
-- materia-avance.ts) con el cliente del servidor, que ya es service_role. Mismo
-- patrón que obtener_perfil_alumno y candidatos_login.
begin;
revoke execute on function public.escolar_agregar_columnas(text, text[]) from public, anon, authenticated;
grant execute on function public.escolar_agregar_columnas(text, text[]) to service_role;
revoke execute on function public.escolar_sync_columns(text, text[]) from public, anon, authenticated;
grant execute on function public.escolar_sync_columns(text, text[]) to service_role;
commit;


-- ── Bloque 4 · RLS automática en las tablas que se creen después ───────────
-- El ejemplo de la documentación de Supabase («Auto-enable RLS for new
-- tables»): un event trigger que activa RLS en cada CREATE TABLE de public.
-- Sin él, la próxima tabla (o materia) nacería abierta a anon.
-- Diferencia con el ejemplo: las etiquetas se filtran DENTRO de la función con
-- `like`, no con `when tag in (…)`. Escrita literal, la etiqueta de «crear tabla
-- como consulta» la lee C15 de test-orden como una tabla llamada «AS». El coste
-- es que el trigger se dispara en cada DDL, que aquí es raro (las columnas
-- dinámicas de materia) y no hace nada si no es una tabla nueva.
begin;
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where (command_tag like 'CREATE TABLE%' or command_tag = 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
      exception
        when others then
          raise log 'rls_auto_enable: no se pudo activar RLS en %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();
commit;

notify pgrst, 'reload schema';


-- ── Verificación (solo lectura) · se pega en el informe ────────────────────
-- Esperado: sin_rls 0 · politicas 0 · definer_anon 0 · trigger 1.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity) as sin_rls,
  (select count(*) from pg_policies where schemaname = 'public') as politicas,
  (select count(*) from pg_proc f join pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'public' and f.prosecdef and has_function_privilege('anon', f.oid, 'execute')) as definer_anon,
  (select count(*) from pg_event_trigger where evtname = 'ensure_rls' and evtenabled <> 'D') as trigger;
-- Desde el repo: `node scripts/diag-rls-anon.mjs` (anon ve 0 filas, el
-- servidor las mismas que antes) y `get_advisors security` sin
-- rls_disabled_in_public.


-- ── Reversión (NO se ejecuta: está comentada) ──────────────────────────────
-- Devuelve la base al 2026-10-25: RLS solo en las 31 tablas que la tenían, con
-- sus políticas `true`, y EXECUTE de anon en las dos RPC. Reabre todo a anon:
-- solo si el código desplegado volviera a leer con la clave anon.
--
-- drop event trigger if exists ensure_rls;
-- drop function if exists public.rls_auto_enable();
-- grant execute on function public.escolar_agregar_columnas(text, text[]) to anon, authenticated;
-- grant execute on function public.escolar_sync_columns(text, text[]) to anon, authenticated;
-- do $R$
-- declare
--   t text;
--   con_rls text[] := array[
--     'academico_semestres', 'actividad_entregas', 'actividades', 'alumno_etiquetas',
--     'asignaciones_profesor', 'boletas_activacion', 'buzon_mensajes', 'calificaciones',
--     'carreras', 'citas', 'citas_dias_bloqueados', 'citas_franjas', 'grupo_materias',
--     'grupos', 'horario_semanal', 'inscripciones_alumno', 'justificaciones_asistencia',
--     'materias', 'mensajes_internos', 'mensajes_justificacion', 'periodos',
--     'periodos_evaluacion', 'portada_ajustes', 'portada_carreras', 'portada_medios',
--     'reportes_alumno', 'seguimiento_medico_historial', 'solicitudes_constancia',
--     'tutor_alumnos', 'tutor_credenciales_iniciales', 'tutores'];
-- begin
--   for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--            where n.nspname = 'public' and c.relkind in ('r', 'p') and not (c.relname = any (con_rls)) loop
--     execute format('alter table public.%I disable row level security', t);
--   end loop;
--   foreach t in array con_rls loop
--     continue when t = 'seguimiento_medico_historial';
--     execute format('drop policy if exists %I on public.%I', t || '_all', t);
--     execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
--   end loop;
-- end
-- $R$;
-- create policy seguimiento_medico_historial_select on public.seguimiento_medico_historial for select using (true);
-- create policy seguimiento_medico_historial_insert on public.seguimiento_medico_historial for insert with check (true);
