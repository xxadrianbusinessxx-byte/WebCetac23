#!/usr/bin/env node
/**
 * gen-panel-repo.mjs — el estado del repo, de un vistazo.
 *
 * QUÉ MIDE: nada por su cuenta. Ejecuta las herramientas que YA miden y junta
 *           sus resultados. Si midiera aquí habría dos fuentes para la misma
 *           verdad (R6) y divergirían a la primera corrección.
 * QUÉ ESCRIBE: un HTML. Por defecto `docs/sistema/panel-repo.html`.
 *           No toca la base ni la red.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-panel-repo.mjs
 *   node scripts/gen-panel-repo.mjs --salida=/tmp/panel.html
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El repo mide mucho y no enseña nada: hay que correr cinco comandos y leer
 * cinco salidas de texto para saber cómo está. Eso hace que en la práctica no
 * se mire, y una deuda que no se mira es una deuda que crece — los archivos de
 * más de 1 000 líneas pasaron de 4 a 7 sin que nadie lo notara.
 *
 * Fuentes (todas de solo lectura):
 *   · test-orden.mjs --json ........ las 10 reglas de ORDEN.md y sus umbrales
 *   · el filesystem ................ suites, coste de arranque, tamaños
 *   · diag-restyle-oceano --json ... avance del restyle, si está disponible
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const salida = arg("salida") ?? "docs/sistema/panel-repo.html";

const leer = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pesa = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.statSync(path.join(root, rel)).size : 0);

/** Corre una herramienta del repo y devuelve su JSON. `null` si no se pudo. */
function medirCon(script, args) {
  try {
    const out = execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out.replace(/^﻿/, ""));
  } catch (e) {
    // test-orden sale con 1 cuando una regla falla, pero su JSON es válido y
    // es justo el caso que hay que enseñar. Se intenta leer igual.
    const out = e?.stdout;
    if (typeof out === "string" && out.trim().startsWith("{")) {
      try { return JSON.parse(out.replace(/^﻿/, "")); } catch { /* no era JSON */ }
    }
    return null;
  }
}

// ── Fuentes ────────────────────────────────────────────────────────────────
const orden = medirCon("test-orden.mjs", ["--json"]);
const restyle = medirCon("diag-restyle-oceano.mjs", ["--json"]);

const suites = fs.readdirSync(path.join(root, "scripts")).filter((f) => /^test-.+\.mjs$/.test(f));

const ARRANQUE = [
  "AGENTS.md", "ESTADO-ACTUAL.md",
  "docs/normativo/REGLAS_NO_HACER.md", "docs/normativo/GLOSARIO.md", "docs/00-INDICE.md",
];
const arranque = ARRANQUE.map((f) => ({ f, b: pesa(f) }));
const arranqueTotal = arranque.reduce((a, x) => a + x.b, 0);

let head = "(desconocido)";
try { head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* fuera de repo */ }
let rama = "";
try { rama = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* idem */ }

// ── HTML ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tok = (b) => Math.round(b / 4);

const duras = (orden?.reglas ?? []).filter((r) => r.modo === "dura");
const trinquetes = (orden?.reglas ?? []).filter((r) => r.modo === "trinquete");
const rotas = (orden?.reglas ?? []).filter((r) => r.estado === "falla" || r.estado === "subio");

function tarjeta(titulo, valor, pie, estado = "") {
  return `<div class="t ${estado}"><p class="t-k">${esc(titulo)}</p><p class="t-v">${valor}</p><p class="t-p">${pie}</p></div>`;
}

function filaRegla(r) {
  const cifra = r.modo === "dura" ? `${r.actual}` : `${r.actual} / ${r.umbral}`;
  const clase = r.estado === "falla" || r.estado === "subio" ? "mal" : r.estado === "bajo" ? "mejor" : "bien";
  const nota = r.estado === "bajo" ? "bajó: aprieta el umbral"
    : r.estado === "subio" ? "SUBIÓ" : r.estado === "falla" ? "incumplida" : "";
  return `<tr class="${clase}">
    <td class="id">${esc(r.id)}</td>
    <td>${esc(r.regla)}${r.deuda ? `<span class="deuda">${esc(r.deuda)}</span>` : ""}</td>
    <td class="modo">${r.modo}</td>
    <td class="num">${cifra}</td>
    <td class="nota">${esc(nota)}</td>
  </tr>`;
}

