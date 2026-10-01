-- ============================================================================
-- MIGRACIÓN A `materias.id` — OPCIÓN B: el puente + calificaciones normalizadas
-- Proyecto: mi-web-escolar (AulaNube / CETAC).  Fecha: 2026-09-30
-- Ejecutar en: Supabase SQL Editor.  ADITIVO E IDEMPOTENTE.
--
-- Decisión y medición: `docs/sistema/MIGRACION-MATERIAS-A-ID.md`.
--
-- NO toca ninguna tabla existente salvo para AÑADIR columnas nullable. No
-- borra, no migra datos, no retira `tabla_legacy` (R8). Se puede ejecutar dos
-- veces sin efecto.
--
-- ── Lo que esto arregla ────────────────────────────────────────────────────
-- Hoy hay DOS identidades de materia bajo el mismo nombre de columna:
--     grupo_materias.materia_id            → uuid → materias.id       correcto
--     materias_nombres_visibles.materia_id → TEXTO «1ROAMAT011»        el nombre de tabla
--     materias_mapeo_columnas.materia_id   → TEXTO «5TOMCAMAT010»      idem
-- Cero de 101 filas de nombres_visibles casan con el catálogo. Un join entre
-- ellas no falla: devuelve vacío, que es peor.
-- ============================================================================

-- ── 1. EL PUENTE ───────────────────────────────────────────────────────────
-- `grupo_materia_id` es el identificador que faltaba: una sola columna que
-- resuelve grupo + materia + periodo, porque `grupo_materias` ya cuelga de
-- `grupos` y `grupos` de `periodos`. No hace falta repetir ninguno de los tres.
--
-- Nullable y sin tocar `materia_id`: las filas viejas siguen donde estaban
-- (R8) y el código nuevo lee por aquí.

alter table public.materias_nombres_visibles
  add column if not exists grupo_materia_id uuid references public.grupo_materias(id) on delete cascade;

alter table public.materias_mapeo_columnas
  add column if not exists grupo_materia_id uuid references public.grupo_materias(id) on delete cascade;

comment on column public.materias_nombres_visibles.grupo_materia_id is
  'Identidad correcta: grupo+materia+periodo en un uuid. La columna materia_id guarda el NOMBRE de la tabla legacy y se conserva sin escribirse (R8).';
comment on column public.materias_mapeo_columnas.grupo_materia_id is
  'Ídem. El alias y el mapeo son atributos de la PAREJA (grupo, materia), no de la materia suelta: «Taller deportivo» de 1RO A y de 1RO B son dos filas.';

-- Un alias y un mapeo por pareja. Parciales porque las filas viejas tienen
-- `grupo_materia_id` nulo y no deben colisionar entre sí.
create unique index if not exists ux_nombres_visibles_gm
  on public.materias_nombres_visibles(grupo_materia_id)
  where grupo_materia_id is not null;

create unique index if not exists ux_mapeo_columnas_gm
  on public.materias_mapeo_columnas(grupo_materia_id)
  where grupo_materia_id is not null;

-- ── 2. BACKFILL del puente, desde `tabla_legacy` ───────────────────────────
-- El enlace existe hoy por el nombre de la tabla física: `materia_id` (texto)
-- de los auxiliares es el mismo valor que `grupo_materias.tabla_legacy`. Eso es
-- lo que permite rellenar el uuid sin inventar nada.
--
-- Solo rellena lo que está vacío: ejecutar de nuevo no repite trabajo ni pisa
-- una corrección manual.

update public.materias_nombres_visibles nv
   set grupo_materia_id = gm.id
  from public.grupo_materias gm
 where nv.grupo_materia_id is null
   and gm.tabla_legacy = nv.materia_id;

update public.materias_mapeo_columnas mc
   set grupo_materia_id = gm.id
  from public.grupo_materias gm
 where mc.grupo_materia_id is null
   and gm.tabla_legacy = mc.materia_id;

