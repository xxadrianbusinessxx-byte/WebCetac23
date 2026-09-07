# PROMPT 5 — Cierre del bloque: verificación y limpieza

> Estado: **ejecutado parcialmente el 2026-09-07.** Parte A completa (A1+A2, con
> autorizaciones) y B1, B2, B6, B7 de la Parte B. B3, B4 y B5 quedan pendientes
> con sus puntos de parada documentados en
> `docs/historial/informes/INFORME-PROMPT-5-CIERRE-Y-VERIFICACION.md` (se ejecutan
> en la siguiente sesión: son movimientos de código grandes y requieren margen de
> verificación con el contrato «el comportamiento no cambia y las suites lo
> demuestran»). Último de cinco. Dos mitades independientes:
> **A) verificar** que los datos y las credenciales son lo que creemos, y **B) cerrar**
> la deuda estructural que quedó marcada durante todo el bloque.
>
> **A no depende de B.** Si hay que partirlo en dos sesiones, se parte por ahí: A es
> solo lectura y reconciliación; B toca código.

---

## 1. OBJETIVO

Terminar el bloque con el sistema **verificado, no solo construido**:

1. Ninguna credencial permite entrar como otra persona, y las que se comparten están
   identificadas y marcadas para cambio.
2. Las inscripciones del ciclo operativo **concuerdan con los Excel de `things/`**, que
   son la verdad de la escuela.
3. Lo que quedó a medias durante el bloque —la puerta del cambio de clave, la lógica en
   la capa equivocada, el código sin dueño— queda cerrado o explícitamente archivado.
4. Las 34 suites corren solas, no cuando alguien se acuerda.

## 2. CONTEXTO — leer solo esto

- `AGENTS.md` · `ESTADO-ACTUAL.md`
- `docs/normativo/ORDEN.md` §2 (capas) y §4 (scripts)
- `docs/normativo/REGLAS_NO_HACER.md` — **R8 gobierna toda la parte B**
- `docs/sistema/MAPA-DEL-SISTEMA.md` §2 — las tres deudas
- `docs/sistema/MATRIZ-PERMISOS.md` §4 — para C5, decidir contra el técnico ya cerrado
- `scripts/README.md`

## 3. MEDICIÓN PREVIA — línea base al 2026-09-07

```bash
node scripts/p0-diag-contexto.mjs
node scripts/test-permisos.mjs && node scripts/test-auditoria-permisos.mjs
```

| Medida | Valor |
|---|---|
| `PROFESORES` | **21 cuentas, 4 claves distintas**: 16 comparten una, 3 comparten otra |
| `debe_cambiar_credenciales = true` | **0 de 21** |
| `ALUMNOS` | 472 · **10 claves duplicadas** (pares) · 0 CURPs duplicados |
| Inscripciones activas | 357 · CURPs con más de una activa: 0 · `decision_manual`: 58 |
| `asignaciones_profesor` activas | **0** |
| `console.log` en `lib/` + `app/` | **23**, de los cuales **10 en la ruta de login** |
| `.from()` en `app/actions/` | 64 (justificaciones 20 · asistencias 15) |
| Módulos con I/O importados desde cliente | 4 |
| Cambio forzado de clave | bloquea **3 de 6** rutas |
| Suites | 34, sin ejecución automática |

---

# PARTE A — VERIFICACIÓN

### A1 · Credenciales duplicadas

**Lo medido, para que no se busque a ciegas:**

- **Profesores: el problema sigue entero.** 21 cuentas y solo 4 claves distintas. El
  mecanismo de cambio forzado existe y funciona —el técnico lo usó— pero
  **`debe_cambiar_credenciales` está en `false` para las 21**. Nadie va a cambiar nada
  porque a nadie se le ha pedido. La deuda 2 no está cerrada: está *lista para cerrarse*.
- **Alumnos: 10 pares comparten clave.** No es un agujero de autenticación:
  `validarAccesoPortal()` exige **nombre + clave**, no clave sola, así que dos alumnos
  con la misma clave no entran uno por otro salvo que compartan también el nombre.
  Pero la clave es **los últimos 6 caracteres del CURP** (`claveDesdeCurp`), o sea
  derivable por cualquiera que vea un CURP.

1. `scripts/diag-credenciales-duplicadas.mjs` (**solo lectura**): profesores, alumnos y
   tutores; para cada población, cuántas credenciales se repiten y entre quiénes.
   Comprobar además si algún par de alumnos comparte **nombre y clave** — ese sí sería
   un agujero real, y hoy nadie lo ha mirado.
2. Marcar `debe_cambiar_credenciales = true` en los profesores que comparten clave, con
   script de dry-run + `--apply`. **No inventar claves nuevas ni tocar la del técnico**:
   cada profesor la define al entrar, que es el flujo de A4.
