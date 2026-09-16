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
  ]),
]);

export default eslintConfig;
