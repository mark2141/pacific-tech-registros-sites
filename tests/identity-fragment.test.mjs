import assert from "node:assert/strict";
import test from "node:test";
import { parseIdentityFragment } from "../lib/identity-fragment.ts";

test("reconoce el token de invitación", () => {
  assert.deepEqual(parseIdentityFragment("#invite_token=abc123"), {
    kind: "invite",
    token: "abc123",
  });
});

test("reconoce el token de recuperación", () => {
  assert.deepEqual(parseIdentityFragment("#recovery_token=xyz789"), {
    kind: "recovery",
    token: "xyz789",
  });
});

test("acepta el hash con y sin almohadilla", () => {
  const esperado = { kind: "invite", token: "abc123" };
  assert.deepEqual(parseIdentityFragment("invite_token=abc123"), esperado);
  assert.deepEqual(parseIdentityFragment("#invite_token=abc123"), esperado);
});

test("ignora otros parámetros que acompañen al token", () => {
  assert.deepEqual(
    parseIdentityFragment("#invite_token=abc123&refresh_token=otro&type=signup"),
    { kind: "invite", token: "abc123" },
  );
});

test("devuelve null cuando el fragmento no trae nada nuestro", () => {
  for (const hash of [
    "",
    "#",
    null,
    undefined,
    "#seccion-de-la-pagina",
    "#invite_token=",
    "#invite_token=%20%20",
  ]) {
    assert.equal(parseIdentityFragment(hash), null, `falló con ${hash}`);
  }
});

test("traduce el error que devuelve Identity a un mensaje legible", () => {
  // Un enlace caducado vuelve así. Sin esta rama parecería que no pasó nada,
  // que es la peor explicación posible.
  const fragmento = parseIdentityFragment(
    "#error=access_denied&error_description=Invalid+or+expired+token",
  );

  assert.deepEqual(fragmento, {
    kind: "error",
    message: "Invalid or expired token",
  });
});

test("da un mensaje propio cuando el error llega sin descripción", () => {
  const fragmento = parseIdentityFragment("#error=access_denied");

  assert.equal(fragmento.kind, "error");
  assert.match(fragmento.message, /no es válido o ya fue utilizado/);
});

test("decodifica el porcentaje del token", () => {
  assert.deepEqual(parseIdentityFragment("#recovery_token=a%2Bb%3Dc"), {
    kind: "recovery",
    token: "a+b=c",
  });
});

test("el token gana al error cuando llegan los dos", () => {
  // Si hay token, hay algo que intentar; el error suelto es el caso sin salida.
  assert.deepEqual(
    parseIdentityFragment("#invite_token=abc123&error=access_denied"),
    { kind: "invite", token: "abc123" },
  );
});
