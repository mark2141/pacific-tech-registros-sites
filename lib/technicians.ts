export const TECHNICIANS = ["Anthony", "Marcos", "Valentín", "Xavier"] as const;
export function isTechnicianName(value: unknown): value is typeof TECHNICIANS[number] {
  return typeof value === "string" && (TECHNICIANS as readonly string[]).includes(value);
}
