#!/usr/bin/env node
/**
 * FASE 10 — PRUEBAS DE CARGA sobre la capa de datos (Supabase/PostgREST).
 *
 * Aísla el comportamiento del proveedor de datos bajo concurrencia con los
 * patrones de consulta REALES de la app (login, paneles, catálogo, directorio
 * de tutores). Solo LECTURA. No escribe, no crea índices, no modifica esquema.
 *
 * Uso:
 *   node scripts/fase10-carga.mjs [--niveles 50,100,200] [--budget N]
 *   node scripts/fase10-carga.mjs --pico-login [--conc 300]
 *   node scripts/fase10-carga.mjs --sostenido [--conc 150] [--duracion 20000]
 *
 * Nota de realismo: usa la SERVICE ROLE key (sin RLS) para medir el costo real
 * de las consultas (filas completas). El camino full-stack (Next.js + sesión)
 * añade coste de servidor; esto aísla la capa de datos, que es la hipótesis.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const MODE = args.includes("--pico-login") ? "pico" : args.includes("--sostenido") ? "sostenido" : "niveles";
const NIVELES = (args.find((a) => a.startsWith("--niveles="))?.split("=")[1] ?? "50,100,200,300,500,750,1000")
  .split(",")
  .map(Number);
const BUDGET = Number(args.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? 300);
const CONC_PICO = Number(args.find((a) => a.startsWith("--conc="))?.split("=")[1] ?? 300);
const CONC_SOST = Number(args.find((a) => a.startsWith("--conc="))?.split("=")[1] ?? 150);
const DURACION_SOST = Number(args.find((a) => a.startsWith("--duracion="))?.split("=")[1] ?? 20000);

function leerEnvLocal() {
  const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = leerEnvLocal();
const urlBase = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!urlBase || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const H = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
};

/** Patrones de consulta con peso (simula distribución por rol). */
const QUERIES = [
  {
    name: "ALUMNOS range(0,4999) [login alumno]",
    weight: 60,
    url: `${urlBase}/rest/v1/ALUMNOS?select=CURP,P_APELLIDO,S_APELLIDO,NOMBRE,CLAVE&offset=0&limit=5000`,
  },
  {
    name: "PROFESORES range(0,4999) [login profesor]",
    weight: 20,
    url: `${urlBase}/rest/v1/PROFESORES?select=ID,%22NOMBRE%2FPROFESOR%2FDIRECTIVO%22,CLAVE,Permisos,debe_cambiar_credenciales&offset=0&limit=5000`,
  },
  {
    name: "tutores eq(usuario) [login tutor]",
    weight: 10,
    url: `${urlBase}/rest/v1/tutores?select=*&usuario=eq.zz-inexistente`,
  },
  {
    name: "tutores range(0,4999) [panel directivo]",
    weight: 5,
    url: `${urlBase}/rest/v1/tutores?select=*&offset=0&limit=5000`,
  },
  {
    name: "grupo_materias eq(activo) [catálogo profesor]",
    weight: 5,
    url: `${urlBase}/rest/v1/grupo_materias?select=*&activo=eq.true`,
  },
];
const PESOS = QUERIES.map((q) => q.weight);
const TOTAL_PESO = PESOS.reduce((a, b) => a + b, 0);

function elegirQuery() {
  let r = Math.random() * TOTAL_PESO;
  for (let i = 0; i < QUERIES.length; i++) {
    r -= PESOS[i];
    if (r <= 0) return QUERIES[i];
  }
  return QUERIES[0];
}

async function unRequest(q) {
  const t0 = performance.now();
  try {
    const r = await fetch(q.url, { headers: H, signal: AbortSignal.timeout(20000) });
    const t1 = performance.now();
    await r.arrayBuffer();
    return { ok: r.ok, status: r.status, ms: t1 - t0, timeout: false };
  } catch (e) {
    const t1 = performance.now();
    const timeout = e?.name === "TimeoutError" || /timeout|abort/i.test(String(e?.message ?? ""));
    return { ok: false, status: 0, ms: t1 - t0, timeout, error: String(e?.message ?? e) };
  }
}

