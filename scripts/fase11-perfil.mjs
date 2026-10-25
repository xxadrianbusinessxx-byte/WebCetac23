#!/usr/bin/env node
/**
 * FASE 11 — PERFIL POR ROL con el código vivo (sucesor de `fase10-perfil-datos.mjs`).
 *
 * Qué mide: por cada escenario de `fase11-escenarios.mjs` (portada, login, entrada de
 * alumno, tutor, docente y directivo) ejecuta las Server Actions REALES, en serie,
 * con varios usuarios reales, y da por paso: latencia p50/max, viajes de red (a
 * Supabase y a otros hosts, p. ej. la Admin API de Cloudinary), bytes recibidos y
 * qué devolvió (ok / vacío / rechazo). Aparte: conteos de tablas, el spec OpenAPI
 * en frío, el coste de CPU del scrypt del login del tutor y el cupo de la Admin API
 * de Cloudinary (1 llamada).
 *
 * Qué escribe: nada en la base ni en el repo. Con `--salida=<ruta.json>` guarda el
 * resultado en ese archivo (para comparar antes/después con `--comparar`).
 *
 * Cómo se ejecuta:
 *   node scripts/fase11-perfil.mjs [--sujetos=3] [--runs=3] [--solo=entrada_alumno,...]
 *        [--salida=ruta.json] [--sin-cloudinary]
 *
 * Cloudinary: el perfil del alumno pregunta a la Admin API si existe la foto
 * (caché de 10 min por proceso). Con --sujetos=3 son ≤ 3+3 llamadas; el cupo de la
 * Admin API es por hora y compartido con producción, así que no se sube sin motivo.
 * Salida: solo cifras y nombres de paso. Ningún nombre, CURP ni clave.
 */
import "./fase11-entorno.mjs";
import fs from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import { cargarEnvLocal, comoUsuario, importar, percentil } from "./fase11-entorno.mjs";
import { ESCENARIOS, cargarModulos, elegirSujetos, etiquetar } from "./fase11-escenarios.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? d;
const SUJETOS = Number(opt("sujetos", 3));
const RUNS = Number(opt("runs", 3));
const SOLO = opt("solo", "") ? opt("solo").split(",") : Object.keys(ESCENARIOS);
const SALIDA = opt("salida", "");
const SIN_CLD = args.includes("--sin-cloudinary");

cargarEnvLocal();
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hostSb = new URL(URL_SB).host;
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const resultado = { fecha: new Date().toISOString(), sujetos: SUJETOS, runs: RUNS, conteos: {}, escenarios: {}, extras: {} };

console.log("=".repeat(78));
console.log(`FASE 11 — PERFIL POR ROL (código vivo) · sujetos=${SUJETOS} runs=${RUNS}`);
console.log("=".repeat(78));

// ── 1. Conteos ───────────────────────────────────────────────────────────────
console.log("\n[1] Conteos de tablas");
for (const [t, col] of Object.entries({
  ALUMNOS: "CURP", PROFESORES: "ID", tutores: "id", tutor_alumnos: "id", tutor_credenciales_iniciales: "tutor_id",
  inscripciones_alumno: "id", asignaciones_profesor: "id", grupo_materias: "id", grupos: "id", periodos: "id",
  asistencia_alumnos: "id", clases_impartidas: "id", calificaciones: "id", justificaciones_asistencia: "id",
  reportes_alumno: "id", alumno_etiquetas: "id", citas: "id",
})) {
  const r = await fetch(`${URL_SB}/rest/v1/${encodeURIComponent(t)}?select=${encodeURIComponent(col)}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" },
  });
  const n = r.headers.get("content-range")?.split("/")[1] ?? `? (${r.status})`;
  resultado.conteos[t] = n;
  console.log(`  ${t.padEnd(30)} ${n}`);
}

// ── 2. OpenAPI en frío ───────────────────────────────────────────────────────
console.log("\n[2] Spec OpenAPI (lo que lib/escolar/openapi.ts descarga sin caché)");
const openapi = [];
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const r = await fetch(`${URL_SB}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" });
  const cuerpo = await r.arrayBuffer();
  openapi.push({ ms: performance.now() - t0, bytes: cuerpo.byteLength });
  console.log(`  intento ${i + 1}: ${(performance.now() - t0).toFixed(0)} ms · ${kb(cuerpo.byteLength)}`);
}
resultado.extras.openapi = openapi;

// ── 3. CPU del scrypt (login del tutor) ──────────────────────────────────────
console.log("\n[3] CPU de scrypt (verificarContraseñaTutor: síncrono, bloquea el hilo)");
{
  const salt = randomBytes(16);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) scryptSync(`x${i}`, salt, 64);
  const msUno = (performance.now() - t0) / 10;
  resultado.extras.scryptMs = msUno;
  console.log(`  1 scryptSync(N=16384, 64 B) ≈ ${msUno.toFixed(1)} ms de CPU en esta máquina`);
}

