import assert from "node:assert/strict";
import test from "node:test";
import {
  IdentityPasswordError,
  acceptInvite,
  looksLikeAccessGate,
  requestPasswordRecovery,
  resetPassword,
} from "../lib/identity-password.ts";

const ENDPOINT = "https://taller.netlify.app/.netlify/identity";

/** Devuelve un `fetch` de mentira y el registro de cómo lo llamaron. */
function stubFetch(...responders) {
  const calls = [];
  let index = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const responder = responders[Math.min(index, responders.length - 1)];
    index += 1;
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

const session = () =>
  jsonResponse({ access_token: "token-de-sesion", expires_in: 3600 });

test("aceptar la invitación canjea el token y fija la contraseña de una vez", async () => {
  const { fetchImpl, calls } = stubFetch(session);

  const result = await acceptInvite("token-invitacion", "contraseña-larga", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.deepEqual(result, { accessToken: "token-de-sesion", expiresIn: 3600 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ENDPOINT}/verify`);
  assert.deepEqual(calls[0].body, {
    type: "signup",
    token: "token-invitacion",
    password: "contraseña-larga",
  });
});

test("usa una hora cuando Identity no dice cuánto dura la sesión", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ access_token: "t" }));

  const result = await acceptInvite("token", "contraseña-larga", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(result.expiresIn, 3600);
});

test("restablecer va en dos pasos: verificar y luego escribir la contraseña", async () => {
  // GoTrue las separa: /verify solo demuestra que el enlace es legítimo.
  const { fetchImpl, calls } = stubFetch(session, () => jsonResponse({ id: "u" }));

  const result = await resetPassword("token-recuperacion", "contraseña-nueva", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(result.accessToken, "token-de-sesion");
  assert.equal(calls.length, 2);

  assert.equal(calls[0].url, `${ENDPOINT}/verify`);
  assert.deepEqual(calls[0].body, {
    type: "recovery",
    token: "token-recuperacion",
  });

  assert.equal(calls[1].url, `${ENDPOINT}/user`);
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(
    calls[1].init.headers.Authorization,
    "Bearer token-de-sesion",
  );
  assert.deepEqual(calls[1].body, { password: "contraseña-nueva" });
});

test("un enlace caducado da un error que sí se le puede enseñar al usuario", async () => {
  for (const status of [400, 401, 404, 410]) {
    const { fetchImpl } = stubFetch(() => jsonResponse({ msg: "expired" }, status));

    await assert.rejects(
      () => acceptInvite("token", "contraseña-larga", {
        endpoint: ENDPOINT,
        fetch: fetchImpl,
      }),
      (error) =>
        error instanceof IdentityPasswordError &&
        error.userFacing === true &&
        /ya fue utilizado o caducó/.test(error.message),
      `falló con ${status}`,
    );
  }
});

test("un fallo de Identity no se le enseña al usuario", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ msg: "boom" }, 503));

  await assert.rejects(
    () => acceptInvite("token", "contraseña-larga", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    (error) =>
      error instanceof IdentityPasswordError && error.userFacing === false,
  );
});

test("lanza si el canje no devuelve sesión utilizable", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ access_token: "" }));

  await assert.rejects(
    () => acceptInvite("token", "contraseña-larga", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    /sesión utilizable/,
  );
});

test("lanza si Identity rechaza la contraseña nueva al restablecer", async () => {
  const { fetchImpl } = stubFetch(session, () =>
    jsonResponse({ msg: "weak password" }, 422),
  );

  await assert.rejects(
    () => resetPassword("token", "corta", { endpoint: ENDPOINT, fetch: fetchImpl }),
    /rechazó la contraseña nueva \(422\)/,
  );
});

test("pedir recuperación llega a /recover con el correo", async () => {
  const { fetchImpl, calls } = stubFetch(() => jsonResponse({}));

  await requestPasswordRecovery("tecnico@example.com", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });

  assert.equal(calls[0].url, `${ENDPOINT}/recover`);
  assert.deepEqual(calls[0].body, { email: "tecnico@example.com" });
});

test("un correo desconocido no se distingue de uno registrado", async () => {
  // Distinguirlos permitiría averiguar quién tiene acceso al taller probando
  // correos, así que el 400 de GoTrue se traga a propósito.
  const { fetchImpl } = stubFetch(() => jsonResponse({ msg: "not found" }, 400));

  await requestPasswordRecovery("desconocido@example.com", {
    endpoint: ENDPOINT,
    fetch: fetchImpl,
  });
});

test("una caída de Identity sí se propaga al pedir recuperación", async () => {
  const { fetchImpl } = stubFetch(() => jsonResponse({ msg: "boom" }, 502));

  await assert.rejects(
    () => requestPasswordRecovery("tecnico@example.com", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    /respondió 502/,
  );
});

test("un fallo de red se envuelve en IdentityPasswordError", async () => {
  const { fetchImpl } = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });

  await assert.rejects(
    () => acceptInvite("token", "contraseña-larga", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    (error) =>
      error instanceof IdentityPasswordError &&
      /No fue posible contactar/.test(error.message),
  );
});

test("guarda lo que respondió GoTrue para el log, sin enseñárselo al usuario", async () => {
  // Es lo único que distingue un token vencido de una petición mal formada por
  // nuestra parte, y las dos llegan como 400.
  const { fetchImpl } = stubFetch(() =>
    jsonResponse({ code: 400, msg: "Invite token not found" }, 400),
  );

  await assert.rejects(
    () => acceptInvite("token", "contraseña-larga", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    (error) => {
      assert.match(error.detail, /POST \/verify → 400/);
      assert.match(error.detail, /Invite token not found/);
      // El mensaje que sí ve el usuario no arrastra el detalle.
      assert.doesNotMatch(error.message, /Invite token not found/);
      return true;
    },
  );
});

test("una página HTML no se lee como veredicto de GoTrue", async () => {
  // Con el sitio protegido, la llamada de la Function a Identity se rebotaba a
  // app.netlify.com/edge-access y volvía como 401. Leído como veredicto, decía
  // "token inválido" y mandaba a pedir otra invitación que fallaría igual.
  const gate = new Response(
    '<!DOCTYPE html>\n<html><head><title>Login Redirect</title></head></html>',
    { status: 401, headers: { "Content-Type": "text/html" } },
  );
  const { fetchImpl } = stubFetch(() => gate);

  await assert.rejects(
    () => acceptInvite("token", "contraseña-larga", {
      endpoint: ENDPOINT,
      fetch: fetchImpl,
    }),
    (error) => {
      assert.ok(error instanceof IdentityPasswordError);
      assert.equal(error.userFacing, true);
      assert.match(error.message, /protección de acceso del sitio/);
      assert.doesNotMatch(error.message, /caducó/);
      return true;
    },
  );
});

test("looksLikeAccessGate distingue HTML de JSON", () => {
  for (const html of [
    "<!DOCTYPE html>",
    "<!doctype html><html>",
    "  \n<html>",
    "<HTML>",
  ]) {
    assert.equal(looksLikeAccessGate(html), true, `falló con ${html}`);
  }

  for (const json of [
    '{"msg":"Invite token not found"}',
    '{"error":"invalid_grant"}',
    "",
    "   ",
  ]) {
    assert.equal(looksLikeAccessGate(json), false, `falló con ${json}`);
  }
});
