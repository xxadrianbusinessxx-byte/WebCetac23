# CLAUDE.md

Este proyecto tiene un único punto de entrada para agentes: **`AGENTS.md`**.
Todo está ahí: orden de arranque, orden de autoridad, reglas de trabajo,
reparto Claude / Cline y presupuesto de contexto. La línea siguiente lo importa
entero al iniciar cada sesión de Claude Code:

@AGENTS.md

El import es necesario: Claude Code solo lee `AGENTS.md` por su cuenta cuando no
existe `CLAUDE.md`, y aquí existen los dos (documentación de memoria de Claude
Code, 2026-10-31; en Windows se prefiere el import a un enlace simbólico).

Este archivo no repite ninguna de esas reglas **a propósito**. Existe solo
porque Claude Code busca `CLAUDE.md` y Cline busca `AGENTS.md`. Duplicar la
regla garantiza que las dos copias se desincronicen — es la R6 del propio repo
(`docs/normativo/REGLAS_NO_HACER.md`), aplicada a la documentación.

**Si vas a añadir algo aquí: va en `AGENTS.md`.**
