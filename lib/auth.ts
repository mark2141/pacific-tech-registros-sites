import type { AuthUser } from "./auth-user.ts";
import {
  DEV_BYPASS_USER,
  resolveAuthProvider,
  type AuthProvider,
} from "./auth-provider.ts";
import { getIdentityUserFromHeaders } from "./netlify-identity-auth";
import { getEnv, isProductionContext } from "./runtime-env";

export type { AuthUser } from "./auth-user.ts";
export {
  DEFAULT_AUTH_PROVIDER,
  ForbiddenAuthProviderError,
  InvalidAuthProviderError,
  resolveAuthProvider,
} from "./auth-provider.ts";

export function getAuthProvider(): AuthProvider {
  const environment = getEnv();
  return resolveAuthProvider(environment.AUTH_PROVIDER, {
    isProduction: isProductionContext(environment),
  });
}

export async function getAuthUserFromHeaders(
  requestHeaders: Pick<Headers, "get">,
): Promise<AuthUser | null> {
  const provider = getAuthProvider();
  if (provider === "dev-bypass") return DEV_BYPASS_USER;
  return getIdentityUserFromHeaders(requestHeaders);
}

/**
 * En Cloudflare el cierre de sesión era una URL que administraba Access. Aquí la
 * sesión es una cookie propia, así que se cierra borrándola desde la API.
 */
export function signOutPath(): string | null {
  return getAuthProvider() === "dev-bypass" ? null : "/api/session";
}
