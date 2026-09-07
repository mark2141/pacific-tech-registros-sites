# Pacific Tech — Registro de servicio técnico

Aplicación interna para registrar los equipos que ingresan al taller, seguir su
reparación, controlar costos y emitir una factura no fiscal al entregarlos.

| Aspecto | Configuración actual |
| --- | --- |
| Producción | Netlify Functions (Node.js) |
| Rama de despliegue | `netlify-migration` |
| Rama principal | `main` |
| Base de datos | Netlify Database (Postgres) + Drizzle ORM |
| Acceso | Netlify Identity |
| Interfaz | Next.js App Router sobre vinext |

## Qué permite hacer

- Registrar clientes, equipos, accesorios y fallas reportadas.
- Generar órdenes mensuales con el formato `OT-YYYYMM-NNN`.
- Asignar técnicos y documentar diagnóstico, piezas, mano de obra y daños.
- Buscar, filtrar y paginar todas las órdenes desde el servidor.
- Corregir datos sin perder el historial del ingreso.
- Marcar órdenes como anuladas cuando se crearon por error.
- Emitir una factura no fiscal imprimible o guardable como PDF.
- Consultar el catálogo privado de repuestos con la misma sesión del registro.

## Flujo de una orden

| Estado | Significado |
| --- | --- |
| `ingreso` | El equipo fue recibido. |
| `diagnostico` | Se está identificando la falla. |
| `reparacion` | El trabajo técnico está en curso. |
| `listo` | El equipo está reparado y espera al cliente. |
| `entregado` | El cliente recibió el equipo y se emitió la factura. |
| `anulado` | La orden se creó por error o el ingreso fue cancelado. |

Las órdenes no se eliminan: se anulan para conservar el correlativo mensual y
el rastro de lo ocurrido. Si una orden entregada se anula o cambia de estado,
sus datos de factura dejan de contar como facturación.

## Entorno de pruebas en Sites

El mismo código puede ejecutarse en Sites y en Netlify. La interfaz y las reglas
de negocio son compartidas; solo cambia el adaptador de autenticación y base de
datos. Sites usa una base D1 independiente y Netlify conserva Postgres e Identity.

Consulta [SITES-Y-NETLIFY.md](SITES-Y-NETLIFY.md) para probar, publicar y volver a Netlify.

## Desarrollo local

### Requisitos

- Node.js `>=22.13.0` —la versión recomendada está en `.nvmrc`—.
- pnpm, definido por el proyecto y su archivo de bloqueo.

### Inicio rápido

```bash
pnpm install
pnpm run dev
```

La plantilla de configuración está en `.env.example`. No coloques credenciales,
datos bancarios ni información real del negocio dentro del repositorio.

### Comandos útiles

| Comando | Uso |
| --- | --- |
| `pnpm run dev` | Inicia Vite para desarrollo local. |
| `pnpm run preview` | Ejecuta el sitio mediante `netlify dev`. |
| `pnpm test` | Ejecuta las pruebas de negocio. |
| `pnpm run lint` | Revisa el estilo del código. |
| `pnpm run typecheck` | Comprueba los tipos sin generar archivos. |
| `pnpm run build` | Genera y valida el build de producción. |
| `pnpm run db:generate -- --name nombre` | Genera una migración de Drizzle. |
| `pnpm run db:backup` | Crea un respaldo local seguro de Postgres. |

`pnpm run preview` requiere la CLI de Netlify y que el directorio esté enlazado
al sitio correspondiente.

## Despliegue

Netlify despliega desde `netlify-migration`. `main` conserva la historia
principal del proyecto y debe seguir siendo la fuente de verdad.

Flujo recomendado para publicar cambios:

1. Trabajar en una rama corta y abrir un pull request hacia `main`.
2. Esperar que GitHub Actions complete pruebas, lint, tipos y build.
3. Fusionar el pull request en `main`.
4. Avanzar `netlify-migration` por *fast-forward* al mismo commit de `main`.
5. Verificar el deploy de Netlify antes de iniciar otro cambio.

De esta forma las dos ramas quedan alineadas sin mantener versiones distintas
del código. Un `push` a `netlify-migration` inicia el despliegue de producción.

### Preparación de Netlify

1. Conectar el repositorio al sitio y seleccionar `netlify-migration` como rama
   de producción.
2. Activar Netlify Identity en modo de invitación.
3. Configurar las variables `BUSINESS_*` utilizadas en las facturas.
4. Desplegar. Netlify aprovisiona la base y aplica las migraciones pendientes.

`netlify.toml` define el directorio publicado, Node.js y las cabeceras de
seguridad. El sitio usa Netlify Functions, no Edge Functions.

## Configuración