// ── 4. Cupo de la Admin API de Cloudinary ────────────────────────────────────
if (!SIN_CLD) {
  console.log("\n[4] Cupo de la Admin API de Cloudinary (1 llamada: ping)");
  try {
    const { getCloudinary, cloudinaryConfigurado } = await importar("lib/cloudinary/config.ts");
    if (!cloudinaryConfigurado()) console.log("  Cloudinary no configurado en .env.local");
    else {
      const t0 = performance.now();
      const r = await getCloudinary().api.ping();
      const ms = performance.now() - t0;
      resultado.extras.cloudinary = { ms, limite: r.rate_limit_allowed, quedan: r.rate_limit_remaining, reinicio: r.rate_limit_reset_at };
      console.log(`  ${ms.toFixed(0)} ms · límite/hora=${r.rate_limit_allowed ?? "?"} · quedan=${r.rate_limit_remaining ?? "?"} · reinicia=${r.rate_limit_reset_at ?? "?"}`);
    }
  } catch (e) {
    console.log(`  no se pudo leer: ${e?.message ?? e}`);
  }
}

// ── 5. Escenarios por rol ────────────────────────────────────────────────────
const m = await cargarModulos();
const sujetos = await elegirSujetos(m, SUJETOS);
console.log(`\n[5] Escenarios (usuarios reales elegidos al azar: ${Object.entries(sujetos).filter(([k]) => k !== "null").map(([k, v]) => `${k} ${v.length}`).join(", ")})`);

for (const id of SOLO) {
  const esc = ESCENARIOS[id];
  if (!esc) { console.log(`  escenario desconocido: ${id}`); continue; }
  const lista = sujetos[String(esc.rol)] ?? [];
  if (!lista.length) { console.log(`\n  ${id}: sin sujetos para el rol ${esc.rol}`); continue; }
  console.log(`\n  ── ${id} (${lista.length} usuario(s) × ${RUNS} runs)`);
  const porPaso = esc.pasos.map(([nombre]) => ({ nombre, ms: [], viajesSb: [], viajesOtros: [], bytes: [], rutas: new Map(), etiquetas: new Map() }));
  for (const s of lista) {
    for (let r = 0; r < RUNS; r++) {
      const memo = {};
      for (let i = 0; i < esc.pasos.length; i++) {
        const [, fn] = esc.pasos[i];
        const x = await comoUsuario(s.sesion, () => fn(m, s, memo), { medirBytes: true });
        const p = porPaso[i];
        p.ms.push(x.ms);
        p.viajesSb.push(x.viajes.filter((v) => v.host === hostSb).length);
        p.viajesOtros.push(x.viajes.filter((v) => v.host !== hostSb).length);
        p.bytes.push(x.viajes.reduce((a, v) => a + v.bytes, 0));
        if (r === 0) for (const v of x.viajes) {
          const k = v.host === hostSb ? v.ruta : `${v.host} ${v.ruta}`;
          const prev = p.rutas.get(k) ?? { n: 0, bytes: 0 };
          p.rutas.set(k, { n: prev.n + 1, bytes: prev.bytes + v.bytes });
        }
        const et = x.error ? `ERROR ${x.error.slice(0, 70)}` : etiquetar(x.valor);
        p.etiquetas.set(et, (p.etiquetas.get(et) ?? 0) + 1);
      }
    }
  }
  resultado.escenarios[id] = [];
  for (const p of porPaso) {
    const ord = [...p.ms].sort((a, b) => a - b);
    const prom = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const fila = {
      paso: p.nombre, p50: percentil(ord, 50), max: ord.at(-1), viajesSupabase: prom(p.viajesSb), viajesOtros: prom(p.viajesOtros),
      bytes: prom(p.bytes), rutas: Object.fromEntries([...p.rutas].map(([k, v]) => [k, { n: v.n / lista.length, bytes: Math.round(v.bytes / lista.length) }])),
      resultados: Object.fromEntries(p.etiquetas),
    };
    resultado.escenarios[id].push(fila);
    console.log(`    ${p.nombre}`);
    console.log(`      p50=${fila.p50.toFixed(0)} ms  max=${fila.max.toFixed(0)} ms  viajes Supabase=${fila.viajesSupabase.toFixed(1)}  otros=${fila.viajesOtros.toFixed(1)}  recibido≈${kb(fila.bytes)}`);
    console.log(`      resultado: ${[...p.etiquetas].map(([k, v]) => `${k} ×${v}`).join(" · ")}`);
    const top = Object.entries(fila.rutas).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6);
    for (const [ruta, v] of top) console.log(`        ${v.n.toFixed(1)}× ${ruta}  ${kb(v.bytes)}`);
  }
}

if (SALIDA) {
  fs.writeFileSync(SALIDA, JSON.stringify(resultado, null, 1));
  console.log(`\nGuardado en ${SALIDA}`);
}
console.log("\nPerfil completado. Solo lectura.");
