import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeLikePattern,
  InvalidEquipmentQueryError,
  parseEquipmentCursor,
  parseEquipmentListQuery,
  serializeEquipmentCursor,
} from "../lib/equipment-query.ts";

test("normaliza búsqueda, estado y límite del listado", () => {
  const query = parseEquipmentListQuery(new URLSearchParams({
    search: "  Ana Rodríguez  ",
    status: "reparacion",
    limit: "900",
  }));

  assert.equal(query.search, "Ana Rodríguez");
  assert.equal(query.status, "reparacion");
  assert.equal(query.limit, 500);
  assert.equal(query.offset, 0);
  assert.equal(query.cursor, null);
});

test("usa Todos y cien resultados como consulta inicial", () => {
  const query = parseEquipmentListQuery(new URLSearchParams());
  assert.equal(query.status, "todos");
  assert.equal(query.limit, 100);
  assert.equal(query.search, "");
});

test("rechaza estado, búsqueda y paginación inválidos", () => {
  for (const params of [
    new URLSearchParams({ status: "cancelado" }),
    new URLSearchParams({ search: "x".repeat(201) }),
    new URLSearchParams({ limit: "0" }),
    new URLSearchParams({ offset: "-1" }),
    new URLSearchParams("status=ingreso&status=listo"),
  ]) {
    assert.throws(
      () => parseEquipmentListQuery(params),
      InvalidEquipmentQueryError,
    );
  }
});

test("serializa un cursor inmutable basado en el id", () => {
  const cursor = { id: 42 };
  const serialized = serializeEquipmentCursor(cursor);

  assert.equal(serialized, "42");
  assert.deepEqual(parseEquipmentCursor(serialized), cursor);
});

test("rechaza cursores fuera del INTEGER de Postgres y no los mezcla con offset", () => {
  for (const cursor of [
    "0",
    "-1",
    "1.5",
    "2147483648",
    "2026-08-23T14:05:06.123456Z|42",
  ]) {
    assert.throws(() => parseEquipmentCursor(cursor), InvalidEquipmentQueryError);
  }

  assert.deepEqual(parseEquipmentCursor("2147483647"), { id: 2_147_483_647 });

  assert.throws(
    () => parseEquipmentListQuery(new URLSearchParams({
      cursor: "42",
      offset: "100",
    })),
    InvalidEquipmentQueryError,
  );
});

test("escapa comodines para una búsqueda ILIKE literal", () => {
  assert.equal(escapeLikePattern(String.raw`50%_off\promo`), String.raw`50\%\_off\\promo`);
});
