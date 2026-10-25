/**
 * FASE 11 — ENTORNO COMPARTIDO de `fase11-perfil.mjs` y `fase11-carga.mjs`.
 *
 * Qué mide: nada por sí solo. Prepara el proceso para ejecutar las Server Actions
 * REALES de `app/actions/` y las funciones REALES de `lib/` fuera de Next.js, y
 * cuenta cada viaje de red que hacen (a PostgREST, a Cloudinary o a cualquier host).
 * Así el instrumento no copia consultas a mano: mide lo que la app ejecuta hoy, y
 * si el código cambia, la medición cambia con él (la deriva que dejó inservible a
 * `fase10-perfil-datos.mjs` tras el refactor).
 *
 * Qué escribe: nada. No toca la base ni el repo.
 *
 * Cómo se usa: lo importan los dos scripts de la FASE 11; no se ejecuta solo.
 *
 * Lo que sustituye, y por qué no es un atajo de seguridad:
 *   · `next/headers` → un almacén de cookies vacío (no hay petición HTTP).
 *   · `next/navigation` → `redirect`/`notFound` lanzan, como en Next.
 *   · `lib/auth/session-server.ts` → devuelve la sesión del USUARIO VIRTUAL en curso
 *     (AsyncLocalStorage). No se firma ni se falsifica ninguna cookie: la sesión
 *     nunca sale de este proceso. `exigir()` y `puede()` corren tal cual, así que
 *     un rol sin la capacidad recibe el mismo «No tienes permiso» que en producción.
 *   · `server-only` → módulo vacío (lo mismo que hace `--conditions=react-server`).
 *   · el alias `@/` y los imports sin extensión → se resuelven como el bundler.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import diagnostics from "node:diagnostics_channel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(__dirname, "..");

// ── .env.local → process.env (lib/supabase/env.ts y Cloudinary leen de ahí) ──
export function cargarEnvLocal() {
  const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

// ── Contexto por usuario virtual ────────────────────────────────────────────
/** store: { sesion, viajes: [], medirBytes } */
export const contexto = new AsyncLocalStorage();
globalThis.__fase11Sesion = () => contexto.getStore()?.sesion ?? null;

const fetchOriginal = globalThis.fetch;
globalThis.fetch = async function fetchMedido(input, init) {
  const store = contexto.getStore();
  if (!store) return fetchOriginal(input, init);
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const metodo = (init?.method ?? input?.method ?? "GET").toUpperCase();
  const t0 = performance.now();
  // En la prueba de CARGA cada petición tiene un tope (FASE11_TIMEOUT_MS), como el
  // límite de duración de una función en Vercel: sin él, las que se quedan en cola
  // se acumulan y prolongan la saturación de producción mucho más que la prueba.
  const tope = Number(process.env.FASE11_TIMEOUT_MS ?? 0);
  if (tope && !init?.signal) init = { ...init, signal: AbortSignal.timeout(tope) };
  let res;
  try {
    res = await fetchOriginal(input, init);
  } catch (e) {
    store.viajes.push({ via: "fetch", host: new URL(url).host, ruta: rutaCorta(url, metodo), ms: performance.now() - t0, bytes: 0, status: 0 });
    throw e;
  }
  const ms = performance.now() - t0;
  let bytes = Number(res.headers.get("content-length") ?? 0);
  if (store.medirBytes) {
    try {
      bytes = (await res.clone().arrayBuffer()).byteLength;
    } catch {
      /* cuerpo no clonable: se queda content-length */
    }
  }
  store.viajes.push({ via: "fetch", host: new URL(url).host, ruta: rutaCorta(url, metodo), ms, bytes, status: res.status });
  return res;
};

// El SDK de Cloudinary no usa fetch sino `https.request`: se cuenta por el canal
// de diagnóstico de Node (sin parchear el módulo). El contexto viaja con la llamada.
diagnostics.subscribe("http.client.request.start", ({ request }) => {
  const store = contexto.getStore();
  if (!store) return;
  const host = request.getHeader?.("host") ?? request.host ?? "?";
  const ruta = decodeURIComponent(String(request.path).split("?")[0]).replace(RE_CURP, "<CURP>");
  store.viajes.push({ via: "https", host: String(host), ruta: `${request.method} ${ruta}`, ms: 0, bytes: 0, status: 0 });
});

/**
 * «GET /rest/v1/ALUMNOS» o «POST /rest/v1/rpc/obtener_perfil_alumno», sin la query.
 * Una CURP dentro de la ruta (el public_id de la foto en Cloudinary la lleva) se
 * sustituye por «<CURP>»: la salida de estos scripts no lleva datos personales.
 */
