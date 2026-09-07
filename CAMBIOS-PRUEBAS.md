# Primera revisión: cuatro cambios pequeños

Los cuatro bloques comparten código entre Sites y Netlify. No requieren migraciones
ni incorporan pagos, inventario o un nuevo modelo de facturación.

| Parte | Cambio | Cómo revisarlo |
| --- | --- | --- |
| 1. Numeración | PostgreSQL conserva todos los dígitos después de 999 órdenes por mes. | Verificado con la consulta real en PostgreSQL temporal: 999 → 1000 → 1001 y 9999 → 10000. No crear cientos de registros en el sitio para comprobarlo. |
| 2. Validación | Límites de texto compartidos, rechazo de JSON inválido y de montos que no caben en la base. Errores visibles dentro del formulario. | En el detalle, introducir un correo inválido e intentar guardar. Corregirlo y guardar: la orden debe conservar todos los demás datos. |
| 3. Formularios | Aviso al descartar cambios, protección al recargar/cerrar la pestaña, confirmaciones coherentes para entrega, anulación, reapertura y corrección de importes ya facturados. | Editar una nota y pulsar Cerrar o Escape. Cancelar el aviso debe conservarla. Guardar y cerrar después no debe pedir descartarla. Entregar una orden sin costos debe mostrar el aviso de $0.00. |
| 4. Listado | Botones Actualizar y Limpiar filtros, adaptados a pantallas pequeñas. | Escribir una búsqueda y seleccionar un estado; Limpiar filtros debe restablecer Todos y quitar la búsqueda. Actualizar debe conservar la búsqueda y consultar datos nuevos. |

La confirmación al modificar una factura explica el comportamiento existente:
se siguen recalculando sus importes o quitando la factura al cambiar el estado.
No se ha añadido todavía una bitácora ni documentos inmutables.

Validación técnica: pruebas de negocio, tipos, lint, ciclo HTTP local con D1 y
compilaciones de ambos destinos. Las pruebas escriben solamente registros ficticios
locales; no se alteran las órdenes guardadas en el Site ni la base de Netlify.
