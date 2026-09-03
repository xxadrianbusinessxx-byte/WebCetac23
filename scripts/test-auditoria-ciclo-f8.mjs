// test-auditoria-ciclo-f8.mjs — FASE 8: autoridad única de activación.
// Solo lectura del filesystem.
// Uso: node scripts/test-auditoria-ciclo-f8.mjs

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

const cicloEstado = leer("lib/escolar/ciclo-estado.ts");
const evalLib = leer("lib/escolar/evaluaciones.ts");
const evalAction = leer("app/actions/evaluaciones.ts");
const rpcSql = leer("supabase/crear-rpc-activar-ciclo-f4.sql");

// 1) Flujo nuevo = RPC único.
ok("ciclo-estado exporta activarCicloOperativoAtomico", /export async function activarCicloOperativoAtomico/.test(cicloEstado));
ok("helper invoca RPC con p_periodo", /supabase\.rpc\("activar_ciclo_operativo", \{\s+p_periodo: periodoId/.test(cicloEstado));
ok("sin fallback multi-paso: error explícito si RPC ausente", /no se permite la secuencia multi-paso/.test(cicloEstado));
ok("lib evaluaciones usa activación atómica (setActivoCiclo)", evalLib.includes("activarCicloOperativoAtomico(supabase, periodoId)"));
ok("lib evaluaciones ya no invoca activarCicloOperativo TS en activación", !/activarCicloOperativo\(supabase, periodoId\)/.test(evalLib));
ok("Server Action conserva autorización directivo", /sesion\?\.rol !== "directivo"/.test(evalAction));

// 2) Una sola autoridad de escritura de activación.
ok("existe UNA función atómica nueva", (cicloEstado.match(/export async function activarCicloOperativoAtomico/g) ?? []).length === 1);
ok("sin vigente en flujo de activación", !/vigente/.test(cicloEstado + evalLib + rpcSql));

// 3) RPC recibe periodo uuid y fija estado/activo espejo.
ok("RPC firma con uuid", /activar_ciclo_operativo\(p_periodo uuid\)/.test(rpcSql));
ok("RPC establece estado=operativo + activo=true", /estado = 'operativo'/.test(rpcSql) && /activo = TRUE/.test(rpcSql));
ok("RPC desactiva anteriores (activo=false, historico)", /estado = 'historico'/.test(rpcSql));
ok("RPC idempotente (ya único operativo)", /ya es el único OPERATIVO/.test(rpcSql));

// 4) auditoría/rollback.
ok("RPC registra transición dentro de la transacción (no bloqueante)", /INSERT INTO public\.ciclo_transiciones/.test(rpcSql) && /EXCEPTION WHEN OTHERS THEN NULL/.test(rpcSql));
ok("RPC usa BEGIN/ROLLBACK implícitos (función plpgsql)", /LANGUAGE plpgsql/.test(rpcSql));

// 5) activo de entidades hijas sin semántica global.
ok("RPC sincroniza inscripciones solo por relación (grupos del periodo)", /UPDATE public\.inscripciones_alumno/.test(rpcSql) && !/vigente/.test(rpcSql));

console.log(`\nFASE 8 AUDITORIA: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
