import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { PortadaCarrusel } from "@/app/components/portada-carrusel";
import { CARPETA_DECORACIONES_PUBLIC } from "@/lib/decoraciones/config";
import { leerPortadaPublica, type CarreraPortada, type PortadaPublica } from "@/lib/escolar/portada/portada";
import { ROTULOS_CARRERA } from "@/lib/escolar/portada/portada-puro";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "CETAC 23 El Marqués",
  description:
    "Somos libres, críticos y humanistas. Conoce nuestra oferta educativa y accede al portal escolar.",
};

/**
 * PORTADA PÚBLICA — frame «Pantalla de bienvenida» (2026-09), PROMPT O.
 *
 * Es PÚBLICA: no consulta la sesión y no exige ninguna capacidad. Lo que cambia
 * de ella lo administran dirección y el técnico en «Configuración → Video e
 * imágenes» (`portada-medios-panel.tsx`): las imágenes del carrusel, un video por
 * carrera y los enlaces de contacto. Todo llega en UNA lectura,
 * `leerPortadaPublica`.
 *
 * ── Nunca se rompe ─────────────────────────────────────────────────────────
 * Si esa lectura falla, la portada se pinta igual con lo fijo: la portada
 * institucional, las dos carreras sin video y el pie sin enlaces. Una portada
 * en blanco por un fallo de la base es peor que una sin novedades.
 *
 * ── Sin imágenes subidas ───────────────────────────────────────────────────
 * Se pinta la portada institucional del frame: lema, Visión y Valores sobre el
 * fondo navy con el sello de fondo. Con imágenes, la imagen ES ese mensaje y
 * solo «Conoce nuestra oferta educativa» va encima.
 *
 * «Alumnos estrella» y «Cree en ti» se retiraron por decisión del usuario
 * (2026-09-23). Sus componentes siguen en el repo hasta que se retiren aparte.
 */

const DECO = CARPETA_DECORACIONES_PUBLIC;

const VALORES = [
  "Respeto",
  "Responsabilidad",
  "Libertad",
  "Bondad",
  "Tolerancia",
  "Solidaridad",
  "Empatía",
  "Justicia",
  "Equidad",
];

/** Dirección del frame: la que se muestra mientras no se configure otra. */
const DIRECCION_POR_DEFECTO =
  "Avenida Villas de la Piedad, La Piedad, San Miguel Colorado, 76246 La Cañada, QRO, México";

/** Si la base no responde, las carreras que la escuela imparte, sin video. */
const CARRERAS_RESPALDO: CarreraPortada[] = Object.entries(ROTULOS_CARRERA).map(([clave, rotulo]) => ({
  id: clave,
  clave,
  rotulo,
  video: null,
}));

/** Las bandas del frame alternan estos dos azules. */
const FONDOS_CARRERA = ["#4C7CBC", "#3D6CAA"];

const LOGOS_OFICIALES = [
  { archivo: "SEMSLogo.png", alt: "Subsecretaría de Educación Media Superior", ancho: 2048, alto: 913 },
  {
    archivo: "DGTAyCMLogo.png",
    alt: "Dirección General de Educación Tecnológica Agropecuaria y Ciencias del Mar",
    ancho: 1024,
    alto: 226,
  },
  { archivo: "SEPLogo.png", alt: "Secretaría de Educación Pública", ancho: 542, alto: 239 },
];

/**
 * `escala`: el PNG de WhatsApp es 1600 × 1136 y el dibujo ocupa ~60 % del ancho; sin
 * compensar, en la misma caja se ve la mitad de grande que los otros.
 */
type Red = { nombre: string; href: string; icono: string; escala?: number };

function redesDe(enlaces: PortadaPublica["enlaces"] | null): Red[] {
  if (!enlaces) return [];
  const todas: (Red | null)[] = [
    enlaces.tiktok ? { nombre: "TikTok", href: enlaces.tiktok, icono: "TikTokLogo.png" } : null,
    enlaces.whatsapp ? { nombre: "WhatsApp", href: enlaces.whatsapp, icono: "WhatsAppLogo.png", escala: 1.6 } : null,
    enlaces.facebook ? { nombre: "Facebook", href: enlaces.facebook, icono: "FacebookLogo.png" } : null,
    enlaces.correo ? { nombre: "Correo", href: enlaces.correo, icono: "GmailLogo.png" } : null,
  ];
  return todas.filter((r): r is Red => r !== null);
}

async function leerSinRomper(): Promise<PortadaPublica | null> {
  try {
    return await leerPortadaPublica(await createClient());
  } catch (e) {
    // Las señales internas de Next (p. ej. «esta ruta es dinámica» al leer las
    // cookies durante el build) también son excepciones: se devuelven a Next.
    unstable_rethrow(e);
    console.error("[portada] la portada pública se pinta sin datos", e);
    return null;
  }
}

function IconoRedPortada({ red, tamano }: { red: Red; tamano: number }) {
  const externo = red.href.startsWith("http");
  return (
    <a
      href={red.href}
      aria-label={red.nombre}
      title={red.nombre}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex shrink-0 items-center justify-center rounded-full transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oc-mint)]"
    >
      <Image
        src={`${DECO}/${red.icono}`}
        alt=""
        width={tamano}
        height={tamano}
        className="object-contain"
        style={red.escala ? { transform: `scale(${red.escala})` } : undefined}
      />
    </a>
  );
}

