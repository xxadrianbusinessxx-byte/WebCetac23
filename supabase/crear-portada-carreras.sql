-- ============================================================================
-- PORTADA — la banda de cada carrera: su video (ENLACE de YouTube o TikTok) y
-- un texto que la describe.  Proyecto: mi-web-escolar (CETAC)
-- Ejecutar en: Supabase SQL Editor.  Fecha: 2026-10-01  ·  PROMPT U, Parte A
--
-- ADITIVO Y REVERSIBLE: una tabla nueva, IF NOT EXISTS. No toca portada_medios
-- ni carreras. Idempotente: se puede ejecutar dos veces.
--
-- Sustituye al video SUBIDO a Cloudinary (portada_medios.tipo = 'video'), que
-- el 2026-10-01 tenía 0 filas (scripts/diag-portada.mjs): no hay nada que
-- migrar. Esa forma queda desactivada en el código y se retira aparte.
--
-- Se guarda la URL CANÓNICA que produce `analizarEnlaceVideo` (portada-puro.ts);
-- plataforma e id se derivan de ella al leer, así que no se guardan dos veces.
-- El formato sí: lo sugiere la URL (Shorts y TikTok son verticales) y quien
-- edita puede corregirlo.
--
-- Los topes (500 y 600) son los de portada-puro.ts; test-portada.mjs comprueba
-- que coinciden. Si cambias uno, cambia el otro.
--
-- IDENTIDADES: carrera por carreras.id (R5); quien edita por PROFESORES.ID,
-- bigint sin FK, igual que portada_medios.subido_por.
-- RLS: permisiva, como el resto. Autoriza exigir("noticia.publicar").
-- ============================================================================

create table if not exists public.portada_carreras (
  carrera_id      uuid primary key references public.carreras(id) on delete cascade,
  video_url       text check (
                    video_url is null
                    or (char_length(video_url) <= 500
                        and video_url ~ '^https://www\.(youtube|tiktok)\.com/')),
  video_formato   text check (video_formato in ('horizontal', 'vertical')),
  descripcion     text check (descripcion is null or char_length(descripcion) between 1 and 600),
  actualizado_por bigint,
  updated_at      timestamptz not null default now(),
  -- Un video lleva siempre su formato, y un formato sin video no significa nada.
  constraint portada_carreras_video_completo check ((video_url is null) = (video_formato is null)),
  -- Una fila vacía no se guarda: se borra.
  constraint portada_carreras_no_vacia check (video_url is not null or descripcion is not null)
);

comment on table public.portada_carreras is
  'Portada pública: video (enlace de YouTube o TikTok) y descripción de cada carrera. PROMPT U, 2026-10-01.';

alter table public.portada_carreras enable row level security;
drop policy if exists portada_carreras_all on public.portada_carreras;
create policy portada_carreras_all on public.portada_carreras for all using (true) with check (true);

-- PostgREST cachea el esquema: sin esto la tabla nueva da 404 (PGRST205) hasta
-- el siguiente recargado.
notify pgrst, 'reload schema';
