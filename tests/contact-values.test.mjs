import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidContactValueError,
  isValidCustomerEmail,
  keepPhoneDigits,
  parseOptionalCustomerEmail,
  parseOptionalCustomerPhone,
} from "../lib/contact-values.ts";

test("el teléfono conserva únicamente números", () => {
  assert.equal(keepPhoneDigits("+507 6000-0000"), "50760000000");
  assert.equal(parseOptionalCustomerPhone("60000000"), "60000000");
  assert.equal(parseOptionalCustomerPhone(""), "");
  assert.throws(
    () => parseOptionalCustomerPhone("6000-0000"),
    InvalidContactValueError,
  );
  assert.throws(
    () => parseOptionalCustomerPhone("123"),
    InvalidContactValueError,
  );
});

test("el correo requiere arroba y dominio con extensión", () => {
  assert.equal(isValidCustomerEmail("cliente@correo.com"), true);
  assert.equal(isValidCustomerEmail("cliente+factura@sub.correo.com"), true);
  assert.equal(isValidCustomerEmail("cliente@correo"), false);
  assert.equal(isValidCustomerEmail("cliente@@correo.com"), false);
  assert.equal(parseOptionalCustomerEmail(""), "");
  assert.throws(
    () => parseOptionalCustomerEmail("cliente@correo"),
    InvalidContactValueError,
  );
});