### Variables principales

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `AUTH_PROVIDER` | No | Proveedor de acceso; usa el modo estricto por defecto. |
| `NETLIFY_IDENTITY_REQUIRED_ROLE` | No | Restringe el acceso a un rol concreto. |
| `BUSINESS_LEGAL_NAME` | Sí para facturas | Nombre legal del negocio. |
| `BUSINESS_TAX_ID` | Sí para facturas | RUC y dígito verificador. |
| `BUSINESS_ADDRESS` | Sí para facturas | Dirección del negocio. |
| `BUSINESS_EMAIL` | Sí para facturas | Correo de contacto. |
| `BUSINESS_PHONE` | Sí para facturas | Teléfono de contacto. |
| `BUSINESS_WEBSITE` | No | Sitio web mostrado en la factura. |
| `BUSINESS_PAYMENT_METHODS` | Sí para facturas | Formas de pago, separadas con `|`. |

No hace falta definir una cadena de conexión manual para la base de datos:
`@netlify/database` resuelve la conexión que administra la plataforma.

### Autenticación

| Valor de `AUTH_PROVIDER` | Entorno | Comportamiento |
| --- | --- | --- |
| `netlify-identity` | Netlify | Valida la sesión contra Netlify Identity. |
| `dev-bypass` | Solo desarrollo | Permite trabajar localmente sin una cuenta real. |

> `dev-bypass` desactiva la autenticación y nunca debe usarse con datos reales.
> El código lo bloquea cuando Netlify identifica el contexto como producción.

## Reglas importantes del negocio

### Facturación

- Los importes se guardan como centavos enteros para evitar errores de punto
  flotante.
- Al entregar una orden se guarda una instantánea de subtotal y total.
- Una corrección explícita de costos actualiza también esa instantánea.
- Las facturas nuevas no agregan ITBMS; el total es la suma de piezas y mano de
  obra.
- Los impuestos históricos se conservan para que las facturas anteriores sigan
  siendo coherentes.
- Las fechas operativas usan la zona horaria de Panamá y el formato
  `YYYY-MM-DD`.

### Migraciones

El esquema está en `db/schema.ts` y las migraciones se guardan en
`netlify/database/migrations/`.

```bash
pnpm run db:generate -- --name describe_el_cambio
```

Netlify aplica las migraciones antes de publicar. No deben ejecutarse a mano ni
editarse después de haber sido aplicadas; una corrección se genera como una
migración nueva.

### Seguridad

- Netlify Identity permanece en modo de invitación.
- Las sesiones se guardan en cookies `HttpOnly`, `Secure` y `SameSite=Lax`.
- El token de actualización permite renovar la sesión sin pedir la contraseña
  cada hora.
- El catálogo de precios requiere autenticación y responde con
  `Cache-Control: private, no-store`.
- Las variables `BUSINESS_*` permanecen fuera del código fuente.

## Estructura del proyecto

| Ruta | Contenido |
| --- | --- |
| `app/` | Pantallas, rutas y componentes de la aplicación. |
| `app/api/` | Endpoints de sesión, órdenes y recuperación de acceso. |
| `db/` | Esquema y acceso a Postgres mediante Drizzle. |
| `lib/` | Reglas de negocio, autenticación y utilidades compartidas. |
| `netlify/database/migrations/` | Historial de migraciones aplicado por Netlify. |
| `scripts/` | Herramientas operativas, incluido el respaldo de la base. |
| `tests/` | Pruebas automatizadas de las reglas del negocio. |

<details>
<summary><strong>Cómo funciona la sesión</strong></summary>

1. La pantalla de acceso envía las credenciales a `POST /api/session`.
2. El servidor las canjea contra Netlify Identity.
3. Los tokens vuelven en cookies `HttpOnly`; no se guardan en JavaScript.
4. Cada solicitud protegida valida la sesión antes de confiar en la identidad.
5. `POST /api/session/refresh` renueva el acceso y `DELETE /api/session` cierra
   la sesión eliminando ambas cookies.

Las invitaciones y recuperaciones llegan mediante fragmentos de URL. La
aplicación reconoce `invite_token`, `recovery_token` y los errores de Identity
para mostrar el formulario apropiado sin exponer los tokens al servidor más de
lo necesario.

</details>

<details>
<summary><strong>Detalles del modelo de datos</strong></summary>

La tabla `equipment` es la fuente de verdad de las órdenes. Agrupa:

- identificadores de orden y factura;
- datos del cliente y del equipo;
- diagnóstico, técnico, estado, daños y notas;
- piezas, mano de obra e instantánea de facturación;
- fechas de ingreso y salida, garantía y auditoría.

`created_at` y `updated_at` son marcas de tiempo con zona horaria. Las fechas
operativas se conservan como texto `YYYY-MM-DD` porque la facturación mensual y
las reglas del taller trabajan en la zona horaria de Panamá.

El campo histórico `serial_number` se mantiene para los registros importados,
aunque ya no se solicita ni se muestra en la aplicación.

</details>

## Integración continua

GitHub Actions ejecuta instalación con el archivo de bloqueo, pruebas, lint,
comprobación de tipos y build en cada `push` y `pull_request`.
