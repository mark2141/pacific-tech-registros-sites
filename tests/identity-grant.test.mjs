import assert from "node:assert/strict";
import test from "node:test";
import {
  exchangePassword,
  exchangeRefreshToken,
} from "../lib/identity-grant.ts";
import { IdentityPasswordError } from "../lib/identity-password.ts";

const ENDPOINT = "https://taller.netlify.app/.netlify/identity";

function stubFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      method: init?.method,
      form: new URLSearchParams(String(init?.body ?? "")),
    });
    return responder();
  };
  return { fetchImpl, calls };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("el canje por contraseña guarda también el token de refresco", () => {
  // Antes se descartaba, y con él la única forma de prolongar la sesión más
  // allá de la hora que dura el token de acceso.
  const { fetchImpl, calls } = stubFetch(() =>
    jsonResponse({
      access_token: "acceso",
      refresh_token: "refresco",
      expires_in: 3600,
    }),
  );

  return exchangePassword("tecnico@example.com", "secreta", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  }).then((session) => {
    assert.deepEqual(session, {
      accessToken: "acceso",
      expiresIn: 3600,
      refreshToken: "refresco",
    });
    assert.equal(calls[0].url, `${ENDPOINT}/token`);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].form.get("grant_type"), "password");
    assert.equal(calls[0].form.get("username"), "tecnico@example.com");
    assert.equal(calls[0].form.get("password"), "secreta");
  });
});

test("la renovación usa grant_type=refresh_token", async () => {
  const { fetchImpl, calls } = stubFetch(() =>
    jsonResponse({ access_token: "nuevo", refresh_token: "rotado", expires_in: 3600 }),
  );

  const session = await exchangeRefreshToken("refresco", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(session.accessToken, "nuevo");
  // GoTrue rota el token de refresco al usarlo: hay que guardar el nuevo.
  assert.equal(session.refreshToken, "rotado");
  assert.equal(calls[0].form.get("grant_type"), "refresh_token");
  assert.equal(calls[0].form.get("refresh_token"), "refresco");
});

test("devuelve null cuando las credenciales o el refresco no valen", async () => {
  for (const status of [400, 401]) {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({ error: "invalid_grant" }, status),
    );

    assert.equal(
      await exchangeRefreshToken("caducado", {
        endpoint: ENDPOINT,
        fetch: fetchImpl,
      }),
      null,
      `falló con ${status}`,
    );
  }
});

test("devuelve null si la respuesta llega sin token de acceso", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ expires_in: 3600 }));

  assert.equal(
    await exchangePassword("a@b.com", "x", { endpoint: ENDPOINT, fetch: fetchImpl }),
    null,
  );
});

test("usa una hora cuando Identity no dice cuánto dura", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ access_token: "acceso" }));

  const session = await exchangePassword("a@b.com", "x", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(session.expiresIn, 3600);
  // Sin token de refresco la sesión solo dura su hora, y eso debe notarse.
  assert.equal(session.refreshToken, null);
});

test("una página HTML no se lee como credenciales incorrectas", async () => {
  // Es la protección de acceso del sitio interponiéndose, no un veredicto de
  // GoTrue. Decir "correo o contraseña incorrectos" manda a probar
  // contraseñas que nunca van a funcionar.
  const { fetchImpl } = stubFetch(
    () =>
      new Response('<!DOCTYPE html><html><title>Login Redirect</title></html>', {
        status: 401,
        headers: { "Content-Type": "text/html" },
      }),
  );

  await assert.rejects(
    () => exchangePassword("a@b.com", "x", { endpoint: ENDPOINT, fetch: fetchImpl }),
    (error) =>
      error instanceof IdentityPasswordError &&
      error.userFacing === true &&
      /protección de acceso del sitio/.test(error.message),
  );
});
