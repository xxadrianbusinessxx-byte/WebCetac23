#!/usr/bin/env node
/**
 * gen-informe.mjs — el informe del repo para PERSONAS.
 *
 * QUÉ MIDE: nada por su cuenta. Lee lo que ya miden otros (`test-orden --json`,
 *           `verificar-docs --json`, `.panel/historico.jsonl`, `pendientes.json`,
 *           `INVARIANTES.md`, `RUMBO.md` y git) y lo ordena en un documento
 *           que se pueda leer de arriba abajo sin abrir el repo.
 * QUÉ ESCRIBE: `docs/informes/<AAAA-MM>.md`. No toca la base ni la red.
 * CÓMO SE EJECUTA:
 *   npm run informe
 *   node scripts/gen-informe.mjs --salida=docs/informes/2026-09.md
 *   node scripts/gen-informe.mjs --stdout      (no escribe; lo imprime)
 *
 * ── Por qué existe, y por qué NO es el panel ───────────────────────────────
 * `.panel/panel.html` contesta «¿qué está roto ahora?» y se mira de un vistazo.
 * Esto contesta otra cosa: «¿el código sigue el hilo de su propia filosofía, y
 * dónde no hay nadie mirando?». Va en Markdown, va versionado y se puede enviar.
 *
 * La pieza que no existía en ningún sitio es la tabla de VIGILANCIA: de los 16
 * invariantes de `filosofia.estructural`, cuáles vigila una máquina y cuáles
 * dependen de que una persona se acuerde. Un repo con diez reglas en verde
 * parece auditado; lo que hay que saber es cuántos de los dieciséis principios
 * cubren de verdad esas diez, y que el resto se sostiene solo.
 *
 * ── Regla de construcción: nada se vuelve a medir ──────────────────────────
 * Igual que `gen-estado.mjs` y `gen-contexto.mjs`: si este script contara
 * archivos o evaluara reglas tendría su propia versión de cifras que ya tienen
 * dueño, y divergirían al primer cambio (R6). Todo lo que sale aquí viene de
 * una fuente que alguien más mantiene.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.join(import.meta.dirname, "..");
const abs = (rel) => path.join(root, rel);
const existe = (rel) => fs.existsSync(abs(rel));
const leer = (rel) => fs.readFileSync(abs(rel), "utf8");

const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : null;
};
const SOLO_STDOUT = process.argv.includes("--stdout");
const hoy = new Date();
const MES = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
const SALIDA = arg("salida") ?? `docs/informes/${MES}.md`;

// ── Fuentes ────────────────────────────────────────────────────────────────
const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

/** Corre una herramienta del repo que expone `--json`. Sale con 1 cuando algo
 *  falla, y ese es justo el caso que hay que enseñar: el JSON sigue siendo
 *  válido. Mismo manejo que en `gen-estado.mjs`. */
function json(script, args = ["--json"]) {
  try {
    const out = execFileSync(process.execPath, [abs(`scripts/${script}`), ...args], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out.replace(/^\ufeff/, ""));
  } catch (e) {
    const out = e?.stdout;
    if (typeof out === "string" && out.trim().startsWith("{")) {
      try { return JSON.parse(out.replace(/^\ufeff/, "")); } catch { /* nada */ }
    }
    return null;
  }
}

const orden = json("test-orden.mjs");
const docs = json("verificar-docs.mjs");
const reglas = orden?.reglas ?? [];
const reglaDe = (id) => reglas.find((r) => r.id === id);

/** Los invariantes, leídos de su archivo generado. */
function invariantes() {
  if (!existe("docs/normativo/INVARIANTES.md")) return [];
  return leer("docs/normativo/INVARIANTES.md")
    .split("\n")
    .filter((l) => /^\|\s*§\d+\s*\|/.test(l))
    .map((l) => {
      const c = l.split("|");
      return { seccion: c[1].trim(), texto: c[2].trim() };
    });
}

