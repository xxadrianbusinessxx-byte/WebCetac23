#!/usr/bin/env node
/**
 * gen-panel.mjs — dibuja `.panel/estado.json` como una página.
 *
 * QUÉ MIDE: nada, y es deliberado. Este archivo solo sabe pintar. Si midiera
 *           algo aquí, ese número no estaría en el JSON, no tendría histórico y
 *           no se podría verificar — que es exactamente cómo un panel empieza a
 *           mentir. Todo lo que se ve sale de `gen-estado.mjs`.
 * QUÉ ESCRIBE: `.panel/panel.html`, autocontenido (el JSON va incrustado).
 *           Ignorado por git. No toca la base, ni la red, ni el código.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-estado.mjs && node scripts/gen-panel.mjs     (o `npm run panel`)
 *   node scripts/gen-panel.mjs --entrada=/tmp/estado.json --salida=/tmp/panel.html
 *
 * ── Por qué el JSON va incrustado ──────────────────────────────────────────
 * Para que el panel se abra con doble clic. Un `fetch("estado.json")` desde
 * `file://` lo bloquea el navegador por CORS, y la alternativa —levantar un
 * servidor para mirar un panel— es justo la fricción que hace que no se mire.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const ENTRADA = arg("entrada") ?? ".panel/estado.json";
const SALIDA = arg("salida") ?? ".panel/panel.html";

const rutaEntrada = path.join(root, ENTRADA);
if (!fs.existsSync(rutaEntrada)) {
  console.error(`ERROR: no existe ${ENTRADA}. Corre antes: node scripts/gen-estado.mjs`);
  process.exit(1);
}
const e = JSON.parse(fs.readFileSync(rutaEntrada, "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => (typeof v === "number" ? v.toLocaleString("es-MX") : esc(v));

const MARCA = { ok: "en su sitio", aviso: "mirar", mal: "roto", info: "dato", "sin-medir": "sin medir" };

function fechaCorta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function chipDelta(d) {
  if (!d) return "";
  const signo = d.cambio > 0 ? "+" : "";
  const clase = d.empeora === true ? "peor" : d.empeora === false ? "mejor" : "neutro";
  const flecha = d.cambio > 0 ? "▲" : "▼";
  return `<span class="delta ${clase}" title="antes: ${num(d.antes)} · ${fechaCorta(d.desde)}">${flecha} ${signo}${num(d.cambio)}</span>`;
}

function tarjeta(s) {
  const items = (s.items ?? []).length
    ? `<details><summary>${s.items.length} archivo(s)</summary><ul>${s.items.map((i) => `<li><code>${esc(i)}</code></li>`).join("")}</ul></details>`
    : "";
  const accion = s.accion
    ? `<div class="cmd"><code>${esc(s.accion)}</code><button data-copiar="${esc(s.accion)}" title="Copiar">copiar</button></div>`
    : "";
  const doc = s.doc ? `<span class="doc">${esc(s.doc)}</span>` : "";
  return `<article class="s ${esc(s.estado)}" data-estado="${esc(s.estado)}">
    <header><span class="punto"></span><h3>${esc(s.titulo)}</h3></header>
    <p class="v">${num(s.valor)}<span class="u">${esc(s.unidad)}</span>${chipDelta(s.delta)}</p>
    ${s.detalle ? `<p class="d">${esc(s.detalle)}</p>` : ""}
    ${items}${accion}${doc}
  </article>`;
}

const alertas = e.zonas.flatMap((z) => z.senales).filter((s) => e.alertas.includes(s.id));
const cuenta = (est) => e.zonas.flatMap((z) => z.senales).filter((s) => s.estado === est).length;

const html = `<!doctype html>
<html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel del repo — WebCetac23</title>
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
    margin:0;padding:32px 16px 64px}
  .wrap{max-width:1100px;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 4px;letter-spacing:-.01em}
  .sub{color:var(--tenue);font-size:.85rem;margin:0 0 6px}
  .sub code,.sub b{background:var(--panel);border:1px solid var(--linea);border-radius:4px;
    padding:1px 5px;font-weight:600}
  h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--tenue);
    margin:38px 0 4px;font-weight:700}
  h2 + .nota{color:var(--tenue);font-size:.8rem;margin:0 0 14px}
  .rej{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
  .s{background:var(--panel);border:1px solid var(--linea);border-radius:10px;padding:13px 15px}
  .s.mal{border-color:var(--mal)}
  .s header{display:flex;align-items:center;gap:7px;margin-bottom:2px}
  .s h3{font-size:.79rem;margin:0;font-weight:700;color:var(--tenue);
    text-transform:uppercase;letter-spacing:.04em;line-height:1.35}
  .punto{width:7px;height:7px;border-radius:50%;background:var(--tenue);flex:none}
  .s.ok .punto{background:var(--bien)} .s.mal .punto{background:var(--mal)}
  .s.aviso .punto{background:var(--mejor)} .s.sin-medir .punto{background:transparent;border:1px solid var(--tenue)}
  .v{margin:6px 0 4px;font-size:1.55rem;font-weight:700;letter-spacing:-.02em;
    font-variant-numeric:tabular-nums;line-height:1.1}
  .s.mal .v{color:var(--mal)} .s.aviso .v{color:var(--mejor)}
  .s.sin-medir .v{color:var(--tenue);font-weight:500}
  .u{font-size:.76rem;font-weight:500;color:var(--tenue);margin-left:5px;letter-spacing:0}
  .delta{font-size:.7rem;font-weight:700;margin-left:7px;padding:2px 6px;border-radius:5px;
    vertical-align:middle;letter-spacing:0}
  .delta.peor{background:var(--mal);color:var(--panel)}
  .delta.mejor{background:var(--bien);color:var(--panel)}
  .delta.neutro{background:var(--linea);color:var(--tenue)}
  .d{margin:0;font-size:.79rem;color:var(--tenue)}
  details{margin-top:8px;font-size:.76rem}
  summary{cursor:pointer;color:var(--acento);font-weight:600}
  details ul{margin:7px 0 0;padding-left:16px;max-height:230px;overflow:auto}
  details li{margin:2px 0;color:var(--tenue)}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
  .cmd{display:flex;align-items:center;gap:6px;margin-top:9px;background:var(--bg);
    border:1px solid var(--linea);border-radius:6px;padding:5px 7px;font-size:.73rem}
  .cmd code{flex:1;overflow:auto;white-space:nowrap;color:var(--tenue)}
  .cmd button{border:1px solid var(--linea);background:var(--panel);color:var(--tenue);
    border-radius:5px;padding:2px 7px;font-size:.7rem;cursor:pointer;flex:none;font-weight:600}
  .cmd button:hover{color:var(--acento);border-color:var(--acento)}
  .doc{display:block;margin-top:7px;font-size:.71rem;color:var(--tenue);opacity:.75}
  .alertas{background:var(--panel);border:1px solid var(--mal);border-left-width:4px;
    border-radius:10px;padding:14px 16px;margin:20px 0 6px}
  .alertas h2{margin:0 0 8px;color:var(--mal)}
  .alertas ol{margin:0;padding-left:18px}
  .alertas li{margin:4px 0;font-size:.87rem}
  .alertas b{font-weight:700}
  .todo-bien{background:var(--panel);border:1px solid var(--bien);border-left-width:4px;
    border-radius:10px;padding:14px 16px;margin:20px 0 6px;font-size:.87rem}
  .barra{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0 0;font-size:.78rem;color:var(--tenue)}
  .barra b{color:var(--texto)}
  .limpias{font-size:.79rem;color:var(--tenue);margin:0 0 12px;display:flex;
    flex-wrap:wrap;gap:6px;align-items:center}
  .limpias b{color:var(--bien);font-weight:700}
  .limpias span{background:var(--panel);border:1px solid var(--linea);border-radius:5px;
    padding:1px 7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:.92em;cursor:help}
  .ciegos{background:var(--panel);border:1px solid var(--linea);border-radius:10px;
    padding:14px 16px;margin-top:14px}
  .ciegos ul{margin:8px 0 0;padding-left:18px;font-size:.81rem;color:var(--tenue)}
  .pie{margin-top:34px;padding-top:16px;border-top:1px solid var(--linea);
    font-size:.78rem;color:var(--tenue)}
</style>

<div class="wrap">
  <h1>Panel del repo</h1>
  <p class="sub">WebCetac23 · rama <code>${esc(e.repo.rama)}</code> ·
    HEAD <code>${esc(e.repo.head)}</code> ·
    ${e.repo.sucios ? `<b>${e.repo.sucios} archivo(s) sin commitear</b>` : "árbol limpio"} ·
    medido ${fechaCorta(e.generado)}</p>
  <p class="sub" style="opacity:.8">último commit: ${esc(e.repo.headAsunto)} ·
    ${e.repo.commits7} commit(s) en 7 días · ${e.repo.commits30} en 30</p>

  <div class="barra">
    <span><b>${cuenta("mal")}</b> roto</span>
    <span><b>${cuenta("aviso")}</b> a mirar</span>
    <span><b>${cuenta("ok")}</b> en su sitio</span>
    <span><b>${cuenta("sin-medir")}</b> sin medir</span>
  </div>

  ${alertas.length ? `<div class="alertas">
    <h2>Atender primero</h2>
    <ol>${alertas.map((s) => `<li><b>${esc(s.titulo)}</b> — ${num(s.valor)} ${esc(s.unidad)}${s.delta ? ` (antes ${num(s.delta.antes)})` : ""}. ${esc(s.detalle ?? "")}</li>`).join("")}</ol>
  </div>` : `<div class="todo-bien">Nada roto ni empeorando respecto a la última medición.
    Eso no significa que todo esté bien: mira los puntos ciegos al final.</div>`}

  ${e.zonas.map((z) => {
    // Una regla que se cumple y vale 0 no necesita una tarjeta con un cero
    // gigante: ocupa el sitio de lo que sí hay que mirar. Se colapsan en una
    // línea, pero NO se ocultan — saber cuáles están vigilando es la mitad del
    // valor de tenerlas.
    const limpias = z.senales.filter((s) => s.estado === "ok" && s.valor === 0 && !s.delta);
    const resto = z.senales.filter((s) => !limpias.includes(s));
    return `
    <h2 id="${esc(z.id)}">${esc(z.titulo)}</h2>
    <p class="nota">${esc(z.nota)}</p>
    ${limpias.length ? `<p class="limpias"><b>${limpias.length} en su sitio:</b>
      ${limpias.map((s) => `<span title="${esc(s.titulo)}">${esc(s.titulo.split(" · ")[0])}</span>`).join(" ")}</p>` : ""}
    <div class="rej">${resto.length ? resto.map(tarjeta).join("") : (limpias.length ? "" : '<p class="d">Sin señales.</p>')}</div>
  `;
  }).join("")}

  <div class="ciegos">
    <h2 style="margin-top:0">Lo que este panel NO mide</h2>
    <p class="d">Un panel que calla sobre una zona entrena a creer que está bien.
      Estos huecos son deliberados: cuestan red o minutos y no caben en una corrida de 2 s.</p>
    <ul>${e.puntosCiegos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  </div>

  <p class="pie">
    Generado por <code>npm run panel</code> (<code>gen-estado.mjs</code> mide y escribe
    <code>.panel/estado.json</code>; este archivo solo pinta). Ninguno toca la base ni la red.
    Fuentes de esta corrida: ${e.fuentes.map((f) => `<code>${esc(f.id)}</code> ${f.ok ? `${f.ms} ms` : "FALLÓ"}`).join(" · ")}.
    Las deltas se comparan contra la última medición de otro commit, en <code>.panel/historico.jsonl</code>.
  </p>
</div>

<script>
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-copiar]");
    if (!b) return;
    const txt = b.getAttribute("data-copiar");
    const ok = () => { b.textContent = "copiado"; setTimeout(() => (b.textContent = "copiar"), 1200); };
    // navigator.clipboard existe en file:// (contexto seguro), pero no en todos
    // los navegadores: el textarea es el plan B para que el botón nunca mienta.
    if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(ok, fallback); } else { fallback(); }
    function fallback() {
      const t = document.createElement("textarea");
      t.value = txt; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); ok(); } catch { b.textContent = "no se pudo"; }
      t.remove();
    }
  });
</script>
<script type="application/json" id="estado">${JSON.stringify(e).replace(/</g, "\\u003c")}</script>
</html>
`;

fs.mkdirSync(path.join(root, path.dirname(SALIDA)), { recursive: true });
fs.writeFileSync(path.join(root, SALIDA), html, "utf8");
console.log(`Panel escrito en ${SALIDA} (${(html.length / 1024).toFixed(1)} KB) · ${alertas.length} alerta(s).`);