function PortadaInstitucional() {
  return (
    <section
      aria-label="Portada del CETAC 23"
      className="relative flex w-full flex-col overflow-hidden px-5 pb-8 pt-10 sm:px-12 md:aspect-[7/3] md:pb-6 md:pt-8"
      style={{ background: "var(--oc-bg)" }}
    >
      <Image
        src={`${DECO}/CetacLogo.png`}
        alt=""
        width={500}
        height={500}
        priority
        className="pointer-events-none absolute left-1/2 top-1/2 w-[70%] max-w-[460px] -translate-x-1/2 -translate-y-1/2 opacity-[0.12] md:w-[34%]"
      />
      <h1 className="relative mx-auto max-w-6xl text-balance text-center text-3xl font-bold leading-tight tracking-tight text-[#A6C4D2] sm:text-5xl lg:text-6xl">
        Somos libres, críticos y humanistas. <span className="sm:block">Orgullo Cetac 23</span>
      </h1>
      <div className="relative mt-8 grid gap-6 md:mt-10 md:grid-cols-2 md:gap-16">
        <div>
          <h2 className="text-lg font-semibold">Visión</h2>
          <p className="max-w-prose text-sm leading-relaxed">
            Ser una institución líder e innovadora de la cual egresan profesionistas éticos, críticos y
            humanistas que aporten al desarrollo sostenible de nuestra sociedad.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Valores</h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
            {VALORES.map((v) => (
              <li key={v}>• {v}</li>
            ))}
          </ul>
        </div>
      </div>
      <a
        href="#oferta"
        className="relative mx-auto mt-10 text-center text-2xl font-light tracking-wide transition hover:underline sm:text-3xl md:mt-auto lg:text-4xl"
      >
        Conoce nuestra oferta educativa
      </a>
    </section>
  );
}

export default async function Home() {
  const portada = await leerSinRomper();
  const redes = redesDe(portada?.enlaces ?? null);
  const carreras = portada?.carreras.length ? portada.carreras : CARRERAS_RESPALDO;
  const imagenes = portada?.imagenes ?? [];
  const telefono = portada?.enlaces.telefono ?? null;
  const correo = portada?.ajustes.correo?.trim() || null;
  const redesSociales = redes.filter((r) => r.nombre !== "Correo");

  return (
    <div className="relative z-10 flex min-h-dvh flex-col text-[var(--oc-text)]" style={{ background: "var(--oc-navy)" }}>
      {/* Barra superior del frame: contacto y redes · nombre · acceso */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--oc-border)] bg-[#0F3A73] px-4 py-2.5 text-xs sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <a href="#contacto" className="shrink-0 text-[var(--oc-muted)] transition hover:text-[var(--oc-text)]">
            Contacta con nosotros
          </a>
          {redes.length > 0 && (
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              {redes.map((r) => (
                <IconoRedPortada key={r.nombre} red={r} tamano={24} />
              ))}
            </div>
          )}
        </div>
        <p className="hidden text-base tracking-wide text-[var(--oc-muted)] lg:block">CETAC 23 EL MARQUES</p>
        <Link href="/login" className="shrink-0 text-[var(--oc-muted)] transition hover:text-[var(--oc-text)]">
          Inicia sesión
        </Link>
      </header>

      <main className="flex-1">
        {imagenes.length > 0 ? <PortadaCarrusel imagenes={imagenes} /> : <PortadaInstitucional />}

        {/* Oferta educativa: una banda a sangre por carrera, con su video 16:9. */}
        <section id="oferta" aria-label="Oferta educativa" className="scroll-mt-4">
          {carreras.map((c, i) => (
            <div
              key={c.id}
              className="px-5 pb-8 pt-5 sm:px-8"
              style={{ background: FONDOS_CARRERA[i % FONDOS_CARRERA.length] }}
            >
              <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">{c.rotulo}</h2>
              {c.video && (
                <video
                  controls
                  preload="none"
                  playsInline
                  poster={c.video.poster}
                  aria-label={`Video de ${c.rotulo}`}
                  className="mt-3 aspect-video w-full bg-[var(--oc-navy)] lg:w-[72%]"
                >
                  <source src={c.video.url} />
                  Tu navegador no puede reproducir este video.
                </video>
              )}
            </div>
          ))}
        </section>
      </main>

      <footer id="contacto" className="scroll-mt-4 px-5 pb-10 pt-8 text-sm sm:px-8">
        <div className="grid gap-8 text-center md:grid-cols-3">
          <div>
            <p className="text-[var(--oc-muted)]">{portada?.enlaces.direccion ?? DIRECCION_POR_DEFECTO}</p>
            <h2 className="mt-4 text-lg">Ubicación</h2>
          </div>
          {(telefono || correo) && (
            <div>
              {telefono && (
                <p className="text-[var(--oc-muted)]">
                  Número telefónico:{" "}
                  <a href={`tel:${telefono.replace(/[^\d+]/g, "")}`} className="text-[var(--oc-text)] hover:underline">
                    {telefono}
                  </a>
                </p>
              )}
              {correo && (
                <p className="mt-2 text-[var(--oc-muted)]">
                  Correo electrónico:{" "}
                  <a href={`mailto:${correo}`} className="break-all text-[var(--oc-text)] hover:underline">
                    {correo}
                  </a>
                </p>
              )}
              <h2 className="mt-4 text-lg">Contactos</h2>
            </div>
          )}
          {redesSociales.length > 0 && (
            <div>
              <ul className="flex justify-center gap-4">
                {redesSociales.map((r) => (
                  <li key={r.nombre}>
                    <IconoRedPortada red={r} tamano={32} />
                  </li>
                ))}
              </ul>
              <h2 className="mt-4 text-lg">Redes sociales</h2>
            </div>
          )}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-around gap-8">
          {LOGOS_OFICIALES.map((l) => (
            <Image
              key={l.archivo}
              src={`${DECO}/${l.archivo}`}
              alt={l.alt}
              width={l.ancho}
              height={l.alto}
              className="h-12 w-auto sm:h-16"
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
