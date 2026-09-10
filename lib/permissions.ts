export const roleLabels = { admin: "Administrador", tecnico: "Técnico" } as const;
export type Role = keyof typeof roleLabels;
export function canSeeFinance(role:Role){return role==="admin";}
export function canAccessOrder(user:{role?:Role;memberId?:number},order:{assignedMemberId?:number|null}|null|undefined){return Boolean(order)&&(user.role!=="tecnico"||Boolean(user.memberId&&order?.assignedMemberId===user.memberId));}
const financialFields=new Set(["partsCostCents","paidCents","invoiceSubtotalCents","invoiceTaxCents","invoiceTotalCents","invoiceTaxRate","monthRevenueCents","unitCostCents"]);
export function operationalData<T>(value:T,role:Role):T {
  if(canSeeFinance(role))return value;
  return JSON.parse(JSON.stringify(value,function(key,item){return financialFields.has(key)&&!(key==="invoiceTotalCents"&&this.invoiceKind==="technician")?undefined:Array.isArray(item)?item.filter(row=>!row||!["pago","contacto"].includes(row.kind)):key==="lastContact"?null:item;})) as T;
}
export type Permission = "receive" | "edit" | "charge" | "reverse" | "stock" | "consume" | "note";
export function can(role: Role, permission: Permission) {
  if (role === "admin") return true;

  return role === "tecnico" && ["edit", "consume", "note"].includes(permission);
}

// Only trusted server configuration and the provider's verified identity enter
// this resolver. Missing/invalid configuration never grants write access.
export function resolveRole(user: { userId: string; email: string }, config?: string): Role | null {
  try {
    const roles: unknown = JSON.parse(config || "{}");
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) return null;
    const map = roles as Record<string, unknown>;
    const role = Object.hasOwn(map, user.userId) ? map[user.userId] : Object.hasOwn(map, user.email.toLowerCase()) ? map[user.email.toLowerCase()] : null;
    return typeof role === "string" && Object.hasOwn(roleLabels, role) ? role as Role : null;
  } catch { return null; }
}
export const technicianFields = new Set(["id", "version", "diagnosis", "partsDescription", "laborDescription", "laborCostCents", "estimatedExitDate", "status"]);
export function canEditPayload(role: Role, payload: Record<string, unknown>, currentStatus?: string) {
  if (!can(role, "edit")) return false;
  if (role !== "tecnico") return true;
  return !["entregado", "anulado"].includes(currentStatus || "") && Object.keys(payload).every(key => technicianFields.has(key)) &&
    (payload.status === undefined || ["ingreso", "diagnostico", "reparacion", "listo"].includes(String(payload.status)));
}
