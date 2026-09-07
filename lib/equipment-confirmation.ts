import { formatMoney } from "./totals.ts";

type OrderForConfirmation = {
  orderNumber: string;
  status: string;
  partsCostCents: number;
  laborCostCents: number;
};

// One message policy for the table, the detail's Save button and the invoice button.
export function equipmentChangeConfirmation(current: OrderForConfirmation, values: Record<string, unknown>): string | null {
  const status = typeof values.status === "string" ? values.status : current.status;
  const parts = typeof values.partsCostCents === "number" ? values.partsCostCents : current.partsCostCents;
  const labor = typeof values.laborCostCents === "number" ? values.laborCostCents : current.laborCostCents;
  if (status === "entregado" && current.status !== "entregado") {
    return `La orden ${current.orderNumber} se marcará como entregada y se generará una factura por ${formatMoney(parts + labor)}. ¿Deseas continuar?` +
      (parts + labor === 0 ? "\n\nEsta orden no tiene costos registrados; la factura será por $0.00." : "");
  }
  if (status === "anulado" && current.status !== "anulado") {
    return `La orden ${current.orderNumber} quedará anulada. Su número se conserva.` +
      (current.status === "entregado" ? "\n\nSe quitará su factura y dejará de contar como facturación del mes." : "") +
      "\n\n¿Deseas continuar?";
  }
  if (current.status === "entregado" && status !== "entregado") {
    return `Cambiar el estado de ${current.orderNumber} quitará su factura y dejará de contar como facturación del mes. ¿Deseas continuar?`;
  }
  if (current.status === "entregado" && (parts !== current.partsCostCents || labor !== current.laborCostCents)) {
    return `Los nuevos costos de ${current.orderNumber} modificarán el importe de la factura ya emitida. ¿Deseas guardar la corrección?`;
  }
  return null;
}
