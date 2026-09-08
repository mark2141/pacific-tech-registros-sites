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
flujos con datos ficticios y deja las órdenes creadas anuladas. La vista privada del
cliente se describe abajo; su acceso externo sigue pendiente.

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

## Roles y permisos

`APP_USER_ROLES` es un objeto JSON en el entorno del servidor que asigna un ID de
usuario verificado o un correo en minúsculas a `admin`, `recepcion`, `tecnico` o
`lectura`. Un ID explícito prevalece sobre el correo. No se aceptan roles enviados
por el navegador. Una cuenta sin asignación o una configuración inválida obtiene
solo lectura; el proveedor sigue siendo quien decide si puede acceder al sitio.

Ejemplo: `{"dueño@ejemplo.com":"admin","recepcion@ejemplo.com":"recepcion","tecnico@ejemplo.com":"tecnico"}`.
La asignación se administra en las variables de entorno de Sites o Netlify; esta
versión no agrega una pantalla para invitar usuarios ni cambiar sus roles. Cambiar
esta variable requiere publicar de nuevo. No concede acceso al Site ni invita a
nadie: el acceso privado y Netlify Identity siguen siendo independientes.

| Acción | Administrador | Recepción | Técnico | Solo lectura |
| --- | --- | --- | --- | --- |
| Consultar órdenes, costos, reportes, inventario y pagos | Sí | Sí | Sí | Sí |
| Ingresos, datos del cliente, importes, entrega, anulación/reapertura | Sí | Sí | No | No |
| Diagnóstico, descripciones, plazo y estado operativo de órdenes abiertas | Sí | Sí | Sí | No |
| Notas, contacto, consumo/devolución de repuestos | Sí | Sí | Sí | No |
| Catálogo y entradas/salidas manuales de stock | Sí | Sí | No | No |
| Registrar abonos | Sí | Sí | No | No |
| Anular un pago registrado | Sí | No | No | No |

El técnico puede trabajar sobre las órdenes abiertas del taller; no se limita la
lectura ni el trabajo al nombre libre de «técnico asignado». Las órdenes entregadas
o anuladas no pueden reabrirse o editarse con ese rol. Las devoluciones de piezas
siguen permitidas en órdenes cerradas. Los campos bloqueados también se comprueban
en la API y, para cambios de orden, dentro de la transacción/control de versión.

Antes de implementar en **Netlify**, configura `APP_USER_ROLES` con las cuentas de
Identity del taller y aplica las nuevas migraciones. No copies la identidad local
de Sites a producción. Sin configuración todos los usuarios serán de solo lectura.
Para Sites local, usa `.dev.vars` (ignorado):
`APP_USER_ROLES='{"seedy@sites.test":"admin"}'`.

## Abonos y saldos

En cada orden, «Pagos y saldo» muestra importe, abonado y saldo; admite efectivo,
transferencia, tarjeta, Yappy y otro, con concepto y referencia opcional. Antes de
la entrega se cobra sobre el importe estimado **guardado**; después, sobre el total
de la factura, conservando los impuestos históricos. No se permite cobrar de más,
cobrar órdenes anuladas ni registrar importes negativos/fraccionarios en centavos.
No procesa cargos bancarios: registra cobros realizados por el taller.

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
con etapa (ingreso, reparación, entrega) y descripción. Administrador, recepción
y técnico pueden subir; lectura puede consultar. Se validan tamaño durante la
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

## Vista privada del cliente

El detalle enlaza «Vista del cliente (privada)». `/cliente?orden=ID` exige la misma
sesión del taller y presenta solo orden, nombre, equipo, estado, fechas, importe
y saldo. No envía al navegador notas internas, diagnóstico libre, autor de notas,
costos de compra ni archivos. Esta vista sirve para revisar el contenido; no es
todavía un portal accesible por clientes externos ni un enlace secreto.

El acceso externo requerirá autenticación propia o enlaces aleatorios revocables
con vencimiento y rutas expresamente autorizadas. No se cambió la audiencia del
Site ni se habilitó un endpoint público por número de orden. Tampoco se enviaron
mensajes a clientes.

Pruebas de esta ronda: `node scripts/check-attachments-local.mjs` valida carga,
descarga exacta, reintentos concurrentes, acceso privado, exportación y exclusión
de notas internas en la vista del cliente. Deja una orden anulada con una imagen
ficticia de un píxel en la base/almacén locales; no publica esos datos.