/** El histórico del panel: primera y última medición dentro del mes. */
function historico() {
  if (!existe(".panel/historico.jsonl")) return [];
  return leer(".panel/historico.jsonl")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function pendientes() {
  if (!existe("docs/sistema/pendientes.json")) return [];
  try { return JSON.parse(leer("docs/sistema/pendientes.json")).pendientes ?? []; } catch { return []; }
}

// ── La tabla de vigilancia ─────────────────────────────────────────────────
/**
 * Qué comprobación automática cubre cada invariante. ESTO ES UNA DECISIÓN, no
 * una medición: nadie puede derivar mecánicamente que la regla C5 «es» el
 * principio de modularidad. Vive aquí, a la vista, y no dentro del ensayo,
 * porque el ensayo es normativo y esto es una afirmación sobre el instrumental
 * —que cambia cuando se añade una regla, no cuando cambia la arquitectura—.
 *
 * `null` significa **nadie lo vigila**, y es el dato más valioso del informe:
 * ese invariante se sostiene solo si una persona se acuerda de él en la
 * revisión. Cuando una entrada pase de `null` a una regla, eso es progreso
 * estructural y merece decirse.
 *
 * ── El listón, que importa más que las entradas ────────────────────────────
 * Una regla cuenta como «lo vigila» solo si **violar el invariante hace fallar
 * esa regla**. Si se limita a rozar el principio, la entrada es `null` y el
 * proxy se nombra en la nota.
 *
 * Es un listón incómodo a propósito. La primera versión de esta tabla daba 6
 * de 16 colgando C9 de §1 («ningún archivo > 1000 líneas» como prueba de
 * modularidad) y C1 de §12 —que además era un error de bulto: §12 del ensayo
 * habla de importar CSV y Excel, no de `import` de módulos—. Con el listón
 * puesto quedan 3, y ese 3 es el dato útil: una tabla que se infla sola vuelve
 * a ser lo que este informe existe para evitar.
 */
const VIGILANCIA = {
  "§1": { regla: null, nota: "C9 (ningún archivo > 1000 líneas) es un proxy del tamaño, no una prueba de que algo sea reemplazable" },
  "§2": { regla: "C5", mas: "C1", nota: "solo para los módulos `-puro`: C5 exige cero I/O y C1 imports relativos, que es lo que permite cargarlos aislados. Un módulo NO puro puede incumplir §2 sin que falle nada" },
  "§3": { regla: null, nota: "C2 (lib/ no importa app/) detecta el acoplamiento hacia arriba; «leer datos de otro módulo para adivinar» no lo ve nadie" },
  "§4": { regla: null, nota: "que un dato tenga UNA fuente no lo puede ver un grep: se revisa a mano (R6)" },
  "§5": { regla: null, nota: "«la identidad académica viene del catálogo» no tiene detector; lo sostienen el GLOSARIO y la revisión" },
  "§6": { regla: null, nota: "campo fijo vs etiqueta es semántico: ninguna comprobación lo distingue" },
  "§7": { regla: "C3", mas: "test-auditoria-permisos.mjs", nota: "una action sin `exigir()` hace fallar la auditoría, y un cliente que importe supabase hace fallar C3. Violar el invariante sí rompe algo" },
  "§8": { regla: "C8", mas: "C4", nota: "si la action habla con Supabase o llama a otra action, falla. Es la forma comprobable de «llama contratos, no tablas»" },
  "§9": { regla: null, nota: "la idempotencia de un `.sql` no se comprueba desde disco; requiere red (punto ciego declarado del panel)" },
  "§10": { regla: null, nota: "«aditivo antes que renombrar» solo se ve en la revisión del diff" },
  "§11": { regla: null, nota: "no hay medición de rendimiento vigente: las cifras son de la FASE 10, anteriores al rediseño entero" },
  "§12": { regla: null, nota: "los importadores de CSV/Excel no tienen detector de reutilización: nada impide escribir un mapeo de columnas nuevo en paralelo" },
  "§13": { regla: null, nota: "que un flag no sustituya a la autorización lo roza la auditoría de permisos, no lo cubre" },
  "§14": { regla: null, nota: "nadie comprueba que el legacy lleve `@deprecated` con su alternativa" },
  "§15": { regla: null, verificador: "verificar-docs.mjs", nota: "desde 2026-09-19 vigila rutas vivas y el techo de arranque; la NO duplicación entre documentos sigue sin detector" },
  "§16": { regla: null, nota: "«medir la capa responsable» es método, no estado: no hay nada que comprobar" },
};

// ── El hilo: código real que hoy cumple el principio ───────────────────────
/**
 * Un informe que solo lleva números no demuestra que el código siga su
 * filosofía: demuestra que un script contó algo. Estos extractores abren un
 * archivo REAL, elegido mecánicamente, y enseñan las líneas donde se ve.
 *
 * El archivo no está escrito a mano a propósito: si se clavara una ruta, el
 * informe mentiría el día que ese archivo se mueva, y sería la misma
 * documentación podrida que `verificar-docs.mjs` persigue.
 */
function listar(dir, filtro) {
  const salida = [];
  if (!existe(dir)) return salida;
  for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...listar(rel, filtro));
    else if (filtro(rel)) salida.push(rel);
  }
  return salida;
}