const html = `<title>Estado del repo — WebCetac23</title>
<style>
  :root{
    --bg:#f6f7f9; --panel:#fff; --linea:#e3e6ea; --texto:#1b1f24; --tenue:#5b636d;
    --bien:#1f7a4d; --mal:#b3261e; --mejor:#8a6100; --acento:#2b4c7e;
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --bg:#14171a; --panel:#1c2024; --linea:#2c3238; --texto:#e8eaed; --tenue:#9aa3ad;
      --bien:#5cc98f; --mal:#f2867d; --mejor:#e0b45e; --acento:#8fb3e8;
    }
  }
  :root[data-theme="dark"]{
    --bg:#14171a; --panel:#1c2024; --linea:#2c3238; --texto:#e8eaed; --tenue:#9aa3ad;
    --bien:#5cc98f; --mal:#f2867d; --mejor:#e0b45e; --acento:#8fb3e8;
  }
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--texto);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    margin:0;padding:32px 20px 64px}
  .wrap{max-width:980px;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 4px;letter-spacing:-.01em}
  .sub{color:var(--tenue);font-size:.85rem;margin:0 0 28px}
  .sub code{background:var(--panel);border:1px solid var(--linea);border-radius:4px;padding:1px 5px}
  h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--tenue);
    margin:34px 0 12px;font-weight:700}
  .rej{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
  .t{background:var(--panel);border:1px solid var(--linea);border-radius:10px;padding:14px 16px}
  .t.mal{border-color:var(--mal)}
  .t-k{margin:0;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--tenue);font-weight:700}
  .t-v{margin:6px 0 2px;font-size:1.7rem;font-weight:700;letter-spacing:-.02em;
    font-variant-numeric:tabular-nums}
  .t.mal .t-v{color:var(--mal)}
  .t-p{margin:0;font-size:.78rem;color:var(--tenue)}
  .caja{background:var(--panel);border:1px solid var(--linea);border-radius:10px;overflow:hidden}
  .scroll{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:.86rem;min-width:620px}
  th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;
    color:var(--tenue);padding:10px 14px;border-bottom:1px solid var(--linea);font-weight:700}
  td{padding:9px 14px;border-bottom:1px solid var(--linea);vertical-align:top}
  tr:last-child td{border-bottom:0}
  .id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tenue);width:44px}
  .modo{color:var(--tenue);font-size:.78rem;width:80px}
  .num{font-variant-numeric:tabular-nums;text-align:right;width:76px;font-weight:600}
  .nota{font-size:.76rem;width:150px}
  tr.bien .num{color:var(--bien)}
  tr.mal .num,tr.mal .nota{color:var(--mal);font-weight:700}
  tr.mejor .num,tr.mejor .nota{color:var(--mejor)}
  .deuda{display:block;color:var(--tenue);font-size:.74rem;margin-top:2px}
  .barra{display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--linea);margin:8px 0 4px}
  .barra i{display:block}
  .ley{font-size:.76rem;color:var(--tenue)}
  .pie{margin-top:34px;padding-top:16px;border-top:1px solid var(--linea);
    font-size:.78rem;color:var(--tenue)}
  .pie code{font-size:.9em}
</style>

<div class="wrap">
  <h1>Estado del repo</h1>
  <p class="sub">WebCetac23 · rama <code>${esc(rama)}</code> · HEAD <code>${esc(head)}</code> ·
     medido ${new Date().toLocaleString("es-MX")}</p>

  <h2>De un vistazo</h2>
  <div class="rej">
    ${tarjeta("Reglas de ORDEN", orden ? `${duras.length + trinquetes.length - rotas.length}/${duras.length + trinquetes.length}` : "—",
      rotas.length ? `${rotas.length} incumplida(s)` : "todas en su sitio", rotas.length ? "mal" : "")}
    ${tarjeta("Suites", suites.length, "corren en cada push y PR")}
    ${tarjeta("Arranque del agente", `${tok(arranqueTotal).toLocaleString("es-MX")}`,
      "tokens que paga cada sesión")}
    ${restyle ? tarjeta("Restyle Océano", `${restyle.avance}%`,
      `${restyle.totalClaro} claro · ${restyle.totalOscuro} oscuro`) : ""}
  </div>

  <h2>Reglas de ORDEN.md — comprobación mecánica</h2>
  <div class="caja scroll">
    <table>
      <thead><tr><th>Id</th><th>Regla</th><th>Modo</th><th>Actual</th><th></th></tr></thead>
      <tbody>${orden ? orden.reglas.map(filaRegla).join("") : `<tr><td colspan="5">No se pudo ejecutar <code>test-orden.mjs</code>.</td></tr>`}</tbody>
    </table>
  </div>
  <p class="ley" style="margin-top:10px">
    <strong>Dura</strong>: la regla se cumple hoy; cualquier violación falla.
    <strong>Trinquete</strong>: hay deuda declarada con prompt asignado; falla solo si el número sube.
    Bajar un umbral para que el CI pase apaga el guardián.
  </p>

  <h2>Coste de arranque — lo que paga cada sesión, de Claude y de Cline</h2>
  <div class="caja scroll">
    <table>
      <thead><tr><th>Archivo</th><th>Bytes</th><th>~Tokens</th><th>Parte</th><th></th></tr></thead>
      <tbody>
        ${arranque.sort((a, b) => b.b - a.b).map((x) => `<tr>
          <td><code>${esc(x.f)}</code></td>
          <td class="num">${x.b.toLocaleString("es-MX")}</td>
          <td class="num">${tok(x.b).toLocaleString("es-MX")}</td>
          <td class="num">${Math.round((x.b / arranqueTotal) * 100)}%</td>
          <td></td></tr>`).join("")}
        <tr><td><strong>Total</strong></td>
          <td class="num"><strong>${arranqueTotal.toLocaleString("es-MX")}</strong></td>
          <td class="num"><strong>${tok(arranqueTotal).toLocaleString("es-MX")}</strong></td>
          <td class="num">100%</td><td></td></tr>
      </tbody>
    </table>
  </div>
  <p class="ley" style="margin-top:10px">
    Es la lectura obligatoria de <code>AGENTS.md</code>. Se paga entera en cada sesión
    nueva, por los dos agentes. Recortarla es la optimización de tokens con mejor
    relación esfuerzo/ahorro que tiene el repo.
  </p>

  ${restyle ? `<h2>Restyle Océano</h2>
  <div class="caja" style="padding:16px">
    <div class="barra">
      <i style="width:${restyle.avance}%;background:var(--bien)"></i>
      <i style="width:${100 - restyle.avance}%;background:var(--mal)"></i>
    </div>
    <p class="ley">${restyle.totalOscuro.toLocaleString("es-MX")} ocurrencias con token
      <code>--oc-*</code> · ${restyle.totalClaro.toLocaleString("es-MX")} todavía en tema claro.
      Buena parte del resto vive en clientes legacy ya inalcanzables desde <code>/oceano</code>.</p>
  </div>` : ""}

  <p class="pie">
    Generado por <code>node scripts/gen-panel-repo.mjs</code>. No mide nada por su
    cuenta: ejecuta <code>test-orden.mjs --json</code> y <code>diag-restyle-oceano.mjs --json</code>
    y junta lo que devuelven. Si midiera aquí habría dos fuentes para la misma verdad (R6).
    Volver a correrlo lo pone al día.
  </p>
</div>
`;

fs.mkdirSync(path.dirname(path.join(root, salida)), { recursive: true });
fs.writeFileSync(path.join(root, salida), html, "utf8");
console.log(`Panel escrito en ${salida} (${(html.length / 1024).toFixed(1)} KB).`);
if (!orden) console.log("  aviso: test-orden.mjs no devolvió JSON; la tabla de reglas queda vacía.");
if (!restyle) console.log("  aviso: diag-restyle-oceano.mjs no devolvió JSON; se omite esa sección.");
