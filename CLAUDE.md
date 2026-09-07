# CLAUDE.md

Este proyecto tiene un único punto de entrada para agentes: **`AGENTS.md`**.
Léelo primero. Este archivo existe solo para que Claude Code arranque igual que Cline,
sin duplicar reglas (duplicarlas garantiza que se desincronicen).

## Arranque

1. `AGENTS.md` — orden de autoridad y reglas de trabajo.
2. `ESTADO-ACTUAL.md` — qué es verdad hoy.
3. `docs/00-INDICE.md` — **qué más leer según la tarea, y qué no leer.**

No cargues documentación «por si acaso»: el índice existe para no gastar contexto.
Si el índice no te lleva a lo que necesitas, arréglalo — no compenses leyendo todo.

## Antes de ejecutar cualquier script

`scripts/README.md` es obligatorio. Hay scripts con nombre inofensivo (`probe-*`,
`verificar-*`) que **vacían tablas en producción**. Están aislados en
`scripts/_peligrosos/`. No hay staging: lo que toques, lo tocas en real.

## Reparto de trabajo

Claude diagnostica, mide y redacta el prompt. **Cline (DeepSeek) implementa.**
Al redactar un prompt: seguir `criterios.prompts` y cerrar con el bloque de
`docs/normativo/CONTRATO-DE-CAMBIO.md` §1.
