/**
 * fetch-con-tope.ts — PROMPT Z-bis. Tope de peticiones SIMULTÁNEAS a Supabase por
 * instancia del servidor.
 *
 * Por qué: en el plan gratuito, cuando llegan más peticiones de las que la capa
 * HTTP de Supabase puede atender, no se vuelve lento poco a poco: se derrumba.
 * Las peticiones se encolan dentro de PostgREST y caducan durante minutos
 * (500 personas entrando en 10 s: INFORME-PROMPT-Z §3d). Con un tope, el exceso
 * espera aquí, en orden de llegada, y a Supabase solo le llega lo que puede servir.
 * Cambia un derrumbe por una espera.
 *
 * Reglas:
 *   · Cola FIFO por instancia. Hay un tope por instancia, no uno global.
 *   · Quien espera más de `SUPABASE_ESPERA_MAX_MS` (20 s por defecto) recibe un
 *     error de red inmediato: supabase-js lo devuelve como `error` y la app
 *     muestra su mensaje de siempre, en lugar de quedarse colgada.
 *   · El turno se libera al llegar la respuesta (cabeceras). Leer el cuerpo ya no
 *     ocupa a PostgREST.
 *   · Llama al `fetch` global en el momento de la llamada (no lo captura al
 *     importar), para que la instrumentación de las pruebas lo siga viendo.
 */

const TOPE = Math.max(1, Number(process.env.SUPABASE_MAX_PETICIONES_SIMULTANEAS ?? 12) || 12);
const ESPERA_MAX_MS = Math.max(0, Number(process.env.SUPABASE_ESPERA_MAX_MS ?? 20_000) || 20_000);

let enVuelo = 0;
const cola: { pasar: () => void; vence: ReturnType<typeof setTimeout> }[] = [];

function liberar(): void {
  const siguiente = cola.shift();
  if (siguiente) {
    clearTimeout(siguiente.vence);
    siguiente.pasar(); // el turno pasa directo: enVuelo no baja
  } else {
    enVuelo--;
  }
}

function esperarTurno(): Promise<void> {
  if (enVuelo < TOPE) {
    enVuelo++;
    return Promise.resolve();
  }
  return new Promise<void>((resolver, rechazar) => {
    const entrada = {
      pasar: resolver,
      vence: setTimeout(() => {
        const i = cola.indexOf(entrada);
        if (i >= 0) cola.splice(i, 1);
        rechazar(new TypeError("Supabase está saturado: la petición esperó demasiado su turno."));
      }, ESPERA_MAX_MS),
    };
    cola.push(entrada);
  });
}

/** `fetch` con tope de peticiones simultáneas: pásalo como `global.fetch` del cliente. */
export async function fetchConTope(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await esperarTurno();
  try {
    return await fetch(input, init);
  } finally {
    liberar();
  }
}

/** Para la medición y las pruebas: cuántas hay en vuelo y en cola ahora mismo. */
export function estadoTope(): { tope: number; enVuelo: number; enCola: number } {
  return { tope: TOPE, enVuelo, enCola: cola.length };
}
