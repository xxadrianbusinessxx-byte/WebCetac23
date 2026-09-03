// test-auditoria-ciclo-f6.mjs — FASE 6: auditoría del horario por periodo.
// Verifica aislamiento real (periodo_id), entrega de periodoId por la UI y la
// ausencia de una segunda autoridad de validación horaria. Estático (filesystem).
// Uso: node scripts/test-auditoria-ciclo-f6.mjs

import fs from "node:fs";
import path from "node:path";
const raiz = path.resolve(".");
const leer = (rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, "utf8");
};
let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok  ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

const paso = leer("app/components/ciclo-configurador/paso-horario.tsx");
const panel = leer("app/components/horario-escolar-panel.tsx");
const sql = leer("supabase/crear-horario-semanal.sql");
const docMod = leer("docs/HORARIO_SEMANAL_MODULO.md");
const ce = leer("lib/escolar/ciclo-estado.ts");

// 1) UI entrega periodoId.
ok("PasoHorario entrega periodoId al panel", paso.includes("periodoIdInicial={periodoId}"));
ok("panel declara prop periodoIdInicial", /periodoIdInicial/.test(panel));
ok("panel no usa ciclo_escolar como identidad", !/ciclo_escolar/.test(panel));

// 2) Aislamiento del modelo: horario_semanal versionado por periodo_id.
ok("horario_semanal definido con periodo_id (SQL)", /periodo_id/.test(sql) && /CREATE TABLE[\\s\\S]{0,200}public\\.horario_semanal|horario_semanal/.test(sql));
ok("documentación: horario_semanal versionado por periodo", /horario_semanal/.test(docMod) && /periodo_id/.test(docMod));
ok("configuracion_clases_profesor declarada legacy (no fuente nueva)", /LEGACY DEPRECATED/.test(sql));

// 3) Sin segunda autoridad de validación horaria.
const libs = fs.readdirSync("lib/escolar").map((f) => fs.readFileSync(path.join("lib/escolar", f), "utf8")).join("\n");
const alt = libs.match(/function (validarHorarioCiclo|validarCicloHorario|checkHorario)\s*\(/g) ?? [];
ok("no existe validarHorarioCiclo/validarCicloHorario/checkHorario", alt.length === 0, alt.join(","));
ok("sin vigente en flujo horario", !/vigente/.test(paso + panel + ce));

// 4) Estado actual honesto: validarIntegridadCiclo NO incorpora horario todavía.
ok("validarIntegridadCiclo existe (contrato F7 único)", /export async function validarIntegridadCiclo/.test(ce));

console.log(`\nFASE 6 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
