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

// 5) F6.1 — horario integrado en validarIntegridadCiclo (reglas demostrables).
ok("validarIntegridadCiclo consulta horario_semanal", ce.includes("TABLA_HORARIO_SEMANAL") && ce.includes('.eq("periodo_id", periodoId)'));
ok("esquema real documentado: dia/hora/materia/profesor (DDL)", /dia_semana text NOT NULL/.test(sql) && /hora_inicio time NOT NULL/.test(sql) && /hora_fin time NOT NULL/.test(sql) && /materia_clave text NOT NULL/.test(sql) && /profesor_clave text/.test(sql));
ok("UNIQUE natural documentada (sin inventar duplicado exacto)", /UNIQUE \(periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave\)/.test(sql));
ok("sin_horario es ADVERTENCIA", /codigo: "sin_horario"/.test(ce));
ok("grupo inexistente del horario es ERROR", /codigo: "horario_grupo_invalido"/.test(ce));
ok("solape de grupo detectado", /codigo: "horario_grupo_solapado"/.test(ce));
ok("solape de profesor detectado (clave NO NULL)", /codigo: "horario_profesor_solapado"/.test(ce));
ok("conteos de validación incluyen horarios", /horarios: bloques\.length/.test(ce));

console.log(`\nFASE 6 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
