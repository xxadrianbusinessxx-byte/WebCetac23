# Contrato de cambio — qué debe cumplir todo cambio antes de aceptarse

NORMATIVO. Sirve en dos direcciones: es lo que se le **exige** a quien implementa
(Cline) y es la lista con la que se **audita** lo que entregó.

---

## 1. Bloque para pegar en el prompt

Esto es lo que se copia al final de cada prompt. Sustituye a repetir las reglas
completas en cada mensaje: son 12 líneas en lugar de 40 KB de documentación.

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

---

## 2. Checklist de auditoría

### Alcance
- [ ] ¿Tocó **solo** lo que el prompt pedía? Cualquier archivo extra debe estar justificado.
- [ ] ¿Dejó legacy en pie? Borrar legacy «de paso» viola R8.
- [ ] ¿Evitó crear un módulo/tabla/columna paralela a algo que ya existía? (R6)

### Capas
- [ ] La lógica de negocio está en `lib/`, no en `app/actions/`.
- [ ] La decisión pura (la que se puede probar sin base) está separada del I/O.
- [ ] La UI no decide nada que deba decidir el dominio.

### Datos
- [ ] ¿Es aditivo? Columnas nuevas nullable, sin `DROP`, sin `NOT NULL` retroactivo.
- [ ] Si escribe: ¿respeta previsualizar→confirmar? El preview no debe escribir.
- [ ] Si hay UPSERT: ¿las claves de conflicto son las correctas y están declaradas?
- [ ] ¿Hay `.sql` versionado en `supabase/` para todo cambio de esquema?

### Identidad (donde el sistema ya se rompió)
- [ ] Ciclo referenciado por `periodos.id`, **nunca** por `periodos.nombre`. (R5)
- [ ] Profesor identificado por `PROFESORES.ID`, **nunca** por `CLAVE`.
- [ ] Materia accedida por `idInterno`, **nunca** por `nombreVisible`.
- [ ] Alumno→grupo resuelto por `inscripciones_alumno`, no por otra vía.
- [ ] Calendario: ¿por `periodo_id` o por el texto `ciclo_escolar`? Si es lo segundo, hay que saber por qué.

### Verificación
- [ ] `npx tsc --noEmit` en 0 errores.
- [ ] La suite pura del módulo pasa (`scripts/README.md` dice cuál es).
- [ ] `next build` completa.
- [ ] Existe una medición **antes** y **después** con el mismo script de diagnóstico.
- [ ] Ningún script de `_peligrosos/` ni de `_archivo/` fue ejecutado.

### Documentación
- [ ] Si cambió una regla estructural: se actualizó `ESTADO-ACTUAL.md`.
- [ ] Si cerró o movió una deuda: se actualizó `docs/sistema/MAPA-DEL-SISTEMA.md` §2.
- [ ] El informe de lo hecho vive en `docs/historial/informes/`, no suelto en `docs/`.

---

## 3. Motivos de rechazo inmediato

No hace falta revisar el resto si aparece cualquiera de estos:

| Señal | Por qué |
|---|---|
| Ejecutó algo de `scripts/_peligrosos/` | Hay scripts ahí que vacían tablas. |
| Migración de datos no pedida en el prompt | Irreversible sin respaldo. |
| Identifica un ciclo por nombre de texto | Es el incidente P0 exacto. |
| Identifica un profesor por CLAVE | 16 de 20 comparten `4321`. |
| Escribe asistencia sin `profesor_id` de sesión | Regla congelada en `atribucion-profesor.ts`. |
| Crea una segunda fuente de verdad «temporal» | Nunca es temporal (R6). |
| Entrega sin medición antes/después | No es auditable. |
| Cita `contexto.feliz` o `docs/historial/` como estado actual | Son bitácora, no presente. |

---

## 4. Cuándo el contrato no aplica

Cambios puramente cosméticos de UI (texto, espaciado, color) que no tocan `lib/`, ni
`supabase/`, ni ninguna action. Ahí basta con `tsc --noEmit` y una revisión visual.
