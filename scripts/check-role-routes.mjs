// Runs the real HTTP handlers with verified identities supplied by a test-only
// module hook. Repositories throw if a forbidden request reaches persistence.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
globalThis.permissionTest = { role: "lectura", calls: 0 };
const identity = moduleUrl('export async function getAuthUser() { return {userId:"verified",email:"verified@example.test",role:globalThis.permissionTest.role}; }');
const repo = moduleUrl('const write=async()=>{globalThis.permissionTest.calls++;throw new Error("Forbidden write reached repository");}; export const createEquipment=write,updateEquipment=write,listEquipment=write,getEquipment=write,listEquipmentHistory=write,addEquipmentNote=write,getLastEquipmentContact=write,getInventoryItem=write,listInventory=write,createInventoryItem=write,editInventoryItem=write,listInventoryMovements=write,listOrderParts=write,moveInventory=write,listPayments=write,recordPayment=write,createAttachment=write,findAttachment=write,getAttachment=write,listAttachments=write,putFile=write,getFile=write,deleteFile=write,exportRecords=write,getStaff=write,listTechnicians=write;');
registerHooks({ resolve(specifier, context, next) {
  if (/\/app\//.test(context.parentURL || "") && /(^|\/)auth$/.test(specifier)) return { url: identity, shortCircuit: true };
  if (specifier.startsWith("@platform/")) return { url: repo, shortCircuit: true };
  if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) { try { return next(specifier + ".ts", context); } catch { /* Let Node resolve other module types. */ } }
  return next(specifier, context);
} });
const equipment = await import("../app/api/equipment/route.ts");
const inventory = await import("../app/api/inventory/route.ts");
const movements = await import("../app/api/inventory/movements/route.ts");
const history = await import("../app/api/equipment/history/route.ts");
const payments = await import("../app/api/equipment/payments/route.ts");
const attachmentRoutes = await import("../app/api/equipment/attachments/route.ts");
const backupRoutes = await import("../app/api/backup/route.ts");
const req = body => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function denied(fn, body) { const r = await fn(req(body)); assert.equal(r.status, 403, JSON.stringify(await r.json())); assert.match(r.headers.get("cache-control"), /no-store/); }
await denied(attachmentRoutes.POST, {}); await denied(backupRoutes.GET, {});
await denied(equipment.POST, {}); await denied(equipment.PATCH, { id: 1, version: 1, status: "entregado", role: "admin" });
await denied(inventory.POST, {}); await denied(inventory.PATCH, {}); await denied(history.POST, {}); await denied(payments.POST, {});
globalThis.permissionTest.role = "tecnico";
await denied(equipment.POST, {});
for (const payload of [{ partsCostCents: 0 }, { status: "entregado" }, { status: "anulado" }, { paidCents: 1 }]) await denied(equipment.PATCH, { id: 1, version: 1, ...payload });
await denied(inventory.POST, {}); await denied(inventory.PATCH, {}); await denied(payments.POST, {});
await denied(movements.POST, { operationId: crypto.randomUUID(), itemId: 1, version: 1, kind: "entrada", quantity: 1, note: "Prueba" });
globalThis.permissionTest.role = "recepcion";
await denied(backupRoutes.GET, {});
await denied(payments.POST, { operationId: crypto.randomUUID(), equipmentId: 1, version: 1, reversalOf: 1, note: "Intento de anulación" });
assert.equal(globalThis.permissionTest.calls, 0);
console.log("OK API: solo lectura y técnicos no pueden elevar permisos, cobrar, alterar costos de piezas ni cerrar órdenes; recepción no puede anular pagos.");
