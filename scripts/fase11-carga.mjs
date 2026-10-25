#!/usr/bin/env node
/**
 * FASE 11 — PRUEBA DE CARGA POR USUARIOS (sucesor de `fase10-carga.mjs`).
 *
 * Qué mide: N usuarios virtuales SIMULTÁNEOS que hacen cada uno una sesión completa
 * con las Server Actions REALES de hoy (portada → login → la navegación de su rol,
 * ver `fase11-escenarios.mjs`), repartidos en varios procesos como si fueran varias
 * instancias del servidor. Por nivel da: sesiones completas, fallos (excepción,
 * rechazo de la action o HTTP ≥ 400 de Supabase), latencia p50/p95/p99 por paso,
 * peticiones a Supabase por segundo y el retraso del bucle de eventos de cada
 * proceso (si sube, la máquina que genera la carga es el cuello y la cifra no vale).
 *
 * Diferencia con la FASE 10: aquella disparaba 5 consultas sueltas; esta mide
 * USUARIOS, con todas las consultas que hace cada pantalla (~50 por sesión de alumno).
 *
 * Qué escribe: nada en la base ni en el repo (solo lecturas; el login usa una clave
 * falsa). Con `--salida=<ruta.json>` guarda el resultado.
 *
 * CARGA REAL sobre producción: sin `--confirmar-carga` sale con 1 antes de leer
 * `.env.local`. Solo una persona, con autorización y fuera de horario.
 * La Admin API de Cloudinary NO se llama (cupo por hora compartido con producción):
 * se sustituye por una espera de `--cloudinary-ms` y se cuentan las llamadas que habría.
 *
 * Uso:
 *   node scripts/fase11-carga.mjs --confirmar-carga [--usuarios=100,250,500]
 *        [--procesos=8] [--rampa=10] [--pausa=1000] [--cloudinary-ms=300] [--timeout=30000]
 *        [--salida=ruta.json]
 *   --rampa   segundos en los que llegan los N usuarios (0 = todos a la vez)
 *   --pausa   ms máximos de «pensar» entre pantalla y pantalla (al azar 0..pausa)
 *   --timeout tope por petición (ms), como el límite de una función de Vercel
 *   --descanso segundos de reposo entre niveles (por defecto 30): cada escalón de la
 *             escalera se mide desde reposo, no sobre la cola del anterior
 * Freno: si un proceso pasa del 10 % de pasos fallidos (tras 50 pasos), sus usuarios
 * dejan de navegar. La prueba no debe prolongar una saturación ya medida.
 */
import { fork } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (!args.includes("--confirmar-carga") && !args.includes("--hijo")) {
  console.error(
    "fase11-carga genera CARGA REAL sobre producción (usuarios simultáneos con las actions reales).\n" +
      "Solo una persona, con autorización y fuera de horario. Para ejecutarla: --confirmar-carga.\n" +
      "Ver scripts/README.md (etiqueta CARGA).",
  );
  process.exit(1);
}
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? d;

/** Sesiones por rol en un pico de «consulta masiva» (semana de boletas). */
const MEZCLA = [
  { peso: 55, rol: "alumno", flujo: ["portada", "login_alumno", "entrada_alumno"] },
  { peso: 35, rol: "tutor", flujo: ["portada", "login_tutor", "entrada_tutor"] },
  { peso: 6, rol: "maestro", flujo: ["login_docente", "entrada_docente"] },
  { peso: 2, rol: "directivo", flujo: ["entrada_directivo"] },
  { peso: 2, rol: "administracion", flujo: ["entrada_administracion"] },
];

if (args.includes("--hijo")) await hijo();
else await padre();