-- ── 3. CALIFICACIONES NORMALIZADAS ─────────────────────────────────────────
-- Sustituye a las 241 tablas físicas (240 vacías, 1 con datos de práctica).
--
-- Una fila = una nota de un alumno en una materia-grupo. El `tipo` dice qué
-- clase de nota es, y `actividad_id` la ata a su actividad cuando la hay.
--
-- ── Las decisiones, y por qué ──────────────────────────────────────────────
--
-- CURP y no un `alumno_id`: es la identidad del alumno en todo el sistema
-- (GLOSARIO). Introducir `alumno_id` aquí abriría una cuarta deuda estructural
-- en mitad de esta migración.
--
-- `actividad_id` NULLABLE y FK a `actividades`: reutiliza la tabla que ya
-- existe en vez de inventar otra lista de actividades. Es null cuando la nota
-- es un agregado (parcial, promedio, final), que no cuelga de una actividad.
--
-- `clave_columna` guarda el ENCABEZADO REAL del Excel del que salió la nota.
-- Sin él, al normalizar se pierde la trazabilidad al archivo del profesor y no
-- se puede explicar de dónde vino un número. Con él, `materias_mapeo_columnas`
-- sigue siendo la fuente de qué significa cada columna.
--
-- `valor` es numeric y no texto: las tablas físicas guardaban "90.0" como
-- cadena, y por eso nada podía promediar sin parsear.

create table if not exists public.calificaciones (
  id               uuid primary key default gen_random_uuid(),
  grupo_materia_id uuid not null references public.grupo_materias(id) on delete cascade,
  curp             text not null,
  actividad_id     uuid references public.actividades(id) on delete set null,
  tipo             text not null
                   check (tipo in ('actividad','parcial','promedio','final')),
  clave_columna    text,
  valor            numeric(6,2),
  registrado_por   bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- La clave de unicidad es la que permite RE-SUBIR un Excel sin duplicar: el
-- upsert actualiza la nota en vez de añadir otra. `clave_columna` entra porque
-- un profesor puede tener dos actividades distintas sin `actividad_id` todavía,
-- y distinguirlas por su encabezado es lo único que queda.
create unique index if not exists ux_calificaciones_identidad
  on public.calificaciones(grupo_materia_id, curp, tipo, coalesce(clave_columna, ''));

-- Los dos accesos que de verdad ocurren: «las notas de este grupo-materia»
-- (profesor) y «mis notas» (alumno).
create index if not exists ix_calificaciones_gm on public.calificaciones(grupo_materia_id);
create index if not exists ix_calificaciones_curp on public.calificaciones(curp);

comment on table public.calificaciones is
  'Calificaciones normalizadas. Sustituye a las tablas físicas por materia (deuda estructural nº3). Una fila = una nota de un alumno en una materia-grupo.';

-- ── 4. RLS: permisiva, como el resto ───────────────────────────────────────
-- La autorización real vive en TypeScript (`exigir()` + el alcance en la
-- action). Es una decisión ya tomada y documentada en ESTADO-ACTUAL §4; esta
-- tabla NO la cambia ni inventa un segundo modelo.
alter table public.calificaciones enable row level security;
drop policy if exists calificaciones_all on public.calificaciones;
create policy calificaciones_all on public.calificaciones for all using (true) with check (true);

-- ── 5. Verificación (solo lectura; el resultado se pega en el informe) ─────
-- 1) ¿Cuántos auxiliares quedaron con su puente puesto?
--      select count(*) total, count(grupo_materia_id) con_puente
--        from public.materias_nombres_visibles;
-- 2) ¿Algún alias quedó sin pareja? (huérfano: su tabla_legacy no existe)
--      select materia_id from public.materias_nombres_visibles
--       where grupo_materia_id is null;
-- 3) El join que antes devolvía vacío:
--      select m.nombre, nv.nombre_visible, g.grado, g.nombre grupo
--        from public.materias_nombres_visibles nv
--        join public.grupo_materias gm on gm.id = nv.grupo_materia_id
--        join public.materias m on m.id = gm.materia_id
--        join public.grupos g on g.id = gm.grupo_id
--       limit 5;
