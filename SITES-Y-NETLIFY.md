# Pacific Tech: pruebas en Sites y despliegue en Netlify

La interfaz, el catálogo, las rutas HTTP y las reglas de costos, estados y facturas
se mantienen en un único proyecto. Sites es un entorno privado de pruebas. Su
base comienza vacía y es independiente de la base del taller en Netlify.

## Qué cambia según el destino

| Elemento | Netlify (predeterminado) | Sites |
| --- | --- | --- |
| Compilar | `pnpm run build` | `pnpm run build:sites` |
| Desarrollo | `pnpm run dev` | `pnpm run dev:sites` |
| Acceso | Netlify Identity | Acceso privado de Sites / ChatGPT |
| Datos | Postgres | D1 |
| Esquema | `db/schema.ts` | `db/sites-schema.ts` |
| Adaptadores | `platforms/netlify/` | `platforms/sites/` |
| Migraciones | `netlify/database/migrations/` | `db/sites-migrations/` y SQL de entrega en `drizzle/` |

`DEPLOY_TARGET=sites` selecciona Sites durante la compilación. Si no se define,
se compila Netlify. La selección se hace en Vite, nunca a partir de una cabecera
del visitante. La versión Netlify no confía en las cabeceras de identidad de Sites.

## Probar cambios aquí

1. Instalar con `pnpm install --frozen-lockfile`.
2. Preparar la base local: `pnpm run db:migrate:sites:local`.
3. Iniciar `pnpm run dev:sites` y abrir la dirección local que muestra Vite.
4. Usar «Entrar con ChatGPT». Solo en desarrollo, Sites simula un usuario local.
   Esa simulación no forma parte de la compilación de producción.
5. Crear órdenes ficticias, editar, entregar, anular y revisar el catálogo.
6. Con la vista previa abierta, `pnpm run test:sites:local` verifica el ciclo de
   una orden ficticia. La prueba solo acepta localhost y deja su orden anulada.
7. Compilar ambos destinos y ejecutar pruebas, lint y tipos antes de publicar.

Las pruebas de interfaz se hacen sobre `app/`, las reglas de negocio sobre `lib/`.
Una modificación de esquema exige actualizar ambos esquemas y generar las dos
migraciones; no se convierte SQL de SQLite directamente en SQL de PostgreSQL.
Las búsquedas de D1 y PostgreSQL pueden diferir en mayúsculas de caracteres no
ASCII; comprobar búsquedas con nombres acentuados cuando se modifique esa función.

## Migraciones de Sites

`pnpm run db:generate:sites` genera SQL y snapshots con Drizzle y prepara el mismo
SQL en archivos planos en `drizzle/`, formato utilizado por Wrangler y Sites.
El script rechaza reemplazar una migración preparada con contenido diferente.
Los snapshots originales quedan en `db/sites-migrations/` para la siguiente
comparación. Las migraciones son de esquema, no contienen clientes ni datos de prueba.
No editar una migración ya aplicada: generar una nueva. Sites las aplica al publicar.

El identificador de `wrangler.sites.json` solo configura una base emulada local.
La base real de Sites se declara por el nombre lógico `DB` en `.openai/hosting.json`
y la administra la plataforma. Los archivos `.wrangler/` no se publican.

## Publicar la prueba en Sites

Conservar el mismo proyecto de `.openai/hosting.json` para todas las iteraciones.
Configurar las variables `BUSINESS_*` desde Sites y mantener el sitio privado.
En este entorno los datos de factura están identificados como pruebas; no son
los datos de facturación reales del taller. Publicar después de `pnpm run build:sites`.
La publicación actualiza el código y conserva las órdenes de prueba almacenadas.

## Volver a Netlify al finalizar

1. Llevar este mismo código, incluido `platforms/`, el archivo de bloqueo y las
   migraciones de PostgreSQL, al repositorio conectado con Netlify.
2. Ejecutar pruebas, lint, tipos y `pnpm run build`.
3. Conservar `netlify.toml`, el comando de compilación `pnpm run build` y `dist`.
   No definir `DEPLOY_TARGET=sites` en Netlify. Conservar las variables reales de
   Identity, conexión y `BUSINESS_*` en Netlify.
4. Revisar cualquier migración nueva de PostgreSQL y disponer de un respaldo antes
   de desplegarla sobre el taller.
5. Seguir el flujo de publicación del README y verificar el ingreso, una consulta,
   una modificación y la impresión en el destino.

No hay sincronización automática entre bases. Volver a Netlify publica cambios de
código; no importa órdenes de pruebas ni reemplaza clientes existentes. Si más
adelante se necesitan datos de Sites, deben exportarse y revisarse en una migración
específica, resolviendo identificadores y números de orden antes de importar.

