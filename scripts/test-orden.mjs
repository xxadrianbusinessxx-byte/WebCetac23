#!/usr/bin/env node
/**
 * test-orden.mjs — la mitad MECÁNICA de `docs/normativo/ORDEN.md`.
 *
 * QUÉ MIDE: que el código cumpla las reglas de ORDEN.md que se pueden
 *           comprobar leyendo archivos (capas, nombres, scripts, raíz).
 * QUÉ ESCRIBE: nada. Solo lee el filesystem. No toca red ni Supabase.
 * CÓMO SE EJECUTA: node scripts/test-orden.mjs
 *                  node scripts/test-orden.mjs --detalle   (lista cada archivo)
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * ORDEN.md está escrito con precisión poco común, pero era prosa: solo se
 * cumplía si quien tocaba el repo se acordaba. Y este repo lo tocan DOS
 * agentes de IA además de una persona. Un implementador puede entregar algo
 * que compila, pasa las suites y aun así subió lógica a la action, importó
 * `@/` dentro de `lib/escolar/` o llamó `probe-` a un script que escribe.
 * `tsc` no ve nada de eso, y el build tampoco.
 *
 * Mismo patrón que `gen-matriz-permisos --check` y `verificar-estado-actual`,
 * que son los dos sitios donde este repo ya evitó que un documento se
 * desincronizara: comparar contra la realidad y fallar si divergen.
 *
 * ── Dos tipos de comprobación ──────────────────────────────────────────────
 * DURA      (`umbral: 0`) — la regla se cumple hoy. Cualquier violación falla.
 *                           Añadirla ahora no cuesta nada y ya no se puede
 *                           romper por descuido.
 * TRINQUETE (`umbral: N`) — la regla NO se cumple hoy; hay deuda declarada y
 *                           con prompt asignado. Falla solo si el número SUBE.
 *                           Cuando baja, avisa para que se ajuste el umbral.
 *
 * El trinquete es lo que permite añadir el guardián a un repo vivo sin
 * bloquear todo el trabajo. Una regla que falla desde el primer día por deuda
 * preexistente se desactiva a la semana, y entonces no protege nada.
 *
 * ── Por qué no es grep ─────────────────────────────────────────────────────
 * Un grep ingenuo sobre estas reglas da FALSOS POSITIVOS, y se comprobó antes
 * de escribir esto: `ciclo-estado-puro.ts` «importaba supabase» en un
 * comentario que citaba un `.sql`, y `test-auditoria-ciclo-f5.mjs` «escribía»
 * porque comparaba contra la cadena `".delete()"`. Un guardián que grita en
 * falso se ignora, o peor, alguien «arregla» código correcto para callarlo.
 * Por eso todo se mide sobre el archivo con comentarios y literales de cadena
 * neutralizados.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const DETALLE = process.argv.includes("--detalle");
// `--json` existe para que otra herramienta lea el resultado sin re-implementar
// las reglas. Lo consume `gen-estado.mjs`: si el panel las midiera por
// su cuenta habría dos fuentes para la misma verdad (R6), y divergirían.
const JSON_OUT = process.argv.includes("--json");

// ── Utilidades ─────────────────────────────────────────────────────────────

/** Archivos bajo `dir` que cumplen `filtro`, recursivo, saltando lo generado. */
function listar(dir, filtro, acc = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".tmp-")) continue;
    const rel = path.join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) listar(rel, filtro, acc);
    else if (filtro(rel)) acc.push(rel);
  }
  return acc;
}

const leer = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

/**
 * Neutraliza comentarios y literales de cadena, conservando la longitud y los
 * saltos de línea para que los números de línea sigan siendo válidos.
 *
 * No es un parser de TypeScript y no pretende serlo: es suficiente para que
 * «mencionar algo en un comentario» y «hacerlo» dejen de ser indistinguibles,
 * que es justo donde el grep fallaba.
 */
function codigoDesnudo(src, { conservarCadenas = false } = {}) {
  let out = "";
  let i = 0;
  const N = src.length;
  while (i < N) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < N && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < N && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      // Con `conservarCadenas` solo se quitan los comentarios: la cadena se copia
      // tal cual. Hace falta recorrerla igual, para que un `//` dentro de una URL
      // no se tome por comentario. Lo usa la detección de `method:` de C6.
      const cierre = c;
      out += conservarCadenas ? c : " "; i++;
      while (i < N && src[i] !== cierre) {
        if (src[i] === "\\") { out += conservarCadenas ? src.slice(i, i + 2) : "  "; i += 2; continue; }
        out += conservarCadenas || src[i] === "\n" ? src[i] : " ";
        i++;
      }
      out += conservarCadenas ? (src[i] ?? "") : " "; i++;
    } else {
      out += c; i++;
    }
  }
  return out;
}

/** Los `import ... from "X"` de un archivo. Se leen del original: la ruta ES
 *  una cadena, así que desnudarla la borraría. */
