// test-activacion-ciclo-f8.mjs — F8 TEST DE CONTRATO (mocks en memoria).
// NO demuestra atomicidad real de PostgreSQL: solo valida el contrato del
// flujo nuevo (helper → RPC) y el manejo de errores de la RPC.
//
// Compilar primero:
//   npx tsc lib/escolar/ciclo-estado.ts lib/escolar/ciclo-estado-puro.ts --rootDir lib/escolar ^
//     --outDir scripts/.tmp-f8 --module commonjs --target es2020 --moduleResolution node ^
//     --esModuleInterop --skipLibCheck
//   node scripts/test-activacion-ciclo-f8.mjs

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-f8");
const CE = require(path.join(dir, "ciclo-estado.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok  ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}
function clienteRpc(handler) {
  return { rpc: handler };
}

/* Caso 1 — RPC disponible: éxito y passthrough del mensaje SQL. */
{
  const sb = clienteRpc(async (fn, args) => {
    ok("caso1: llama a la función exacta", fn === "activar_ciclo_operativo" && args.p_periodo === "B");
    return { data: "ciclo 2027-2028 activado como operativo (exclusivo). Otros desactivados: 1", error: null };
  });
  const r = await CE.activarCicloOperativoAtomico(sb, "B");
  ok("caso1: ok + rpc=true + mensaje SQL propagado", r.ok && r.rpc && /exclusivo/.test(r.mensaje ?? ""), JSON.stringify(r));
}
/* Caso 2 — RPC ausente: error explícito, sin mutaciones (contrato multi-paso vetado). */
{
  let muto = false;
  const sb = {
    rpc: async () => ({ data: null, error: { message: 'function activar_ciclo_operativo(uuid) does not exist (PGRST202)' } }),
    from: () => { muto = true; },
  };
  const r = await CE.activarCicloOperativoAtomico(sb, "A");
  ok("caso2: falla con error explícito de despliegue", !r.ok && r.rpc === false && /no está disponible/.test(r.error ?? ""), JSON.stringify(r));
  ok("caso2: nunca tocó la capa REST (sin secuencia)", muto === false);
}
/* Caso 3 — error real de la RPC se propaga sin transformarse. */
{
  const sb = clienteRpc(async () => ({ data: null, error: { message: "no se puede reactivar un ciclo historico (2025-2026)" } }));
  const r = await CE.activarCicloOperativoAtomico(sb, "HI");
  ok("caso3: error RPC propagado", !r.ok && r.rpc === true && /historico/.test(r.error ?? ""), JSON.stringify(r));
}

console.log(`\nF8 ACTIVACION (CONTRATO): ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
