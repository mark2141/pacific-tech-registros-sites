import assert from "node:assert/strict";
const origin = new URL(process.argv[2] || "http://localhost:5173").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Sólo se permiten pruebas de inventario locales.");
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); assert.ok(cookie);
const home = await fetch(`${origin}/`, { headers: { Cookie: cookie } }); assert.equal(home.status, 200);
async function request(path, method = "GET", body, authenticated = true) {
  const response = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const base = { sku: `LOCAL-${Date.now()}`, name: "Pantalla ficticia %_", supplier: "Proveedor ficticio", unitCostCents: 1599, minimumStock: 2, initialStock: 3 };
const create = await request("/api/inventory", "POST", base); assert.equal(create.status, 201, JSON.stringify(create.body)); let item = create.body.item;
const order = await request("/api/equipment", "POST", { customerName: "Inventario ficticio", equipmentType: "Laptop", reportedIssue: "Prueba de inventario local" }); assert.equal(order.status, 201); const orderId = order.body.equipment.id;
const payload = (values = {}) => ({ operationId: crypto.randomUUID(), itemId: item.id, version: item.version, kind: "salida", quantity: 1, note: "Prueba local", ...values });
const move = values => request("/api/inventory/movements", "POST", values);
try {
  for (const path of ["/api/inventory", `/api/inventory/movements?itemId=${item.id}`]) assert.equal((await request(path, "GET", null, false)).status, 403);
  assert.equal((await request("/api/inventory/movements", "POST", payload(), false)).status, 403);
  assert.equal((await request("/api/inventory", "POST", base)).status, 409);
  assert.equal((await request(`/api/inventory?search=${encodeURIComponent("ficticia %_")}`)).body.items.some(value => value.id === item.id), true);
  const initial = await request(`/api/inventory/movements?itemId=${item.id}`);
  assert.equal(initial.body.movements.length, 1); assert.equal(initial.body.movements[0].quantity, 3); assert.ok(initial.body.movements[0].actorEmail);
  assert.match(initial.headers.get("cache-control"), /no-store/);
  assert.equal((await move(payload({ quantity: 4 }))).status, 409);
  const use = payload({ kind: "consumo", quantity: 2, equipmentId: orderId });
  const race = await Promise.all([move(use), move(payload({ kind: "consumo", quantity: 2, equipmentId: orderId }))]);
  assert.deepEqual(race.map(value => value.status).sort(), [200, 409], JSON.stringify(race));
  const winner = race.find(value => value.status === 200).body;
  item = winner.item; assert.equal(item.stock, 1);
  const source = winner.movement;
  const replayBody = { ...use, operationId: source.operationId };
  const replay = await move(replayBody); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.item.stock, 1);
  assert.equal((await move({ ...replayBody, note: "Cambió" })).status, 409);
  const low = await request(`/api/inventory?low=1&search=${base.sku}`); assert.equal(low.body.items.length, 1);
  const changed = await request("/api/inventory", "PATCH", { ...base, id: item.id, version: item.version, unitCostCents: 2999 });
  assert.equal(changed.status, 200); item = changed.body.item;
  const returned = await move(payload({ kind: "devolucion", quantity: 1, equipmentId: orderId, sourceMovementId: source.id }));
  assert.equal(returned.status, 200, JSON.stringify(returned.body)); assert.equal(returned.body.movement.unitCostCents, 1599); item = returned.body.item; assert.equal(item.stock, 2);
  assert.equal((await move(payload({ kind: "devolucion", quantity: 2, equipmentId: orderId, sourceMovementId: source.id }))).status, 409);
  const parts = await request(`/api/inventory/movements?equipmentId=${orderId}`); assert.equal(parts.body.parts[0].quantity, 2); assert.equal(parts.body.parts[0].returned, 1);
  const freshOrder = (await request(`/api/equipment/detail?id=${orderId}`)).body.equipment;
  assert.equal(freshOrder.partsCostCents, 0, "El inventario no cambia el precio cobrado");
  const cancelled = await request("/api/equipment", "PATCH", { id: orderId, version: freshOrder.version, status: "anulado" }); assert.equal(cancelled.status, 200);
  assert.equal((await move(payload({ kind: "consumo", equipmentId: orderId }))).status, 409);
  assert.equal((await move(replayBody)).status, 200, "Reintentar un consumo confirmado tras cerrar la orden no lo duplica");
  const lastReturn = await move(payload({ kind: "devolucion", equipmentId: orderId, sourceMovementId: source.id })); assert.equal(lastReturn.status, 200); item = lastReturn.body.item; assert.equal(item.stock, 3);
  assert.equal((await move(payload({ kind: "devolucion", equipmentId: orderId, sourceMovementId: source.id }))).status, 409);
  const audit = await request(`/api/equipment/history?equipmentId=${orderId}`);
  assert.equal(audit.body.history.filter(event => event.kind === "repuesto").length, 3);
  assert.equal((await request("/api/inventory", "PATCH", { ...base, id: item.id, version: 1 })).status, 409);
  for (const values of [{ quantity: -1 }, { quantity: 1.5 }, { note: "" }, { kind: "incorrecto" }]) assert.equal((await move(payload(values))).status, 400);
  console.log("OK: catálogo, stock inicial, alertas, búsqueda literal, movimientos, 2 consumidores concurrentes, reintentos sin duplicados, devoluciones acotadas, costos históricos, orden cerrada, precios intactos y auditoría con autor.");
} finally {
  const current = (await request(`/api/equipment/detail?id=${orderId}`)).body.equipment;
  if (current.status !== "anulado") await request("/api/equipment", "PATCH", { id: orderId, version: current.version, status: "anulado" });
}
