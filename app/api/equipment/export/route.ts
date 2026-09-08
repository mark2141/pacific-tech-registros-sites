import { listReportRows } from "@platform/equipment";
import { getAuthUser } from "../../../auth";
import { todayInPanama } from "../../../../lib/panama-date";
import { InvalidEquipmentQueryError } from "../../../../lib/equipment-query";
import { parseReportQuery, reportCsvHeader, reportCsvRow } from "../../../../lib/equipment-reports";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return Response.json({ error: "Acceso denegado." }, { status: 403, headers });
    const query = parseReportQuery(new URL(request.url).searchParams, todayInPanama());
    let rows = await listReportRows(query);
    let first = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (request.signal.aborted) { controller.close(); return; }
          const csv = (first ? reportCsvHeader : "") + rows.filter(row => row.entryDate >= query.from && row.entryDate <= query.to).map(reportCsvRow).join("");
          first = false;
          controller.enqueue(encoder.encode(csv));
          if (rows.length < 500) { controller.close(); return; }
          rows = await listReportRows(query, rows.at(-1)!.id);
        } catch (error) { controller.error(error); }
      },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ordenes-ingresadas-${query.from}-${query.to}.csv"` } });
  } catch (error) {
    if (error instanceof InvalidEquipmentQueryError) return Response.json({ error: error.message }, { status: 400, headers });
    console.error("Error al exportar órdenes:", error);
    return Response.json({ error: "No se pudo exportar el reporte." }, { status: 500, headers });
  }
}
