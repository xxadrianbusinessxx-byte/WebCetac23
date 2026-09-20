#!/usr/bin/env node
/**
 * gen-rumbo.mjs — reescribe el bloque GENERADO de RUMBO.md.
 *
 * QUÉ MIDE: nada por su cuenta. LEE de sus fuentes:
 *             · «Rama y HEAD» → `git rev-parse`
 *             · «Qué cerró» → `git log -10 --format=%h · %s`
 *             · «Lo que más pesa hoy» → los pendientes `estado: abierto` y
 *               `riesgo: alto` de `docs/sistema/pendientes.json` (id, título y comando),
 *               y las reglas de `node scripts/test-orden.mjs --json` que NO están en 0.
 * QUÉ ESCRIBE: `RUMBO.md`, y SOLO el bloque entre sus marcadores GENERADO. La
 *             cabecera y «Fuera de alcance ahora» son decisiones humanas: no se tocan.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-rumbo.mjs           # reescribe el bloque
 *   node scripts/gen-rumbo.mjs --check   # no escribe; sale 1 si hay desfase
 *
 * ── Por qué no mide nada ───────────────────────────────────────────────────
 * Si este script contara archivos o parseara `app/`, crearía una segunda fuente de
 * lo que ya miden `test-orden` y `pendientes.json` (R6), y el resumen —que es el que
 * se lee al arrancar— sería el que miente. Aquí solo se copia lo ya medido.
 *
 * ── Por qué recorta textos ─────────────────────────────────────────────────
 * `RUMBO.md` entra en la lectura de arranque y su techo de tokens lo vigila el CI
 * (`scripts/verificar-docs.mjs`). Solo se recorta el asunto de un commit, a
 * ANCHO_ASUNTO (72, el ancho del documento); el que cabe, cabe entero. Todo lo
 * demás —incluido el título de cada pendiente— se copia completo: un resumen que
 * obliga a abrir su fuente no ahorra contexto, lo gasta dos veces.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const raiz = path.join(import.meta.dirname, "..");
const DOC = path.join(raiz, "RUMBO.md");
const PENDIENTES = path.join(raiz, "docs", "sistema", "pendientes.json");
const INICIO = "<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->";
const FIN = "<!-- FIN GENERADO -->";
const soloComprobar = process.argv.includes("--check");

const NUM_COMMITS = 10;
/**
 * Ancho del asunto de cada commit. 72 es el ancho del propio documento: un asunto
 * entero cabe, y el que no cabe se corta con `…` en vez de desaparecer. Estuvo en
 * 20 para que el archivo cupiera en un techo que ya no existe, y el resultado era
 * «UIs pendientes: las…», que no dice qué cerró.
 */
const ANCHO_ASUNTO = 72;

/** Recorta a `n` caracteres visibles, avisando con `…` de que hay más en la fuente. */
const recorta = (txt, n) => (String(txt).length <= n ? String(txt) : `${String(txt).slice(0, n).trimEnd()}…`);

/** «Qué cerró»: el histórico reciente, tal cual lo da git. */
function commits() {
  const salida = execFileSync("git", ["log", `-${NUM_COMMITS}`, "--format=%h · %s"], {
    cwd: raiz,
    encoding: "utf8",
  });
  const lineas = salida.split(/\r?\n/).filter(Boolean);
  return lineas.map((l) => {
    const corte = l.indexOf(" · ");
    return `- ${corte < 0 ? l : `${l.slice(0, corte)} · ${recorta(l.slice(corte + 3), ANCHO_ASUNTO)}`}`;
  });
}

/** «Lo que más pesa hoy» (1/2): pendientes abiertos de riesgo alto, leídos de su fuente.
 *
 *  Se copian el `id`, el `titulo` y el comando —todo—, y eso NO es R6: R6 prohíbe una
 *  segunda fuente **editable**, no una **proyección regenerable**. Este archivo es a
 *  `docs/sistema/pendientes.json` lo que `INVARIANTES.md` es a `filosofia.estructural`:
 *  si derivar desde la fuente fuera R6, derivar los invariantes también lo sería. Lo
 *  que R6 prohíbe es que alguien **edite** el título aquí; por eso esto vive dentro de
 *  los marcadores GENERADO, donde el siguiente `gen-rumbo` lo revierte.
 *
 *  Sin el título, un `id` como `rotar-password-supabase — sin verificar` no dice qué
 *  es: obliga a abrir otro archivo, que es justo el gasto que RUMBO existe para evitar.
 */
function pendientes() {
  const json = JSON.parse(fs.readFileSync(PENDIENTES, "utf8"));
  const abiertos = json.pendientes.filter((p) => p.estado === "abierto" && p.riesgo === "alto");
  if (!abiertos.length) return ["- ninguno"];
  return abiertos.map((p) => {
    const donde = p.verificar ? `\`${p.verificar}\`` : "sin comando de verificación";
    return `- ${p.id} — ${p.titulo} · ${donde}`;
  });
}

/** Dónde estamos: rama y HEAD salen de git, no de la cabecera manual.
 *
 *  Vivían escritos a mano en la cabecera y no los verificaba nadie: coincidían el día
 *  que se escribieron. Es exactamente el fallo que documentó `PENDIENTES-2026-09-16.md`
 *  §4 sobre `ESTADO-ACTUAL.md`, cuya cabecera llegó a estar 31 commits atrás. No son
 *  decisiones, son hechos que este script ya tiene delante (corre `git`).
 */
function ramaYHead() {
  const rama = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
  return `- **Rama y HEAD:** ${rama} · ${head}`;
}

