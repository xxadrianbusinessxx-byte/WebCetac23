#!/usr/bin/env node
/**
 * gen-estado.mjs — el estado del repo, en un solo JSON.
 *
 * QUÉ MIDE: casi nada por su cuenta. Ejecuta las herramientas que YA miden
 *           (lista blanca explícita, todas de solo lectura y sin red) y junta
 *           sus JSON en un único documento por zonas. Lo único que calcula
 *           aquí es lo que nadie más mide: git, tamaños de archivo y el coste
 *           de arranque en tokens.
 * QUÉ ESCRIBE: `.panel/estado.json` (ignorado por git) y una línea en
 *           `.panel/historico.jsonl`. No toca la base, ni la red, ni el código.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-estado.mjs
 *   node scripts/gen-estado.mjs --salida=/tmp/estado.json
 *   node scripts/gen-estado.mjs --sin-historico   (no añade línea al histórico)
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `gen-panel-repo.mjs` ya demostró que juntar mediciones funciona, pero escupe
 * HTML directamente: el número no se puede comparar con el de ayer, ni pasar a
 * un prompt, ni verificar en CI. Y el problema real de este repo no es que un
 * número esté mal —es que EMPEORA SOLO sin que nadie lo note: el lint pasó de
 * 140 a 151 y los archivos de más de 1 000 líneas de 4 a 7, en silencio.
 *
 * Un panel sin memoria enseña un número que se aprende a ignorar. Por eso el
 * JSON va antes que el HTML y se guarda un histórico: lo que el panel tiene que
 * gritar no es «151», es «151, +11 desde la última medición».
 *
 * ── La lista blanca no es paranoia ─────────────────────────────────────────
 * `scripts/` contiene cosas que VACÍAN TABLAS en producción y cuyo nombre no lo
 * dice (por eso existe `_peligrosos/`). Un recolector que hiciera `readdir` y
 * ejecutara lo que encuentre sería un arma cargada apuntando a la base. Aquí
 * cada fuente se nombra a mano, con sus argumentos, y no hay forma de añadir
 * una sin editar este archivo.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const SALIDA = arg("salida") ?? ".panel/estado.json";
const HISTORICO = ".panel/historico.jsonl";
const SIN_HISTORICO = process.argv.includes("--sin-historico");

const abs = (rel) => path.join(root, rel);
const existe = (rel) => fs.existsSync(abs(rel));
const leer = (rel) => fs.readFileSync(abs(rel), "utf8");
const pesa = (rel) => (existe(rel) ? fs.statSync(abs(rel)).size : 0);

// ── Fuentes: lista blanca ──────────────────────────────────────────────────
// Solo esto se ejecuta. Todas `LEE(fs)`: leen archivos del repo, no la base.
const FUENTES = [
  { id: "orden", script: "test-orden.mjs", args: ["--json"] },
  { id: "restyle", script: "diag-restyle-oceano.mjs", args: ["--json"] },
  { id: "estadoActual", script: "verificar-estado-actual.mjs", args: ["--json"] },
  { id: "docs", script: "verificar-docs.mjs", args: ["--json"] },
];

const fuentes = [];

/** Corre una fuente y devuelve su JSON. `null` si no se pudo. */
function correr({ id, script, args }) {
  const t0 = Date.now();
  let json = null;
  let error = null;
  try {
    const out = execFileSync(process.execPath, [abs(`scripts/${script}`), ...args], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    json = JSON.parse(out.replace(/^﻿/, ""));
  } catch (e) {
    // Estas herramientas salen con 1 cuando la comprobación falla, y ese es
    // justo el caso que hay que enseñar. El JSON de stdout sigue siendo válido.
    const out = e?.stdout;
    if (typeof out === "string" && out.trim().startsWith("{")) {
      try { json = JSON.parse(out.replace(/^﻿/, "")); } catch { error = "salida no era JSON"; }
    } else {
      error = String(e?.message ?? e).split("\n")[0];
    }
  }
  fuentes.push({ id, comando: `node scripts/${script} ${args.join(" ")}`.trim(), ok: json !== null, ms: Date.now() - t0, error });
  return json;
}

const orden = correr(FUENTES[0]);
const restyle = correr(FUENTES[1]);
const docState = correr(FUENTES[2]);
const docSistema = correr(FUENTES[3]);

// ── Git ────────────────────────────────────────────────────────────────────
const git = (...a) => {
  try { return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const repo = {
  rama: git("rev-parse", "--abbrev-ref", "HEAD"),
  head: git("rev-parse", "--short", "HEAD"),
  headFecha: git("log", "-1", "--format=%cI"),
  headAsunto: git("log", "-1", "--format=%s"),
  sucios: (git("status", "--porcelain") || "").split("\n").filter(Boolean).length,
  commits7: Number(git("rev-list", "--count", "--since=7 days ago", "HEAD") ?? 0),
  commits30: Number(git("rev-list", "--count", "--since=30 days ago", "HEAD") ?? 0),
};

// ── Coste de arranque ──────────────────────────────────────────────────────
// Ya NO se mide aquí. La lista de lectura obligatoria y su techo viven en
// `verificar-docs.mjs`, que es quien los vigila en el CI, y el panel los lee de
// su `--json` (ver FUENTES). Medirlos otra vez aquí daría dos fuentes para la
// misma verdad —R6— y la cifra del panel podría dejar de ser la que falla.

/** Bytes de todos los archivos bajo `dir` que cumplen `filtro`. */
function pesarArbol(dir, filtro, acc = { n: 0, bytes: 0 }) {
  if (!existe(dir)) return acc;
  for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".tmp-")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) pesarArbol(rel, filtro, acc);
    else if (filtro(rel)) { acc.n++; acc.bytes += pesa(rel); }
  }
  return acc;
}
const docs = pesarArbol("docs", (f) => /\.md$/.test(f));
const sql = pesarArbol("supabase", (f) => /\.sql$/.test(f));

