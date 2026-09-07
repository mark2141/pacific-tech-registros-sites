import assert from "node:assert/strict";
import test from "node:test";
import {
  IdentityLookupError,
  fetchIdentityUser,
} from "../lib/identity-token.ts";

const ENDPOINT = "https://taller.netlify.app/.netlify/identity";
const TOKEN = "token-de-pruebas";

/** Devuelve un `fetch` de mentira y el registro de cómo lo llamaron. */
function stubFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fetchImpl, calls };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("pregunta a /user con el token en la cabecera Authorization", async () => {
  const { fetchImpl, calls } = stubFetch(() =>
    jsonResponse({ id: "user-42", email: "tecnico@example.com" }),
  );

  await fetchIdentityUser(TOKEN, { endpoint: ENDPOINT, fetch: fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ENDPOINT}/user`);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  // La identidad no debe quedar cacheada en ningún intermediario.
  assert.equal(calls[0].init.cache, "no-store");
});

test("devuelve la identidad y los roles cuando Identity acepta el token", async () => {
  const { fetchImpl } = stubFetch(() =>
    jsonResponse({
      id: "user-42",
      email: "  tecnico@example.com  ",
      app_metadata: { roles: ["taller", "admin"] },
    }),
  );

  const user = await fetchIdentityUser(TOKEN, {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.deepEqual(user, {
    email: "tecnico@example.com",
    userId: "user-42",
    roles: ["taller", "admin"],
  });
});

test("devuelve null cuando Identity responde 401", async () => {
  // Es la respuesta a un token caducado, revocado o falsificado, y también a
  // la cuenta que ya no existe. No es un error: es un "no".
  const { fetchImpl } = stubFetch(() =>
    jsonResponse({ msg: "invalid token" }, 401),
  );

  const user = await fetchIdentityUser(TOKEN, {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(user, null);
});

test("no llama a Identity si no hay token", async () => {
  const { fetchImpl, calls } = stubFetch(() => jsonResponse({}));

  for (const empty of ["", "   "]) {
    assert.equal(
      await fetchIdentityUser(empty, { endpoint: ENDPOINT, fetch: fetchImpl }),
      null,
    );
  }
  assert.equal(calls.length, 0);
});

test("lanza cuando Identity falla, en lugar de fingir sesión anónima", async () => {
  // Una caída de Identity no es un usuario sin sesión: presentarla como tal
  // mandaría al usuario a un formulario de acceso que tampoco va a funcionar.
  const { fetchImpl } = stubFetch(() => jsonResponse({ msg: "boom" }, 503));

  await assert.rejects(
    () => fetchIdentityUser(TOKEN, { endpoint: ENDPOINT, fetch: fetchImpl }),
    (error) =>
      error instanceof IdentityLookupError && /respondió 503/.test(error.message),
  );
});

test("lanza cuando la red falla", async () => {
  const { fetchImpl } = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });

  await assert.rejects(
    () => fetchIdentityUser(TOKEN, { endpoint: ENDPOINT, fetch: fetchImpl }),
    (error) =>
      error instanceof IdentityLookupError && /No fue posible consultar/.test(error.message),
  );
});

test("lanza si la respuesta no es JSON", async () => {
  const { fetchImpl } = stubFetch(
    () => new Response("<html>error</html>", { status: 200 }),
  );

  await assert.rejects(
    () => fetchIdentityUser(TOKEN, { endpoint: ENDPOINT, fetch: fetchImpl }),
    (error) => error instanceof IdentityLookupError && /no es JSON/.test(error.message),
  );
});

test("lanza si un 200 llega sin correo", async () => {
  // Una identidad a medias no debe pasar por buena.
  for (const body of [{ id: "user-42" }, { id: "user-42", email: "   " }]) {
    const { fetchImpl } = stubFetch(() => jsonResponse(body));
    await assert.rejects(
      () => fetchIdentityUser(TOKEN, { endpoint: ENDPOINT, fetch: fetchImpl }),
      (error) =>
        error instanceof IdentityLookupError && /no devolvió el correo/.test(error.message),
    );
  }
});

test("usa el correo como identificador cuando no hay id, y sin roles da lista vacía", async () => {
  const { fetchImpl } = stubFetch(() =>
    jsonResponse({ email: "tecnico@example.com" }),
  );

  const user = await fetchIdentityUser(TOKEN, {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(user.userId, "tecnico@example.com");
  assert.deepEqual(user.roles, []);
});

test("ignora roles que no sean cadenas", async () => {
  const { fetchImpl } = stubFetch(() =>
    jsonResponse({
      id: "user-42",
      email: "tecnico@example.com",
      app_metadata: { roles: ["taller", 7, null, "admin"] },
    }),
  );

  const user = await fetchIdentityUser(TOKEN, {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.deepEqual(user.roles, ["taller", "admin"]);
});
