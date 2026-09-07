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

Esta adaptación conserva las funciones existentes. No implementa todavía la
bitácora, pagos parciales, permisos por función ni las demás mejoras propuestas
en el análisis; pueden incorporarse como siguientes iteraciones compartidas.