// ── Señales ────────────────────────────────────────────────────────────────
// `peorSi` dice en qué dirección duele, y es lo que permite que el histórico
// distinga «mejoró» de «empeoró» sin que nadie lo interprete a ojo.
const senales = [];
const señal = (s) => { senales.push({ unidad: "", detalle: null, accion: null, doc: null, items: [], peorSi: null, ...s }); };

// --- Zona técnica: las 10 reglas de ORDEN.md -------------------------------
if (orden) {
  for (const r of orden.reglas) {
    señal({
      zona: "tecnico",
      id: `orden.${r.id}`,
      titulo: `${r.id} · ${r.regla}`,
      valor: r.actual,
      unidad: r.modo === "trinquete" ? `/ ${r.umbral}` : "",
      estado: r.estado === "falla" || r.estado === "subio" ? "mal" : r.estado === "bajo" ? "aviso" : "ok",
      detalle: r.estado === "subio" ? "SUBIÓ por encima del umbral: el trinquete saltó"
        : r.estado === "falla" ? "regla dura incumplida"
        : r.estado === "bajo" ? `bajó de ${r.umbral}: aprieta el umbral en test-orden.mjs o volverá a subir`
        : r.deuda ? `deuda declarada: ${r.deuda}` : null,
      accion: r.actual > 0 ? "node scripts/test-orden.mjs --detalle" : null,
      doc: "docs/normativo/ORDEN.md",
      items: r.archivos,
      peorSi: "sube",
    });
  }
} else {
  señal({ zona: "tecnico", id: "orden.error", titulo: "Reglas de ORDEN.md", valor: "—",
    estado: "sin-medir", detalle: "test-orden.mjs no devolvió JSON", accion: "node scripts/test-orden.mjs" });
}

