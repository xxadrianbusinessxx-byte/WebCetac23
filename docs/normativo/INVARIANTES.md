# INVARIANTES — 16 principios, uno por línea

**Generado por `node scripts/gen-invariantes.mjs` — no editar a mano.** El § es esa sección
de `filosofia.estructural`: fuente y porqué; `docs/00-INDICE.md` sigue mandando allí.

| § | INVARIANTE |
|---|---|
| §1 | Un bloque se reemplaza, desactiva o evoluciona sin obligar a tocar código no relacionado. |
| §2 | Un módulo tiene fuente de datos propia, dependencias explícitas y contrato de salida estable. |
| §3 | Un módulo no lee datos de otro para adivinar información que ya tiene una fuente oficial. |
| §4 | Ningún módulo crea una segunda fuente «porque es más fácil» ni inventa datos de otro módulo. |
| §5 | La identidad académica se obtiene exclusivamente del catálogo: nunca de ETIQUETAS PERSONALES. |
| §6 | Un campo con significado fijo vive en los datos personales, nunca como etiqueta. |
| §7 | Ocultar un botón no es autorización: toda escritura valida sesión, rol y alumno en el servidor. |
| §8 | La UI no accede a detalles internos de otro módulo: llama Server Actions, dominio o RPC. |
| §9 | Toda migración es idempotente y no borra el legacy en el mismo paso: primero se verifica. |
| §10 | Se añaden claves antes que renombrarlas; si un contrato cambia, migran sus consumidores. |
| §11 | Antes de crear una consulta se revisa la existente, y se agrupa en lote, nunca en bucles 1×N. |
| §12 | La importación reutiliza lectura y mapeo, y valida todo antes de escribir. |
| §13 | Un flag de desactivación no reemplaza la autorización: si el módulo escribe, la action valida. |
| §14 | El código viejo se marca @deprecated con su alternativa; un fallback de identidad no se amplía. |
| §15 | Los documentos no se duplican entre sí: el estado lo dice ESTADO-ACTUAL.md, no este archivo. |
| §16 | No se optimiza una capa si el costo es de otra: primero se mide la capa responsable. |