## Seguimiento, comunicación y reportes

El código compartido incluye filtros por técnico y fecha de ingreso, entrega
estimada, serial / IMEI, garantía configurable, comprobante imprimible, notas
independientes y cambios de estado con fecha y autor. El historial comienza con
esta actualización: las notas anteriores se conservan, sin inventar autores ni
fechas. Cada edición exige la versión leída; un conflicto devuelve 409 y la
interfaz permite cargar la orden actual después de revisar el borrador.

Las migraciones nuevas agregan `equipment.version` (inicialmente 1),
`equipment.estimated_exit_date` y `equipment_history`, preservando los registros.
Las migraciones de PostgreSQL están en `netlify/database/migrations/`; Sites
aplica el equivalente D1 desde `drizzle/`. Deben acompañar el código al desplegar.

Los mensajes de WhatsApp y correo son enlaces con texto para revisar. El usuario
envía desde su aplicación y luego pulsa «Registrar contacto realizado» para
conservar destinatario, canal, texto y autor. Abrir el enlace no registra un envío
ni demuestra recepción. No requiere servicios de mensajería ni claves adicionales.

«Indicadores y reportes» separa carga actual (activos, listos y plazos vencidos)
de resultados del período (ingresos no anulados, entregas y facturación por fecha
de salida). El promedio mide días de ingreso a entrega; la agrupación usa el
técnico asignado actualmente. Los importes facturados no representan pagos
cobrados. Las consultas recorren páginas de 500 registros en el servidor.

El CSV descarga todas las órdenes ingresadas en el período y técnico elegidos,
incluidas las anuladas, con montos en USD y protección ante fórmulas en texto.
El resumen de indicadores puede imprimirse o guardarse como PDF. Las rutas de
reporte y descarga requieren sesión y envían `private, no-store`.

Con la vista previa local abierta, `pnpm run test:tracking:local` comprueba estos
flujos con datos ficticios y deja las órdenes creadas anuladas. La vista del cliente fue retirada; la integración comercial queda fuera de esta aplicación.

## Inventario de repuestos

El botón «Inventario» abre el catálogo propio del taller: código único, nombre,
proveedor, costo de compra, existencias y stock mínimo. Los códigos se guardan en
mayúsculas. El inventario comienza vacío; el catálogo de precios anterior no se
convierte en existencias supuestas. La alerta se activa cuando stock ≤ mínimo,
incluido stock cero, y aparece también junto al botón de inventario.

Las existencias iniciales y cada entrada o salida generan un movimiento con
fecha, autor, motivo, cantidad, costo unitario y saldo resultante. Las correcciones
de metadatos usan control de versión; las existencias se cambian mediante
movimientos. El servidor impide stock negativo y repeticiones de la misma operación.

Desde una orden, «Repuestos del inventario» permite asociar unidades y descontarlas
atómicamente. Las devoluciones están vinculadas al consumo original, conservan su
costo unitario y no pueden superar las unidades utilizadas. Se permiten devoluciones
de órdenes cerradas; anular o entregar una orden no repone piezas automáticamente.
Los movimientos asociados también aparecen en el historial de la orden. El costo
de compra no modifica los precios facturados al cliente ni las notas anteriores.

Las tablas `inventory_items` e `inventory_movements` tienen migraciones equivalentes
en PostgreSQL y D1. Las operaciones de stock y auditoría comparten transacción;
la implementación D1 usa lotes atómicos y actualizaciones condicionadas por versión.
La autenticación es la misma que la del registro; los permisos por función también
protegen las operaciones del inventario.

`pnpm run test:inventory:local` prueba consumos simultáneos, reintentos sin duplicados,
devoluciones acotadas, costos históricos y acceso privado con datos ficticios.
Deja el repuesto de prueba en la base local y la orden anulada. La publicación
incluye sólo código y migraciones; no lleva esos datos al Site o a Netlify.

## Roles, usuarios y asignaciones

Solo hay dos roles: **Administrador** y **Técnico**. El administrador gestiona ingresos,
asignaciones, usuarios, inventario, salidas, facturas, pagos y respaldos. El técnico
consulta sus órdenes, registra diagnóstico, trabajo, notas, adjuntos, repuestos y
el monto de su mano de obra; puede consultar e imprimir sus facturas a Pacific Tech.
La salida y la emisión definitiva siguen a cargo del administrador.

