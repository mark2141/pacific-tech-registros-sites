import assert from "node:assert/strict";
const origin = new URL(process.argv[2] || "http://localhost:5173").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Solo pruebas locales con datos ficticios.");
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); assert.ok(cookie);
async function request(path, method = "GET", body, authenticated = true) {
  const r = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
const created = await request("/api/equipment", "POST", { customerName: "Pagos ficticios", equipmentType: "Laptop", reportedIssue: "Prueba local de pagos" });
assert.equal(created.status, 201, JSON.stringify(created.body)); let order = created.body.equipment;
async function fresh() { order = (await request(`/api/equipment/detail?id=${order.id}`)).body.equipment; return order; }
async function edit(payload) { return request("/api/equipment", "PATCH", { id: order.id, version: order.version, ...payload }); }
const payload = patch => ({ equipmentId: order.id, version: order.version, operationId: crypto.randomUUID(), amountCents: 6000, method: "efectivo", note: "Abono ficticio", reference: "LOCAL", ...patch });
const pay = input => request("/api/equipment/payments", "POST", input);
const page = () => request(`/api/equipment/payments?equipmentId=${order.id}`);
try {
  assert.equal((await request(`/api/equipment/payments?equipmentId=${order.id}`, "GET", null, false)).status, 403);
  assert.equal((await request("/api/equipment/payments", "POST", payload(), false)).status, 403);
  assert.equal((await edit({ partsCostCents: 6000, laborCostCents: 4000 })).status, 200); await fresh();
  const attempts = [payload(), payload()]; const race = await Promise.all(attempts.map(pay));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409], JSON.stringify(race));
  const winnerIndex = race.findIndex(r => r.status === 200); const winner = race[winnerIndex].body.payment; const input = attempts[winnerIndex];
  const replay = await pay(input); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
  assert.equal((await pay({ ...input, note: "Otra intención" })).status, 409);
  await fresh(); assert.equal(order.paidCents, 6000);
  assert.equal((await edit({ partsCostCents: 0, laborCostCents: 5999 })).status, 409);
  assert.equal((await edit({ status: "anulado" })).status, 409);
  assert.equal((await pay(payload({ amountCents: 4001 }))).status, 409);
  const paid = await pay(payload({ amountCents: 4000, method: "yappy" })); assert.equal(paid.status, 200);
  await fresh(); const ledger = await page(); assert.equal(ledger.body.balance.dueCents, 0); assert.equal(ledger.body.balance.label, "Pagado"); assert.match(ledger.headers.get("cache-control"), /no-store/);
  assert.equal((await edit({ status: "entregado" })).status, 200); await fresh();
  assert.equal((await edit({ status: "ingreso" })).status, 409);
  const reverse = payload({ reversalOf: winner.id, note: "Anulación ficticia" });
  const reverseRace = await Promise.all([pay(reverse), pay({ ...reverse, operationId: crypto.randomUUID() })]);
  assert.deepEqual(reverseRace.map(r => r.status).sort(), [200, 409], JSON.stringify(reverseRace)); await fresh(); assert.equal(order.paidCents, 4000);
  assert.equal((await page()).body.payments.find(p => p.id === winner.id).reversed, true);
  assert.equal((await pay(payload({ reversalOf: winner.id }))).status, 409);
  assert.equal((await pay(payload({ reversalOf: paid.body.payment.id }))).status, 200); await fresh(); assert.equal(order.paidCents, 0);
  assert.equal((await edit({ status: "anulado" })).status, 200); await fresh();
  assert.equal((await pay(payload({ amountCents: 1 }))).status, 409);
  const history = (await request(`/api/equipment/history?equipmentId=${order.id}`)).body.history.filter(event => event.kind === "pago");
  assert.equal(history.length, 4); assert.ok(history.every(event => event.actorEmail && event.message));
  console.log("OK D1: permisos de sesión, abonos, carrera de cobros, reintentos, límite de saldo, edición protegida, anulaciones concurrentes e historial.");
} finally {
  await fresh();
  for (const payment of (await page()).body.payments ?? []) if (payment.amountCents > 0 && !payment.reversed) { await pay(payload({ reversalOf: payment.id, note: "Limpieza de prueba ficticia" })); await fresh(); }
  if (order.status !== "anulado") await edit({ status: "anulado" });
}
