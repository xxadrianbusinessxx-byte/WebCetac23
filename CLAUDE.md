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

Claude diagnostica, mide, redacta el prompt **y revisa lo entregado**.
**Cline (DeepSeek) implementa.** El bucle completo y el presupuesto de contexto
de cada agente están en `AGENTS.md` §Reparto — no se duplican aquí.

Al redactar un prompt: **generar el paquete, no escribirlo a mano.**

```bash
node scripts/gen-contexto-cline.mjs --tarea=crear <archivos que se van a tocar>
```

Sale con el presupuesto de lectura, la capa de cada archivo, las suites que lo
cubren, los términos del glosario que aplican y el bloque del CONTRATO §1.

## Antes de dar por bueno lo que entregó Cline

```bash
node scripts/test-orden.mjs        # capas, nombres, scripts, raíz
npm run test:ci                    # suites + ESTADO-ACTUAL al día
```

`test-orden.mjs` es la mitad mecánica de `ORDEN.md`. Lo que no alcanza, se
revisa contra el checklist de `docs/normativo/CONTRATO-DE-CAMBIO.md` §2.
**Nunca bajes un umbral de `test-orden.mjs` para que pase**: eso apaga el
guardián y es una decisión de arquitectura disfrazada de arreglo.
