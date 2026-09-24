-- ============================================================================
-- PORTADA ADMINISTRABLE — carrusel de imágenes, video por carrera y ajustes de
-- contacto de la pantalla de bienvenida.  Proyecto: mi-web-escolar (CETAC)
-- Ejecutar en: Supabase SQL Editor.  Fecha: 2026-09-23  ·  PROMPT L
--
-- ADITIVO Y REVERSIBLE: solo CREATE ... IF NOT EXISTS, una función y una
-- siembra con ON CONFLICT DO NOTHING. No toca ninguna tabla existente, no borra
-- nada, no migra datos. Idempotente: se puede ejecutar dos veces.
--
-- Los ARCHIVOS viven en Cloudinary; aquí solo va QUÉ se muestra, en qué orden y
-- con qué versión. Sustituye a los slots fijos de `lib/cloudinary/noticias.ts`
-- (`noticia_inicio_1/2`), que comprobaban existencia con la API de
-- administración de Cloudinary —limitada a 500 consultas/hora— en una página
-- PÚBLICA, no guardaban orden ni carrera, y al sobrescribir el mismo public_id
-- dejaban al CDN sirviendo la versión vieja.
--
-- IDENTIDADES (GLOSARIO): la carrera por `carreras.id` (NUNCA por nombre, R5);
-- el profesor por `PROFESORES.ID`, SIN foreign key y en `bigint`, igual que
-- `mensajes_internos` en crear-tablas-uis-pendientes.sql: la FK sería un cambio
-- sobre la tabla con la identidad rota (deuda estructural nº2).
--
-- RLS: permisiva, como el resto. La autorización vive en TypeScript: todas las
-- escrituras pasan por `exigir("noticia.publicar")` (ESTADO-ACTUAL §4).
-- ============================================================================

-- ── 1. portada_medios ──────────────────────────────────────────────────────
-- Una fila por imagen del carrusel o por video de carrera.
create table if not exists public.portada_medios (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('imagen', 'video')),

  -- Solo imagen: su posición en el carrusel. Con el UNIQUE de abajo y este
  -- rango, el máximo de 5 imágenes lo garantiza la base, no el código.
  orden           smallint check (orden between 1 and 5),

  -- Solo video: la carrera a la que pertenece. Si la carrera desaparece del
  -- catálogo, su video no tiene dónde mostrarse: cascade.
  carrera_id      uuid references public.carreras(id) on delete cascade,

  -- El archivo principal: la imagen horizontal (7:3) o el video (16:9).
  public_id       text not null,
  -- La versión que devuelve Cloudinary al subir. Va DENTRO de la URL servida,
  -- así que reemplazar un archivo cambia la URL y ningún CDN sirve la anterior.
  version         bigint not null,

  -- Solo imagen, opcional: la variante vertical (4:5) para teléfono. Sin ella,
  -- el teléfono muestra la horizontal. Decisión 1 del PROMPT L.
  public_id_movil text,
  version_movil   bigint,

  -- La imagen de portada LLEVA TEXTO (Visión, Valores). Sin esto, un lector de
  -- pantalla no lo ve.
  texto_alt       text,

  -- Medidos por el SERVIDOR contra el recurso real de Cloudinary, no declarados
  -- por el navegador (PROMPT M).
  ancho           integer,
  alto            integer,
  bytes           bigint,
  duracion_s      numeric,

  subido_por      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Forma según el tipo: una imagen tiene orden y no carrera; un video tiene
  -- carrera, no orden y no variante móvil. La variante móvil va completa o no va.
  constraint portada_medios_forma check (
    (tipo = 'imagen' and orden is not null and carrera_id is null)
    or
    (tipo = 'video' and carrera_id is not null and orden is null
       and public_id_movil is null and version_movil is null)
  ),
  constraint portada_medios_movil_completa check (
    (public_id_movil is null) = (version_movil is null)
  ),

  -- DEFERRABLE, y no un índice único parcial: reordenar intercambia posiciones,
  -- y un índice único normal se comprueba fila a fila y falla a mitad del
  -- intercambio. Los videos tienen `orden` nulo y los nulos no chocan entre sí,
  -- así que una restricción corriente basta.
  constraint portada_medios_orden_unico unique (orden) deferrable initially immediate,

  -- Un video por carrera, garantizado por la base. Las imágenes tienen
  -- `carrera_id` nulo y no chocan.
  constraint portada_medios_carrera_unica unique (carrera_id)
);

comment on table public.portada_medios is
  'Portada pública: carrusel (tipo imagen, orden 1-5) y un video por carrera. Los archivos viven en Cloudinary. PROMPT L, 2026-09-23.';

-- ── 2. reordenar_portada ───────────────────────────────────────────────────
-- Recibe TODOS los ids de imagen en el orden nuevo. Un solo UPDATE, con la
-- unicidad de `orden` diferida al final de la transacción.
create or replace function public.reordenar_portada(p_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_actuales uuid[];
begin
  select coalesce(array_agg(id order by id), '{}')
    into v_actuales
    from public.portada_medios
   where tipo = 'imagen';

  -- Tienen que ser exactamente las imágenes que hay: ni una de más, ni una de
  -- menos, ni repetidas. Si no, se rechaza entero en vez de dejar huecos.
  if (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) is distinct from v_actuales
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'reordenar_portada: la lista no coincide con las imágenes actuales';
  end if;

  set constraints public.portada_medios_orden_unico deferred;

  update public.portada_medios m
     set orden = n.posicion, updated_at = now()
    from unnest(p_ids) with ordinality as n(id, posicion)
   where m.id = n.id;
end;
$$;

-- ── 3. portada_ajustes ─────────────────────────────────────────────────────
-- Clave/valor de lo configurable de la barra superior y el pie. Las claves
-- válidas las fija el CHECK; su formato lo valida `portada-puro.ts`.
create table if not exists public.portada_ajustes (
  clave           text primary key check (clave in (
                    'tiktok_url', 'facebook_url', 'whatsapp_numero',
                    'correo', 'telefono', 'direccion')),
  valor           text not null,
  actualizado_por bigint,
  updated_at      timestamptz not null default now()
);

comment on table public.portada_ajustes is
  'Enlaces y datos de contacto de la portada, editables desde Configuración. PROMPT L, 2026-09-23.';

-- La dirección ya estaba escrita en app/page.tsx: se siembra para que la
-- portada no pierda el dato al pasar a ser configurable.
insert into public.portada_ajustes (clave, valor)
values ('direccion', 'Avenida Villas de la Piedad, La Piedad, San Miguel Colorado, 76246 La Cañada, QRO, México')
on conflict (clave) do nothing;

-- ── 4. RLS permisiva, igual que el resto del esquema ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['portada_medios', 'portada_ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
  end loop;
end $$;

-- PostgREST cachea el esquema: sin esto las tablas nuevas dan 404 (PGRST205)
-- hasta el siguiente recargado.
notify pgrst, 'reload schema';
