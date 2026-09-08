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
flujos con datos ficticios y deja las órdenes creadas anuladas. Pagos parciales,
permisos por función y portal del cliente siguen pendientes.

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
La autenticación es la misma que la del registro; este bloque no agrega roles.

`pnpm run test:inventory:local` prueba consumos simultáneos, reintentos sin duplicados,
devoluciones acotadas, costos históricos y acceso privado con datos ficticios.
Deja el repuesto de prueba en la base local y la orden anulada. La publicación
incluye sólo código y migraciones; no lleva esos datos al Site o a Netlify.
