# AGENTS.md — Punto de entrada para agentes de IA

## Lectura de arranque (obligatoria; su coste: `npm run verificar:docs`)

1. `ESTADO-ACTUAL.md` — qué es verdad hoy
2. `RUMBO.md` — en medio de qué estamos
3. `docs/normativo/REGLAS_NO_HACER.md` — R1–R8, las prohibiciones permanentes
4. `docs/normativo/INVARIANTES.md` — los 16 principios, uno por línea
5. `docs/normativo/GLOSARIO.md` — los términos donde el sistema ya se rompió
6. `docs/00-INDICE.md` — qué leer después, según la tarea

**No leas más que eso al arrancar.** `docs/00-INDICE.md` tiene un presupuesto de
lectura por tipo de tarea; síguelo. Cargar documentación «por si acaso» gasta la
ventana antes de escribir una línea: casi toda la documentación del repo es historial.

Antes de **crear** un archivo, funcion, script o SQL: leer `docs/normativo/ORDEN.md`.
Dice donde va cada cosa y que puede importar que.

Antes de ejecutar cualquier cosa de `scripts/`: leer `scripts/README.md`.
Hay scripts que borran tablas en producción y no lo dice su nombre.

## Orden de autoridad

1. código y estado real del repositorio
2. reglas arquitectónicas permanentes (`filosofia.estructural`)
3. normas: `docs/normativo/REGLAS_NO_HACER.md`, el resto de `docs/normativo/` y
   `criterios.prompts`. En la forma de trabajo mandan ORDEN y CONTRATO; en los
   principios, `filosofia.estructural`
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
- **Ninguna migración de datos ni SQL sin autorización explícita** (CONTRATO §1.3). Los
  cambios de datos: mínimos, reversibles, explicados y verificables.
- **La lógica va en `lib/`.** `app/actions/` valida sesión y delega. La decisión que se
  pueda probar sin base de datos va en un módulo puro.
- Al terminar: `npm run test:ci` y, si cambió la arquitectura, `ESTADO-ACTUAL.md`.

## Antes de dar un cambio por bueno

```bash
node scripts/test-orden.mjs        # capas, nombres, scripts, raíz
node scripts/verificar-docs.mjs    # rutas vivas y coste de arranque
npm run test:ci                    # lo mismo que el CI de GitHub (C17 lo vigila)
```

`docs/normativo/CONTRATO-DE-CAMBIO.md` — checklist de aceptación, y en su §1 el bloque
de 12 líneas que se pega al final de cada prompt para Cline. Lo que `test-orden`
no alcanza se revisa a mano contra su §2.

## Reparto

Claude diagnostica, mide, redacta el prompt **y revisa lo entregado**.
Cline (DeepSeek) implementa. Quién implementa lo orienta
`node scripts/diag-peso-cambio.mjs <rutas>`. Estructura del prompt: `docs/normativo/ORDEN.md` §6.

```
Claude    diagnostica → decide arquitectura → redacta el prompt
              ↓
Cline     implementa → corre suites → corrige lo suyo
              ↓
CI        tsc · suites · test-orden · permisos · build      ← árbitro objetivo
              ↓
Claude    revisa: ¿funciona Y respeta la arquitectura?
              ↓                         ↓
            acepta                   nuevo prompt → Cline
```

**La revisión no es opcional, y no pregunta solo «¿funciona?».** Un
implementador puede entregar algo que compila, pasa las suites y aun así
duplicó lógica, creó una segunda fuente de verdad, subió I/O a la action o se
saltó una capa. Eso el CI no lo ve entero y `tsc` no lo ve en absoluto — por
eso existe `scripts/test-orden.mjs`, que convierte la mitad comprobable de
`ORDEN.md` en una suite. Lo que el script no alcanza, lo revisa Claude contra
el checklist de `CONTRATO-DE-CAMBIO.md` §2.

### Presupuesto de contexto por agente

No es el mismo, y confundirlos es lo que hace caro el reparto:

| Agente | Recibe | Por qué |
|---|---|---|
| Claude | el repo: puede investigar a fondo | diagnosticar exige ver relaciones que no están en ningún archivo |
| Cline | **solo el paquete del prompt** (sustituye a `docs/00-INDICE.md`) | no necesita decidir nada: la decisión llega tomada |

**Ninguno de los dos se arma a mano.** El mismo script emite lo que le toca a
cada uno, desde las mismas fuentes:

```bash
node scripts/gen-contexto.mjs --tarea=crear <archivos>   # Cline: paquete cerrado + CONTRATO
node scripts/gen-contexto.mjs --agente=claude <archivos> # Claude: qué está ya medido y qué no mide nadie
```

Qué lleva cada uno y por qué son distintos: `scripts/README.md`. A mano se olvida
algo y el prompt acaba diciendo «lee el repo», que es lo contrario del presupuesto.

### Qué nunca se delega sin revisión

Decidir el esquema · elegir la fuente de verdad de un dominio · tocar `lib/auth/` ·
retirar legacy o un fallback · **aflojar** un umbral de `test-orden.mjs` (subirlo o
pasar una regla DURA a trinquete) · subir `TECHO_TOKENS` o añadir un archivo al
arranque. Aflojarlo para que el CI pase apaga el guardián; apretarlo cuando baja la
deuda es parte del cambio.