/** Devuelve las líneas pedidas con su número real, listas para un bloque. */
function fragmento(rel, numeros) {
  const lineas = leer(rel).split("\n");
  const ancho = String(Math.max(...numeros) + 1).length;
  return numeros
    .filter((n) => n >= 1 && n <= lineas.length)
    .map((n) => `${String(n).padStart(ancho)}  ${lineas[n - 1]}`)
    .join("\n");
}

/** Los índices (1-based) de las líneas que casan con `re`, hasta `max`. */
function dondeCasa(rel, re, max = 4) {
  const out = [];
  leer(rel).split("\n").forEach((l, i) => { if (re.test(l) && out.length < max) out.push(i + 1); });
  return out;
}

const pruebas = [];

// §8 · la action valida y delega. Se elige la action MÁS LIMPIA: la que ni
// siquiera importa supabase, porque es donde el principio se ve entero.
{
  const acciones = listar("app/actions", (f) => f.endsWith(".ts"))
    .filter((f) => !/lib\/supabase/.test(leer(f)) && /exigir\(/.test(leer(f)))
    .sort((a, b) => leer(a).length - leer(b).length);
  const f = acciones[0];
  if (f) {
    const ls = [...dondeCasa(f, /^import \{ exigir \}/, 1), ...dondeCasa(f, /await exigir\(/, 1), ...dondeCasa(f, /^\s*return [a-zA-Z]/, 1)];
    pruebas.push({
      inv: "§8", titulo: "La action valida y delega; no hace el trabajo", archivo: f,
      codigo: fragmento(f, [...new Set(ls)].sort((a, b) => a - b)),
      lectura: "Ni una consulta: `exigir()` decide si puede, y el trabajo vive en `lib/`. Por eso C8 está en 0.",
    });
  }
}

// §2 · el módulo puro. Se elige el que más exporta: el que más decisiones
// concentra sin tocar I/O.
{
  const puros = listar("lib", (f) => /-puro\.tsx?$/.test(f))
    .sort((a, b) => (leer(b).match(/^export /gm) ?? []).length - (leer(a).match(/^export /gm) ?? []).length);
  const f = puros[0];
  if (f) {
    // Se prefieren las FUNCIONES: un `export const ESTADO = "borrador"` es una
    // constante, y no demuestra que aquí viva una decisión probable sin base.
    const fns = dondeCasa(f, /^export function /, 4);
    const ls = fns.length ? fns : dondeCasa(f, /^export (const|type|interface)/, 4);
    pruebas.push({
      inv: "§2", titulo: "La decisión vive en un módulo puro, probable sin base de datos", archivo: f,
      codigo: fragmento(f, ls),
      lectura: "Cero `import` de Supabase en todo el archivo: se puede correr su suite sin red. Es lo que mide C5.",
    });
  }
}

// §12 · imports relativos dentro de lib/escolar. Se elige el archivo de dominio
// con más imports relativos: donde la regla se aplica más veces seguidas.
{
  const dominio = listar("lib/escolar", (f) => /\.ts$/.test(f) && !/-puro\.ts$/.test(f))
    .sort((a, b) => (leer(b).match(/^import .*from "\.\.?\//gm) ?? []).length - (leer(a).match(/^import .*from "\.\.?\//gm) ?? []).length);
  const f = dominio[0];
  if (f) {
    const ls = dondeCasa(f, /^import .*from "\.\.?\//, 4);
    if (ls.length) {
      pruebas.push({
        inv: "§2", titulo: "…y se puede cargar aislado: el dominio importa por ruta relativa", archivo: f,
        codigo: fragmento(f, ls),
        lectura: "Nada de `@/`. No es estética: con el alias, las suites puras dejan de transpilar y el build sigue verde — el fallo se descubre tarde. Es C1.",
      });
    }
  }
}

// ── Armado ─────────────────────────────────────────────────────────────────
const L = [];
const rama = git("rev-parse", "--abbrev-ref", "HEAD");
const head = git("rev-parse", "--short", "HEAD");
const desde = `${MES}-01`;
const commitsMes = Number(git("rev-list", "--count", `--since=${desde}`, "HEAD") ?? 0);
const invs = invariantes();

// La tabla de arriba es a mano, y los invariantes se generan: si alguien añade
// una sección al ensayo, esto se queda corto EN SILENCIO y el informe diría que
// hay menos principios de los que hay. Se comprueba que los dos conjuntos
// coincidan, y si no, se para. Mismo motivo que `gen-invariantes --check`.
if (invs.length) {
  const enDoc = invs.map((i) => i.seccion);
  const enTabla = Object.keys(VIGILANCIA);
  const faltan = enDoc.filter((s) => !enTabla.includes(s));
  const sobran = enTabla.filter((s) => !enDoc.includes(s));
  if (faltan.length || sobran.length) {
    console.error("La tabla VIGILANCIA de este script no coincide con INVARIANTES.md:");
    if (faltan.length) console.error(`  · sin entrada en la tabla: ${faltan.join(", ")}`);
    if (sobran.length) console.error(`  · en la tabla pero ya no en el ensayo: ${sobran.join(", ")}`);
    console.error("Decide quién vigila los nuevos (o «nadie», que también es una respuesta)");
    console.error("antes de volver a generar el informe.");
    process.exit(1);
  }
}

const vigilados = invs.filter((i) => VIGILANCIA[i.seccion]?.regla);
const hist = historico();

L.push(`# Informe del repositorio — ${MES}`);
L.push("");
L.push(`**Generado por \`npm run informe\` el ${hoy.toISOString().slice(0, 10)}.** No tiene autoridad:`);
L.push("describe el estado en esta fecha y se regenera. Lo que obliga está en");
L.push("`docs/normativo/`; lo que es verdad hoy, en `ESTADO-ACTUAL.md`.");
L.push("");
L.push(`- **Rama:** \`${rama}\` · **HEAD:** \`${head}\``);
L.push(`- **Commits en el mes:** ${commitsMes}`);
if (existe("RUMBO.md")) {
  const campana = leer("RUMBO.md").match(/\*\*Campaña:\*\*\s*(.+)/)?.[1]?.trim();
  if (campana) L.push(`- **Campaña en curso:** ${campana}`);
}
L.push("");
L.push("---");
L.push("");

// 1 · Vigilancia
L.push("## 1 · Quién vigila cada principio");
L.push("");
const parciales = invs.filter((i) => !VIGILANCIA[i.seccion]?.regla && VIGILANCIA[i.seccion]?.verificador);
L.push(`De los **${invs.length} invariantes** de \`filosofia.estructural\`, **${vigilados.length}** tienen una regla que`);
L.push(`falla si se violan${parciales.length ? `, **${parciales.length}** tiene cobertura parcial` : ""}, y los **${invs.length - vigilados.length - parciales.length}** restantes se sostienen porque`);
L.push("alguien se acuerda en la revisión — y esa es la lectura importante de esta");
L.push("tabla, no la columna de la derecha en verde.");
L.push("");
L.push("| § | Invariante | Lo vigila | Hoy |");
L.push("|---|---|---|---|");
for (const inv of invs) {
  const v = VIGILANCIA[inv.seccion] ?? {};
  const r = v.regla ? reglaDe(v.regla) : null;
  const quien = v.regla
    ? `\`${v.regla}\`${v.mas ? ` + \`${v.mas}\`` : ""}`
    : v.verificador ? `\`${v.verificador}\` (parcial)` : "**nadie**";
  const hoyTxt = r ? `${r.actual}/${r.umbral} ${r.estado === "ok" ? "ok" : "**falla**"}` : "—";
  L.push(`| ${inv.seccion} | ${inv.texto} | ${quien} | ${hoyTxt} |`);
}
L.push("");
L.push("Por qué cada uno está donde está:");
L.push("");
for (const inv of invs) {
  const v = VIGILANCIA[inv.seccion];
  if (v?.nota) L.push(`- **${inv.seccion}** — ${v.nota}`);
}
L.push("");
L.push("---");
L.push("");

// 2 · El hilo
L.push("## 2 · El hilo, en código");
L.push("");
L.push("Los números de arriba dicen que nadie viola las reglas. Esto enseña cómo se ve");
L.push("cumplirlas: archivos reales del repo de hoy, elegidos por el propio script —no");
L.push("escogidos a mano, para que el informe no mienta el día que uno se mueva—.");
L.push("");
for (const p of pruebas) {
  L.push(`### ${p.inv} · ${p.titulo}`);
  L.push("");
  L.push(`\`${p.archivo}\``);
  L.push("");
  L.push("```ts");
  L.push(p.codigo);
  L.push("```");
  L.push("");
  L.push(p.lectura);
  L.push("");
}
L.push("---");
L.push("");

// 3 · Qué se movió
L.push("## 3 · Qué se movió");
L.push("");
if (hist.length >= 2) {
  const a = hist[0];
  const b = hist[hist.length - 1];
  L.push(`Entre la primera y la última medición del panel (\`${a.head}\` → \`${b.head}\`,`);
  L.push(`${hist.length} mediciones):`);
  L.push("");
  L.push("| Señal | Antes | Ahora | |");
  L.push("|---|---|---|---|");
  const claves = [...new Set([...Object.keys(a.valores ?? {}), ...Object.keys(b.valores ?? {})])];
  for (const k of claves) {
    const antes = a.valores?.[k];
    const ahora = b.valores?.[k];
    if (antes === undefined || ahora === undefined || antes === ahora) continue;
    const d = ahora - antes;
    L.push(`| \`${k}\` | ${antes} | ${ahora} | ${d > 0 ? "+" : ""}${d} |`);
  }
  L.push("");
  L.push("El signo no dice si es bueno: `frontend.claro` bajando es avance, y");
  L.push("`docs.peso` subiendo no siempre es malo. El panel sí lo sabe (`peorSi`).");
} else {
  L.push("No hay histórico suficiente. `npm run panel` añade una medición cada vez.");
}
L.push("");
L.push("---");
L.push("");

// 4 · Abierto
const abiertos = pendientes().filter((p) => p.estado === "abierto");
const altos = abiertos.filter((p) => p.riesgo === "alto");
L.push("## 4 · Lo que sigue abierto");
L.push("");
L.push(`**${abiertos.length} pendientes**, ${altos.length} de riesgo alto. Fuente: \`docs/sistema/pendientes.json\`.`);
L.push("");
for (const p of abiertos) {
  const quien = /persona/i.test(p.quien ?? "") ? "una **persona**" : "un **agente**";
  L.push(`- **${p.titulo}** — riesgo ${p.riesgo}, lo cierra ${quien}, revisado ${p.revisado}`);
  if (p.verificar) L.push(`  - comprobar: \`${p.verificar}\``);
}
L.push("");
L.push("---");
L.push("");

// 5 · Sin instrumento
L.push("## 5 · Dónde no hay nadie mirando");
L.push("");
const sinNadie = invs.filter((i) => !VIGILANCIA[i.seccion]?.regla && !VIGILANCIA[i.seccion]?.verificador);
L.push(`**${sinNadie.length} de los ${invs.length} invariantes no tienen detector.** Si uno se rompe hoy, se`);
L.push("descubre cuando falle algo en producción o cuando alguien lo lea en una revisión:");
L.push("");
for (const i of sinNadie) L.push(`- ${i.seccion} — ${i.texto}`);
L.push("");
if (docs) {
  L.push(`Además, el arranque de los agentes cuesta **${docs.arranqueTokens?.toLocaleString("es-MX")} tokens** de un techo de`);
  L.push(`${docs.techoTokens?.toLocaleString("es-MX")}, y hay **${(docs.rutasMuertas ?? []).length} rutas muertas** en los ${docs.docsRevisados} documentos del presente.`);
  L.push("");
}
const pnl = existe(".panel/estado.json") ? JSON.parse(leer(".panel/estado.json")) : null;
if (pnl?.puntosCiegos?.length) {
  L.push("Y lo que el panel declara que **no mide**:");
  L.push("");
  for (const c of pnl.puntosCiegos) L.push(`- ${c}`);
  L.push("");
}
L.push("Una zona en silencio entrena a creer que está bien. Por eso este apartado va al");
L.push("final y no se omite cuando está vacío.");
L.push("");

const texto = L.join("\n") + "\n";
if (SOLO_STDOUT) {
  process.stdout.write(texto);
} else {
  fs.mkdirSync(path.dirname(abs(SALIDA)), { recursive: true });
  fs.writeFileSync(abs(SALIDA), texto, "utf8");
  console.log(`Informe escrito en ${SALIDA} (${texto.split("\n").length} líneas).`);
  console.log(`  ${vigilados.length}/${invs.length} invariantes con comprobación automática · ${abiertos.length} pendientes abiertos`);
}
