import Link from "next/link";
import { actionAlumnosEstrella } from "@/app/actions/home";
import { AlumnosEstrellaPanel } from "@/app/components/alumnos-estrella";
import { EventosInicio } from "@/app/components/eventos-inicio";

export const metadata = {
  title: "CETAC 23 El Marqués",
  description:
    "Somos libres, críticos y humanistas. Conoce nuestra oferta educativa y accede al portal escolar.",
};

/**
 * PORTADA PÚBLICA (Fase 8 del rediseño Océano).
 *
 * Antes esta ruta era portada Y login a la vez: el formulario vivía aquí y
 * `/login` se limitaba a redirigir. El diseño las separa, así que el acceso se
 * mudó a `/login` y aquí queda solo lo que ve un visitante.
 *
 * Es PÚBLICA: no consulta la sesión y no exige ninguna capacidad
 * (`portada.ver` es la única capacidad pública del sistema). La única lectura
 * es la de alumnos estrella, que ya era pública.
 *
 * ── Una divergencia declarada con el frame ────────────────────────────────
 * El frame «Pantalla de bienvenida» dibuja hero, Visión y Valores, la oferta
 * educativa y el pie. NO dibuja «Alumnos estrella» ni «Cree en ti», que son
 * dos bloques que esta portada ya tenía y que siguen funcionando. Quitarlos
 * sería una decisión de producto, no una migración, así que se conservan
 * debajo de la oferta educativa. Si sobran, se retiran en su propio cambio.
 *
 * Los teléfonos y correos del pie son literales SIN VALOR en el frame
 * («Numero telefonico :»). Se dejan como el diseño los define en vez de
 * inventarlos.
 */

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

const CARRERAS = [
  { nombre: "MECATRÓNICA", fondo: "#4C7CBC" },
  { nombre: "RECURSOS HUMANOS", fondo: "#3D6CAA" },
];

export default async function Home() {
  const alumnosEstrella = await actionAlumnosEstrella();

  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col text-[var(--oc-text)]"
      style={{ background: "var(--oc-bg)" }}
    >
      {/* Barra superior del frame: contacto · nombre · acceso */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 text-xs sm:px-8">
        <a href="#contacto" className="text-[var(--oc-muted)] transition hover:text-[var(--oc-text)]">
          Contacta con nosotros
        </a>
        <p className="hidden font-semibold uppercase tracking-wide text-[var(--oc-muted)] sm:block">
          CETAC 23 El Marqués
        </p>
        <Link href="/login" className="text-[var(--oc-muted)] transition hover:text-[var(--oc-text)]">
          Inicia sesión
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-5 py-14 text-center sm:px-8 sm:py-20">
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold leading-tight tracking-tight text-[#A6C4D2] sm:text-5xl lg:text-6xl">
            Somos libres, críticos y humanistas. Orgullo Cetac 23
          </h1>
        </section>

        {/* Visión y Valores, a dos columnas como el frame */}
        <section className="grid gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="mb-2 text-lg font-semibold">Visión</h2>
            <p className="max-w-prose text-sm leading-relaxed text-[var(--oc-text)]">
              Ser una institución líder e innovadora de la cual egresan profesionistas éticos,
              críticos y humanistas que aporten al desarrollo sostenible de nuestra sociedad.
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-lg font-semibold">Valores</h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--oc-text)]">
              {VALORES.map((v) => (
                <li key={v}>· {v}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Oferta educativa: dos bandas a sangre, como el diseño */}
        <section className="pb-4">
          <h2 className="px-5 pb-8 text-center text-2xl font-medium sm:px-8 sm:text-3xl">
            Conoce nuestra oferta educativa
          </h2>
          {CARRERAS.map((c) => (
            <div
              key={c.nombre}
              className="flex min-h-[9rem] items-center px-5 py-10 sm:px-10"
              style={{ background: c.fondo }}
            >
              {/* El frame dibuja estas bandas VACÍAS salvo por el rótulo. No se
                  les inventa contenido: cuando haya material de cada carrera,
                  entra aquí. */}
              <p className="text-3xl font-medium tracking-tight text-[var(--oc-text)] sm:text-4xl">
                {c.nombre}
              </p>
            </div>
          ))}
        </section>

        {/* Bloques que esta portada ya tenía y el frame no sitúa. Ver cabecera. */}
        <section className="grid gap-6 px-5 py-14 sm:px-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--oc-muted)]">
              Alumnos estrella
            </h2>
            <AlumnosEstrellaPanel alumnos={alumnosEstrella} />
          </div>
          <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--oc-muted)]">
              Cree en ti
            </h2>
            <EventosInicio />
          </div>
        </section>
      </main>

      <footer
        id="contacto"
        className="grid gap-8 border-t border-[var(--oc-border)] px-5 py-12 text-sm sm:px-8 lg:grid-cols-3"
      >
        <div>
          <p className="text-[var(--oc-muted)]">Numero telefonico :</p>
          <p className="mt-3 text-[var(--oc-muted)]">Correo electronico</p>
          <p className="mt-5 font-semibold">Contáctanos</p>
        </div>
        <div>
          <p className="text-[var(--oc-muted)]">Numero telefonico :</p>
          <p className="mt-3 text-[var(--oc-muted)]">Correo electronico</p>
          <p className="mt-5 font-semibold">Redes sociales</p>
        </div>
        <div>
          <p className="text-[var(--oc-muted)]">
            Avenida Villas de la Piedad, La Piedad, San Miguel Colorado, 76246 La Cañada, QRO,
            México
          </p>
          <p className="mt-5 font-semibold">Ubicación</p>
        </div>
      </footer>
    </div>
  );
}