if (docState) {
  señal({
    zona: "tecnico", id: "tecnico.suites", titulo: "Suites puras", valor: docState.suitesReales,
    estado: "info", detalle: "corren en cada push y PR — la red de seguridad del repo",
    accion: "npm run test:suites", peorSi: "baja",
  });
}

// --- Zona frontend: restyle Océano -----------------------------------------
if (restyle) {
  const peores = [...(restyle.archivos ?? [])].filter((a) => a.claro > 0)
    .sort((a, b) => b.claro - a.claro).slice(0, 12)
    .map((a) => `${a.archivo} — ${a.claro} claro${a.fase ? ` · fase ${a.fase}` : " · sin fase"}`);
  señal({
    zona: "frontend", id: "frontend.restyle", titulo: "Avance del restyle Océano", valor: restyle.avance,
    unidad: "%", estado: restyle.avance >= 90 ? "ok" : "aviso",
    detalle: `${restyle.totalOscuro} ocurrencias ya con token --oc-* · ${restyle.totalClaro} todavía en tema claro`,
    accion: "node scripts/diag-restyle-oceano.mjs", peorSi: "baja",
  });
  señal({
    zona: "frontend", id: "frontend.claro", titulo: "Ocurrencias en tema claro", valor: restyle.totalClaro,
    estado: "info", detalle: "buena parte vive en clientes legacy ya inalcanzables desde /oceano",
    accion: "node scripts/diag-restyle-oceano.mjs --fase=7", items: peores, peorSi: "sube",
  });
} else {
  señal({ zona: "frontend", id: "frontend.error", titulo: "Restyle Océano", valor: "—",
    estado: "sin-medir", detalle: "diag-restyle-oceano.mjs no devolvió JSON" });
}

// --- Zona backend / datos --------------------------------------------------
// Lo único medible desde disco sin red. Lo demás son huecos declarados, no
// silencios: un panel que calla sobre una zona entrena a creer que está bien.
señal({
  zona: "datos", id: "datos.sql", titulo: "Archivos .sql en el repo", valor: sql.n,
  estado: "info", detalle: "cuántos están aplicados en la base NO se sabe desde disco",
  accion: "node scripts/diag-sql-aplicado.mjs",
});
for (const [id, titulo, comando] of [
  ["datos.aplicado", "SQL aplicado vs declarado", "node scripts/diag-sql-aplicado.mjs"],
  ["datos.fk", "FK y relaciones reales", "node scripts/diag-relaciones-supabase.mjs"],
  ["datos.filas", "Filas y huérfanos por tabla", "node scripts/probe-todas-tablas.mjs"],
]) {
  señal({ zona: "datos", id, titulo, valor: "—", estado: "sin-medir",
    detalle: "requiere red y credenciales: fuera del panel rápido (Fase 2)", accion: comando });
}

