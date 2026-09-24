-- ============================================================================
-- UIs PENDIENTES — esquema de las pantallas que el diseño dibuja y el sistema
-- todavía no soporta.  Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor.  Fecha: 2026-09-17
--
-- ADITIVO Y REVERSIBLE: solo CREATE TABLE IF NOT EXISTS e índices. No toca
-- ninguna tabla existente, no borra nada, no migra datos. Idempotente.
--
-- IDENTIDADES (GLOSARIO): el ciclo por `periodos.id` (NUNCA por nombre, R5);
-- el alumno por CURP; el profesor por `PROFESORES.ID` (NUNCA por CLAVE, que 15
-- de 21 comparten); el grupo por `grupos.id`.
--
-- Las columnas de profesor van SIN foreign key a propósito: `PROFESORES."ID"`
-- existe, pero añadir la FK es un cambio sobre una tabla con la identidad rota
-- (deuda estructural nº2) y este archivo no repara deudas ajenas. La integridad
-- se sostiene en TypeScript, como el resto del sistema.
--
-- RLS: permisiva, igual que el resto. La autorización real vive en TypeScript
-- (`exigir()`), no en la base — decisión ya tomada (ESTADO-ACTUAL §4). Estas
-- tablas NO la cambian ni inventan un segundo modelo.
-- ============================================================================

-- ── 1. ACTIVIDADES ─────────────────────────────────────────────────────────
-- Pantalla: Materias › Actividades (alumno y tutor).
-- El diseño muestra tarjetas con estado ACTIVA/VENCIDA, un peso («20%»), una
-- descripción, archivos del profesor y un botón de entrega. Nada de eso era
-- derivable: `pesos_actividades` de `materias_mapeo_columnas` es otra cosa
-- (promedio ponderado de columnas existentes) y además tiene 0 filas.
--
-- El estado NO se guarda: se DERIVA de `fecha_limite` contra la fecha actual.
-- Guardarlo obligaría a un proceso que lo refresque, y podría mentir.
create table if not exists public.actividades (
  id               uuid primary key default gen_random_uuid(),
  periodo_id       uuid not null references public.periodos(id) on delete cascade,
  grupo_materia_id uuid references public.grupo_materias(id) on delete cascade,
  materia_interna  text,
  titulo           text not null,
  descripcion      text,
  fecha_limite     timestamptz,
  peso             numeric(5,2),
  creada_por       bigint,
  created_at       timestamptz not null default now()
);
create index if not exists ix_actividades_periodo on public.actividades(periodo_id);
create index if not exists ix_actividades_gm on public.actividades(grupo_materia_id);

-- Entregas del alumno. Una por actividad; re-entregar actualiza la fila.
create table if not exists public.actividad_entregas (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  curp         text not null,
  ruta_storage text,
  comentario   text,
  entregado_at timestamptz not null default now(),
  calificacion numeric(5,2),
  unique (actividad_id, curp)
);
create index if not exists ix_entregas_curp on public.actividad_entregas(curp);

-- ── 2. REPORTES DISCIPLINARIOS ─────────────────────────────────────────────
-- Pantalla: Administración escolar › Reportes (directivo).
-- NO son estadísticas: el diseño pide alumno + motivo + fecha/hora + gravedad,
-- listados por grupo, con «Anular». Es un incidente, no un informe.
--
-- `anulado_at` en vez de DELETE: un reporte anulado sigue siendo información, y
-- borrarlo destruiría el historial del alumno.
create table if not exists public.reportes_alumno (
  id               uuid primary key default gen_random_uuid(),
  periodo_id       uuid not null references public.periodos(id) on delete cascade,
  curp             text not null,
  grupo_id         uuid references public.grupos(id) on delete set null,
  motivo           text not null,
  gravedad         text not null check (gravedad in ('leve','media','grave')),
  ocurrido_at      timestamptz not null,
  creado_por       bigint,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      bigint,
  motivo_anulacion text
);
create index if not exists ix_reportes_curp on public.reportes_alumno(curp);
create index if not exists ix_reportes_grupo on public.reportes_alumno(periodo_id, grupo_id);

