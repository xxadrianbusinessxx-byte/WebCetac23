/**
 * compilar-suites.mjs — recompila los módulos puros que consumen las suites.
 *
 * Las suites (`test-*.mjs`) importan JS ya compilado desde las carpetas `scripts/.tmp-*`.
 * Esas carpetas están en `.gitignore`, así que en un clon limpio —o después de
 * borrarlas— las suites fallan con ERR_MODULE_NOT_FOUND hasta recompilar.
 *
 * Antes, el comando de compilación de cada suite vivía solo en un comentario de
 * su cabecera. Aquí están todos, en un único lugar ejecutable.
 *
 * Uso:
 *   node scripts/compilar-suites.mjs           # compila todo
 *   node scripts/compilar-suites.mjs fechas    # compila solo lo que haga match
 *
 * Solo lee `lib/` y escribe en las carpetas `scripts/.tmp-*`. No toca la base de datos.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** salida → módulos de lib/escolar que hay que compilar ahí */
const SUITES = {
  // `.tmp-fechas` ya no está: `test-fechas.mjs` importa `lib/escolar/fechas.ts`
  // directamente y Node lo ejecuta solo (PROMPT H, parte 1). Es la única suite
  // que puede: su módulo no tiene imports relativos. Las 38 restantes siguen
  // aquí porque el resolver ESM de Node exige la extensión exacta en cada
  // import relativo y `lib/` los escribe sin extensión.
  ".tmp-asistencia-parciales": ["asistencia/asistencia-parcial.ts"],
  ".tmp-atribucion-profesor": ["asistencia/atribucion-profesor.ts"],
  ".tmp-evaluaciones": ["ciclo/evaluaciones.ts", "horario/horario-importar.ts", "ciclo/contexto-ciclo.ts"],
  ".tmp-justificacion-clase": ["asistencia/justificaciones.ts"],
  ".tmp-reparar-tabla-legacy": ["ciclo/contexto-ciclo.ts"],
  ".tmp-ctx": ["asistencia/asistencia-contexto.ts"],
  ".tmp-rv": ["catalogo/roster-validacion.ts"],
  ".tmp-cal": ["ciclo/calendario.ts"],
  ".tmp-ciclo-estado": ["ciclo/ciclo-estado.ts", "ciclo/ciclo-estado-puro.ts", "ciclo/orquestador-ciclo.ts"],
  ".tmp-insc-f3": ["catalogo/inscripciones-borrador.ts"],
  ".tmp-f8": ["ciclo/ciclo-estado.ts", "ciclo/ciclo-estado-puro.ts"],
  ".tmp-f5": ["ciclo/calendario.ts"],
  ".tmp-orden-alumnos": ["alumno/orden-alumnos.ts"],
  };

const FLAGS_TSCONFIG = [
  ["noEmit", false],
  ["module", "commonjs"],
  ["moduleResolution", "node"],
  ["target", "es2020"],
  ["isolatedModules", false],
  ["incremental", false],
  ["declaration", false],
];

const filtro = process.argv[2] ?? "";
const objetivos = Object.entries(SUITES).filter(
  ([salida, mods]) =>
    !filtro || salida.includes(filtro) || mods.some((m) => m.includes(filtro)),
);

if (objetivos.length === 0) {
  console.error(`Sin coincidencias para "${filtro}". Salidas: ${Object.keys(SUITES).join(", ")}`);
  process.exit(1);
}

let fallos = 0;
for (const [salida, modulos] of objetivos) {
  // Se compila con un tsconfig que EXTIENDE el del proyecto: un `npx tsc archivo.ts`
  // suelto no lee tsconfig.json y por tanto no resuelve el alias `@/`.
  // Las suites hacen require() del JS resultante, así que la salida es CommonJS.
  const cfg = {
    extends: "../tsconfig.json",
    compilerOptions: {
      ...Object.fromEntries(FLAGS_TSCONFIG),
      rootDir: "../lib/escolar",
      outDir: salida,
      baseUrl: "..",
      paths: { "@/*": ["./*"] },
    },
    // `include: []` es imprescindible: sin el, se hereda el include global del
    // tsconfig del proyecto y cada invocacion compila el repo entero.
    include: [],
    files: modulos.map((m) => `../lib/escolar/${m}`),
  };
  const cfgPath = path.join(raiz, "scripts", ".tsconfig.suite.json");
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  try {
    execFileSync("npx", ["tsc", "-p", cfgPath], { cwd: raiz, stdio: "pipe", shell: true });
    console.log(`ok   ${salida.padEnd(28)} ${modulos.join(", ")}`);
  } catch (e) {
    fallos++;
    const salidaErr = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    console.error(`FALLO ${salida.padEnd(27)} ${modulos.join(", ")}`);
    if (salidaErr) console.error(salidaErr.split("\n").slice(0, 6).map((l) => `      ${l}`).join("\n"));
  } finally {
    fs.rmSync(cfgPath, { force: true });
  }
}

console.log(`\n${objetivos.length - fallos}/${objetivos.length} compiladas.`);
process.exit(fallos > 0 ? 1 : 0);