const RE_CURP = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/gi;
function rutaCorta(url, metodo) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(url).pathname);
  } catch {
    ruta = String(url);
  }
  return `${metodo} ${ruta.replace(RE_CURP, "<CURP>")}`;
}

// ── Resolución de módulos ───────────────────────────────────────────────────
const STUBS = {
  "next/headers":
    "export async function cookies(){return {get(){return undefined},getAll(){return []},has(){return false},set(){},delete(){}}}" +
    "export async function headers(){return new Headers()}",
  "next/navigation":
    'export function redirect(u){const e=new Error("NEXT_REDIRECT "+u);e.digest="NEXT_REDIRECT";throw e}' +
    'export function notFound(){const e=new Error("NEXT_NOT_FOUND");e.digest="NEXT_NOT_FOUND";throw e}' +
    "export function unstable_rethrow(){}",
  "server-only": "export {};",
};
const STUB_SESION = "export async function obtenerSesionPortal(){return globalThis.__fase11Sesion()}";
// Solo en la prueba de CARGA (FASE11_STUB_CLOUDINARY=<ms>): la Admin API de Cloudinary
// tiene un cupo POR HORA compartido con producción (500 en este plan); 500 perfiles lo
// agotarían y las fotos reales dejarían de verse una hora. El stub espera lo que tarda
// la llamada, devuelve «sin foto» y deja constancia de cada llamada que habría hecho.
globalThis.__fase11Cloudinary = (ms) =>
  new Promise((r) => {
    contexto.getStore()?.viajes.push({ via: "stub", host: "api.cloudinary.com (stub)", ruta: "GET resource", ms, bytes: 0, status: 0 });
    setTimeout(() => r(null), ms);
  });
const STUB_CLOUDINARY = (ms) =>
  `export async function obtenerUrlFotoPerfilSiExiste(){return globalThis.__fase11Cloudinary(${Number(ms)})}` +
  "export function invalidarUrlFotoPerfil(){}";
const aData = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const EXTENSIONES = [".ts", ".tsx", "/index.ts"];

function archivoConExtension(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONES) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

registerHooks({
  resolve(especificador, ctx, siguiente) {
    if (STUBS[especificador]) return { url: aData(STUBS[especificador]), format: "module", shortCircuit: true };
    let r;
    if (especificador.startsWith("@/")) {
      const archivo = archivoConExtension(path.join(root, especificador.slice(2)));
      if (!archivo) throw new Error(`fase11: no se resuelve ${especificador}`);
      r = { url: pathToFileURL(archivo).href, shortCircuit: true };
    } else {
      try {
        r = siguiente(especificador, ctx);
      } catch (e) {
        if (!especificador.startsWith(".") || !ctx.parentURL?.startsWith("file:")) throw e;
        const archivo = archivoConExtension(path.join(path.dirname(fileURLToPath(ctx.parentURL)), especificador));
        if (!archivo) throw e;
        r = { url: pathToFileURL(archivo).href, shortCircuit: true };
      }
    }
    if (r.url.endsWith("/lib/auth/session-server.ts")) return { url: aData(STUB_SESION), format: "module", shortCircuit: true };
    if (process.env.FASE11_STUB_CLOUDINARY && r.url.endsWith("/lib/cloudinary/urls-server.ts")) {
      return { url: aData(STUB_CLOUDINARY(process.env.FASE11_STUB_CLOUDINARY)), format: "module", shortCircuit: true };
    }
    return r;
  },
});

/** import() de un archivo del repo por su ruta relativa a la raíz. */
export const importar = (rel) => import(pathToFileURL(path.join(root, rel)).href);

/**
 * Ejecuta `fn` como un usuario virtual con `sesion` y devuelve lo que costó:
 * duración, viajes de red (por host) y bytes. Nunca lanza: el error va en el resultado.
 */
export async function comoUsuario(sesion, fn, { medirBytes = false } = {}) {
  const store = { sesion, viajes: [], medirBytes };
  const t0 = performance.now();
  let error = null;
  let valor;
  try {
    valor = await contexto.run(store, fn);
  } catch (e) {
    error = e?.message ?? String(e);
  }
  return { ms: performance.now() - t0, viajes: store.viajes, error, valor };
}

/** Percentil sobre una lista ya ordenada. */
export const percentil = (ord, p) => (ord.length ? ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))] : 0);
