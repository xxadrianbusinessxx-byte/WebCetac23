# Sostenibilidad del reparto Claude / Cline

Medido el **2026-09-28** sobre `main` (`c9453c7`). Este documento describe cómo
se está trabajando de verdad, no cómo está escrito que se trabaja, y qué cambiar.

---

## 1. El dato que ordena todo lo demás

`AGENTS.md` declara:

> Claude diagnostica, mide, redacta el prompt **y revisa lo entregado**.
> Cline (DeepSeek) implementa.

Lo que dice el historial de los últimos 9 días:

```
70 commits · 7,8 al día
67 con co-autoría declarada, de los cuales:
   64  Claude          (95 %)
    3  Cline (DeepSeek) ( 4 %)
```

**El reparto está invertido.** No parcialmente: casi por completo.

### Por qué pasó, sin adornos

Pasó porque funciona **por tarea** y falla **por mes**. Cada vez que había algo
que hacer, escribir el código yo era más rápido que escribir un prompt, esperar,
revisar y corregir. Esa cuenta sale bien veinte veces seguidas y mal al final del
mes, cuando el recurso que se agota es el único que no se puede comprar por
volumen.

Y lo pediste explícitamente varias veces —«¿crees poder terminarlo tú?»,
«ejecuta y prosigue de lleno sin parar»— y yo acepté sin señalar el coste. El
reparto no se rompió por un malentendido: se rompió por conveniencia mutua.

### Qué cuesta exactamente

- **Claude Pro es un techo fijo**: $20/mes y una ventana de contexto. Cuando se
  gasta en teclear código que Cline podría teclear, no queda para lo que solo
  puede hacer Claude: decidir un esquema, elegir una fuente de verdad, revisar
  si algo rompe la arquitectura.
- **Cline es capacidad casi libre y está parada.** 3 commits en 9 días.
- El cuello de botella no es escribir código. Es **mantener coherencia
  arquitectónica mientras el proyecto crece**, y eso es justo lo que se sacrifica
  cuando el arquitecto está ocupado tecleando.

---

## 2. Lo que SÍ funciona, y no se toca

Antes de cambiar nada, conviene reconocer que la infraestructura de proceso es
buena y es lo que ha sostenido 7,8 commits diarios sin romper el sistema:

| Pieza | Qué evita |
|---|---|
| `test-orden.mjs`, **15 reglas** | Que la arquitectura dependa de que alguien se acuerde |
| Panel con **histórico** | Que una deuda crezca sin que nadie lo note (los archivos >1 000 líneas pasaron de 4 a 7 así) |
| `scripts/gen-contexto.mjs` | Que Cline reciba «lee el repo» en vez de un paquete acotado |
| `verificar-docs` / `verificar-estado` | Que la documentación se podra en silencio |
| **41 suites** + CI con puerta de lint | Que un refactor cambie comportamiento sin avisar |

Nada de esto existía hace tres semanas. **La capacidad de construir guardianes
es el activo real del repo**, más que cualquier pantalla.

---

## 3. Los cinco problemas, medidos

### P-1 · El reparto invertido (64 / 3)
Ya explicado. Es la raíz de los demás.

### P-2 · Los guardianes son reactivos
Cada regla mecánica nació **después** de que algo se rompiera. El caso más claro:
mi patrón de fachada reexportaba tipos desde un `"use server"`, Next los registró
como Server Actions y **todas las actions de `/oceano` devolvieron 500 en
producción**. La respuesta fue correcta —nació C14— pero llegó después del golpe.

El sistema aprende. Lo que no hace es **anticipar**, y cada lección se paga en
producción porque no hay staging.

### P-3 · El arranque a 288 tokens del techo
```
10 212 tokens de un techo de 10 500, en 8 archivos
```
Es un recurso finito que se consume solo: cada documento de arranque que crece se
lo cobra a las dos IAs en **cada sesión**. Nadie ha decidido si el techo es 10 500
o debe ser otro; simplemente se está llegando.

### P-4 · Siete ramas vivas
`capas-y-tamano`, `ciclo-f1-f7-sin-push`, `constancias-solicitud`,
`portada-administrable`, `rediseno-oceano`, `rol-administracion-escolar`,
`uis-pendientes`. Varias ya fusionadas y sin cerrar. Deuda de fusión que crece.

### P-5 · El punto ciego está donde vive el bug
El panel tiene **tres señales «sin-medir»**, las tres en la zona de datos: SQL
declarado vs aplicado, FK reales, huérfanos por tabla. Y ahí hay un pendiente de
riesgo **alto**: `archivos_calificaciones` devuelve **404** y tres llamadas
`.from()` vivas apuntan a ella.

**Quince guardianes vigilan el código y ninguno vigila si las tablas que el
código nombra existen.**

---

## 4. El plan

### Paso 1 · Una escala medible, no «decisión vs implementación»

La primera versión de este plan partía el trabajo en «Claude decide, Cline
teclea», y **estaba mal**. Claude Code dentro del repo también implementa, y hay
cambios que debe implementar él justamente por el razonamiento que exigen. El
eje no es qué tipo de tarea es: es **cuánto pesa**.