/** «Lo que más pesa hoy» (2/2): las reglas de test-orden que no están en 0, con su valor. */
function reglas() {
  let salida;
  try {
    salida = execFileSync(process.execPath, ["scripts/test-orden.mjs", "--json"], { cwd: raiz, encoding: "utf8" });
  } catch (e) {
    // `test-orden` sale 1 si alguna regla falla, y eso es justo lo que hay que
    // contar aquí: su JSON sigue siendo válido, se lee del stdout del error.
    if (!e.stdout) throw e;
    salida = e.stdout;
  }
  return JSON.parse(salida)
    .reglas.filter((r) => r.actual !== 0)
    .map((r) => `- ${r.id} = ${r.actual}`);
}

if (!fs.existsSync(DOC)) {
  console.error(`No existe ${path.relative(raiz, DOC)}.`);
  process.exit(1);
}
const doc = fs.readFileSync(DOC, "utf8").split("\r\n").join("\n");
if (!doc.includes(INICIO) || !doc.includes(FIN)) {
  console.error(`Faltan los marcadores GENERADO / FIN GENERADO en ${path.relative(raiz, DOC)}.`);
  process.exit(1);
}

const bloque = [
  ramaYHead(),
  "",
  `## Qué cerró (últimos ${NUM_COMMITS} commits)`,
  "",
  ...commits(),
  "",
  "## Lo que más pesa hoy",
  "",
  ...pendientes(),
  ...reglas(),
].join("\n");

const antes = doc.slice(0, doc.indexOf(INICIO) + INICIO.length);
const despues = doc.slice(doc.indexOf(FIN));
const salida = `${antes}\n${bloque}\n${despues}`;

// ── Qué cuenta como «desfasado» ────────────────────────────────────────────
// Comparar el bloque entero byte a byte hace este check IMPOSIBLE de
// satisfacer, y no de una forma sutil: el sha y la lista de commits son función
// de HEAD, así que el propio commit que pone RUMBO.md al día lo vuelve a
// desincronizar. El CI corre en cada push y fallaría SIEMPRE.
//
// Es exactamente la trampa que ya documentó `verificar-estado-actual.mjs`, y se
// sale por donde salió aquel: lo que hay que impedir no es que el sha difiera,
// es que el documento se quede MUY atrás. Así que la parte que depende de git
// se tolera mientras venga de un ANCESTRO cercano, y la parte que NO depende de
// git —pendientes y reglas, que solo cambian cuando cambia lo que describen—
// se sigue comparando estricta.
const MAX_COMMITS_ATRAS = 10;
const SEPARADOR = "## Lo que más pesa hoy";

const trozoMedido = (texto) => texto.slice(texto.indexOf(SEPARADOR));
const bloqueEnDisco = doc.slice(doc.indexOf(INICIO) + INICIO.length, doc.indexOf(FIN));

// Se comparan las dos versiones del BLOQUE, no del documento: `salida` lleva
// pegado todo lo que va detrás del marcador FIN y la comparación daba siempre
// distinto.
const medidoCambio =
  !bloqueEnDisco.includes(SEPARADOR) || trozoMedido(bloqueEnDisco).trim() !== trozoMedido(bloque).trim();

/** Cuántos commits atrás va el sha que declara el documento. `null` = no se sabe. */
function commitsAtras() {
  const m = bloqueEnDisco.match(/\*\*Rama y HEAD:\*\*.*·\s*([0-9a-f]{7,40})/);
  if (!m) return { sha: null, n: null };
  const sha = m[1];
  try {
    const real = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
    if (real.startsWith(sha) || sha.startsWith(real)) return { sha, n: 0 };
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: raiz, stdio: "ignore" });
    return { sha, n: Number(execFileSync("git", ["rev-list", "--count", `${sha}..HEAD`], { cwd: raiz, encoding: "utf8" }).trim()) };
  } catch {
    return { sha, n: null }; // no es ancestro, o el sha ya no existe
  }
}

const { sha, n } = commitsAtras();
const gitDemasiadoAtras = sha === null || n === null || n > MAX_COMMITS_ATRAS;
const desfasado = medidoCambio || gitDemasiadoAtras;
const hayQueReescribir = salida !== doc;

if (soloComprobar) {
  if (!desfasado) {
    console.log(n > 0 ? `Al día (el bloque viene de \`${sha}\`, ${n} commit(s) atrás; tolerado hasta ${MAX_COMMITS_ATRAS}).` : "Al día.");
  } else {
    console.log("DESFASADO:");
    if (medicionCambioTexto()) console.log(`  · ${medicionCambioTexto()}`);
    if (gitDemasiadoAtras) {
      console.log(
        sha === null
          ? "  · el bloque no declara «Rama y HEAD»: no se puede saber de cuándo es."
          : n === null
            ? `  · declara \`${sha}\`, que no es ancestro del HEAD real (¿otra rama?).`
            : `  · declara \`${sha}\`, ${n} commits atrás (máximo ${MAX_COMMITS_ATRAS}).`,
      );
    }
    console.log("  Corre `node scripts/gen-rumbo.mjs`.");
  }
} else if (hayQueReescribir) {
  fs.writeFileSync(DOC, salida);
  console.log("RUMBO.md regenerado: commits recientes + lo que más pesa hoy.");
} else {
  console.log("Sin cambios.");
}

function medicionCambioTexto() {
  return medidoCambio ? "los pendientes o las reglas ya no son los que dice el documento." : null;
}

process.exit(soloComprobar && desfasado ? 1 : 0);