-- ── 3. CITAS ───────────────────────────────────────────────────────────────
-- DOS pantallas, UNA entidad: «Administración escolar › Citas» (el directivo
-- acepta, rechaza y marca finalizada) y «Perfil › Sesiones programadas» (el
-- alumno o su tutor la ven). Dos tablas habrían sido dos fuentes del mismo
-- dato (R6).
create table if not exists public.citas (
  id             uuid primary key default gen_random_uuid(),
  periodo_id     uuid not null references public.periodos(id) on delete cascade,
  curp           text not null,
  solicitada_por text not null check (solicitada_por in ('alumno','tutor','directivo')),
  motivo         text,
  propuesta_at   timestamptz not null,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','aceptada','rechazada','finalizada','cancelada')),
  atendida_por   bigint,
  nota_cierre    text,
  created_at     timestamptz not null default now(),
  actualizado_at timestamptz
);
create index if not exists ix_citas_curp on public.citas(curp);
create index if not exists ix_citas_estado on public.citas(periodo_id, estado);

-- ── 4. SOLICITUDES DE CONSTANCIA ───────────────────────────────────────────
-- Pantalla: Administración escolar › Recursos administrativos.
-- El diseño habla de «constancias» por grupo, con aceptar / rechazar / anular:
-- es un flujo de solicitud, no un repositorio de archivos.
create table if not exists public.solicitudes_constancia (
  id            uuid primary key default gen_random_uuid(),
  periodo_id    uuid not null references public.periodos(id) on delete cascade,
  curp          text not null,
  tipo          text not null,
  observaciones text,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','aceptada','rechazada','entregada','anulada')),
  resuelta_por  bigint,
  ruta_storage  text,
  created_at    timestamptz not null default now(),
  resuelta_at   timestamptz
);
create index if not exists ix_constancias_estado on public.solicitudes_constancia(periodo_id, estado);

-- ── 5. BUZÓN ───────────────────────────────────────────────────────────────
-- Pantalla: Administración escolar › Buzón, con dos modos (quejas y
-- comentarios). Se separa de `COMENTARIOS`, que es de otro dominio: aquel son
-- comentarios SOBRE un alumno escritos por el personal; esto son mensajes DE
-- alumnos y tutores hacia la dirección. Mismo nombre, sentido contrario.
create table if not exists public.buzon_mensajes (
  id           uuid primary key default gen_random_uuid(),
  periodo_id   uuid references public.periodos(id) on delete set null,
  tipo         text not null check (tipo in ('queja','comentario')),
  remitente    text not null check (remitente in ('alumno','tutor')),
  curp         text,
  mensaje      text not null,
  leido_at     timestamptz,
  atendido_por bigint,
  created_at   timestamptz not null default now()
);
create index if not exists ix_buzon_tipo on public.buzon_mensajes(tipo, created_at desc);

-- ── 6. MENSAJES INTERNOS ───────────────────────────────────────────────────
-- Pedido explícito del responsable (2026-09-17): chats privados entre
-- directivo, técnico y profesor. NO es el chat global retirado —aquel era
-- alumno↔profesor y quedó descartado—, y por eso no reutiliza `COMENTARIOS`.
--
-- Identidad por `PROFESORES.ID`, nunca por CLAVE: 15 de 21 comparten la misma,
-- así que un mensaje dirigido «a la clave» llegaría a quince personas.
create table if not exists public.mensajes_internos (
  id            uuid primary key default gen_random_uuid(),
  hilo_id       uuid not null,
  de_profesor   bigint not null,
  para_profesor bigint not null,
  asunto        text,
  cuerpo        text not null,
  leido_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists ix_mensajes_hilo on public.mensajes_internos(hilo_id, created_at);
create index if not exists ix_mensajes_para on public.mensajes_internos(para_profesor, leido_at);

-- ── RLS: permisiva, como el resto del sistema ──────────────────────────────
do $BLOQUE$
declare t text;
begin
  foreach t in array array['actividades','actividad_entregas','reportes_alumno',
                           'citas','solicitudes_constancia','buzon_mensajes','mensajes_internos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
  end loop;
end
$BLOQUE$;
