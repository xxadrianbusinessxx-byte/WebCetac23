# Informe — Historial del seguimiento médico (quién lo editó y cuándo)

> 2026-10-01 · Implementado por Claude: `diag-peso-cambio.mjs` le da 10/14
> (toca ESQUEMA e IDENTIDAD, sin precedente). SQL aplicado por persona el mismo día.

## Petición

El apartado «Seguimiento médico» del alumno lo editan el padre o tutor,
Administración escolar y Dirección. Cada edición debe **añadir** una fila a una
tabla indexada con quién la hizo y cuándo, **solo** para ese apartado.

## Lo que se encontró (medido, solo lectura)

| Hallazgo | Medida |
|---|---|
| El guardado era `update … where CURP` sobre `ETIQUETAS PERSONALES`: si el alumno no tiene fila, no toca nada y responde «Datos guardados». | **144 de 472** alumnos sin fila |
| Fichas con algún dato médico | 1 |
| Tras guardar, la pantalla seguía mostrando los valores anteriores hasta recargar (sin `router.refresh()`). | — |
| «Información personal» y «Seguimiento médico» comparten la misma action (`actionGuardarCamposPersonales`). | — |
| Quién edita según el servidor (`resolverAccesoAlumno`): tutor (sus vinculados), administración y directivo (cualquiera). El técnico tiene la capacidad pero el alcance se la niega. | — |
| **Dirección no tiene pantalla** para abrir el seguimiento médico de un alumno: su «Alumnos / Tutores» es un aviso de «falta». | — |

## Lo que se hizo

- `supabase/crear-historial-seguimiento-medico.sql`: tabla
  `seguimiento_medico_historial` (una fila por edición: `curp`, `editor_rol`,
  `editor_profesor_id` o `editor_tutor_id`, `editor_nombre`, `campos text[]`,
  `cambios jsonb` con antes/después, `editado_at`), tres índices (por alumno y
  por editor) y RLS de solo-añadir. Función `guardar_campos_personales_alumno`:
  crea la ficha si falta, lee el «antes» con la fila bloqueada, escribe los 14
  campos y, si cambió algún campo médico, el historial — todo en una transacción.
- `lib/escolar/alumno/seguimiento-medico-puro.ts`: quién firma (desde la sesión;
  `PROFESORES.ID`, nunca CLAVE; `tutores.id`), qué campos se auditan
  (`CAMPOS_SEGUIMIENTO_MEDICO`), cómo se lee una entrada (hora del plantel).
- `lib/escolar/alumno/seguimiento-medico.ts`: invoca la función; lee el historial.
- `actionGuardarCamposPersonales` pasa por la función; nueva
  `actionListarHistorialSeguimientoMedico` (`alumno.ver_perfil` + alcance).
- UI: «Historial de cambios» bajo los campos médicos; `router.refresh()` tras guardar.
- `scripts/test-seguimiento-medico.mjs` (49 casos, incluye el contrato TS↔SQL) y
  `scripts/diag-seguimiento-medico.mjs`.

## Decisiones

- **Atómico en PL/pgSQL** (ORDEN §5): si el historial no se escribe, el dato tampoco.
- **Sin la función desplegada no se guarda nada** (error explícito), igual que el
  traspaso de materias: guardar sin historial es lo que se quería evitar.
- El historial lo ve quien ve el apartado (alumno, padre, administración).
- Valor vacío = sin dato: pasar de `''` a `null` no es un cambio.

## Pendiente (humano)

`docs/sistema/pendientes.json` → `sql-historial-seguimiento-medico`: el `.sql` ya
está aplicado (`diag-seguimiento-medico.mjs`: función y tabla presentes, 0 ediciones).
Falta probar con sesión real de padre y de Administración, incluido un alumno sin ficha.
