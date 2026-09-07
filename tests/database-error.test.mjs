import assert from "node:assert/strict";
import test from "node:test";
import { isUniqueConstraintError } from "../lib/database-error.ts";

test("detecta una colisión UNIQUE aunque el controlador la envuelva", () => {
  const d1Error = new Error(
    "D1_ERROR: UNIQUE constraint failed: equipment.order_number",
  );
  const drizzleError = new Error("Failed query: insert into equipment");
  drizzleError.cause = d1Error;

  assert.equal(isUniqueConstraintError(drizzleError), true);
  assert.equal(isUniqueConstraintError(new Error("database unavailable")), false);
});