function importsDe(src) {
  const fuera = [];
  // `[^;]*?` y no `[^;\n]*?`: una sentencia de import acaba en `;`, no en el salto
  // de línea. La versión anterior cortaba en `\n` y NO VEÍA NINGÚN IMPORT
  // MULTILÍNEA —`import {\n  a,\n  b,\n} from "x";`—: el 2026-09-23 eran 210 de 813
  // en app/ + lib/ (26 %), invisibles para C1, C2, C3 y C4. Sigue anclada en
  // `import` / `export` a principio de línea, así que la palabra «from» en prosa
  // no cuenta; medida contra un `from "…"` sin ancla, las dos ven los mismos 813.
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g)) fuera.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) fuera.push(m[1]);
  // El import de efecto lateral, sin `from`. Es justo la forma en que se escribe
  // `import "server-only"`, lo que C3 prohíbe en el cliente: sin esta línea, C3
  // no podía ver la única violación que existe para vigilar.
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) fuera.push(m[1]);
  return fuera;
}

// ── Motor de comprobaciones ────────────────────────────────────────────────

const resultados = [];

/**
 * @param {string} id       C1, C2…
 * @param {string} regla    qué exige ORDEN.md, en una línea
 * @param {number} umbral   0 = dura; N = trinquete con deuda declarada
 * @param {() => {archivo:string, detalle:string}[]} buscar
 * @param {string} [deuda]  por qué el umbral no es 0, y quién lo baja
 */
function comprobar(id, regla, umbral, buscar, deuda) {
  const hallazgos = buscar();
  resultados.push({ id, regla, umbral, hallazgos, deuda });
}

const ES_TS = (f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f);

// ── C1 · lib/escolar no usa el alias «@/» ──────────────────────────────────
// ORDEN.md §1b. No es estilo: las suites cargan `lib/` con Node, que ejecuta
// los `.ts` directamente (PROMPT H-bis) y NO resuelve el alias `@/` —eso lo hace
// el bundler de Next, no Node—. Un import absoluto aquí rompe la suite sin romper
// el build: falla en el sitio equivocado. Antes de H-bis el motivo era el mismo
// por otro camino (`ts.transpileModule` tampoco reescribía `@/`), y por eso esta
// regla sobrevivió intacta al cambio de mecanismo.
comprobar("C1", "lib/escolar/** importa por ruta relativa, nunca «@/»", 0, () =>
  listar("lib/escolar", ES_TS)
    .flatMap((f) => importsDe(leer(f)).filter((s) => s.startsWith("@/")).map((s) => ({ archivo: f, detalle: s }))),
);

