export const roleLabels = { admin: "Administrador", recepcion: "Recepción", tecnico: "Técnico", lectura: "Solo lectura" } as const;
export type Role = keyof typeof roleLabels;
export type Permission = "receive" | "edit" | "charge" | "reverse" | "stock" | "consume" | "note";
export function can(role: Role, permission: Permission) {
  if (role === "admin") return true;
  if (role === "recepcion") return permission !== "reverse";
  return role === "tecnico" && ["edit", "consume", "note"].includes(permission);
}

// Only trusted server configuration and the provider's verified identity enter
// this resolver. Missing/invalid configuration never grants write access.
export function resolveRole(user: { userId: string; email: string }, config?: string): Role {
  try {
    const roles: unknown = JSON.parse(config || "{}");
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) return "lectura";
    const map = roles as Record<string, unknown>;
    const role = Object.hasOwn(map, user.userId) ? map[user.userId] : Object.hasOwn(map, user.email.toLowerCase()) ? map[user.email.toLowerCase()] : null;
    return typeof role === "string" && Object.hasOwn(roleLabels, role) ? role as Role : "lectura";
  } catch { return "lectura"; }
}
export const technicianFields = new Set(["id", "version", "diagnosis", "partsDescription", "laborDescription", "estimatedExitDate", "status"]);
export function canEditPayload(role: Role, payload: Record<string, unknown>, currentStatus?: string) {
  if (!can(role, "edit")) return false;
  if (role !== "tecnico") return true;
  return !["entregado", "anulado"].includes(currentStatus || "") && Object.keys(payload).every(key => technicianFields.has(key)) &&
    (payload.status === undefined || ["ingreso", "diagnostico", "reparacion", "listo"].includes(String(payload.status)));
}
