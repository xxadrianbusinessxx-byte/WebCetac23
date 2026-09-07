# AGENTS.md — Punto de entrada para agentes de IA

## Lectura de arranque (obligatoria, ~35 KB)

1. `ESTADO-ACTUAL.md` — qué es verdad hoy
2. `docs/normativo/REGLAS_NO_HACER.md` — R1–R8, las prohibiciones permanentes
3. `docs/normativo/GLOSARIO.md` — los términos donde el sistema ya se rompió
4. `docs/00-INDICE.md` — qué leer después, según la tarea

**No leas más que eso al arrancar.** `docs/00-INDICE.md` tiene un presupuesto de
lectura por tipo de tarea; síguelo. Cargar documentación «por si acaso» consume la
mitad de la ventana antes de escribir una línea, y en este repo hay ~500 KB de docs.

Antes de **crear** un archivo, funcion, script o SQL: leer `docs/normativo/ORDEN.md`.
Dice donde va cada cosa y que puede importar que.

Antes de ejecutar cualquier cosa de `scripts/`: leer `scripts/README.md`.
Hay scripts que borran tablas en producción y no lo dice su nombre.

## Orden de autoridad

1. código y estado real del repositorio
2. reglas arquitectónicas permanentes (`filosofia.estructural`)
3. reglas de no hacer (`docs/normativo/REGLAS_NO_HACER.md`)
4. contexto funcional (`ESTADO-ACTUAL.md`)
5. historial y documentación técnica (`docs/historial/` — **nunca como estado actual**)
6. prompt actual

## Reglas de trabajo

- **Medir antes de modificar.** Consultas de solo lectura (`scripts/`, columna LEE) antes
  de cualquier cambio importante, y otra vez al terminar para comparar.
- **No asumir que la documentación histórica describe el presente.** `contexto.feliz`
  (ahora `docs/historial/contexto.feliz.md`) y
  todo `docs/historial/` fueron ciertos el día que se escribieron.
- **No crear sistemas paralelos** cuando ya existe una fuente de verdad
  (`periodos` para ciclo; `inscripciones_alumno` para alumno→grupo).
- **No ejecutar migraciones destructivas sin autorización explícita.** Los cambios de
  datos deben ser mínimos, reversibles, explicados y verificables.
- **La lógica va en `lib/`.** `app/actions/` valida sesión y delega. La decisión que se
  pueda probar sin base de datos va en un módulo puro.
- Al terminar: `npx tsc --noEmit`, la suite pura del módulo, `next build`, y documentar
  cualquier cambio arquitectónico relevante en `ESTADO-ACTUAL.md`.

## Antes de dar un cambio por bueno

`docs/normativo/CONTRATO-DE-CAMBIO.md` — checklist de aceptación, y en su §1 el bloque
de 12 líneas que se pega al final de cada prompt para Cline.

## Reparto

Claude diagnostica, mide y redacta prompts. Cline (DeepSeek) implementa.
Cómo se redacta un prompt: `criterios.prompts`.
