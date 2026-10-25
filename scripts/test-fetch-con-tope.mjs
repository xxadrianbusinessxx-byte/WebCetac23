/**
 * test-fetch-con-tope.mjs — el tope de peticiones simultáneas a Supabase (PROMPT Z-bis).
 *
 * QUE PRUEBA: `lib/supabase/fetch-con-tope.ts`. Nunca más de TOPE peticiones en
 * vuelo; las demás esperan en orden de llegada; quien espera demasiado recibe un
 * error en vez de colgarse; un error de red libera el turno igual que una
 * respuesta. El `fetch` real se sustituye por uno falso: no hay red.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem.
 *
 * Uso:
 *   node scripts/test-fetch-con-tope.mjs
 */

process.env.SUPABASE_MAX_PETICIONES_SIMULTANEAS = "3";
process.env.SUPABASE_ESPERA_MAX_MS = "150";
const T = await import("../lib/supabase/fetch-con-tope.ts");

let pasadas = 0;
let fallidas = 0;
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`ok  ${titulo}`);
  } else {
    fallidas++;
    console.log(`FALLA  ${titulo}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let enVueloMax = 0;
let enVuelo = 0;
const orden = [];
globalThis.fetch = async (url) => {
  enVuelo++;
  enVueloMax = Math.max(enVueloMax, enVuelo);
  orden.push(String(url));
  await dormir(20);
  enVuelo--;
  if (String(url).includes("falla")) throw new TypeError("red");
  return new Response("{}", { status: 200 });
};

ok("el tope se lee del entorno", T.estadoTope().tope === 3, JSON.stringify(T.estadoTope()));

// 10 peticiones a la vez: nunca más de 3 en vuelo, y todas terminan.
const r = await Promise.all(Array.from({ length: 10 }, (_, i) => T.fetchConTope(`u${i}`)));
ok("10 simultáneas: nunca más de 3 en vuelo", enVueloMax === 3, `máximo: ${enVueloMax}`);
ok("y las 10 responden", r.length === 10 && r.every((x) => x.status === 200));
ok("en orden de llegada", orden.join(",") === Array.from({ length: 10 }, (_, i) => `u${i}`).join(","), orden.join(","));
ok("al terminar no queda nada en vuelo ni en cola", T.estadoTope().enVuelo === 0 && T.estadoTope().enCola === 0, JSON.stringify(T.estadoTope()));

// Un error de red libera el turno.
const conError = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => T.fetchConTope(i % 2 ? "falla" : `b${i}`)));
ok("los errores de red se propagan", conError.filter((x) => x.status === "rejected").length === 3);
ok("y no dejan turnos ocupados", T.estadoTope().enVuelo === 0 && T.estadoTope().enCola === 0, JSON.stringify(T.estadoTope()));

// Quien espera más de ESPERA_MAX_MS recibe un error (no se cuelga).
globalThis.fetch = async () => {
  await dormir(400);
  return new Response("{}", { status: 200 });
};
const lentas = await Promise.allSettled(Array.from({ length: 5 }, () => T.fetchConTope("lenta")));
const rechazadas = lentas.filter((x) => x.status === "rejected");
ok("con 3 ocupadas 400 ms y espera máxima de 150 ms, las 2 que esperan reciben error", rechazadas.length === 2, `rechazadas: ${rechazadas.length}`);
ok("el error dice que Supabase está saturado", rechazadas.every((x) => /saturado/.test(String(x.reason?.message))));
ok("las 3 que entraron responden", lentas.filter((x) => x.status === "fulfilled").length === 3);
ok("tras el rechazo la cola queda vacía", T.estadoTope().enCola === 0 && T.estadoTope().enVuelo === 0, JSON.stringify(T.estadoTope()));

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
