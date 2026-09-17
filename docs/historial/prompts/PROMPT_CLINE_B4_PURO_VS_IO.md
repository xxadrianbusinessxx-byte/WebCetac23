# PROMPT CLINE — B4 · Separar la decisión pura del I/O en `documentos.ts`

> **Lee esto antes que nada: B4 no es lo que dice ser, y este prompt es mucho
> más pequeño de lo que el nombre sugiere.** La medición está abajo.

---

## LO PRIMERO: la mitad principal de B4 ya está cerrada

`PROMPT_E_CAPAS_Y_TAMANO.md` describe B4 así:

> «Cuatro módulos mezclan decisión pura e I/O y los importa un `"use client"`,
> **lo que arrastra al bundle código que solo debería correr en servidor**.»

Esa segunda parte —la que justificaba el trabajo— **es falsa**, y no por
opinión: se midió en el bundle construido.

```
Chunks de cliente ......................... 16 (1,4 MB de JS)
obtenerCalendarioEscolar en los chunks .... 0
guardarDiaCalendario ...................... 0
listarCiclosEscolares ..................... 0
generarPlantillaAsistencia ................ 0
repararTablaLegacy ........................ 0
clonarCatalogo ............................ 0
«supabase» en los chunks .................. 1 aparición, y es una cadena suelta
```

**Ni un solo símbolo de servidor llega al navegador.** Dos razones, y las dos
son decisiones ya tomadas en este repo:

1. Los módulos de `lib/escolar/` **no importan** el cliente de Supabase: lo
   reciben por parámetro (`funcion(supabase, …)`) y solo importan
   `SupabaseClient` **como tipo**, que TypeScript borra al compilar.
2. Lo que queda lo elimina el *tree-shaking*: un `"use client"` que importa
   `fechaISO` no se lleva las otras 18 funciones del archivo.

> **Aviso para quien mida esto otra vez.** Un detector ingenuo da **36 módulos
> culpables**. Es un falso positivo: cuenta los `import type`. Contando solo
> imports **de valor**, y comprobando el bundle real, la cifra es **0**. Si
> alguien vuelve con «hay 36 módulos que arrastran Supabase al cliente», está
> midiendo tipos borrados.

**No hagas nada por motivos de bundle. No hay nada que ganar ahí.**

---

## LO QUE SÍ QUEDA, medido

La otra mitad de B4 —«mezclan decisión pura e I/O»— sí es real, pero es deuda
de **testabilidad**, no de bundle: ORDEN.md §3 dice que una decisión que se
puede probar sin base de datos va en un módulo puro **y debe tener suite**.

Módulos mixtos de los que un `"use client"` importa una pieza pura:

| Módulo | Líneas | Funciones con I/O | ¿Suite? | Qué le importa el cliente |
|---|---|---|---|---|
| `escolar/ciclo/calendario.ts` | 493 | 10 | **sí** | `fechaISO` |
| `escolar/materia/mapeo-columnas-materia.ts` | 613 | 2 | **sí** | 5 funciones de mapeo |
| `escolar/alumno/alumnos.ts` | 529 | 11 | **sí** | `nombreCompletoAlumno` |
| `escolar/materia/nombres-visibles.ts` | 242 | 4 | **sí** | `materiasConNombreVisible` |
| `escolar/alumno/etiquetas.ts` | 193 | 2 | **sí** | `CAMPOS_PERSONALES_PRIMARIOS`, `comentarioPersonalDesdeFila` |
| **`escolar/documentos.ts`** | **422** | **14** | **NO** | **`puedeVer`, `puedeSubir`, `puedeEliminar`, `rutaCarpeta`** |

**Cinco de los seis ya tienen suite**, así que su parte pura ya está probada
donde vive. Partirlos sería mover código sin ganar una sola verificación.

Queda **uno**, y ese sí importa.

---

## OBJETIVO

Sacar de `lib/escolar/documentos.ts` las cuatro funciones puras que consume
`app/components/documentos-panel.tsx`, y **darles la suite que nunca tuvieron**.

Por qué este y no los otros cinco: **tres de las cuatro son decisiones de
permiso** —`puedeVer`, `puedeSubir`, `puedeEliminar`— y hoy **ningún test las
cubre**. Son las que deciden qué botones ve el usuario en Documentos. Un error
ahí enseña un control que el servidor va a rechazar, que es exactamente lo que
la regla 4 del PROMPT-3 prohíbe.