// --- Zona documentación ----------------------------------------------------
if (docState) {
  const atras = docState.commitsAtras;
  señal({
    zona: "docs", id: "docs.frescura", titulo: "ESTADO-ACTUAL.md vs el HEAD real",
    valor: atras === null ? "?" : atras, unidad: "commits atrás",
    estado: docState.fallos.length ? "mal" : atras > 1 ? "aviso" : "ok",
    detalle: docState.fallos[0] ?? docState.avisos[0] ??
      `declara ${docState.headDeclarado ?? "—"}, el real es ${docState.headReal ?? "—"}`,
    accion: "node scripts/verificar-estado-actual.mjs", doc: "ESTADO-ACTUAL.md", peorSi: "sube",
  });
  señal({
    zona: "docs", id: "docs.suitesDeclaradas", titulo: "Suites declaradas vs reales",
    valor: docState.suitesDeclaradas ?? "—", unidad: `/ ${docState.suitesReales} reales`,
    estado: docState.suitesDeclaradas === docState.suitesReales ? "ok" : "mal",
    detalle: docState.suitesDeclaradas === docState.suitesReales
      ? "coinciden" : "el documento miente sobre su propio repo",
    doc: "ESTADO-ACTUAL.md",
  });
  señal({
    zona: "docs", id: "docs.lineas", titulo: "Tamaño de ESTADO-ACTUAL.md", valor: docState.lineas,
    unidad: `/ ~${docState.limiteLineas} líneas`,
    estado: docState.lineas > docState.limiteLineas ? "aviso" : "ok",
    detalle: docState.lineas > docState.limiteLineas
      ? `${docState.lineas - docState.limiteLineas} líneas de más: lo que sobra es historial y va a docs/historial/`
      : "dentro de su propia regla",
    doc: "ESTADO-ACTUAL.md", peorSi: "sube",
  });
}
if (docSistema) {
  const arranque = docSistema.arranque ?? [];
  const arranqueTokens = docSistema.arranqueTokens ?? 0;
  const techo = docSistema.techoTokens ?? 0;
  señal({
    zona: "docs", id: "docs.arranque", titulo: "Coste de arranque del agente", valor: arranqueTokens,
    unidad: `tokens / techo ${techo.toLocaleString("es-MX")}`,
    estado: arranqueTokens > techo ? "mal" : arranqueTokens > techo * 0.95 ? "aviso" : "ok",
    detalle: "lo que pagan Claude y Cline en CADA sesión nueva, antes de escribir una línea",
    accion: "node scripts/verificar-docs.mjs", doc: "AGENTS.md", peorSi: "sube",
    items: arranque.map((x) => `${x.archivo} — ${x.tokens.toLocaleString("es-MX")} tokens · ${Math.round((x.tokens / arranqueTokens) * 100)}%`),
  });
  señal({
    zona: "docs", id: "docs.rutasMuertas", titulo: "Rutas muertas en docs del presente",
    valor: (docSistema.rutasMuertas ?? []).length, unidad: `en ${docSistema.docsRevisados} documentos`,
    estado: (docSistema.rutasMuertas ?? []).length === 0 ? "ok" : "mal",
    detalle: "un documento del presente que cita un archivo retirado gasta contexto para nada",
    accion: "node scripts/verificar-docs.mjs", doc: "docs/00-INDICE.md", peorSi: "sube",
    items: (docSistema.rutasMuertas ?? []).map((x) => `${x.doc} → ${x.ruta}`),
  });
}
señal({
  zona: "docs", id: "docs.peso", titulo: "Peso total de docs/", valor: Math.round(docs.bytes / 1024),
  unidad: `KB en ${docs.n} archivos`, estado: "info",
  detalle: "no se lee entero nunca: docs/00-INDICE.md existe para eso", doc: "docs/00-INDICE.md",
  peorSi: "sube",
});

// --- Zona pendientes humanos -----------------------------------------------
// Se mantiene A MANO en docs/sistema/pendientes.json, y está bien que así sea:
// «subir una plantilla» o «rotar la contraseña de Supabase» no los puede medir
// ningún script. Lo que sí se mide es hace cuánto que nadie los revisa.
const PENDIENTES = "docs/sistema/pendientes.json";
if (existe(PENDIENTES)) {
  let lista = [];
  try { lista = JSON.parse(leer(PENDIENTES)).pendientes ?? []; } catch { lista = []; }
  const dias = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  const abiertos = lista.filter((p) => p.estado !== "cerrado");
  for (const p of abiertos) {
    const d = p.revisado ? dias(p.revisado) : null;
    señal({
      zona: "pendientes", id: `pendiente.${p.id}`, titulo: p.titulo, valor: p.riesgo ?? "—",
      estado: p.riesgo === "alto" ? "mal" : p.riesgo === "medio" ? "aviso" : "info",
      detalle: `${p.detalle}${d !== null ? ` · sin verificar desde hace ${d} día(s)` : ""}`,
      accion: p.verificar ?? null, doc: p.doc ?? null, items: p.quien ? [`Lo hace: ${p.quien}`] : [],
    });
  }
  señal({
    zona: "pendientes", id: "pendientes.total", titulo: "Pendientes abiertos", valor: abiertos.length,
    estado: "info", detalle: `de ${lista.length} declarados · se editan a mano en ${PENDIENTES}`,
    doc: PENDIENTES, peorSi: "sube",
  });
} else {
  señal({ zona: "pendientes", id: "pendientes.falta", titulo: "Lista de pendientes", valor: "—",
    estado: "sin-medir", detalle: `no existe ${PENDIENTES}`, doc: PENDIENTES });
}

