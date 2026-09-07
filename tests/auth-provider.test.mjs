import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AUTH_PROVIDER,
  ForbiddenAuthProviderError,
  resolveAuthProvider,
} from "../lib/auth-provider.ts";

test("sin configuración se exige Netlify Identity", () => {
  assert.equal(DEFAULT_AUTH_PROVIDER, "netlify-identity");
  assert.equal(resolveAuthProvider(undefined), "netlify-identity");
  assert.equal(resolveAuthProvider(null), "netlify-identity");
  assert.equal(resolveAuthProvider("   "), "netlify-identity");
});

test("acepta los proveedores conocidos y rechaza el resto", () => {
  assert.equal(resolveAuthProvider("netlify-identity"), "netlify-identity");
  assert.equal(resolveAuthProvider(" netlify-identity "), "netlify-identity");
  assert.throws(() => resolveAuthProvider("automatico"), /AUTH_PROVIDER inválido/);
  assert.throws(() => resolveAuthProvider("public-test"), /AUTH_PROVIDER inválido/);
  assert.throws(() => resolveAuthProvider("cloudflare-access"), /AUTH_PROVIDER inválido/);
});

test("dev-bypass funciona fuera de producción", () => {
  assert.equal(resolveAuthProvider("dev-bypass"), "dev-bypass");
  assert.equal(
    resolveAuthProvider("dev-bypass", { isProduction: false }),
    "dev-bypass",
  );
});

test("dev-bypass es imposible de activar en producción", () => {
  // Es la regla que sustituye al antiguo public-test, que abría la aplicación
  // en cualquier entorno. Aquí el modo abierto no puede llegar a producción ni
  // aunque alguien fije la variable por error.
  assert.throws(
    () => resolveAuthProvider("dev-bypass", { isProduction: true }),
    ForbiddenAuthProviderError,
  );
});