/** Ejecuta `budget` requests con `conc` workers concurrentes. */
async function corrida(conc, budget, label) {
  const latencias = [];
  let ok = 0;
  let errores = 0;
  let timeouts = 0;
  let hecho = 0;
  let idx = 0;
  const tIni = performance.now();

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= budget) return;
      const q = QUERIES[i % QUERIES.length];
      const r = await unRequest(q);
      hecho++;
      latencias.push(r.ms);
      if (r.ok) ok++;
      else {
        errores++;
        if (r.timeout) timeouts++;
      }
    }
  }

  const workers = Array.from({ length: conc }, () => worker());
  await Promise.all(workers);
  const durMs = performance.now() - tIni;
  const ord = [...latencias].sort((a, b) => a - b);
  const pct = (p) => ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
  const rps = durMs > 0 ? (hecho / durMs) * 1000 : 0;
  console.log(
    `${label.padEnd(24)} conc=${String(conc).padStart(4)}  reqs=${hecho}  ok=${ok}  err=${errores}  to=${timeouts}  ` +
      `p50=${pct(50).toFixed(0)}ms  p95=${pct(95).toFixed(0)}ms  p99=${pct(99).toFixed(0)}ms  ` +
      `rps=${rps.toFixed(1)}  dur=${(durMs / 1000).toFixed(1)}s`,
  );
  return { conc, budget, ok, errores, timeouts, p50: pct(50), p95: pct(95), p99: pct(99), rps, durMs };
}

console.log("=".repeat(78));
console.log("FASE 10 — PRUEBAS DE CARGA (capa de datos Supabase/PostgREST)");
console.log(`URL: ${urlBase}`);
console.log(`Modo: ${MODE}`);
console.log("=".repeat(78));

if (MODE === "niveles") {
  console.log("\nNiveles de concurrencia: " + NIVELES.join(", ") + ` (budget=${BUDGET} reqs/nivel)`);
  const resultados = [];
  for (const n of NIVELES) {
    const r = await corrida(n, BUDGET, `Nivel ${n}`);
    resultados.push(r);
    if (r.ok / r.budget < 0.8) {
      console.log(`  → Error rate alto en ${n}; se detiene la progresión.`);
      break;
    }
  }
  console.log("\nResumen de niveles:");
  for (const r of resultados) {
    console.log(
      `  conc=${r.conc}  ok=${r.ok}/${r.budget} (${((r.ok / r.budget) * 100).toFixed(0)}%)  err=${r.errores}  p50=${r.p50.toFixed(0)}ms  p95=${r.p95.toFixed(0)}ms  p99=${r.p99.toFixed(0)}ms  rps=${r.rps.toFixed(1)}`,
    );
  }
} else if (MODE === "pico") {
  console.log(`\nPICO — todos los requests sobre el patrón de login (ALUMNOS range) con conc=${CONC_PICO}`);
  const q = QUERIES[0];
  const latencias = [];
  let ok = 0;
  let errores = 0;
  const tIni = performance.now();
  const total = Math.max(CONC_PICO * 2, 200);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= total) return;
      const r = await unRequest(q);
      latencias.push(r.ms);
      if (r.ok) ok++;
      else errores++;
    }
  }
  await Promise.all(Array.from({ length: CONC_PICO }, () => worker()));
  const durMs = performance.now() - tIni;
  const ord = [...latencias].sort((a, b) => a - b);
  const pct = (p) => ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
  console.log(
    `  reqs=${total}  ok=${ok}  err=${errores}  p50=${pct(50).toFixed(0)}ms  p95=${pct(95).toFixed(0)}ms  p99=${pct(99).toFixed(0)}ms  rps=${((total / durMs) * 1000).toFixed(1)}  dur=${(durMs / 1000).toFixed(1)}s`,
  );
} else {
  // Sostenido
  console.log(`\nSOSTENIDO — conc=${CONC_SOST} durante ${(DURACION_SOST / 1000).toFixed(0)}s (mezcla por rol)`);
  const latencias = [];
  let ok = 0;
  let errores = 0;
  let hecho = 0;
  const tIni = performance.now();
  const fin = tIni + DURACION_SOST;
  async function worker() {
    while (performance.now() < fin) {
      const q = elegirQuery();
      const r = await unRequest(q);
      latencias.push(r.ms);
      hecho++;
      if (r.ok) ok++;
      else errores++;
    }
  }
  await Promise.all(Array.from({ length: CONC_SOST }, () => worker()));
  const durMs = performance.now() - tIni;
  const ord = [...latencias].sort((a, b) => a - b);
  const pct = (p) => ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
  console.log(
    `  reqs=${hecho}  ok=${ok}  err=${errores}  p50=${pct(50).toFixed(0)}ms  p95=${pct(95).toFixed(0)}ms  p99=${pct(99).toFixed(0)}ms  rps=${((hecho / durMs) * 1000).toFixed(1)}  dur=${(durMs / 1000).toFixed(1)}s`,
  );
}
console.log("\nPrueba completada. Solo lectura.");

