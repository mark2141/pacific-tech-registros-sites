import assert from "node:assert/strict";
import test from "node:test";
import {
  applySecurityHeaders,
  contentSecurityPolicy,
  withSecurityHeaders,
} from "../lib/security-headers.ts";

test("la CSP de producción no concede eval ni websockets", () => {
  const csp = contentSecurityPolicy(false);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /ws:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test("la CSP de desarrollo permite el HMR de Vite", () => {
  const csp = contentSecurityPolicy(true);
  assert.match(csp, /unsafe-eval/);
  assert.match(csp, /connect-src 'self' ws: wss:/);
});

test("aplica las cabeceras y reserva HSTS para HTTPS", () => {
  const plain = withSecurityHeaders(new Response("ok"), new URL("http://localhost:3000/"));
  assert.equal(plain.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(plain.headers.get("X-Frame-Options"), "DENY");
  assert.equal(plain.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(plain.headers.get("Strict-Transport-Security"), null);

  const secure = withSecurityHeaders(new Response("ok"), new URL("https://registros.example/"));
  assert.match(secure.headers.get("Strict-Transport-Security"), /max-age=31536000/);
});

test("escribe las cabeceras sobre un Headers existente", () => {
  // Es la forma que usa middleware.ts: la respuesta la genera el framework
  // después, así que no hay un Response que envolver.
  const headers = new Headers({ "X-Existente": "conservado" });
  applySecurityHeaders(headers, new URL("https://registros.example/"));

  assert.equal(headers.get("X-Existente"), "conservado");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.match(headers.get("Strict-Transport-Security"), /max-age=31536000/);
});

test("conserva el estado y el cuerpo de la respuesta original", async () => {
  const forbidden = withSecurityHeaders(
    new Response("denegado", { status: 403 }),
    new URL("https://registros.example/"),
  );
  assert.equal(forbidden.status, 403);
  assert.equal(await forbidden.text(), "denegado");
});
