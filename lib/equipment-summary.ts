/**
 * Cifras derivadas de los recuentos por estado.
 *
 * Vivía dentro del componente y se calculaba restando: "todo menos entregado".
 * Al aparecer el estado `anulado` nadie se acordó de descontarlo, y una orden
 * anulada siguió contando como equipo en el taller. Sumar los estados de
 * trabajo en lugar de restar los que sobran deja de depender de esa memoria: un
 * estado nuevo no entra en el recuento salvo que se le añada aquí a propósito.
 */

/** Órdenes vivas: hay un equipo físico en el taller esperando algo. */
export const WORKING_STATUSES = [
  "ingreso",
  "diagnostico",
  "reparacion",
  "listo",
] as const;

export const ANNULLED_STATUS = "anulado";

export type StatusCounts = Record<string, number | undefined>;

export function summarizeStatusCounts(counts: StatusCounts, total: number) {
  const activeCount = WORKING_STATUSES.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );

  return {
    activeCount,
    // El total del servidor cuenta todas las filas, anuladas incluidas. La
    // cifra de "Todos" no: una anulada solo aparece bajo su propio filtro.
    liveTotal: Math.max(0, total - (counts[ANNULLED_STATUS] ?? 0)),
  };
}
