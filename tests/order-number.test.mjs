import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ORDER_SEQUENCE_WIDTH,
  formatOrderNumber,
  orderNumberPrefix,
} from "../lib/order-number.ts";

test("genera correlativos OT-YYYYMM-NNN y reinicia cada mes", (context) => {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  db.exec("CREATE TABLE equipment (order_number TEXT NOT NULL UNIQUE)");
  db.prepare("INSERT INTO equipment (order_number) VALUES (?)").run("OT-1234567");

  const insert = db.prepare(`
    INSERT INTO equipment (order_number)
    VALUES (
      ? || printf(
        ?,
        COALESCE((
          SELECT MAX(CAST(substr(order_number, ?) AS INTEGER))
          FROM equipment
          WHERE order_number LIKE ?
        ), 0) + 1
      )
    )
    RETURNING order_number
  `);
  const printfFormat = `%0${ORDER_SEQUENCE_WIDTH}d`;

  function createFor(date) {
    const prefix = orderNumberPrefix(date);
    const row = insert.get(
      prefix,
      printfFormat,
      prefix.length + 1,
      `${prefix}%`,
    );
    return row.order_number;
  }

  const januaryPrefix = orderNumberPrefix("2026-01-31");
  assert.equal(createFor("2026-01-31"), formatOrderNumber(januaryPrefix, 1));
  assert.equal(createFor("2026-01-31"), "OT-202601-002");
  assert.equal(createFor("2026-02-01"), "OT-202602-001");
  assert.equal(createFor("2026-01-31"), "OT-202601-003");
});
