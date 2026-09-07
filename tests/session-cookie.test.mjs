import assert from "node:assert/strict";
import test from "node:test";
import {
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  clearSessionCookies,
  readRefreshCookie,
  readSessionCookie,
  serializeRefreshCookie,
  serializeSessionCookie,
} from "../lib/session-cookie.ts";

test("lee la cookie de sesión entre otras cookies", () => {
  assert.equal(
    readSessionCookie(`analytics=1; ${SESSION_COOKIE}=abc.def.ghi; otra=2`),
    "abc.def.ghi",
  );
  assert.equal(readSessionCookie(`${SESSION_COOKIE}=solo`), "solo");
  assert.equal(readSessionCookie(`  ${SESSION_COOKIE}=conEspacios  `), "conEspacios");
});

test("devuelve null cuando no hay sesión", () => {
  assert.equal(readSessionCookie(null), null);
  assert.equal(readSessionCookie(undefined), null);
  assert.equal(readSessionCookie(""), null);
  assert.equal(readSessionCookie("otra=1"), null);
  assert.equal(readSessionCookie(`${SESSION_COOKIE}=`), null);
});

test("no confunde una cookie cuyo nombre termina igual", () => {
  // `otro_pt_session` contiene el nombre buscado como sufijo: una comparación
  // por inclusión en lugar de por igualdad devolvería el token equivocado.
  assert.equal(readSessionCookie(`otro_${SESSION_COOKIE}=ajeno`), null);
});

test("serializa con HttpOnly, SameSite y Secure según el esquema", () => {
  const secure = serializeSessionCookie("token", { maxAgeSeconds: 3600, secure: true });
  assert.match(secure, /^pt_session=token/);
  assert.match(secure, /HttpOnly/);
  assert.match(secure, /SameSite=Lax/);
  assert.match(secure, /Max-Age=3600/);
  assert.match(secure, /Secure/);

  // En local el servidor habla http y una cookie Secure no llegaría a fijarse.
  const plain = serializeSessionCookie("token", { maxAgeSeconds: 3600, secure: false });
  assert.doesNotMatch(plain, /Secure/);
});

test("el cierre de sesión caduca las dos cookies de inmediato", () => {
  // Caducar solo la de sesión dejaría el token de refresco vivo, y con él la
  // puerta abierta: vale por sí solo para volver a entrar.
  const cleared = clearSessionCookies({ secure: true });

  assert.equal(cleared.length, 2);
  assert.ok(cleared.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`)));
  assert.ok(cleared.some((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`)));
  for (const cookie of cleared) {
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
  }
});

test("la cookie de refresco dura semanas y no se confunde con la de sesión", () => {
  const refresh = serializeRefreshCookie("refresco", { secure: true });
  assert.match(refresh, new RegExp(`^${REFRESH_COOKIE}=refresco`));
  assert.match(refresh, new RegExp(`Max-Age=${REFRESH_MAX_AGE_SECONDS}`));
  assert.match(refresh, /HttpOnly/);

  const header = `${SESSION_COOKIE}=acceso; ${REFRESH_COOKIE}=refresco`;
  assert.equal(readSessionCookie(header), "acceso");
  assert.equal(readRefreshCookie(header), "refresco");
});

test("codifica valores con caracteres reservados y los recupera intactos", () => {
  const token = "a b;c=d";
  const serialized = serializeSessionCookie(token, { maxAgeSeconds: 60, secure: true });
  const value = serialized.split(";")[0].slice(`${SESSION_COOKIE}=`.length);
  assert.equal(readSessionCookie(`${SESSION_COOKIE}=${value}`), token);
});