3. Reportar los 10 pares de alumnos. Si se decide cambiar el esquema de clave, es
   decisión aparte y **no entra en este prompt**: cambia el acceso de 472 personas.

### A2 · Las inscripciones concuerdan con los Excel de `things/`

La verdad de quién está en qué grupo vive en `things/Alumnos CETAC`. Hoy la base dice
357 inscripciones activas y nadie ha verificado que sean exactamente esas.

1. `scripts/diag-inscripciones-vs-roster.mjs` (**solo lectura**). La carpeta de Excel es
   **parámetro obligatorio**, nunca ruta absoluta incrustada — ya hubo dos scripts así,
   están en `_archivo/` y es una trampa conocida.
2. Reportar cuatro listas, no un número:
   - **En la base y no en el Excel** → inscripción de más
   - **En el Excel y no en la base** → alumno sin inscribir
   - **En ambos pero en grupo distinto** → el caso peligroso, porque no se ve
   - **CURPs del Excel que no existen en `ALUMNOS`**
3. **Solo diagnostica. No corrige nada.** La corrección se decide leyendo el reporte,
   y las herramientas ya existen: `migrar-deduplicar-inscripciones.mjs` (PROMPT-1) y la
   baja de roster (PROMPT-4/T3). Cualquier baja debe llevar `decision_manual = true` o
   la siguiente activación de ciclo la deshace.
4. Cruzar el resultado con las **58 filas marcadas** de PROMPT-4/T1: si el Excel
   contradice alguna decisión manual, hay que saberlo — es la única contradicción que
   el sistema ya no puede resolver solo.

**Punto de parada:** presentar el reporte de A2 antes de tocar un solo dato.

---

# PARTE B — CIERRE ESTRUCTURAL

### B1 · Una sola puerta para el cambio de clave

Hoy el cambio forzado bloquea `/configuracion`, `/profesor` y `/directivo`; **no bloquea
`/perfil`, `/documentos` ni `/tutor`**. Un profesor marcado entra por `/documentos` y usa
el portal igual.

La solución no es añadir la comprobación a tres archivos más: es ponerla **en un solo
sitio** —`app/layout.tsx` o `proxy.ts`— y quitarla de los tres que la repiten. Una
puerta, no seis. Esto además es lo que hace efectivo A1: marcar a los profesores no
sirve de nada si pueden esquivar la pantalla.

### B2 · Quitar los diagnósticos de la ruta de login

10 `console.log` con prefijo `[6J-login]` en `lib/auth/portal-login.ts`, uno de ellos
registrando el **identificador de quien intenta entrar**. Están marcados «DIAGNÓSTICO
TEMPORAL» y llevan meses ahí. Fuera. Revisar también los otros 13 de `lib/` + `app/`:
lo que no aporte, fuera; lo que sí, que diga por qué se queda.

### B3 · La lógica vuelve a `lib/` (C1)

64 consultas `.from()` en la capa de transporte. Empezar por las dos que concentran la
mitad: `justificaciones.ts` (20) y `asistencias.ts` (15).

- Una action valida con `exigir()`, delega y formatea. Si tiene un `if` de negocio, ese
  `if` va a `lib/`.
- **Prueba del algodón** (ORDEN.md §2): si borras `app/` entero, `lib/` debe seguir
  compilando y teniendo sentido.
- No cambiar comportamiento: mover, no reescribir. Las suites lo demuestran.

### B4 · Separar puro de I/O (C2)

Cuatro módulos con acceso a base importados **como valor** desde componentes cliente:
`ciclo/calendario` (10 `.from()`), `alumno/alumnos` (6), `materia/nombres-visibles` (4),
`materia/mapeo-columnas-materia` (2). Partir cada uno en `-puro` + I/O, y que el cliente
importe solo la mitad pura. Cada mitad pura gana suite (ORDEN.md §3).

### B5 · Resolver `_borrador/` y las actions huérfanas (C5)

Ahora sí se puede decidir: **la especificación del técnico está cerrada**, que era lo
que faltaba.

1. Los 5 componentes de `app/_borrador/` y los 7 módulos de `lib/_borrador/`: contra la
   §4 de la matriz, cada uno se **cablea** o se **borra**. Nada se queda «por si acaso»:
   una carpeta de borrador que nadie revisa es código muerto con otro nombre, y así lo
   dice su propio README.
2. Las actions sin consumidor: mismo criterio. **`calificaciones.ts` merece decisión
   explícita**: es la base del sistema de boletas de B7.
3. El **chat** se queda en `_borrador/` — retirada deliberada con reemplazo previsto.
   Si se borra algo suyo, que sea con la decisión escrita.

### B6 · Que las suites corran solas (D2)

Nada ejecuta las 34 suites automáticamente. Durante este bloque descubrimos **8 suites
que llevaban tiempo rotas sin que nadie se enterara**; el CI es lo que impide que vuelva
a pasar.