«Órdenes abiertas» muestra trabajos sin cuenta asignada, en ingreso, diagnóstico
o reparación. Cada técnico puede tomar los libres o los reservados a su nombre.
Una actualización condicional por versión asigna su cuenta y marca «En reparación»;
dos reclamos simultáneos tienen un único ganador. El servidor decide quién reclama,
sin aceptar el técnico enviado por el navegador. Antes de tomar una orden solo se
expone su ficha de trabajo, no contactos del cliente, pagos ni adjuntos.
«Mis órdenes», sus filtros y contadores usan el identificador de cuenta.

El desplegable ofrece **Anthony, Marcos, Valentín y Xavier**. No se inventan correos.
El administrador vincula cada nombre a una cuenta real en «Usuarios y permisos».
El vínculo es único incluso si la cuenta está bloqueada; se libera quitándolo
explícitamente. Puede reservarse una orden por nombre antes de vincular la cuenta;
luego ese técnico puede tomarla. Si ya existe una cuenta activa vinculada, el
administrador puede asignársela directamente. Las asignaciones históricas conservan
sus nombres. Cada cambio de asignación se registra en el historial.

Las cuentas antiguas Recepción/Solo lectura se muestran como técnicos bloqueados
hasta que el administrador decida su nuevo acceso; no se convierten en administradores.
Las cuentas existentes de técnicos conservan sus órdenes, y necesitan vincular un
nombre para tomar trabajos nuevos. Las cuentas desconocidas quedan bloqueadas.
`APP_USER_ROLES` solo inicializa cuentas ausentes; un administrador inicial queda
protegido. No se permite desactivar ni cambiar el propio rol o el del administrador
protegido. El correo verificado identifica la cuenta y no se edita. La gestión no
envía invitaciones, crea contraseñas ni modifica el acceso privado de Sites/Identity.

El técnico recibe la mano de obra propia y el total de sus facturas de mano de obra,
pero no costos de compra/piezas, reportes generales, facturas históricas a clientes
ni pagos. Los límites se aplican en servidor, incluidas las descargas de adjuntos.
Notas y archivos son contenido libre; no se clasifican los importes escritos manualmente.
Los cambios de permisos se aplican en solicitudes nuevas; una página abierta se recarga.

La prueba `node scripts/check-staff-local.mjs` usa exclusivamente el sitio/base locales
y restaura el administrador al terminar.

## Facturación de técnicos a Pacific Tech

Las nuevas órdenes tienen `invoice_kind=technician`. Al confirmar la salida se
guarda el nombre que realizó el trabajo en `invoice_technician` y se factura solo
`labor_cost_cents`. El PDF y correo preparado muestran «Trabajo realizado por»,
equipo, orden, servicio y total; el destinatario es Pacific Tech. El correo utiliza
el correo empresarial configurado, nunca el correo del cliente de esa reparación.
No se envía automáticamente.

Las facturas ya emitidas conservan su formato e impuestos históricos mediante
`invoice_kind=customer`, valor predeterminado de la migración. Una orden antigua
abierta emite su siguiente factura bajo el formato nuevo. Los pagos existentes se
respetan: si superan la nueva mano de obra hay que corregirlos antes de emitir.
No se reasigna una factura entregada; primero se reabre la orden. El nombre de una
factura no cambia al editar el perfil del técnico.

## Abonos y saldos

En cada orden, «Pagos y saldo» muestra importe, abonado y saldo; admite efectivo,
transferencia, tarjeta, Yappy y otro, con concepto y referencia opcional. Antes de
la entrega se cobra sobre el importe estimado **guardado**; después, sobre el total
de la factura, conservando los impuestos históricos. No se permite cobrar de más,
cobrar órdenes anuladas ni registrar importes negativos/fraccionarios en centavos.
No procesa cargos bancarios. En órdenes nuevas registra pagos de Pacific Tech al técnico por su mano de obra; las órdenes históricas conservan sus cobros anteriores.

Cada pago tiene identificador de reintento, fecha del servidor y autor. Administrador
puede anular íntegramente un pago con motivo; se crea un asiento negativo vinculado
al original y ambos se conservan. No hay borrado ni reembolsos bancarios automáticos.
No se puede reducir el total por debajo de lo abonado, ni anular/reabrir una orden
entregada con pagos vigentes. Para corregir un pago parcial: anular el original y
registrar el importe correcto, con sus motivos.

El acumulado `equipment.paid_cents`, el asiento de `payments` y el historial se
guardan atómicamente. Pagos y ediciones comparten la versión de orden, de modo que
dos cobros concurrentes no pueden superar su saldo. Los pagos antiguos no se
deducen de las facturas: las órdenes existentes empiezan con cero pagos registrados.
«Facturado este mes» sigue representando facturación, no caja. El listado muestra
estado de pago y saldo; el detalle contiene el historial paginado y las anulaciones.

