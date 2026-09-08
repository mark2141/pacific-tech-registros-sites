# Primera revisión: cuatro cambios pequeños

## Revisión actual: permisos y pagos

- Tu cuenta de Sites tiene rol Administrador; aparece junto al correo. «Mi acceso»
  resume las funciones. Los roles de otras cuentas se asignan en el entorno del
  servidor, con las instrucciones de `SITES-Y-NETLIFY.md`.
- Abre una orden, guarda un importe de servicio y usa «Pagos y saldo». Registra un
  abono menor al total: deben actualizarse abonado, saldo y estado «Pago parcial».
- Completa el saldo: debe decir «Pagado». Intenta cobrar más: debe impedirlo.
- Anula un pago indicando motivo: el original se conserva marcado «Anulado» y
  aparece su asiento de anulación; el saldo vuelve a aumentar.
- Con pagos vigentes, intenta anular la orden o reducir el total por debajo de lo
  abonado: se explica por qué no se permite. Las facturas previas no se marcan como
  cobradas automáticamente.
- El diseño sigue con fondos lisos y acentos discretos en bordes y botones.

## Alcance de la primera revisión

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
En esta primera revisión todavía no había bitácora. La siguiente incorpora el
historial descrito abajo; los documentos siguen mostrando los datos guardados
actualmente en la orden.

Validación técnica: pruebas de negocio, tipos, lint, ciclo HTTP local con D1 y
compilaciones de ambos destinos. Las pruebas escriben solamente registros ficticios
locales; no se alteran las órdenes guardadas en el Site ni la base de Netlify.

## Segunda revisión: seguimiento de órdenes

1. Filtrar por técnico y rango de ingreso; revisar días en taller y fecha estimada.
2. Añadir notas desde «Historial de la orden» y cambiar un estado: ambos eventos
   deben mostrar autor y fecha. Las notas antiguas aparecen como nota anterior.
3. Registrar serial / IMEI y garantía; abrir «Comprobante de ingreso» e imprimir
   o guardar como PDF. También se abre al guardar un ingreso nuevo.
4. Abrir la misma orden en dos sesiones: guardar una y luego intentar guardar la
   otra. La segunda conserva su borrador y pide cargar la versión actual.

## Tercera revisión: comunicación e indicadores

1. En una orden, desplegar «Contactar al cliente». Elegir plantilla y canal,
   revisar destinatario y texto, y abrir WhatsApp o correo. Después de enviar,
   pulsar «Registrar contacto realizado». Verificar el último contacto y el
   evento en el historial. Las pruebas automatizadas nunca envían mensajes.
2. Abrir «Indicadores y reportes», elegir período y técnico y pulsar Consultar.
   Revisar carga actual, resultados del período y tabla por técnico. Los equipos
   anulados no cuentan como nuevos ingresos del período.
3. Descargar órdenes en CSV y usar Imprimir / PDF para el resumen. El CSV filtra
   por fecha de ingreso e incluye anulados identificados por estado; la
   facturación del panel filtra por fecha de salida. No son el mismo conjunto.

Este bloque agrega migraciones compatibles para Sites y Netlify. Los cambios
de código no sincronizan ni importan los datos de prueba a Netlify.

## Cuarta revisión: diseño discreto e inventario

Los filtros por técnico y fecha siguen siendo desplegables. Los fondos generales,
cabecera y tarjetas vuelven a superficies planas; se conservan acentos de color
en bordes y botones.

1. Abrir «Inventario» y crear un repuesto con proveedor, costo de compra, tres
   existencias y mínimo de dos. Consultar el movimiento de existencias iniciales.
2. Abrir una orden activa y desplegar «Repuestos del inventario». Asociar dos
   unidades: debe quedar una en stock y activarse la alerta de stock bajo.
3. Preparar una devolución y devolver una unidad: quedan dos disponibles. El
   historial de la orden registra ambas operaciones con su autor.
4. En inventario, cambiar el costo de compra. Una devolución del consumo anterior
   conserva el costo registrado originalmente. No cambia el precio de la factura.
5. Probar una cantidad superior al stock o devolver más unidades de las utilizadas:
   el servidor rechaza el movimiento y conserva las existencias.
