# AGENTS.md — Punto de entrada para agentes de IA

Antes de analizar o modificar el repositorio:

1. leer `contexto.feliz`
2. leer `filosofia.estructural`
3. leer `criterios.prompts`
4. leer `docs/REGLAS_NO_HACER.md`

Después, leer documentación especializada solo si el trabajo pertenece a ese
dominio (`docs/`).

## Orden de autoridad

1. código y estado real del repositorio
2. reglas arquitectónicas permanentes
3. reglas de no hacer (`docs/REGLAS_NO_HACER.md`)
4. contexto funcional
5. historial/documentación técnica
6. prompt actual

## Reglas de trabajo

- No asumir que documentación histórica describe el estado actual: medir y
  analizar (consultas de solo lectura, `scripts/`) antes de modificar cuando el
  cambio sea importante.
- No crear sistemas paralelos cuando exista una fuente de verdad existente
  (p. ej. `periodos` para ciclos; `inscripciones_alumno` para alumno→grupo).
- No ejecutar migraciones destructivas sin autorización explícita; los cambios
  de datos deben ser mínimos, reversibles, explicados y verificables.
- Al terminar, validar (`npx tsc --noEmit`, eslint/build según aplique) y
  documentar cualquier cambio arquitectónico relevante.
