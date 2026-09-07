# Migración a Netlify — estado y pasos pendientes

Este documento cubre el corte de Cloudflare (Workers + D1 + Access) a Netlify
(Functions + Netlify Database + Identity). El código ya está migrado; lo que
queda es la puesta en marcha, que necesita credenciales y una máquina con Node.

## Estado de verificación

Sobre Node 22.22.1 y pnpm 11.16.0, con `NITRO_PRESET=netlify`:

| Comando | Resultado |
| --- | --- |
| `pnpm install` | 469 paquetes, sin conflictos |
| `pnpm test` | 49 de 49 en verde |
| `pnpm run lint` | limpio |
| `pnpm run typecheck` | sin errores |
| `pnpm run build` | correcto, preset `netlify` |
| `drizzle-kit generate` | sin deriva contra `db/schema.ts` |
| SQL generado por Drizzle rc.4 | correcto en las cuatro consultas |
| Build en el CI de Netlify | correcto, las cinco etapas de vinext |

El build emite las Functions en `.netlify/functions-internal/server/` y los
estáticos en `dist/`, que es lo que `netlify.toml` publica. Las tres rutas
(`/`, `/api/equipment`, `/api/session`) se generan como dinámicas, y el
adaptador de Netlify Database y Drizzle quedan empaquetados en el servidor.

**Lo que sigue sin probarse es la ejecución**: nada de esto ha hablado con una
base de datos real ni con Identity. Que compile no significa que funcione.

### Requisito del entorno local

El paquete `nodejs` de Ubuntu viene reempaquetado (`+dfsg`) **sin Amaro**, el
componente que despoja los tipos de TypeScript. Con ese Node, `pnpm test` falla
con `ERR_UNKNOWN_FILE_EXTENSION` porque los tests importan `lib/*.ts`
directamente. Hay que usar Node de NodeSource o de nvm. Comprobación rápida:

```bash
node -p "process.config.variables.node_use_amaro"
```

Debe imprimir `true`. La imagen de build de Netlify usa Node oficial, así que
esto solo afecta al desarrollo local.

## Puesta en marcha, en orden

> **El orden ya no importa para la base.** Antes había que aprovisionarla a mano
> antes del primer deploy, porque el comando de build encadenaba
> `drizzle-kit migrate` y fallaba sin cadena de conexión. Ya no: la dependencia
> `@netlify/database` basta para que la plataforma aprovisione la base, y las
> migraciones las aplica ella misma antes de publicar. El paso 1 quedó vacío a
> propósito.

### 1. La base de datos: nada que hacer

No hay que crear nada ni copiar ninguna credencial. `@netlify/database` está en
las dependencias, así que Netlify aprovisiona la base e inyecta la cadena de
conexión en `NETLIFY_DB_URL`. No hay que copiarla a ninguna parte: la lee
`db/index.ts`.

Ojo con el driver. El adaptador `drizzle-orm/netlify-db` habla con Postgres por
HTTP a través del cliente de Neon, y Drizzle `1.0.0-rc.4` lo invoca con una
forma que ese cliente ya no acepta: **toda consulta fallaba en producción**
antes de tocar la red. `db/index.ts` usa `drizzle-orm/node-postgres` en su
lugar, que es lo mismo a lo que delega el propio adaptador cuando se le pone
`NETLIFY_DB_DRIVER=server`.

El esquema se aplica igual de solo: Netlify ejecuta lo que haya pendiente en
`netlify/database/migrations/` justo antes de publicar el deploy, y si alguna
migración falla, no publica. Para ver el estado:

```bash
netlify db status
```

> **No apliques las migraciones a mano** — ni con `drizzle-kit migrate`, ni con
> SQL directo. La plataforma lleva su propio historial de lo aplicado, y
> adelantarse por fuera lo desincroniza. Por eso `db:migrate` ya no existe como
> script y `netlify.toml` solo compila.

### 2. Migrar los datos de D1

Todavía **no se ha exportado nada de producción**. Con la base Postgres ya
migrada y vacía:

```bash
wrangler d1 execute pacific-tech-registros --remote --json \
  --command "SELECT * FROM equipment ORDER BY id" > equipment.json

node scripts/d1-export-to-postgres.mjs equipment.json > equipment.sql
```