`scripts/diag-peso-cambio.mjs` lo convierte en una cuenta sobre cinco
dimensiones, y está **calibrado contra 8 commits reales (7 de 8)**:

| Dimensión | Por qué pesa |
|---|---|
| **ESQUEMA** | No hay staging: un `.sql` mal pensado no se deshace con un revert |
| **IDENTIDAD / autorización** | RLS no autoriza nada; un error aquí no tiene red debajo |
| **DETECTABILIDAD** | Si ninguna suite lo cubre, el error viaja |
| **NOVEDAD** | Copiar un patrón es barato; inventarlo es caro, aunque toque 3 archivos |
| **GOBIERNO** | Crear la regla que juzgará al resto no es implementar: es constituir |

Tres salidas, no dos: **Cline**, **«Cline + revisión»** (lo implementa él y
Claude mira solo el cambio de regla) y **Claude**.

#### Lo que la calibración DESCARTÓ, que es lo más útil

**El tamaño no discrimina.** Los dos commits más grandes del repo son de Cline
—60 y 49 archivos, 7 845 inserciones— y salieron bien. Varios de los míos tenían
tres. Contar archivos o líneas daría la respuesta contraria a la correcta.

Y el fallo de producción tenía **13 archivos, cero esquema y cero permisos**:
ninguna métrica de volumen lo predecía. Lo predecía que el patrón **no tenía
precedente**, y de ahí salió la cuarta dimensión.

#### El desacuerdo que dejé sin ajustar

La escala falla en un caso de ocho, y lo dejo así a propósito: `e212b0c`, el
panel del repo, **lo creó Cline y salió mejor que el que yo había hecho y
retiré**. Una escala afinada para decir «crear una herramienta de medición es de
Claude» habría impedido el mejor trabajo que hizo Cline. La escala orienta; no
decide por nadie.

#### Qué cambia hoy

```bash
node scripts/diag-peso-cambio.mjs <rutas del cambio>
```

Aplicado al **Prompt P** que escribí hoy: **3/14 → Cline entero.** Antes lo
habría hecho yo.

### Paso 2 · Invertir la carga de la prueba

Hoy la pregunta es «¿puede hacerlo Cline?». Que pase a ser: **«¿por qué no puede
hacerlo Cline?»**, y que la respuesta vaya escrita. Si no hay respuesta, va a
Cline.

Y una regla para mí: **si me pides que implemente algo que cabe en un prompt, lo
digo antes de empezar.** No para negarme —la decisión es tuya— sino para que la
tomes sabiendo el coste. Eso es exactamente lo que no hice estas tres semanas.

### Paso 3 · Guardián antes del dominio, no después

Antes de abrir un dominio nuevo, una pregunta en el prompt: **«¿qué regla
mecánica cazaría el error que estamos a punto de cometer?»** Si tiene respuesta,
esa regla se escribe **en el mismo cambio**, no después del incidente.

Ejemplo concreto y disponible ya: **C16 para la capa de datos.** Un guardián que
compruebe que toda tabla nombrada en un `.from()` existe en `public`. Habría
cazado `archivos_calificaciones` antes del 404, y cierra el punto ciego de P-5.
Es la pieza que falta y es pequeña.

### Paso 4 · Decidir el techo del arranque, no chocar con él

Tres opciones, y es tu decisión:
- **subirlo** a 12 000 a conciencia, aceptando el coste por sesión;
- **mantener 10 500** y podar —el candidato es `REGLAS_NO_HACER.md`, 2 115 tokens
  y el más grande de los ocho;
- **partirlo por rol**: que Cline lea menos que Claude, porque no decide.

La tercera es la que más me convence y la que nadie ha probado: Cline no necesita
`INVARIANTES.md` para mover una función a un `-puro`.

### Paso 5 · Cerrar ramas

Fusionar o cerrar las siete. Una rama publicada y ya fusionada que sigue abierta
no es una copia de seguridad: es una invitación a ramificar desde un punto viejo.

---

## 5. Cómo se sabrá si el plan funciona

Sin medición esto es una intención. Tres números, en el panel:

| Señal | Hoy | Objetivo |
|---|---|---|
| Commits de Cline / total | **3 / 70 (4 %)** | > 50 % |
| Reglas nacidas antes del fallo | **0 de 15** | ≥ 1 por dominio nuevo |
| Señales «sin-medir» en datos | **3** | 0 |

La primera es la que importa. Si en el próximo mes sigue por debajo del 20 %, el
plan no se aplicó — y la explicación no será técnica.

---

## 6. Lo que este documento no resuelve

- **Rotar la contraseña de Supabase.** Riesgo alto, pendiente declarado, y se
  pasó por chat el 17-09: está en ese historial.
- **Nada de lo construido en las UIs pendientes se ha probado con datos reales.**
  Las siete tablas siguen vacías.
- **`asignaciones_profesor` con 0 filas.** Código entero sin estrenar en
  producción, y el pendiente de mayor riesgo del sistema.

Los tres son de persona, no de IA. Ninguna de las dos puede cerrarlos.
