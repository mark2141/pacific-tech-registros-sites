import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Esta prueba solo puede escribir en un entorno local.");
const signIn = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = signIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "La sesión local debe emitir una cookie");
const home = await fetch(`${origin}/`, { headers: { Cookie: cookie } });
assert.equal(home.status, 200, "La pantalla principal debe compilar y responder");
async function request(path, method = "GET", body, authenticated = true) {
  const response = await fetch(`${origin}${path}`, { method, headers: { ...(authenticated ? { Cookie: cookie } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
assert.equal((await request("/api/equipment", "GET", null, false)).status, 403);
const before = await request("/api/equipment");
assert.equal(before.status, 200);
for (const raw of ["{", "null", "[]"]) {
  const invalid = await fetch(`${origin}/api/equipment`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: raw });
  assert.equal(invalid.status, 400, "Los datos mal formados deben devolver un error de validación");
}
const longName = await request("/api/equipment", "POST", { customerName: "a".repeat(121), equipmentType: "Laptop", reportedIssue: "Prueba" });
assert.equal(longName.status, 400);
const marker = `Prueba local ${Date.now()} %_`;
const created = await request("/api/equipment", "POST", { customerName: marker, customerPhone: "60000000", equipmentType: "Laptop", reportedIssue: "Comprobación de adaptación; datos ficticios" });
assert.equal(created.status, 201, JSON.stringify(created.body));
const { id, orderNumber } = created.body.equipment;
assert.match(orderNumber, /^OT-\d{6}-\d{3,}$/);
const search = await request(`/api/equipment?search=${encodeURIComponent(marker)}`);
assert.equal(search.body.total, 1);
assert.equal(search.body.equipment[0].id, id);
assert.match(search.headers.get("cache-control"), /no-store/);
const edited = await request("/api/equipment", "PATCH", { id, diagnosis: "Equipo de prueba revisado", status: "listo", partsCostCents: 1999, laborCostCents: 5000 });
assert.equal(edited.status, 200, JSON.stringify(edited.body));
const delivered = await request("/api/equipment", "PATCH", { id, status: "entregado" });
assert.equal(delivered.body.equipment.invoiceTotalCents, 6999);
assert.ok(delivered.body.equipment.invoiceNumber);
const corrected = await request("/api/equipment", "PATCH", { id, laborCostCents: 6000 });
assert.equal(corrected.body.equipment.invoiceTotalCents, 7999);
const invalid = await request("/api/equipment", "PATCH", { id, customerPhone: "abc" });
assert.equal(invalid.status, 400);
for (const values of [{ laborCostCents: true }, { laborCostCents: 2147483648 }, { notes: "a".repeat(2001) }, { id: [id], status: "anulado" }]) {
  const rejected = await request("/api/equipment", "PATCH", { id, ...values });
  assert.equal(rejected.status, 400);
}
const unchanged = await request(`/api/equipment?search=${encodeURIComponent(marker)}`);
assert.equal(unchanged.body.equipment[0].invoiceTotalCents, 7999, "Rechazar una edición debe conservar la factura");
const catalog = await fetch(`${origin}/precios/`, { headers: { Cookie: cookie } });
assert.equal(catalog.status, 200);
assert.match(catalog.headers.get("cache-control"), /no-store/);
const cancelled = await request("/api/equipment", "PATCH", { id, status: "anulado" });
assert.equal(cancelled.body.equipment.invoiceNumber, null);
assert.equal(cancelled.body.equipment.invoiceTotalCents, null);
assert.equal((await request(`/api/equipment?search=${encodeURIComponent(marker)}`)).body.total, 0);
const after = await request("/api/equipment");
assert.equal(after.body.summary.monthRevenueCents, before.body.summary.monthRevenueCents);
console.log("OK: acceso privado, alta, búsqueda literal, edición, entrega, totales, corrección, validación, catálogo y anulación. Solo datos locales.");
