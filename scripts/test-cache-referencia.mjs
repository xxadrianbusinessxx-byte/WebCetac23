/**
 * test-cache-referencia.mjs — la caché corta de datos de referencia (PROMPT Z).
 *
 * QUE PRUEBA: `lib/escolar/cache-referencia.ts`, que guardan el ciclo operativo,
 * sus parciales y la portada pública. Lo que no puede fallar: que caduque, que las
 * lecturas simultáneas compartan una sola consulta, que una invalidación gane a una
 * lectura en vuelo, que nadie pueda alterar lo guardado para los demás y que un
 * error no se quede guardado.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem (no toca la base).
 *
 * Uso:
 *   node scripts/test-cache-referencia.mjs
 */

const C = await import("../lib/escolar/cache-referencia.ts");

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

const reloj = { t: 1_000_000 };
const ahoraReal = Date.now;
Date.now = () => reloj.t;
const lector = (valor, ms = 0) => {
  const l = async () => {
    l.llamadas++;
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return structuredClone(valor);
  };
  l.llamadas = 0;
  return l;
};

// --- caducidad --------------------------------------------------------------
{
  C.invalidarCacheReferencia("ciclo");
  const l = lector({ ok: true, n: 1 });
  await C.conCacheReferencia("ciclo", "a", l, (v) => v.ok);
  await C.conCacheReferencia("ciclo", "a", l, (v) => v.ok);
  ok("dentro del TTL no se vuelve a leer", l.llamadas === 1, `lecturas: ${l.llamadas}`);
  reloj.t += 19_000;
  await C.conCacheReferencia("ciclo", "a", l, (v) => v.ok);
  ok("el ciclo sigue guardado a los 19 s", l.llamadas === 1);
  reloj.t += 2_000;
  await C.conCacheReferencia("ciclo", "a", l, (v) => v.ok);
  ok("el ciclo caduca a los 20 s", l.llamadas === 2, `lecturas: ${l.llamadas}`);

  C.invalidarCacheReferencia("portada");
  const p = lector({ ok: true });
  await C.conCacheReferencia("portada", "publica", p, () => true);
  reloj.t += 59_000;
  await C.conCacheReferencia("portada", "publica", p, () => true);
  ok("la portada sigue guardada a los 59 s", p.llamadas === 1);
  reloj.t += 2_000;
  await C.conCacheReferencia("portada", "publica", p, () => true);
  ok("la portada caduca a los 60 s", p.llamadas === 2);
}

// --- una sola lectura para las simultáneas -----------------------------------
{
  C.invalidarCacheReferencia("ciclo");
  const l = lector({ ok: true }, 20);
  const r = await Promise.all(Array.from({ length: 25 }, () => C.conCacheReferencia("ciclo", "b", l, (v) => v.ok)));
  ok("25 lecturas simultáneas hacen UNA consulta", l.llamadas === 1, `lecturas: ${l.llamadas}`);
  ok("y las 25 reciben el valor", r.every((v) => v.ok === true));
}

// --- invalidación -------------------------------------------------------------
{
  C.invalidarCacheReferencia("ciclo");
  const l = lector({ ok: true });
  await C.conCacheReferencia("ciclo", "c", l, (v) => v.ok);
  C.invalidarCacheReferencia("ciclo");
  await C.conCacheReferencia("ciclo", "c", l, (v) => v.ok);
  ok("tras invalidar se vuelve a leer", l.llamadas === 2);

  const lento = lector({ ok: true, version: "vieja" }, 30);
  const enVuelo = C.conCacheReferencia("ciclo", "d", lento, (v) => v.ok);
  C.invalidarCacheReferencia("ciclo");
  await enVuelo;
  const nuevo = lector({ ok: true, version: "nueva" });
  const v = await C.conCacheReferencia("ciclo", "d", nuevo, (x) => x.ok);
  ok("una lectura en vuelo durante una invalidación NO guarda lo viejo", v.version === "nueva" && nuevo.llamadas === 1, JSON.stringify(v));

  const pc = lector({ ok: true });
  await C.conCacheReferencia("portada", "x", pc, () => true);
  C.invalidarCacheReferencia("ciclo");
  await C.conCacheReferencia("portada", "x", pc, () => true);
  ok("invalidar el ciclo no toca la portada", pc.llamadas === 1);
}

// --- copias aisladas ----------------------------------------------------------
{
  C.invalidarCacheReferencia("ciclo");
  const l = lector({ ok: true, parciales: [{ numero: 2 }, { numero: 1 }] });
  const a = await C.conCacheReferencia("ciclo", "e", l, (v) => v.ok);
  a.parciales.sort((x, y) => x.numero - y.numero);
  a.parciales.push({ numero: 99 });
  const b = await C.conCacheReferencia("ciclo", "e", l, (v) => v.ok);
  ok("lo que un lector altera no lo ve el siguiente", b.parciales.length === 2 && b.parciales[0].numero === 2, JSON.stringify(b.parciales));

  C.invalidarCacheReferencia("ciclo");
  const l2 = lector({ ok: true, lista: [1] }, 10);
  const [x, y] = await Promise.all([
    C.conCacheReferencia("ciclo", "f", l2, (v) => v.ok),
    C.conCacheReferencia("ciclo", "f", l2, (v) => v.ok),
  ]);
  x.lista.push(2);
  ok("ni siquiera entre dos lecturas simultáneas", y.lista.length === 1);
}

// --- errores y resultados malos ----------------------------------------------
{
  C.invalidarCacheReferencia("ciclo");
  const malo = lector({ ok: false, error: "sin ciclo" });
  await C.conCacheReferencia("ciclo", "g", malo, (v) => v.ok);
  await C.conCacheReferencia("ciclo", "g", malo, (v) => v.ok);
  ok("un resultado no guardable (ok: false) no se cachea", malo.llamadas === 2);

  let veces = 0;
  const falla = async () => {
    veces++;
    throw new Error("red");
  };
  let lanzo = 0;
  for (let i = 0; i < 2; i++) {
    try {
      await C.conCacheReferencia("ciclo", "h", falla, () => true);
    } catch {
      lanzo++;
    }
  }
  ok("una excepción se propaga y no se cachea", lanzo === 2 && veces === 2);
}

Date.now = ahoraReal;
console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