Lee `equipment.sql` antes de aplicarlo. Va todo en una transacción y termina
adelantando la secuencia de `id` con `setval`, para que el próximo alta no
choque contra la clave primaria. Después:

```bash
psql "<cadena de conexión de netlify db status --show-credentials>" -f equipment.sql
```

Comprueba que el número de filas coincide y que el correlativo más alto del mes
en curso es el que esperabas.

### 3. Configurar Identity

1. Activa Netlify Identity en el sitio.
2. Ponlo en **invitación**, no en registro abierto.
3. Invita al personal del taller. Cada persona elige su contraseña al
   abrir el enlace del correo; no se fija desde el panel.
4. Define las variables `BUSINESS_*` con los datos reales del taller (ver
   `.env.example`). Sin ellas la factura se imprime con `— sin configurar —`
   en lugar del RUC y las formas de pago.

No hay ningún JWT secret que copiar. El panel de Netlify dejó de exponerlo, así
que la sesión se valida preguntándole a Identity en cada request en lugar de
comprobar la firma con una llave local.

Ojo con lo que eso implica: **la única puerta es la lista de usuarios de
Identity**. Antes, una instalación sin secreto devolvía 500 en todas las rutas y
fallaba en ruidoso; ahora la aplicación arranca en cuanto Identity responde. Si
el registro queda en abierto, cualquiera puede darse de alta y entrar. El modo
invitación del paso 2 dejó de ser una recomendación y pasó a ser el control.

### 4. Verificación funcional

La suite cubre los cálculos, no el recorrido. Esto hay que probarlo a mano en un
deploy preview:

- [ ] Entrar con una cuenta invitada; comprobar que una cuenta no invitada no entra.
- [ ] Crear una orden y verificar que el correlativo `OT-YYYYMM-NNN` continúa la
      secuencia correcta **sobre los datos migrados**, no desde 001.
- [ ] Recorrer los cinco estados.
- [ ] Marcar `entregado`: confirma que congela importes y asigna número de factura.
- [ ] Revertir una entrega: confirma que limpia los datos de factura.
- [ ] Abrir la factura e imprimirla; revisar el PDF.
- [ ] Buscar, filtrar por estado y paginar.
- [ ] Contrastar las métricas (contadores y facturado del mes) contra un `SELECT`
      directo sobre la base.
- [ ] Entrar sin sesión: debe verse la pantalla de acceso, no un error.
- [ ] Cerrar sesión y confirmar que la cookie caduca.
- [ ] Revisar que el logo y la imagen de la factura cargan (van por el Image CDN).
- [ ] Comprobar las cabeceras de seguridad en una respuesta dinámica y en un estático.

### 5. Corte

Mantén la D1 original intacta y accesible al menos una semana. Si algo no cuadra
en importes o correlativos, esa copia es la única fuente de verdad.

## Respaldo de la base de datos

Netlify Database (Neon) mantiene sus propias opciones de recuperación, pero un
respaldo descargable permite conservar una copia independiente antes de un
cambio grande o al cerrar el mes. Para eso está `scripts/backup-db.sh`.

Se ejecuta desde una máquina que tenga `pg_dump`, usando la cadena que entrega
`netlify db status --show-credentials`. Para que no quede copiada en el historial
del shell, se lee sin mostrarla:

```bash
# Abre Bash primero; macOS usa zsh por defecto y su `read` tiene otra sintaxis.
bash
read -r -s -p "NETLIFY_DB_URL: " NETLIFY_DB_URL; printf '\n'
export NETLIFY_DB_URL
pnpm db:backup
unset NETLIFY_DB_URL
exit
```

El script crea primero un archivo temporal con permisos privados y solo lo
renombra a `pacifictech-*.dump` cuando `pg_dump` termina correctamente. Conserva
los últimos 30 y elimina únicamente respaldos anteriores con ese patrón. La
carpeta está en `.gitignore`: contiene nombres, teléfonos y correos de clientes
y debe guardarse en almacenamiento cifrado.

Para restaurar sobre una base vacía:

