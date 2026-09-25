# INFORME — Constancia de estudios con el formato oficial y número de control

**Fecha:** 2026-09-24 · **Rama:** `feature/rol-administracion-escolar` · **Ejecutado por:** Claude
**Referencia:** una constancia real del plantel, enviada por el responsable como imagen.

## Qué cambió

La vista previa beta de «Trámites escolares › Constancias de estudios» pasa a ser la
constancia con el **formato oficial**, lista para **imprimir o guardar como PDF**. De un
alumno a otro solo cambian sus datos:

| En la hoja | De dónde sale |
|---|---|
| Nombre, CURP | el expediente |
| **Número de control** | columna nueva `ALUMNOS.numero_control` (ver abajo) |
| el alumno / la alumna · INSCRITO / INSCRITA · al interesado / a la interesada | la CURP (posición 11: H/M) |
| «SEXTO semestre» | el grado del grupo («6TO») |
| «TÉCNICO EN MECATRÓNICA» / «TÉCNICO EN RECURSOS HUMANOS» | la carrera |
| «Semestre del 16 de Febrero al 30 de Julio de 2026» | fechas del periodo operativo |
| «a uno de Junio del año dos mil veintiséis» | la fecha de emisión, en letras |

Lo del plantel (C.C.T. 22DCM0001I, encabezado, director, domicilio del pie) está en UN sitio,
`PLANTEL` de `constancia-puro.ts`. Se copió **literal** de la constancia de referencia, erratas
incluidas («Subsecretaria de Educación Publica», «Centro de Estudios Tecnológica», el correo con
comas). Si alguna se corrige en el formato oficial, se corrige ahí.

**Logos:** los cuatro que agregó el responsable a `decoraciones imagenes/`: Gobierno de México,
Educación/SEP, la ilustración de la bandera y «2026 año de Margarita Maza». Se copian a `public/`
con `sync:decoraciones`.

**Firma y sello no se generan.** La hoja deja su espacio (en pantalla, con una guía punteada que
no se imprime) y el director firma y sella a mano, como hasta ahora.

Si falta un dato del alumno (número de control, inscripción en un grupo o fechas del ciclo), el
botón de imprimir se desactiva y se dice qué falta: no sale una constancia incompleta.

## Número de control

`supabase/agregar-numero-control-alumno.sql`: columna nullable en `ALUMNOS`, **única** cuando
existe (sirve como identificador institucional) y con un CHECK de formato: `^[A-Z0-9-]{4,20}$`.
**Aplicado dos veces sin error.** Los 472 alumnos quedan sin número hasta que se capture.

- Se ve en «Datos personales» para quien ve la ficha. Lo captura solo quien tenga la capacidad
  nueva `alumno.editar_numero_control`, que tiene solo Administración escolar. El tutor edita
  datos personales pero **no** este: es institucional y va impreso.
- También se captura desde la pantalla de la constancia, que sin él no se emite.
- La app normaliza (quita espacios, mayúsculas) con la misma regla que el CHECK.
- Se lee con una consulta propia (`numero-control.ts`): las lecturas de ALUMNOS y la RPC del
  perfil piden columnas exactas y no se tocaron.

## Cómo se imprime

Una sola hoja en unidades `cqw`: en pantalla escala al ancho disponible; al imprimir es tamaño
carta exacto. Se imprime desde un portal en `<body>`, así que no sale nada del shell. El nombre
propuesto al guardar es «Constancia de estudios - NOMBRE».

## Pruebas

| Qué | Resultado |
|---|---|
| `test-uis-pendientes`: la constancia de referencia reproducida dato por dato, alumna/alumno, las dos carreras, los seis semestres, fechas y números en letras, número de control | **92/92** |
| `test-permisos` | **685/0** |
| Base real (clave anónima): guardar, leer, duplicado rechazado con mensaje claro, CHECK que rechaza un formato inválido aunque no pase por la app, quitar el número | 6/6, limpieza verificada (0 números) |
| HTTP sin sesión: `actionGuardarNumeroControl` | 200 · «Solo Administración escolar puede capturar el número de control.» |
| **PDF real** con Chrome sin ventana, sobre una página temporal (ya borrada) con los datos de la referencia | 1 página carta, sin el shell ni las guías, texto seleccionable, posiciones a ±1 % del original |

`tsc` 0 · `eslint` 0 · `test-orden` 15 reglas · `test:ci` 41/41 · auditoría 178/0 ·
`gen:matriz --check` · `verificar-docs` · `build`.
