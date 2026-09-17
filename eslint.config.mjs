import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ARTEFACTOS DE COMPILACION de las suites puras: `npm run test:compilar`
    // deja ahi el JS CommonJS de los modulos TS. No es codigo del repo (esta
    // gitignorado) y lintarlo generaba 135 de los 151 errores del 2026-09-16,
    // enterrando los ~29 hallazgos reales de app/ y lib/. Ver
    // docs/sistema/PENDIENTES-2026-09-16.md §1.
    "scripts/.tmp-*/**",
    // CODIGO QUE NO SE MANTIENE, y por eso no se lint-ea (PROMPT F, 2026-09-16).
    // Lint-earlo llenaba la salida con hallazgos de archivos que nadie va a
    // tocar —incluido un `require()` y un `setState` en cuarentena— y enterraba
    // los del codigo vivo: de los 17 errores del punto de partida, 2 estaban
    // aqui. Los dos primeros vienen de ORDEN.md §4 (`_archivo/`: un solo uso ya
    // consumido, no re-ejecutar; `_peligrosos/`: no se ejecutan ni se
    // mantienen). Los dos ultimos son la cuarentena explicita `_borrador/`, cuya
    // resolucion archivo por archivo es el resultado esperado R-4 del Prompt F:
    // los globs se quedan aunque las carpetas desaparezcan, para que un
    // `_borrador/` futuro no vuelva a llenar la salida.
    "scripts/_archivo/**",
    "scripts/_peligrosos/**",
    "app/_borrador/**",
    "lib/_borrador/**",
  ]),
]);

export default eslintConfig;