```bash
PGDATABASE="$NETLIFY_DB_URL" pg_restore --no-owner --no-privileges \
  --clean --if-exists backups/pacifictech-AAAAMMDD-HHMMSS-XXXXXX.dump
```

## Riesgos conocidos

**Cuatro dependencias pre-release en la ruta de despliegue.** `vinext` (1.0.0-beta.8) declara que
todavía no es un reemplazo directo para toda carga de producción, y `nitro` 3
está en beta. **El build pasa entero en el CI de Netlify**, con las cinco etapas
de vinext y el preset `netlify`, así que este riesgo está en gran medida
retirado. Lo que queda es que ninguna de las dos garantiza estabilidad entre
versiones: están fijadas a versión exacta, y no deben subirse sin volver a
correr la verificación completa. Si algún día el preset se rompe, la salida es
el preset de Nitro para Node en un contenedor, no volver a Cloudflare.

**Drizzle va en `1.0.0-rc.4`, y el constructor sin configuración es frágil.**
`db/index.ts` llama a `drizzle()` sin argumentos. Esa forma **no existía igual
en toda la línea 1.0**: en `1.0.0-beta.22` se aceptaba `drizzle({ schema })`,
y en `rc.4` la clave `schema` desapareció —sustituida por `relations` con la
nueva API relacional— así que pasarla rompe la compilación. El registro de npm
conserva un dist-tag `revert-netlify` como rastro de ese vaivén.

La aplicación no usa `db.query.*`, que es lo único que alimentaba `schema`, así
que no pasar nada es correcto y además es la forma que sobrevive. Si algún día
subes de versión, comprueba lo primero que `drizzle()` sin argumentos siga
siendo válido. Ojo también: para drizzle-orm el tag `latest` sigue siendo
`0.45.2`; la línea 1.0 es pre-release.

**Las versiones están acopladas entre sí.** vinext beta.8 exige
`@vitejs/plugin-rsc` 0.5.34 o superior y falla el build con una versión menor.
No subas ni bajes ninguna de las dos por separado.

**`next/image` va por un loader propio.** `lib/netlify-image-loader.ts` apunta al
Image CDN de Netlify porque, al desaparecer el Worker, nadie atiende
`/_vinext/image`. Es la pieza que más probablemente necesite ajuste.

**Sin límite de intentos en el login.** `POST /api/session` no tiene rate
limiting. GoTrue aplica el suyo, pero conviene confirmar que es suficiente antes
de exponer el sitio.

## Cambios de comportamiento respecto a Cloudflare

| Antes | Ahora |
| --- | --- |
| Access resolvía el login antes del origen | La app tiene su propia pantalla de acceso |
| Migraciones en el primer request | Las aplica Netlify antes de publicar |
| `public-test` abría la app en cualquier entorno | `dev-bypass`, bloqueado por código en producción |
| Ejecución en el borde global | Una región AWS, con cold starts |
| `updated_at` como texto, con dos formatos mezclados | `timestamptz` real |
| Cierre de sesión en `/cdn-cgi/access/logout` | `DELETE /api/session` |

## Lo que sigue pendiente, y no lo resuelve la migración

Detectado en el análisis previo, sin tocar en este corte:

- **Factura descuadrada.** Editar costos de una orden ya entregada actualiza los
  renglones pero no la instantánea de importes, así que el PDF puede mostrar
  líneas que no suman su total. Está en `lib/equipment-update.ts`.
- **Búsqueda parcial.** El filtro de texto solo mira las órdenes ya cargadas en
  el cliente. Pasando 100 órdenes deja de encontrar registros antiguos. Postgres
  permite bajarlo a SQL con `ILIKE`.
- **Contraste WCAG.** `--blue` #087af5 se usa como color de texto en unos 13
  puntos y da 4.11:1, por debajo del mínimo de 4.5:1. `--blue-dark` #0866cf da
  5.51:1 y sirve como reemplazo directo.
- **Tamaños de la factura impresa.** Entre 8 y 10 px, demasiado pequeños.
- **No hay forma de anular una orden.** Solo GET, POST y PATCH.
- ~~RUC y cuenta bancaria incrustados~~ — resuelto: viven en las variables
  `BUSINESS_*` y el código ya no los contiene.
