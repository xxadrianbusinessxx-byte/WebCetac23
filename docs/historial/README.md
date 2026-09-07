# docs/historial/ — pasado, no presente

**Nada de esta carpeta describe el estado actual del sistema.** Cada documento fue
cierto el día que se escribió y no se ha vuelto a verificar desde entonces.

## Regla

- ❌ No citar como fuente de verdad.
- ❌ No usar para decidir qué está implementado o qué falta.
- ✅ Usar solo para responder **«¿por qué se hizo así?»** y recuperar el razonamiento
  de una decisión pasada.

Para saber qué es verdad hoy: `ESTADO-ACTUAL.md`, el código, o un diagnóstico de
`scripts/` (columna LEE en `scripts/README.md`).

> **Las rutas citadas dentro de estos documentos son las de su época** (`docs/X.md`,
> antes de la reorganización de septiembre de 2026). No se corrigieron a propósito:
> reescribir un documento histórico falsifica el registro. Si una ruta no resuelve,
> buscar el archivo por su nombre — sigue existiendo, en otra carpeta.

## Contenido

| Carpeta | Qué guarda |
|---|---|
| `auditorias/` | Incidente P0, diseño P1, fases F1–F10, auditorías de ciclo por fase, cierres de unificación. |
| `informes/` | Resultado de cada prompt ya ejecutado: qué se cambió y cómo se validó. |
| `prompts/` | Los prompts que se le enviaron a Cline, tal cual. Sirven de plantilla para escribir los siguientes. |
| `OPTIMIZACION_RENDIMIENTO_400_500.md` | Benchmark real con 461 alumnos (1 928 líneas). Las **mediciones** siguen siendo válidas y son difíciles de reproducir; las **recomendaciones** pueden estar aplicadas ya. Leer solo la sección que aplique. |

## Dónde archivar lo nuevo

Al terminar un trabajo: el informe va a `informes/`, el prompt usado a `prompts/`.
Lo que cambie el estado del sistema se refleja en `ESTADO-ACTUAL.md`, no aquí.
