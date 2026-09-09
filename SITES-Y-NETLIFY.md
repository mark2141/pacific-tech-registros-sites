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

«Usuarios y permisos» permite a Administrador añadir cuentas por correo, cambiar
nombre/rol y bloquear o reactivar accesos. No envía invitaciones, crea contraseñas
ni cambia el acceso del proveedor (Sites privado o Netlify Identity). Los cambios
se aplican en las siguientes solicitudes; la interfaz ya abierta se actualiza al
recargar. Los datos ya vistos no pueden retirarse de un navegador remoto.

Las tablas `staff` y `staff_audit` guardan roles, estado, versión y auditoría de
cambios. El correo verificado identifica la cuenta; no se puede cambiar desde la
interfaz. `APP_USER_ROLES` **solo inicializa una cuenta que aún no existe** cuando
inicia sesión; posteriormente prevalece el rol de la base. Usuarios sin asignación
inicial reciben solo lectura. Los administradores inicializados desde esa variable
quedan protegidos: no pueden desactivarse ni cambiarse de rol desde la aplicación.
Tampoco se permite cambiar el propio rol o bloquear la propia cuenta. Las cuentas
no se borran. Esto conserva al menos el administrador protegido inicial incluso
ante cambios simultáneos entre otros administradores.

| Rol | Vista y permisos |
| --- | --- |
| Administrador | Todas las órdenes, información económica, inventario, cobros, anulaciones de pago, copias y gestión de usuarios. |
| Recepción | Todas las órdenes, datos de clientes, importes, entregas, inventario y cobros. No gestiona usuarios, descarga copias generales ni anula pagos. |
| Técnico | «Mis órdenes»: únicamente las asignadas a su cuenta, incluidos contadores y búsqueda. Trabajo, notas, adjuntos y consumo/devolución de repuestos propios. Sin campos económicos, reportes financieros, catálogo de precios, pagos ni contacto con plantillas de importes. No entrega, anula ni reabre órdenes. |
| Solo lectura | Consulta operativa de todas las órdenes, notas y adjuntos. Sin escrituras ni campos económicos, pagos, reportes económicos o catálogo de precios. |

La asignación usa `equipment.assigned_member_id`, estable aunque se repitan nombres.
Administrador y recepción eligen una cuenta activa con rol Técnico. Las órdenes
anteriores conservan su nombre de técnico y quedan **sin vincular** hasta asignarlas;
no se intenta adivinar qué cuenta corresponde a un nombre. Guardar otros campos
no borra el nombre anterior. Cada reasignación genera un evento de historial.
Bloquear al técnico conserva sus órdenes; administrador o recepción puede reasignarlas.

Los límites se comprueban en listados, métricas, detalle, historial, adjuntos y
movimientos. Las escrituras técnicas vuelven a validar asignación dentro de su
transacción o condición atómica. Los campos financieros se eliminan de las
respuestas para Técnico/Lectura; no se ocultan solo mediante CSS. Los eventos de
pago y contacto preparado también se excluyen del historial para esos roles.
Las notas y archivos son contenido libre: no se analizan para detectar importes
escritos manualmente; quien los añade debe considerar quién puede consultar la orden.

Para Netlify, configura el administrador inicial en `APP_USER_ROLES` antes de su
primer acceso, usando su correo de Identity, y aplica las migraciones. Ejemplo:
`{"administrador@ejemplo.com":"admin"}`. Después, administra las cuentas desde
la aplicación. La recuperación excepcional de un administrador bloqueado por una
intervención directa en la base requiere al propietario de la infraestructura;
no hay un mecanismo de elevación de permisos público.

Para Sites local, `.dev.vars` conserva
`APP_USER_ROLES='{"seedy@sites.test":"admin"}'`. Las pruebas
`node scripts/check-staff-local.mjs` alteran **solo** el usuario/base locales para
recorrer roles y restauran el administrador en su bloque de limpieza.

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

## Acceso de clientes y Odoo

Por decisión del usuario se retiraron la vista privada `/cliente` y su enlace.
Los clientes accederán desde la página de compra; no se está construyendo un
portal de clientes en esta aplicación. La integración con Odoo queda aplazada.
No se cambió la audiencia del Site ni se enviaron mensajes a clientes.

Pruebas de adjuntos: `node scripts/check-attachments-local.mjs` comprueba carga,
descarga exacta, reintentos y privacidad. El respaldo de registros incluye también
usuarios y auditoría de permisos; siguen excluidos los archivos y las variables
de entorno. La restauración debe conservar los IDs de usuarios para mantener las
asignaciones de equipos.
