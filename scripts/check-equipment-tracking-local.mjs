import assert from "node:assert/strict";
const origin = new URL(process.argv[2] || "http://localhost:5173").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Solo se permiten datos ficticios en localhost.");
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie);
async function request(path, method = "GET", body, authenticated = true) {
  const response = await fetch(origin + path, { method, headers: { ...(authenticated ? { Cookie: cookie } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
const orders = [];
const marker = `Seguimiento ficticio ${Date.now()}`;
try {
  for (const [assignedTechnician, entryDate] of [[marker, "2026-09-01"], [marker, "2026-09-07"], [marker + " otro", "2026-09-07"]]) {
    const result = await request("/api/equipment", "POST", { customerName: marker, equipmentType: "Laptop", reportedIssue: "Prueba automatizada local", serialNumber: "IMEI-LOCAL-123", assignedTechnician, entryDate, estimatedExitDate: "2026-09-10", warrantyDays: 90 });
    assert.equal(result.status, 201, JSON.stringify(result.body)); orders.push(result.body.equipment);
  }
  const first = orders[0];
  assert.equal(first.version, 1); assert.equal(first.warrantyDays, 90); assert.equal(first.serialNumber, "IMEI-LOCAL-123");
  const historyPath = `/api/equipment/history?equipmentId=${first.id}`;
  for (const path of [historyPath, `/api/equipment/detail?id=${first.id}`]) assert.equal((await request(path, "GET", null, false)).status, 403);
  assert.equal((await request("/api/equipment/history", "POST", { equipmentId: first.id, message: "Sin acceso" }, false)).status, 403);
  const initial = await request(historyPath);
  assert.equal(initial.body.history.length, 1); assert.equal(initial.body.history[0].kind, "ingreso");
  assert.match(initial.headers.get("cache-control"), /no-store/);
  const author = initial.body.history[0].actorEmail; assert.ok(author);
  const race = await Promise.all(["diagnostico", "reparacion"].map(status => request("/api/equipment", "PATCH", { id: first.id, version: 1, status })));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  assert.equal(race.find(result => result.status === 409).body.code, "ORDER_CONFLICT");
  const winner = race.find(result => result.status === 200).body.equipment;
  const afterRace = await request(historyPath);
  assert.equal(afterRace.body.history.length, 2, "Solo el guardado ganador debe crear un evento");
  assert.equal(afterRace.body.history[0].fromStatus, "ingreso"); assert.equal(afterRace.body.history[0].toStatus, winner.status);
  assert.equal((await request("/api/equipment", "PATCH", { id: first.id, status: "listo" })).status, 409);
  for (const payload of [{ warrantyDays: -1 }, { warrantyDays: 1.5 }, { estimatedExitDate: "2026-08-31" }, { estimatedExitDate: "2026-02-30" }, { serialNumber: "s".repeat(121) }, { notes: "Sobrescribir" }]) {
    assert.equal((await request("/api/equipment", "PATCH", { id: first.id, version: winner.version, ...payload })).status, 400);
  }
  const notes = await Promise.all(["Primera nota", "Segunda nota"].map(message => request("/api/equipment/history", "POST", { equipmentId: first.id, message, actorEmail: "autor-falso@example.test" })));
  for (const note of notes) { assert.equal(note.status, 201, JSON.stringify(note.body)); assert.equal(note.body.event.actorEmail, author); }
  assert.equal((await request(`/api/equipment/detail?id=${first.id}`)).body.equipment.version, winner.version, "Añadir notas no invalida los cambios pendientes de la orden");
  const history = await request(historyPath);
  assert.equal(history.body.history.filter(event => event.kind === "nota").length, 2);
  assert.equal((await request("/api/equipment/history", "POST", { equipmentId: first.id, message: " " })).status, 400);
  const cleared = await request("/api/equipment", "PATCH", { id: first.id, version: winner.version, estimatedExitDate: null, warrantyDays: 0 });
  assert.equal(cleared.status, 200); assert.equal(cleared.body.equipment.estimatedExitDate, null); assert.equal(cleared.body.equipment.warrantyDays, 0);
  const filter = new URLSearchParams({ technician: marker, entryFrom: "2026-09-01", entryTo: "2026-09-07", limit: "1" });
  const page1 = await request(`/api/equipment?${filter}`);
  assert.equal(page1.body.total, 2); assert.equal(page1.body.equipment.length, 1); assert.ok(page1.body.nextCursor);
  filter.set("cursor", page1.body.nextCursor);
  const page2 = await request(`/api/equipment?${filter}`);
  assert.equal(page2.body.total, 2); assert.equal(page2.body.equipment.length, 1); assert.notEqual(page1.body.equipment[0].id, page2.body.equipment[0].id);
  assert.equal(page2.body.nextCursor, null); assert.ok(page2.body.technicians.includes(marker + " otro"));
  const exactDay = await request(`/api/equipment?${new URLSearchParams({ technician: marker, entryFrom: "2026-09-07", entryTo: "2026-09-07" })}`);
  assert.equal(exactDay.body.total, 1);
  assert.equal((await request("/api/equipment?entryFrom=2026-09-08&entryTo=2026-09-07")).status, 400);
  for (let index = 0; index < 49; index++) {
    assert.equal((await request("/api/equipment/history", "POST", { equipmentId: first.id, message: `Nota de paginación ${index}` })).status, 201);
  }
  const recent = await request(historyPath); assert.equal(recent.body.history.length, 50); assert.ok(recent.body.nextCursor);
  const older = await request(historyPath + `&before=${recent.body.nextCursor}`);
  assert.equal(older.body.history.length, 3); assert.equal(older.body.nextCursor, null);
  assert.equal(new Set([...recent.body.history, ...older.body.history].map(event => event.id)).size, 53);
  for (const path of ["/api/equipment/reports", "/api/equipment/export"]) assert.equal((await request(path, "GET", null, false)).status, 403);
  const contact = await request("/api/equipment/history", "POST", { equipmentId: first.id, kind: "contacto", channel: "whatsapp", template: "recibido", recipient: "50760000000", message: "Mensaje ficticio; no enviado.", actorEmail: "autor-falso@example.test" });
  assert.equal(contact.status, 201); assert.equal(contact.body.event.actorEmail, author);
  const contacted = await request(historyPath);
  assert.equal(contacted.body.lastContact.id, contact.body.event.id);
  assert.equal((await request("/api/equipment/history", "POST", { equipmentId: first.id, kind: "contacto", channel: "sms", template: "recibido", recipient: "123", message: "Ficticio" })).status, 400);
  const delivered = await request("/api/equipment", "PATCH", { id: orders[1].id, version: orders[1].version, status: "entregado", exitDate: "2026-09-07", laborCostCents: 1299 });
  assert.equal(delivered.status, 200);
  const reportQuery = new URLSearchParams({ technician: marker, from: "2026-09-01", to: "2026-09-07" });
  const report = await request(`/api/equipment/reports?${reportQuery}`);
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.report.active, 1); assert.equal(report.body.report.received, 2);
  assert.equal(report.body.report.delivered, 1); assert.equal(report.body.report.invoicedCents, 1299);
  assert.equal(report.body.report.averageTurnaroundDays, 0);
  const csv = await fetch(`${origin}/api/equipment/export?${reportQuery}`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200); assert.match(csv.headers.get("content-disposition"), /attachment/);
  const content = await csv.text();
  assert.ok(content.includes(orders[0].orderNumber)); assert.ok(content.includes(orders[1].orderNumber));
  assert.ok(!content.includes(orders[2].orderNumber)); assert.ok(content.includes('"12.99"'));
  console.log("OK: contacto registrado con autor real, último contacto, indicadores por período y técnico, CSV completo del filtro, montos y endpoints privados.");
  console.log("OK: serial, garantía, plazos, filtros paginados, recepción con autor, 2 escritores simultáneos (200/409), notas independientes, autor del servidor, historial paginado y acceso privado.");
} finally {
  for (const order of orders) {
    const current = await request(`/api/equipment/detail?id=${order.id}`);
    const result = await request("/api/equipment", "PATCH", { id: order.id, version: current.body.equipment.version, status: "anulado" });
    assert.equal(result.status, 200, "Las órdenes ficticias deben quedar anuladas");
  }
}