Validación: `node tests/index.js`, `node scripts/check-role-routes.mjs` y
`node scripts/check-payments-local.mjs` (este último necesita Sites local con rol
administrador). Las órdenes de prueba se dejan anuladas y sus abonos revertidos.

## Fotos y adjuntos

«Fotos y adjuntos» en una orden permite subir JPG, PNG, WebP y PDF de hasta 3 MB
con etapa (ingreso, reparación, entrega) y descripción. El administrador puede subir y consultar; el técnico lo hace en sus propias órdenes. Se validan tamaño durante la
lectura del cuerpo y firma del tipo; SVG/HTML no están admitidos. PDF se descarga,
las imágenes tienen vista previa privada y descarga. No es un servicio de análisis
antivirus ni de conversión de imágenes.

Los archivos son inmutables, con hash SHA-256, identificador de reintento, autor
y fecha. Un reintento no duplica el adjunto ni su evento de historial. Si se subió
la evidencia equivocada, se conserva y se añade la corrección con su descripción.
Los archivos no están en `public/` ni tienen una URL de almacenamiento pública;
cada descarga valida sesión y busca la clave exclusivamente en la base.

Sites usa el binding R2 `FILES`; Netlify usa el almacén de Netlify Blobs
`pacific-tech-attachments`, que persiste entre publicaciones. El adaptador usa
consistencia fuerte, según la [documentación oficial de Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
La base contiene solo metadatos en `attachments`, con migraciones en ambas
plataformas. Los bytes se suben antes de confirmar metadatos e historial; un
fallo ambiguo de base puede dejar un objeto sin referencia, inaccesible desde la
aplicación. No se borra automáticamente para evitar pérdida ante una confirmación
de resultado incierto. La limpieza de esos objetos requiere revisión del almacén.

**Migrar datos entre plataformas:** publicar el código en Netlify no copia los
archivos ni la base de Sites. Si se quieren trasladar pruebas, exportar los
registros y copiar cada objeto conservando `object_key` y comprobando `sha256`.
El despliegue Netlify debe tener su contexto de Blobs y las migraciones aplicadas;
el desarrollo local de ese adaptador se realiza bajo `netlify dev`.

## Copia descargable de registros

Administrador tiene «Copias de registros» en la pantalla principal. Descarga un
JSON versionado de órdenes, historial, inventario, movimientos, pagos y metadatos
de adjuntos. Los datos se leen en una instantánea: transacción `repeatable read`
en PostgreSQL y lote atómico en D1. Exportaciones mayores a 2 MB de datos se
rechazan sin entregar una copia parcial; para bases grandes usar respaldo del
proveedor. No se incluyen credenciales, roles de entorno ni bytes de archivos.

**No sustituye un respaldo completo:** guardar también los archivos de cada orden
o una copia del almacén de objetos. `scripts/backup-db.sh` mantiene el volcado
completo PostgreSQL para Netlify, pero tampoco incluye Netlify Blobs. La copia
JSON es una exportación portable para revisión/restauración técnica validada sobre
una base vacía; no hay importación automática ni restauración sobre la base activa.
No se ha programado una ejecución automática de respaldos.

## Acceso de clientes y Odoo

Por decisión del usuario se retiraron la vista privada `/cliente` y su enlace.
Los clientes accederán desde la página de compra; no se está construyendo un
portal de clientes en esta aplicación. Odoo Estándar no incluye la API externa:
https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
Una integración automática requeriría Personalizado y un enlace servidor a servidor
con una cuenta de integración restringida. Recepción registraría órdenes en Reparaciones
(`repair.order`); esta aplicación importaría su referencia única como órdenes abiertas,
y los técnicos las tomarían aquí. El identificador externo evitaría duplicados.
No se ha conectado ninguna cuenta ni sincronizado datos con Odoo.

Como alternativa sin cambiar de plan, Odoo puede exportar CSV/XLSX. Habría que añadir
un importador validado a esta aplicación; todavía no existe ese flujo de importación.
https://www.odoo.com/documentation/19.0/applications/essentials/export_import_data.html
No se cambió la audiencia del Site ni se enviaron mensajes a clientes.

Pruebas de adjuntos: `node scripts/check-attachments-local.mjs` comprueba carga,
descarga exacta, reintentos y privacidad. El respaldo de registros incluye también
usuarios y auditoría de permisos; siguen excluidos los archivos y las variables
de entorno. La restauración debe conservar los IDs de usuarios para mantener las
asignaciones de equipos.