// ── Histórico y deltas ─────────────────────────────────────────────────────
// Se compara contra la última medición de OTRO commit: contra la misma HEAD el
// delta sería siempre 0 y el panel no diría nada al re-ejecutarlo.
let previo = null;
if (existe(HISTORICO)) {
  const lineas = leer(HISTORICO).split("\n").filter(Boolean);
  for (let i = lineas.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lineas[i]);
      if (!previo) previo = e;
      if (e.head !== repo.head) { previo = e; break; }
    } catch { /* línea corrupta: se ignora, el histórico es append-only */ }
  }
}
for (const s of senales) {
  const antes = previo?.valores?.[s.id];
  if (typeof antes !== "number" || typeof s.valor !== "number") continue;
  const d = s.valor - antes;
  if (d === 0) continue;
  s.delta = { antes, cambio: d, desde: previo.generado, empeora: s.peorSi === "sube" ? d > 0 : s.peorSi === "baja" ? d < 0 : null };
}

// ── Documento final ────────────────────────────────────────────────────────
const ZONAS = [
  { id: "tecnico", titulo: "Técnico · arquitectura", nota: "la mitad mecánica de ORDEN.md — lo que tsc y el build no ven" },
  { id: "frontend", titulo: "Frontend", nota: "estado visual y de cliente" },
  { id: "datos", titulo: "Backend · datos", nota: "casi todo requiere red: el panel rápido no la toca" },
  { id: "docs", titulo: "Documentación · contexto", nota: "lo que los agentes leen, y si sigue siendo verdad" },
  { id: "pendientes", titulo: "Pendientes humanos", nota: "lo que ningún agente puede cerrar por ti" },
];

const estado = {
  generado: new Date().toISOString(),
  repo,
  zonas: ZONAS.map((z) => ({ ...z, senales: senales.filter((s) => s.zona === z.id) })),
  alertas: senales.filter((s) => s.estado === "mal" || s.delta?.empeora === true).map((s) => s.id),
  puntosCiegos: [
    "lint — SÍ está en el CI desde el PROMPT F y hoy pasa; lo que el panel no ve es el recuento de warnings (necesita eslint -f json)",
    "tsc --noEmit — no se corre en el panel rápido",
    "rendimiento — las cifras de FASE 10 son anteriores al rediseño Océano entero",
    "Supabase — filas, FK, RPC y SQL aplicado: todo requiere red (Fase 2)",
  ],
  fuentes,
};

fs.mkdirSync(abs(path.dirname(SALIDA)), { recursive: true });
fs.writeFileSync(abs(SALIDA), JSON.stringify(estado, null, 2), "utf8");

if (!SIN_HISTORICO) {
  const valores = Object.fromEntries(senales.filter((s) => typeof s.valor === "number").map((s) => [s.id, s.valor]));
  fs.mkdirSync(abs(path.dirname(HISTORICO)), { recursive: true });
  fs.appendFileSync(abs(HISTORICO), JSON.stringify({ generado: estado.generado, head: repo.head, valores }) + "\n", "utf8");
}

const fallaron = fuentes.filter((f) => !f.ok);
console.log(`Estado escrito en ${SALIDA} · ${senales.length} señales · ${estado.alertas.length} alerta(s).`);
for (const f of fallaron) console.log(`  aviso: ${f.id} no devolvió JSON (${f.error}); su zona queda incompleta.`);