// ─────────────────────────────────────────────────────────────────────────────
async function padre() {
  const NIVELES = opt("usuarios", "100,250,500").split(",").map(Number);
  const PROCESOS = Number(opt("procesos", 8));
  const RAMPA = Number(opt("rampa", 10));
  const PAUSA = Number(opt("pausa", 1000));
  const CLD_MS = Number(opt("cloudinary-ms", 300));
  const TIMEOUT = Number(opt("timeout", 30000));
  const DESCANSO = Number(opt("descanso", 30));
  const SALIDA = opt("salida", "");
  const informe = { fecha: new Date().toISOString(), procesos: PROCESOS, rampa: RAMPA, pausa: PAUSA, cloudinaryMs: CLD_MS, timeoutMs: TIMEOUT, niveles: [] };

  console.log("=".repeat(78));
  console.log(`FASE 11 — CARGA POR USUARIOS · niveles ${NIVELES.join(", ")} · ${PROCESOS} procesos · rampa ${RAMPA}s · pausa ≤${PAUSA}ms`);
  console.log(`Mezcla: ${MEZCLA.map((x) => `${x.rol} ${x.peso}%`).join(" · ")}`);
  console.log("=".repeat(78));

  for (const [indice, N] of NIVELES.entries()) {
    if (indice > 0 && DESCANSO > 0) await new Promise((r) => setTimeout(r, DESCANSO * 1000));
    const t0 = Date.now();
    const partes = await Promise.all(
      Array.from({ length: PROCESOS }, (_, i) => {
        const n = Math.floor(N / PROCESOS) + (i < N % PROCESOS ? 1 : 0);
        return new Promise((ok, mal) => {
          const h = fork(fileURLToPath(import.meta.url), ["--hijo", `--n=${n}`, `--rampa=${RAMPA}`, `--pausa=${PAUSA}`], {
            env: { ...process.env, FASE11_STUB_CLOUDINARY: String(CLD_MS), FASE11_TIMEOUT_MS: String(TIMEOUT) },
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          });
          h.on("message", ok);
          h.on("exit", (c) => c !== 0 && mal(new Error(`proceso ${i} salió con ${c}`)));
        });
      }),
    );
    const dur = (Date.now() - t0) / 1000;
    const nivel = resumir(N, partes, dur);
    informe.niveles.push(nivel);
    imprimir(nivel);
    if (nivel.tasaFallo > 0.05) {
      console.log(`  → más de 5 % de pasos fallidos en ${N}; se detiene la progresión.`);
      break;
    }
  }
  if (SALIDA) {
    fs.writeFileSync(SALIDA, JSON.stringify(informe, null, 1));
    console.log(`\nGuardado en ${SALIDA}`);
  }
  console.log("\nPrueba completada. Solo lectura.");
}

function resumir(N, partes, dur) {
  const pasos = new Map();
  let sesiones = 0, sesionesConFallo = 0, viajesSb = 0, httpError = 0, stubCld = 0, pasosTot = 0, pasosFallo = 0, frenados = 0;
  const lag = [];
  const ejemplos = new Map();
  for (const p of partes) {
    sesiones += p.sesiones; sesionesConFallo += p.sesionesConFallo; viajesSb += p.viajesSb; httpError += p.httpError; stubCld += p.stubCld;
    lag.push(p.lagP99);
    if (p.frenado) frenados++;
    for (const [k, v] of Object.entries(p.ejemplos)) ejemplos.set(k, (ejemplos.get(k) ?? 0) + v);
    for (const [nombre, d] of Object.entries(p.pasos)) {
      const acc = pasos.get(nombre) ?? { ms: [], fallos: 0 };
      acc.ms.push(...d.ms); acc.fallos += d.fallos; pasos.set(nombre, acc);
      pasosTot += d.ms.length; pasosFallo += d.fallos;
    }
  }
  const pct = (ord, q) => (ord.length ? ord[Math.min(ord.length - 1, Math.floor((q / 100) * ord.length))] : 0);
  const filas = [...pasos].map(([nombre, d]) => {
    const ord = d.ms.sort((a, b) => a - b);
    return { paso: nombre, n: ord.length, fallos: d.fallos, p50: pct(ord, 50), p95: pct(ord, 95), p99: pct(ord, 99) };
  });
  return {
    usuarios: N, duracionS: dur, sesiones, sesionesConFallo, pasos: pasosTot, pasosFallo, tasaFallo: pasosTot ? pasosFallo / pasosTot : 0,
    viajesSupabase: viajesSb, rpsSupabase: viajesSb / dur, httpError, llamadasCloudinary: stubCld, lagP99MaxMs: Math.max(...lag), procesosFrenados: frenados, filas,
    fallosEjemplo: Object.fromEntries([...ejemplos].sort((a, b) => b[1] - a[1]).slice(0, 8)),
  };
}