Un workflow que corra, en este orden: `npx tsc --noEmit` → `npm run test:compilar` →
las 34 suites → `gen-matriz-permisos.mjs --check` → `test-auditoria-permisos.mjs` →
`next build`. Sin credenciales: **todas son de solo lectura del filesystem**. Las que
tocan Supabase (`diag-*`, `probe-*`) **no van al CI**.

### B7 · Documentación de cierre

1. **`docs/sistema/modulos/CALIFICACIONES-Y-BOLETAS.md`** — por qué las 240 tablas
   físicas por materia son **deliberadas**: origen Excel, esquema variable por materia,
   columnas creadas en caliente, datos que cambian por ciclo y se actualizan por parcial,
   y base del **sistema de boletas digital** previsto. Sin este documento, el próximo
   agente las «optimiza» por ignorancia. Entrada cruzada en el GLOSARIO.
2. **Podar `contexto.feliz`** (D6): 1 500 líneas de bitácora con banner de histórico.
   Lo que siga siendo cierto se traslada a `ESTADO-ACTUAL.md`; el resto se queda como
   historial, pero el archivo deja de cruzarse en las búsquedas. **No se borra** (R8).
3. `ESTADO-ACTUAL.md` y `MAPA-DEL-SISTEMA.md` §2 al día: qué deudas cierran con este
   bloque y cuáles siguen abiertas.

---

## 4. ALCANCE

**SÍ:** scripts de diagnóstico de A1 y A2 · `lib/auth/portal-login.ts` ·
`app/layout.tsx` o `proxy.ts` · `app/actions/justificaciones.ts` y `asistencias.ts` ·
los 4 módulos de B4 · `_borrador/` · workflow de CI · la documentación de B7.

**NO:**

- Cambiar el esquema de claves de alumno (472 personas — decisión aparte)
- Reescribir `eliminar_ciclo` ni particionar `asistencia_alumnos`
- Tocar la matriz de permisos: está cerrada
- Migraciones de datos que no salgan del reporte de A2

**NUNCA:** corregir inscripciones sin el reporte de A2 revisado · dar de baja sin
`decision_manual` · borrar de `supabase/` · inventar claves de profesor.

---

## 5. CONTRATO

```
1. Antes de tocar nada: correr la medición de §3 y pegarla.
2. La decisión va en un módulo puro y probable sin base de datos. La action valida
   con exigir(), delega y formatea. Nada más.
3. Cambio aditivo. B3 y B4 son MOVIMIENTOS, no reescrituras: el comportamiento no
   cambia y las suites lo demuestran.
4. No crear un camino paralelo: una sola puerta para el cambio de clave, una sola
   fuente para alumno->grupo.
5. Validar: npx tsc --noEmit + npm run test:compilar + las 34 suites + next build.
6. Volver a correr la medición del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

**Puntos de parada obligatorios:**

- **A2**, con el reporte delante: qué se corrige y qué no.
- **A1 paso 2**, antes del `--apply` que marca a los profesores.
- **B5**, antes de borrar nada de `_borrador/`.
- Cualquier movimiento de B3/B4 que cambie comportamiento en vez de solo mover.

## 6. ENTREGABLES

- `diag-credenciales-duplicadas.mjs` y `diag-inscripciones-vs-roster.mjs`, con cabecera
  y fila en `scripts/README.md`
- El reporte de A2 en el informe, con las cuatro listas
- Una sola puerta de cambio de clave · login sin diagnósticos
- `justificaciones.ts` y `asistencias.ts` sin `.from()` · los 4 módulos partidos
- `_borrador/` resuelto, con la decisión de cada archivo escrita
- Workflow de CI
- `docs/sistema/modulos/CALIFICACIONES-Y-BOLETAS.md` · `contexto.feliz` podado
- `ESTADO-ACTUAL.md` y `MAPA-DEL-SISTEMA.md` §2 al día
- Informe en `docs/historial/informes/INFORME-PROMPT-5-CIERRE-Y-VERIFICACION.md`

## 7. Criterio de terminado

1. Existe un reporte que dice, alumno por alumno, en qué **no** concuerdan la base y los
   Excel de `things/` — o que dice que concuerdan del todo.
2. Los profesores que comparten clave están marcados y **no pueden esquivar** la
   pantalla de cambio por ninguna ruta.
3. Ningún `console.log` queda en la ruta de login.
4. `justificaciones.ts` y `asistencias.ts` no tienen `.from()`.
5. Ningún componente cliente importa un módulo con acceso a base.
6. `_borrador/` está vacío o cada archivo tiene su decisión escrita.
7. El CI corre en verde: `tsc` · 34 suites · `gen:matriz --check` · auditoría de
   permisos · `next build` 9 rutas.
8. **El bloque queda listo para commitear.**
