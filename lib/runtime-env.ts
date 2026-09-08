/**
 * Acceso al entorno, aislado del proveedor.
 *
 * En Cloudflare el entorno llegaba por `import { env } from "cloudflare:workers"`,
 * un módulo que solo existe dentro de workerd. En Netlify Functions el runtime es
 * Node, así que la fuente es `process.env`. Todo el código de la aplicación pasa
 * por aquí para que cambiar de plataforma vuelva a ser un solo archivo.
 */

export type RuntimeEnv = {
  /** JSON: identidad verificada (ID o correo en minúsculas) → rol. */
  APP_USER_ROLES?: string;
  // Ni la conexión a Postgres ni el secreto de Identity aparecen aquí. La
  // primera la inyecta Netlify Database en NETLIFY_DB_URL y la lee db/index.ts,
  // que es el único sitio que la necesita; el segundo dejó de existir cuando la
  // validación de sesión pasó a preguntarle a GoTrue en lugar de comprobar la
  // firma en local (lib/identity-token.ts).

  /** Opcional: rol que el usuario debe tener para entrar al registro. */
  NETLIFY_IDENTITY_REQUIRED_ROLE?: string;
  /** Selección explícita del proveedor de autenticación. Nunca se autodetecta. */
  AUTH_PROVIDER?: string;
  /** URL canónica del sitio, inyectada por Netlify. */
  URL?: string;
  /** URL del deploy actual (preview o rama), inyectada por Netlify. */
  DEPLOY_PRIME_URL?: string;
  /** production | deploy-preview | branch-deploy | dev. La inyecta Netlify. */
  CONTEXT?: string;

  // Datos del emisor de la factura. Fuera del código a propósito: incluyen el
  // RUC y la cuenta bancaria, que no deben vivir en el control de versiones.
  // Las listas se separan con "|".
  BUSINESS_LEGAL_NAME?: string;
  BUSINESS_TAX_ID?: string;
  BUSINESS_ADDRESS?: string;
  BUSINESS_EMAIL?: string;
  BUSINESS_PHONE?: string;
  BUSINESS_WEBSITE?: string;
  BUSINESS_PAYMENT_METHODS?: string;
};

export function getEnv(): RuntimeEnv {
  return (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {};
}

/**
 * Netlify pone CONTEXT en "production" tanto para el sitio en producción como
 * para los deploys de la rama de producción. Cualquier otro valor —o su
 * ausencia, que es el caso en local— cuenta como entorno no productivo.
 */
export function isProductionContext(environment: RuntimeEnv = getEnv()) {
  return environment.CONTEXT?.trim() === "production";
}

/** Base absoluta del sitio, necesaria para hablar con la API de Identity. */
export function siteUrl(environment: RuntimeEnv = getEnv()) {
  return (
    environment.DEPLOY_PRIME_URL?.trim() ||
    environment.URL?.trim() ||
    "http://localhost:3000"
  );
}
