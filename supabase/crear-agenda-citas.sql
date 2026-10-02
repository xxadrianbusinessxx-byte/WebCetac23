-- ============================================================================
-- AGENDA DE CITAS — cuándo recibe citas la dirección.  Proyecto: mi-web-escolar
-- (AulaNube / CETAC).  Ejecutar en: Supabase SQL Editor.  Fecha: 2026-10-01
--
-- ADITIVO Y REVERSIBLE: dos tablas nuevas y un índice parcial sobre `citas`. No
-- toca columnas existentes, no borra nada, no migra datos. Idempotente.
--
-- Pantalla: Administración escolar › Citas › «Configurar citas» (directivo).
-- Hasta hoy ese modo no tenía nada detrás y alumno y tutor podían proponer
-- cualquier fecha y hora (un domingo a las 3 a. m., o una fecha pasada).
--
-- DECISIONES
--   · GLOBALES, sin `periodo_id`: es la agenda de la dirección, no un dato del
--     ciclo. No representa el ciclo ni lo duplica (R4/R6); los días bloqueados
--     son fechas absolutas.
--   · AGENDA PROPIA, no `calendario_escolar`: el director puede no atender un
--     día de clase, y el calendario escolar tiene su propia deuda (R5).
--   · `dia_semana` en TEXTO con el vocabulario de `DIAS_SEMANA`
--     (lib/escolar/ciclo/calendario.ts), igual que `horario_semanal`. Aquí los
--     siete días: hay planteles que atienden en sábado.
--   · Las horas son LOCALES del plantel (America/Mexico_City). `citas.propuesta_at`
--     sigue siendo timestamptz; la conversión vive en `hora-plantel-puro.ts`.
--   · La regla «¿se puede pedir este hueco?» vive en TypeScript
--     (`agenda-citas-puro.ts`, con suite). Lo que debe ser EXCLUSIVO —que dos
--     personas no se queden con el mismo hueco— lo impone la base (ORDEN §5):
--     el índice único parcial de abajo, que cubre la carrera entre dos tutores.
--
-- MEDIDO ANTES (2026-10-01, solo lectura): `citas` tiene 1 fila (rechazada), así
-- que el índice único se crea sin conflicto. Ninguna de las dos tablas existía.
--
-- RLS: permisiva, igual que el resto. La autorización real vive en TypeScript
-- (`exigir("cita.gestionar")` para escribir la agenda), ESTADO-ACTUAL §4.
-- ============================================================================

-- ── 1. FRANJAS: el horario semanal de atención ─────────────────────────────
-- «Los martes de 09:00 a 13:00, citas de 30 minutos.» Un día puede tener varias
-- franjas (mañana y tarde); que no se solapen lo valida `validarFranja`.
create table if not exists public.citas_franjas (
  id           uuid primary key default gen_random_uuid(),
  dia_semana   text not null
               check (dia_semana in ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')),
  hora_inicio  time not null,
  hora_fin     time not null,
  duracion_min smallint not null default 30 check (duracion_min in (15,20,30,45,60)),
  -- PROFESORES.ID de quien la creó (sin FK, como el resto: deuda de identidad nº2).
  creado_por   bigint,
  created_at   timestamptz not null default now(),
  constraint citas_franjas_horas_check check (hora_fin > hora_inicio)
);
create index if not exists ix_citas_franjas_dia on public.citas_franjas(dia_semana, hora_inicio);

-- ── 2. DÍAS BLOQUEADOS: fechas concretas en que no se atiende ──────────────
-- La fecha es la clave: bloquear dos veces el mismo día no tiene sentido.
create table if not exists public.citas_dias_bloqueados (
  fecha      date primary key,
  motivo     text,
  creado_por bigint,
  created_at timestamptz not null default now()
);

-- ── 3. UN HUECO VIVO NO SE PIDE DOS VECES ──────────────────────────────────
-- Solo cuentan las citas que siguen ocupando su hora (pendiente o aceptada). Una
-- rechazada o cancelada libera el hueco. Es la garantía final: la lista que ve
-- el tutor ya excluye los ocupados, pero dos tutores pueden pulsar a la vez.
create unique index if not exists ux_citas_hueco_vivo
  on public.citas(propuesta_at)
  where estado in ('pendiente','aceptada');

-- ── RLS: permisiva, como el resto del sistema ──────────────────────────────
do $BLOQUE$
declare t text;
begin
  foreach t in array array['citas_franjas','citas_dias_bloqueados']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
  end loop;
end
$BLOQUE$;

-- ── Verificación (solo lectura) ────────────────────────────────────────────
-- select count(*) from public.citas_franjas;            -- 0 recién creada
-- select count(*) from public.citas_dias_bloqueados;    -- 0 recién creada
-- select indexname from pg_indexes where indexname = 'ux_citas_hueco_vivo';
--
-- ── Reversión (si hiciera falta) ───────────────────────────────────────────
-- drop index if exists public.ux_citas_hueco_vivo;
-- drop table if exists public.citas_dias_bloqueados;
-- drop table if exists public.citas_franjas;