```ts
export function puedeSubir(nivel: NivelPermiso | null): boolean {
  return nivel === "subir" || nivel === "eliminar";
}
```

Cuatro líneas, sin red debajo, gobernando la interfaz de permisos.

---

## RESULTADO ESPERADO

### R-1 · `lib/escolar/documentos-permisos-puro.ts`

Contiene, **movidas tal cual** (sin reescribir):

- `puedeVer`, `puedeSubir`, `puedeEliminar` — los tres predicados de nivel;
- `rutaCarpeta` — reconstruye la ruta de migas desde la lista de carpetas;
- el tipo `NivelPermiso` si hace falta para que el módulo compile solo.

Requisitos del módulo: **cero imports de I/O**, ni siquiera el tipo
`SupabaseClient`. Imports relativos (C1). Tiene que poder compilarse y
ejecutarse sin base de datos — es lo que hace posible la suite.

### R-2 · `documentos.ts` re-exporta

El archivo original re-exporta lo que movió, para que **ningún import existente
cambie de ruta** — mismo criterio que el PROMPT E. `documentos-panel.tsx` puede
seguir importando de donde importaba, o apuntar al módulo puro: lo que prefieras,
pero dilo en el informe.

### R-3 · `scripts/test-documentos-permisos.mjs`

La suite que falta. Como mínimo:

- **`puedeVer`/`puedeSubir`/`puedeEliminar` para cada nivel y para `null`.**
  La tabla completa, no un caso feliz: `null` es el caso que decide si alguien
  sin permiso ve la carpeta.
- **La jerarquía**: `eliminar` implica `subir` implica `ver`. Si alguien
  invierte un `||` esa relación se rompe y hoy nadie se entera.
- **`rutaCarpeta`**: raíz (`null`), un nivel, varios niveles, y una carpeta
  cuyo padre no está en la lista (no puede colgarse ni devolver basura).

Sigue el patrón de `scripts/test-*.mjs` que ya existen, y **añade su fila a
`scripts/README.md`** — si no, C10 de `test-orden` te lo va a cazar.

---

## REGLAS

1. **Mover, no reescribir.** Si una función cambia de comportamiento, la suite
   nueva estaría certificando algo distinto de lo que hay en producción.
2. **La suite se escribe contra el comportamiento ACTUAL.** Si al escribirla
   descubres que una función hace algo que parece un bug: **no lo arregles**,
   escríbelo en el informe. Arreglarlo aquí mezclaría dos cambios y haría
   imposible saber cuál rompió qué.
3. Imports relativos dentro de `lib/escolar/` (C1). Cero I/O en el `-puro` (C5).
4. Nada destructivo (R8), sin SQL, sin tocar permisos.

---

## LÍMITES

- ❌ **No toques los otros cinco módulos de la tabla.** Ya tienen suite;
  partirlos no gana ninguna verificación y sí arriesga imports.
- ❌ No toques nada por motivos de bundle: está medido y no hay nada que ganar.
- ❌ No toques `app/directivo/` — esa ruta ya solo redirige a `/oceano`.
- ❌ No bajes ningún umbral de `test-orden.mjs`.

---

## VALIDACIÓN

```bash
npx tsc --noEmit
node scripts/test-documentos-permisos.mjs   # la suite nueva, en verde
npm run test:ci                             # ahora 38/38, y ESTADO-ACTUAL al día
npm run test:permisos
node scripts/test-orden.mjs                 # C5 y C10 siguen en su sitio
npm run lint                                # 0 errores
npm run build
```

**Ojo con `test:ci`:** la suite nueva sube el total de 37 a 38, y
`verificar-estado-actual.mjs` compara ese número contra `ESTADO-ACTUAL.md`.
Hay que actualizarlo **en el mismo cambio**, o el CI se cae. Y desde el
PROMPT F el límite de ~150 líneas es **fallo**, no aviso: lo que añadas ahí
tiene que caber.

---

## INFORME FINAL

### Implementado
Qué se movió y qué suite se escribió.

### La tabla de la suite
Qué casos cubre, y sobre todo **cuáles no** y por qué.

### Hallazgos
Si al escribir las pruebas apareció algo que parece un bug: descrito, **no
arreglado**.

### Los cinco que no se tocaron
Confirmar que siguen intactos.

### Validación
Antes/después, con el 37 → 38 declarado en `ESTADO-ACTUAL.md`.

---

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```