// ── C2 · lib/ nunca importa app/ ───────────────────────────────────────────
// ORDEN.md §2, «la prueba del algodón»: si borras `app/` entero, `lib/` debe
// seguir compilando.
comprobar("C2", "lib/** nunca importa de app/", 0, () =>
  listar("lib", ES_TS)
    .flatMap((f) => importsDe(leer(f)).filter((s) => s.startsWith("@/app/") || /(^|\/)\.\.\/app\//.test(s)).map((s) => ({ archivo: f, detalle: s }))),
);

// ── C3 · los componentes cliente no arrastran el servidor ──────────────────
// ORDEN.md §2: un `"use client"` que importa `lib/supabase/*` o `server-only`
// mete en el bundle del navegador código que solo puede correr en servidor.
comprobar("C3", "«use client» no importa lib/supabase ni server-only", 0, () =>
  listar("app", (f) => ES_TS(f))
    .filter((f) => /^\s*["']use client["']/.test(leer(f)))
    .flatMap((f) => importsDe(leer(f)).filter((s) => /lib\/supabase|^server-only$/.test(s)).map((s) => ({ archivo: f, detalle: s }))),
);

// ── C4 · una action no llama a otra action ─────────────────────────────────
// ORDEN.md §2: si dos actions comparten algo, ese algo baja a `lib/`.
comprobar("C4", "app/actions/** no importa otra action", 0, () =>
  listar("app/actions", ES_TS)
    .flatMap((f) => importsDe(leer(f)).filter((s) => /@\/app\/actions\//.test(s)).map((s) => ({ archivo: f, detalle: s }))),
);

// ── C5 · un módulo «-puro» es puro ─────────────────────────────────────────
// ORDEN.md §2: `lib/*-puro.ts` solo importa tipos; nada de I/O. Se mide sobre
// el código desnudo: `ciclo-estado-puro.ts` nombra un `.sql` en un comentario
// y eso NO es I/O.
comprobar("C5", "lib/**-puro.ts no hace I/O", 0, () =>
  listar("lib", (f) => /-puro\.tsx?$/.test(f))
    .flatMap((f) => {
      const src = leer(f);
      const mal = importsDe(src).filter((s) => /supabase|node:fs|^fs$/.test(s));
      const cuerpo = codigoDesnudo(src);
      const usa = /\bcreateClient\s*\(|\bfetch\s*\(/.test(cuerpo);
      return [
        ...mal.map((s) => ({ archivo: f, detalle: `importa ${s}` })),
        ...(usa ? [{ archivo: f, detalle: "llama a createClient/fetch" }] : []),
      ];
    }),
);

// ── C6 · un script de solo lectura no escribe ──────────────────────────────
// ORDEN.md §4, «regla dura», y existe porque SE VIOLÓ: había `probe-*` que
// vaciaban tablas en producción. Se mide sobre el código desnudo: una suite
// que compara contra la cadena ".delete()" no escribe nada.
//
// Desde el PROMPT V (B4), también el método HTTP: un `fetch` con método DELETE
// escribe sin llamar a `.delete(`, y el código desnudo no lo ve porque el método ES
// una cadena —así vaciaba una tabla `_peligrosos/probe-materia-crud.mjs` con C6 en
// 0—. Esa detección se mide sobre el fuente SIN COMENTARIOS PERO CON CADENAS, y deja
// fuera `_peligrosos/` (lo vigila C18) y `_archivo/` (historia) SOLO en ella: la de
// llamadas sigue recorriendo todo, como antes. (Este comentario no escribe el método
// entre comillas a propósito: el escáner no entiende los literales de regex, y en
// este archivo una comilla dentro de una regex desalinea comentarios y cadenas. Por
// eso las regex nuevas de C6 y C18 escriben las comillas como \x22, \x27 y \x60.)
// El método se reconoce en cualquier caja (fetch pasa a mayúsculas DELETE, POST y
// PUT) y con la clave entre comillas o sin ellas, como en un JSON.
//
// Excepción declarada: una RPC de LECTURA va por POST a `/rest/v1/rpc/`, porque así
// la invoca PostgREST. Cada archivo exceptuado nombra sus funciones y su motivo; si
// llama a una RPC que no está en su lista, el POST cuenta como escritura.
const C6_RPC_DE_LECTURA = {
  "scripts/diag-materias-alumno.mjs": {
    rpcs: ["obtener_perfil_alumno"],
    motivo: "la función solo hace SELECT (supabase/crear-rpc-obtener-perfil-alumno.sql)",
  },
};
function esRpcDeLectura(archivo, fuente, posicion) {
  const excepcion = C6_RPC_DE_LECTURA[archivo];
  if (!excepcion) return false;
  const llamada = fuente.slice(fuente.lastIndexOf("fetch(", posicion), posicion);
  if (!llamada.includes("/rest/v1/rpc/")) return false;
  const llamadas = [
    ...[...fuente.matchAll(/\/rest\/v1\/rpc\/([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ...[...fuente.matchAll(/\brpc\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]),
  ];
  // Una llamada `rpc(x)` cuyo nombre no es un literal no se puede comprobar contra
  // la lista: el POST deja de estar exento (la definición `function rpc(` no cuenta).
  if (/(?<!function\s+)\brpc\(\s*(?![\x22\x27])/.test(fuente)) return false;
  return llamadas.length > 0 && llamadas.every((fn) => excepcion.rpcs.includes(fn));
}
comprobar("C6", "test-/diag-/probe- nunca escriben en la base", 0, () =>
  listar("scripts", (f) => /\/(test|diag|probe)-[^/]+\.mjs$/.test(f))
    .flatMap((f) => {
      const src = leer(f);
      const cuerpo = codigoDesnudo(src);
      const llamadas = [...cuerpo.matchAll(/\.(insert|update|upsert|delete|rpc)\s*\(/g)]
        .map((m) => ({ archivo: f, detalle: `.${m[1]}(` }));
      if (/^scripts\/_(peligrosos|archivo)\//.test(f)) return llamadas;
      const fuente = codigoDesnudo(src, { conservarCadenas: true });
      const metodos = [...fuente.matchAll(/[\x22\x27]?method[\x22\x27]?\s*:\s*[\x22\x27\x60](POST|PUT|PATCH|DELETE)\b/gi)]
        .map((m) => ({ metodo: m[1].toUpperCase(), index: m.index }))
        .filter((m) => !(m.metodo === "POST" && esRpcDeLectura(f, fuente, m.index)))
        .map((m) => ({ archivo: f, detalle: `method ${m.metodo} (línea ${fuente.slice(0, m.index).split("\n").length})` }));
      return [...llamadas, ...metodos];
    }),
);

// ── C7 · la raíz está cerrada ──────────────────────────────────────────────
// ORDEN.md §1: «Nada nuevo en la raíz». Lo permitido es configuración.
const RAIZ_PERMITIDA = new Set([
  "eslint.config.mjs", "next.config.ts", "next-env.d.ts", "postcss.config.mjs", "proxy.ts",
]);
comprobar("C7", "la raíz solo contiene configuración conocida", 0, () =>
  fs.readdirSync(root)
    .filter((f) => /\.(ts|tsx|mjs|js|cjs)$/.test(f) && !RAIZ_PERMITIDA.has(f))
    .map((f) => ({ archivo: f, detalle: "archivo nuevo en la raíz" })),
);

// ── C8 · el I/O no vive en la action ───────────────────────────────────────
// CONTRATO §1 punto 2 y ORDEN.md §2. Empezó siendo TRINQUETE (eran 13 archivos
// con `.from()`). Al cerrar la parte 3 de `PROMPT_CLINE_E` llegó a 0, así que
// pasa a regla DURA: una sola action que hable con Supabase vuelve a fallar.
// Lo ganado queda clavado y ya no hay umbral que apretar.
comprobar("C8", "app/actions/** no habla con Supabase directamente", 0, () =>
  listar("app/actions", ES_TS)
    .filter((f) => /\.from\s*\(/.test(codigoDesnudo(leer(f))))
    .map((f) => ({ archivo: f, detalle: "usa .from()" })),
);

// ── C9 · ningún archivo es intocable ───────────────────────────────────────
// Evaluación 09-08, punto 7. Empezó siendo TRINQUETE (eran 4 archivos, subieron
// a 7). Al cerrar la parte 4 de `PROMPT_CLINE_E` llegó a 0 partiendo los seis
// gigantes por responsabilidad, así que pasa a regla DURA: un archivo nuevo de
// más de 1 000 líneas vuelve a fallar.
const LIMITE_LINEAS = 1000;
comprobar("C9", `ningún archivo de app/ o lib/ supera ${LIMITE_LINEAS} líneas`, 0, () =>
  [...listar("app", ES_TS), ...listar("lib", ES_TS)]
    .map((f) => ({ f, n: leer(f).split("\n").length }))
    .filter((x) => x.n > LIMITE_LINEAS)
    .sort((a, b) => b.n - a.n)
    .map((x) => ({ archivo: x.f, detalle: `${x.n} líneas` })),
);

// ── C10 · todo script está inventariado ────────────────────────────────────
// ORDEN.md §4: «Todo script nuevo: … y una fila en scripts/README.md. Sin eso,
// no está terminado». TRINQUETE: los que faltan son casi todos anteriores a la
// regla. Lo que importa es que no crezca.
comprobar("C10", "todo scripts/*.mjs tiene fila en scripts/README.md", 19, () => {
  const readme = fs.existsSync(path.join(root, "scripts/README.md")) ? leer("scripts/README.md") : "";
  return listar("scripts", (f) => /^scripts\/[^/]+\.mjs$/.test(f))
    .map((f) => path.basename(f))
    .filter((b) => !readme.includes(b))
    .map((b) => ({ archivo: `scripts/${b}`, detalle: "sin fila en README" }));
}, "deuda histórica: la regla es posterior a casi todos");

// ── C11 · una pieza de presentación se define UNA vez ──────────────────────
// ORDEN.md §1: un componente visual sin dominio vive en `app/components/ui/` y
// se IMPORTA; no se vuelve a escribir. Las diez reglas anteriores miden módulos
// TypeScript; ninguna hablaba de composición de UI, y por eso una píldora
// idéntica podía estar copiada en siete paneles sin que nada lo dijera.
//
// TRINQUETE: hoy hay copias de sobra, y bajarlas es F-UX1 (`MATRIZ-UX` §7). Se
// cuenta lo que SOBRA —copias menos una por nombre— y no «nombres duplicados»:
// con nombres, retirar seis de las siete copias de `GreyActionPill` no movería
// el marcador, y el trabajo real no se vería.
//
// Qué es «la misma pieza»: una declaración, exportada o no, cuyo nombre empieza
// por mayúscula. No es un parser: cubre `function X(`, `const X = (` y
// `const X: FC... = (`, que es lo que hay en este repo. `app/components/ui/` es
// el destino, no el problema, y queda fuera; también la cuarentena `_borrador/`.
// Todo se mide sobre `codigoDesnudo()`: mencionar un nombre en un comentario o
// en una cadena NO es definir un componente.
const PIEZA_UI = (f) => /\.tsx$/.test(f) && !f.startsWith("app/components/ui/") && !f.startsWith("app/_borrador/");
comprobar(
  "C11",
  "ningún componente de app/ se define a mano en más de un archivo",
  21,
  () => {
    const porNombre = new Map();
    for (const f of listar("app", PIEZA_UI)) {
      const cuerpo = codigoDesnudo(leer(f));
      const nombres = new Set();
      for (const m of cuerpo.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[<(]/g)) nombres.add(m[1]);
      for (const m of cuerpo.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\(/g)) nombres.add(m[1]);
      for (const n of nombres) {
        if (!porNombre.has(n)) porNombre.set(n, []);
        porNombre.get(n).push(f);
      }
    }
    const sobrantes = [];
    for (const [nombre, archivos] of [...porNombre].sort()) {
      if (archivos.length < 2) continue;
      for (const f of archivos.slice(1)) {
        sobrantes.push({ archivo: f, detalle: `definición sobrante de ${nombre} (${archivos.length} copias)` });
      }
    }
    return sobrantes;
  },
  "docs/sistema/MATRIZ-UX.md §7 (F-UX1) es el plan que las unifica en app/components/ui/",
);

// ── C12 · la entrada de una action se valida contra un esquema ─────────────
// ORDEN.md §2: la action empieza por `exigir()` —eso responde «este rol puede hacer
// esto»— y luego LEE LA ENTRADA. `exigir()` nunca dijo «lo que ha llegado es lo que
// dice ser»: eso lo declara un esquema de `lib/validacion/`, y hasta el PROMPT K cada
// action lo hacía a mano o no lo hacía (34 `formData.get()` en 11 archivos, cada uno
// con su criterio). Y pesa más aquí que en otros repos: las policies de RLS son
// `USING (true)`, así que no hay una segunda red debajo.
//
// DURA, umbral 0: las once actions que leen `FormData` ya pasan por su esquema. Una
// action nueva que lea el formulario a mano vuelve a fallar aquí, que es exactamente
// lo que hace falta para que la duodécima no se olvide. Se mide sobre
// `codigoDesnudo()`: un `formData.get` citado en un comentario no es una lectura.
comprobar("C12", "ninguna action lee formData a mano: valida contra lib/validacion/", 0, () =>
  listar("app/actions", ES_TS).flatMap((f) =>
    [...codigoDesnudo(leer(f)).matchAll(/\bformData\s*\.\s*(get|getAll|entries|has|keys|values)\s*\(/g)].map((m) => ({
      archivo: f,
      detalle: `formData.${m[1]}(`,
    })),
  ),
);

// ── C13 · los imports relativos de lib/ llevan extensión ───────────────────
// ORDEN.md §1b. Desde el PROMPT H-bis las suites cargan `lib/` con Node, que
// ejecuta los `.ts` directamente —sin paso de compilar— y cuyo resolver ESM exige
// la extensión EXACTA. `from "../tables"` no resuelve; `from "../tables.ts"` sí.
//
// Por qué hace falta una regla y no basta con tsc: `allowImportingTsExtensions`
// hace que tsc ACEPTE las dos formas en silencio, y el build también. Quitar una
// extensión deja tsc y build en verde y rompe solo la suite que cargue ese módulo
// —si la hay—, con ERR_MODULE_NOT_FOUND. Comprobado el 2026-09-23 sobre
// `calendario.ts`: tsc exit 0, Node roto. Sin esta regla, H-bis se deshace con el
// primer import nuevo, y nadie lo ve hasta que falla una prueba que no la mira.
//
// Solo `lib/`: es lo único que Node carga. `app/` lo resuelve el bundler de Next.
comprobar("C13", "lib/** importa con extensión explícita: Node carga los .ts sin compilar", 0, () =>
  listar("lib", ES_TS).flatMap((f) =>
    importsDe(leer(f))
      .filter((s) => /^\.\.?\//.test(s) && !/\.(ts|tsx|js|mjs|json)$/.test(s))
      .map((s) => ({ archivo: f, detalle: `import sin extensión: "${s}"` })),
  ),
);

// ── C14 · un "use server" no reexporta listas ──────────────────────────────
// Un archivo `"use server"` solo puede exportar funciones async. Next recorre
// sus `export` para registrarlos como Server Actions, y al compilar con
// Turbopack —lo que hace Vercel— trata CADA nombre de una lista `export { … }`
// o `export type { … }` como una acción: genera `registerServerReference(X, …)`.
// Si X es un tipo, no existe en tiempo de ejecución y el módulo revienta al
// cargarse con `ReferenceError`.
//
// No es teórico. Del 2026-09-17 al 23, producción devolvió 500 en TODAS las
// Server Actions de `/oceano` —mensajes y asistencias se quedaban «cargando»
// para siempre— por tres `export type { … }` que el PROMPT E puso «para no
// romper los imports de la UI». `tsc`, lint, las 40 suites y `next build`
// pasaban: el build termina bien y el fallo es al EVALUAR el módulo. En local
// no se veía porque `npm run dev` usa webpack.
//
// Las declaraciones `export type X = {…}` NO disparan el fallo (medido: de 13
// en archivos "use server", ninguna acabó registrada) y se permiten.
const USE_SERVER = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;
comprobar("C14", "un \"use server\" no reexporta listas: Next las registraría como Server Actions", 0, () =>
  [...listar("app", ES_TS), ...listar("lib", ES_TS)]
    .filter((f) => USE_SERVER.test(leer(f)))
    .flatMap((f) =>
      [...codigoDesnudo(leer(f)).matchAll(/(?:^|\n)\s*export\s+(type\s+)?(\{|\*)/g)].map((m) => ({
        archivo: f,
        detalle: m[2] === "*" ? "export * from …" : `export ${m[1] ? "type " : ""}{ … }`,
      })),
    ),
);

// ── C15 · toda tabla nueva queda clasificada: sistema o materia ────────────
// El descubrimiento de materias es NEGATIVO: `listarTablasMateriasDesdeSupabase`
// ofrece como materia toda tabla que no esté en `TABLAS_SISTEMA`. Una tabla
// nueva que nadie añade ahí aparece en los selectores de materias sin avisar.
// Pasó: el 2026-09-23 había diez colándose (buzón, citas, reportes, constancias,
// mensajes internos…), cada una añadida por un cambio que no sabía de esa lista.
//
// Sin red, así que no mira la base: mira de dónde NACEN las tablas —los
// `create table` de `supabase/*.sql` y los `TABLA_*` de `lib/escolar/tables.ts`—
// y exige que cada una esté en la lista o tenga forma de materia legacy
// (`1ROAMAT001`). Las plantillas `%I` de las RPC que crean materias se saltan.
const { TABLAS_SISTEMA } = await import("../lib/escolar/materia/tablas-sistema.ts");
const FORMA_MATERIA = /^[0-9][A-Z]+MAT[0-9]{3}$/;
function tablasCreadasEnSql(src) {
  const sinComentarios = src.replace(/--[^\n]*/g, "");
  const fuera = [];
  for (const m of sinComentarios.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(?:"([^"]+)"|([A-Za-z_%][A-Za-z0-9_%]*))/gi,
  )) {
    const nombre = m[1] ?? m[2];
    if (!nombre.includes("%")) fuera.push(nombre);
  }
  return fuera;
}
comprobar("C15", "toda tabla que nace en supabase/*.sql o tables.ts está clasificada: no se cuela como materia", 0, () => {
  const sistema = new Set(TABLAS_SISTEMA);
  const clasificada = (t) => sistema.has(t) || FORMA_MATERIA.test(t);
  const desdeSql = listar("supabase", (f) => f.endsWith(".sql")).flatMap((f) =>
    tablasCreadasEnSql(leer(f)).map((t) => ({ archivo: f, tabla: t })),
  );
  const desdeTables = [...leer("lib/escolar/tables.ts").matchAll(/export const TABLA_\w+\s*=\s*"([^"]+)"/g)].map(
    (m) => ({ archivo: "lib/escolar/tables.ts", tabla: m[1] }),
  );
  return [...desdeSql, ...desdeTables]
    .filter((x) => !clasificada(x.tabla))
    .map((x) => ({ archivo: x.archivo, detalle: `«${x.tabla}» no está en materia/tablas-sistema.ts: saldría como materia` }));
});

// ── C16 · cada onConflict literal es una restricción que la base infiere ────
// El fallo del 2026-10-01: los upserts del modelo B apuntaban con `onConflict`
// a un índice único PARCIAL (`where … is not null`) y a uno de EXPRESIÓN
// (`coalesce(clave, '')`). PostgreSQL no infiere ninguno de los dos desde el
// `ON CONFLICT (cols)` que genera PostgREST, así que cada escritura devolvía
// 42P10 y no escribía nada —mientras las suites pasaban en verde, porque su
// doble de Supabase acepta cualquier `onConflict`.
//
// La lógica nació en el último bloque de `test-calificaciones-io.mjs`, mirando
// solo a los tres escritores del modelo B. Aquí se generaliza a todo `lib/`:
// cada `onConflict: "a,b"` literal tiene que coincidir (mismas columnas, en
// cualquier orden) con una restricción declarada en `supabase/*.sql`:
//   · `unique (a, b)` que no sea parte de un `create unique index`;
//   · `create unique index … (a, b)` sin `where` ni expresiones;
//   · una columna `primary key`.
// Se lee el fuente CRUDO, no `codigoDesnudo()`: lo que se mide ES la cadena
// literal, y desnudarla la borraría. Línea base medida: 23 claves literales,
// 0 sin declarar; umbral 0 (DURA).
const normalizarColumnas = (cols) =>
  cols.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean).sort().join(",");

// Quita los dos tipos de comentario de SQL. Solo con `--`, una UNIQUE escrita
// dentro de un `/* … */` contaba como declarada (comprobado en la revisión).
const sinComentariosSql = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

function restriccionesInferibles() {
  const declaradas = new Set();
  for (const f of listar("supabase", (x) => x.endsWith(".sql"))) {
    const sql = sinComentariosSql(leer(f));
    for (const m of sql.matchAll(/(create\s+unique\s+index[^;]*?)?\bunique\s*\(([^)]*)\)/gi)) {
      if (m[1]) continue;
      declaradas.add(normalizarColumnas(m[2]));
    }
    for (const m of sql.matchAll(/create\s+unique\s+index[^;(]*\(([^;]*?)\)([^;]*);/gi)) {
      if (/\bwhere\b/i.test(m[2]) || /\(/.test(m[1])) continue;
      declaradas.add(normalizarColumnas(m[1]));
    }
    for (const m of sql.matchAll(/\b([a-z_][a-z0-9_]*)\s+[a-z_][a-z0-9_]*(?:\s*\([^)]*\))?\s+primary\s+key/gi)) {
      declaradas.add(normalizarColumnas(m[1]));
    }
    for (const m of sql.matchAll(/(?:constraint\s+[a-z_][a-z0-9_]*\s+)?primary\s+key\s*\(([^)]*)\)/gi)) {
      declaradas.add(normalizarColumnas(m[1]));
    }
  }
  return declaradas;
}

// Las dos claves NO literales de `asistencia-plantillas.ts` salen de constantes
// de `atribucion-profesor.ts` y sus índices se crean con SQL dinámico
// (`CREATE UNIQUE INDEX %I ON … (%s)`): índices simples e inferibles, que
// asistencias ya usa en producción. Van en esta lista con su motivo, como hace
// `test-auditoria-permisos` con las suyas.
const ONCONFLICT_NO_LITERAL_PERMITIDO = new Set([
  "atribuido.conflictoClases", // índice simple creado con SQL dinámico en agregar-atribucion-profesor-asistencia.sql
  "atribuido.conflictoAsistencia", // ídem
]);

// LO QUE NO PUEDE SABER: si esa restricción está APLICADA en la base. Mide el
// repo, no Supabase. El 2026-10-01 estuvo en verde con
// `corregir-unicidad-calificaciones.sql` escrito y todavía sin aplicar, es
// decir, con todas las escrituras del modelo B devolviendo 42P10. Verde aquí
// significa «la clave está bien declarada»; «funciona» lo dice
// `node scripts/migrar-ensayo-modelo-b.mjs --apply` o `diag-sql-aplicado.mjs`.
comprobar("C16", "cada onConflict literal en lib/ apunta a una restricción inferible DECLARADA en supabase/", 0, () => {
  const declaradas = restriccionesInferibles();
  const hallazgos = [];
  for (const f of listar("lib", ES_TS)) {
    const src = leer(f);
    for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      if (!declaradas.has(normalizarColumnas(m[1]))) {
        hallazgos.push({ archivo: f, detalle: `onConflict «${m[1]}» no es una restricción inferible en supabase/` });
      }
    }
    for (const m of src.matchAll(/onConflict:\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*[},]/g)) {
      if (!ONCONFLICT_NO_LITERAL_PERMITIDO.has(m[1])) {
        hallazgos.push({ archivo: f, detalle: `onConflict no literal «${m[1]}» sin excepción declarada` });
      }
    }
  }
  return hallazgos;
});

// ── C17 · npm run test:ci reproduce el workflow de GitHub ──────────────────
// `test:ci` corría suites, gen-invariantes, gen-rumbo, verificar:estado y
// verificar:docs. El workflow (`.github/workflows/verificacion.yml`) corre
// ADEMÁS tsc, lint, test:permisos, gen-matriz-permisos --check y build. Son
// dos listas de lo mismo y ya divergieron (R6): con `test:ci` en verde,
// `gen-matriz` estuvo desfasado dos commits seguidos.
//
// La regla lee los `run:` del workflow y el `test:ci` de `package.json`, y
// falla si un paso del workflow (salvo `npm ci`) no está en `test:ci`. Compara
// por comando normalizado: `npm run x` y el script al que `x` apunta cuentan
// como el mismo. Umbral 0 (DURA).
const PKG = JSON.parse(leer("package.json"));
const RUN_DEL_WORKFLOW = [...leer(".github/workflows/verificacion.yml").matchAll(/^\s*run:\s*(.+?)\s*$/gm)].map((m) =>
  m[1].trim(),
);

function comandosDeScript(script) {
  const fuera = [];
  for (const parte of script.split("&&")) {
    const c = parte.trim();
    if (!c) continue;
    const m = /^npm\s+run\s+([A-Za-z0-9:_-]+)/.exec(c);
    if (m && PKG.scripts[m[1]]) fuera.push(...comandosDeScript(PKG.scripts[m[1]]));
    else fuera.push(c);
  }
  return fuera;
}

comprobar("C17", "npm run test:ci corre los mismos pasos que el workflow (salvo npm ci)", 0, () => {
  const enTestCi = new Set(comandosDeScript(PKG.scripts["test:ci"]));
  const hallazgos = [];
  for (const c of RUN_DEL_WORKFLOW) {
    if (c === "npm ci") continue;
    for (const atomico of comandosDeScript(c)) {
      if (!enTestCi.has(atomico)) hallazgos.push({ archivo: ".github/workflows/verificacion.yml", detalle: `«${c}» falta en test:ci` });
    }
  }
  return hallazgos;
});

// ── C18 · la cuarentena no se puede desarmar ───────────────────────────────
// PROMPT V (B2). `scripts/_peligrosos/` guarda scripts que escriben o borran en
// producción sin guarda. Hasta el 2026-10-04 no arrancaban solo porque buscaban
// `scripts/.env.local`, que no existe: «arreglar» esa ruta los armaba. Ahora su
// primera sentencia tras los `import` lanza, y esta regla exige que siga ahí.
//
// Lee el fuente CRUDO, no `codigoDesnudo()`: lo que se comprueba es la línea con su
// cadena, y desnudarla la borraría. DURA. Una carpeta sin scripts también falla: un
// guardián que mide 0 archivos no protege nada.
const LINEA_CUARENTENA = 'throw new Error("CUARENTENA: no se ejecuta. Ver scripts/README.md");';
function primeraSentenciaTrasImports(src) {
  let i = src.startsWith("#!") ? src.indexOf("\n") + 1 : 0;
  if (i === 0 && src.startsWith("#!")) return "";
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    const resto = src.slice(i, i + 12);
    let fin; // último carácter de lo que se salta (comentario o import)
    if (resto.startsWith("//")) fin = src.indexOf("\n", i);
    else if (resto.startsWith("/*")) fin = src.indexOf("*/", i + 2) + 1;
    else if (/^import\b(?!\s*[.(])/.test(resto)) {
      // El import acaba en su especificador, con `;` opcional, y no en el primer `;`
      // del archivo: sin `;`, aquel se tragaba la sentencia siguiente y el throw podía
      // ir segundo. Una forma que no reconoce devuelve -1, y C18 falla.
      const m = /^import\b[^\x22\x27\x60;]*?[\x22\x27][^\x22\x27\n]+[\x22\x27][^\S\n]*;?/.exec(src.slice(i));
      fin = m ? i + m[0].length - 1 : -1;
    }
    else {
      const salto = src.indexOf("\n", i);
      return src.slice(i, salto < 0 ? src.length : salto).trimEnd();
    }
    if (fin <= 0) return "";
    i = fin + 1;
  }
}
comprobar("C18", "todo scripts/_peligrosos/ lanza antes de ejecutar nada: la cuarentena no se desarma", 0, () => {
  const archivos = listar("scripts/_peligrosos", (f) => /\.(mjs|cjs|js)$/.test(f));
  if (archivos.length === 0) {
    return [{ archivo: "scripts/_peligrosos/", detalle: "no hay scripts que vigilar: ¿se movió la cuarentena?" }];
  }
  return archivos
    .filter((f) => primeraSentenciaTrasImports(leer(f)) !== LINEA_CUARENTENA)
    .map((f) => ({ archivo: f, detalle: "la primera sentencia tras los import no es el throw de CUARENTENA" }));
});

// ── Informe ────────────────────────────────────────────────────────────────

if (JSON_OUT) {
  const reglas = resultados.map((r) => ({
    id: r.id,
    regla: r.regla,
    modo: r.umbral === 0 ? "dura" : "trinquete",
    umbral: r.umbral,
    actual: r.hallazgos.length,
    estado:
      r.hallazgos.length > r.umbral ? (r.umbral === 0 ? "falla" : "subio")
      : r.hallazgos.length < r.umbral ? "bajo" : "ok",
    deuda: r.deuda ?? null,
    archivos: r.hallazgos.map((h) => `${h.archivo} — ${h.detalle}`),
  }));
  process.stdout.write(JSON.stringify({ medido: new Date().toISOString(), reglas }, null, 2) + "\n");
  process.exit(reglas.some((r) => r.estado === "falla" || r.estado === "subio") ? 1 : 0);
}

console.log("ORDEN.md — comprobación mecánica\n");

let fallos = 0;
let aflojar = 0;

for (const r of resultados) {
  const n = r.hallazgos.length;
  const dura = r.umbral === 0;
  const mal = n > r.umbral;
  const mejor = !dura && n < r.umbral;

  let marca;
  if (mal) marca = dura ? "FALLA" : "SUBIÓ";
  else if (mejor) marca = "BAJÓ";
  else marca = "ok";

  const cifra = dura ? `${n}` : `${n}/${r.umbral}`;
  console.log(`  ${marca.padEnd(6)} ${r.id}  ${r.regla}  ·  ${cifra}`);

  if (mal) {
    fallos++;
    const muestra = DETALLE ? r.hallazgos : r.hallazgos.slice(0, 6);
    for (const h of muestra) console.log(`         ${h.archivo}  —  ${h.detalle}`);
    if (!DETALLE && r.hallazgos.length > 6) {
      console.log(`         … y ${r.hallazgos.length - 6} más (--detalle para verlos)`);
    }
    if (r.deuda) console.log(`         deuda declarada: ${r.deuda}`);
  } else if (mejor) {
    aflojar++;
    console.log(`         bajó de ${r.umbral} a ${n}: ajusta el umbral en este archivo para que no vuelva a subir.`);
  } else if (DETALLE && n > 0) {
    for (const h of r.hallazgos) console.log(`         ${h.archivo}  —  ${h.detalle}`);
  }
}

console.log();
if (fallos > 0) {
  console.log(`${fallos} regla(s) incumplida(s). Una regla DURA no admite excepciones;`);
  console.log("un TRINQUETE solo falla si la deuda sube, y bajarla es el trabajo, no el obstáculo.");
  process.exit(1);
}
if (aflojar > 0) {
  console.log(`Todo en orden. ${aflojar} umbral(es) se pueden apretar: la deuda bajó y nadie lo registró.`);
} else {
  console.log(`Todo en orden: ${resultados.length} reglas comprobadas.`);
}