function imprimir(r) {
  console.log(`\n■ ${r.usuarios} usuarios simultáneos · ${r.duracionS.toFixed(1)} s`);
  console.log(`  sesiones completas ${r.sesiones - r.sesionesConFallo}/${r.sesiones} · pasos fallidos ${r.pasosFallo}/${r.pasos} (${(r.tasaFallo * 100).toFixed(2)} %) · HTTP≥400 de Supabase ${r.httpError}`);
  console.log(`  Supabase: ${r.viajesSupabase} peticiones · ${r.rpsSupabase.toFixed(0)} req/s de media · Admin API Cloudinary que se habría llamado: ${r.llamadasCloudinary}`);
  if (r.procesosFrenados) console.log(`  FRENO: ${r.procesosFrenados} proceso(s) dejaron de navegar por pasar del 10 % de fallos`);
  console.log(`  retraso del bucle de eventos (p99, peor proceso): ${r.lagP99MaxMs.toFixed(0)} ms ${r.lagP99MaxMs > 200 ? "← la máquina de carga satura: cifras infladas" : ""}`);
  console.log(`  ${"paso".padEnd(40)} ${"n".padStart(5)} ${"fallos".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"p99".padStart(7)}`);
  for (const f of r.filas) {
    console.log(`  ${f.paso.padEnd(40)} ${String(f.n).padStart(5)} ${String(f.fallos).padStart(6)} ${f.p50.toFixed(0).padStart(5)}ms ${f.p95.toFixed(0).padStart(5)}ms ${f.p99.toFixed(0).padStart(5)}ms`);
  }
  if (Object.keys(r.fallosEjemplo).length) {
    console.log("  fallos más frecuentes:");
    for (const [k, v] of Object.entries(r.fallosEjemplo)) console.log(`    ×${v}  ${k}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function hijo() {
  const { cargarEnvLocal, comoUsuario } = await import("./fase11-entorno.mjs");
  const { ESCENARIOS, cargarModulos, elegirSujetos, etiquetar } = await import("./fase11-escenarios.mjs");
  const { monitorEventLoopDelay } = await import("node:perf_hooks");
  cargarEnvLocal();
  const N = Number(opt("n", 0));
  const RAMPA = Number(opt("rampa", 10)) * 1000;
  const PAUSA = Number(opt("pausa", 1000));
  const hostSb = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;

  const m = await cargarModulos();
  const sujetos = await elegirSujetos(m, 25);
  const total = MEZCLA.reduce((a, x) => a + x.peso, 0);
  const elegirFlujo = () => {
    let r = Math.random() * total;
    for (const x of MEZCLA) if ((r -= x.peso) <= 0) return x;
    return MEZCLA[0];
  };
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  const out = { sesiones: 0, sesionesConFallo: 0, viajesSb: 0, httpError: 0, stubCld: 0, pasos: {}, ejemplos: {}, lagP99: 0, frenado: false };
  let hechos = 0, fallidos = 0;
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();

  async function usuario() {
    await dormir(Math.random() * RAMPA);
    let tipo = elegirFlujo();
    let lista = sujetos[tipo.rol] ?? [];
    if (!lista.length) { tipo = MEZCLA[0]; lista = sujetos.alumno; }
    const s = lista[Math.floor(Math.random() * lista.length)];
    let fallo = false;
    for (const idEsc of tipo.flujo) {
      const esc = ESCENARIOS[idEsc];
      const sujeto = esc.rol === null ? { sesion: null } : s;
      const memo = {};
      for (const [nombre, fn] of esc.pasos) {
        if (out.frenado) break;
        const x = await comoUsuario(sujeto.sesion, () => fn(m, sujeto, memo));
        const sb = x.viajes.filter((v) => v.host === hostSb);
        const http = sb.filter((v) => v.status === 0 || v.status >= 400);
        out.viajesSb += sb.length;
        out.httpError += http.length;
        out.stubCld += x.viajes.filter((v) => v.via === "stub").length;
        const et = x.error ? `ERROR ${x.error.slice(0, 80)}` : etiquetar(x.valor);
        const malo = Boolean(x.error) || et.startsWith("rechazo") || http.length > 0;
        const d = (out.pasos[nombre] ??= { ms: [], fallos: 0 });
        d.ms.push(x.ms);
        hechos++;
        if (malo) fallidos++;
        if (hechos >= 50 && fallidos / hechos > 0.1) out.frenado = true;
        if (malo) {
          d.fallos++;
          fallo = true;
          const clave = `${nombre}: ${x.error ? et : http.length ? `HTTP ${http[0].status} ${http[0].ruta}` : et}`;
          out.ejemplos[clave] = (out.ejemplos[clave] ?? 0) + 1;
        }
        if (PAUSA) await dormir(Math.random() * PAUSA);
      }
    }
    out.sesiones++;
    if (fallo) out.sesionesConFallo++;
  }

  await Promise.all(Array.from({ length: N }, () => usuario()));
  lag.disable();
  out.lagP99 = lag.percentile(99) / 1e6;
  process.send(out, () => process.exit(0));
}
