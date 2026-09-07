import type { AuthUser } from "./auth-user.ts";

export type AuthProvider = "netlify-identity" | "dev-bypass";

export const DEFAULT_AUTH_PROVIDER: AuthProvider = "netlify-identity";

export const DEV_BYPASS_USER: AuthUser = Object.freeze({
  email: "Sesión local de desarrollo",
  userId: "dev-bypass",
});

export class InvalidAuthProviderError extends Error {
  constructor(value: string) {
    super(
      `AUTH_PROVIDER inválido: ${value}. Usa "netlify-identity" o "dev-bypass".`,
    );
    this.name = "InvalidAuthProviderError";
  }
}

export class ForbiddenAuthProviderError extends Error {
  constructor() {
    super(
      'AUTH_PROVIDER="dev-bypass" no puede usarse en producción: desactiva la autenticación de toda la aplicación.',
    );
    this.name = "ForbiddenAuthProviderError";
  }
}

/**
 * El proveedor se elige por configuración explícita, nunca por "la cabecera o la
 * cookie que aparezca". Autodetectar sería un bypass total de autenticación, y
 * esta regla sobrevivió a la migración por la misma razón por la que existía en
 * Cloudflare: la selección explícita *es* el control de seguridad.
 *
 * `dev-bypass` sustituye al antiguo `public-test`, que abría la aplicación en
 * cualquier entorno. Ahora el modo abierto es imposible de activar en
 * producción, aunque alguien fije la variable por error.
 */
export function resolveAuthProvider(
  rawValue: unknown,
  { isProduction = false }: { isProduction?: boolean } = {},
): AuthProvider {
  if (rawValue === undefined || rawValue === null) return DEFAULT_AUTH_PROVIDER;

  const value = String(rawValue).trim();
  if (!value) return DEFAULT_AUTH_PROVIDER;

  if (value === "netlify-identity") return value;
  if (value === "dev-bypass") {
    if (isProduction) throw new ForbiddenAuthProviderError();
    return value;
  }

  throw new InvalidAuthProviderError(value);
}
