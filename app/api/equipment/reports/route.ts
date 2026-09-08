import { listReportRows } from "@platform/equipment";
import { getAuthUser } from "../../../auth";
import { todayInPanama } from "../../../../lib/panama-date";
import { InvalidEquipmentQueryError } from "../../../../lib/equipment-query";
import { parseReportQuery, createReport, accumulateReport, finishReport } from "../../../../lib/equipment-reports";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return Response.json({ error: "Acceso denegado." }, { status: 403, headers });
    const today = todayInPanama();
    const query = parseReportQuery(new URL(request.url).searchParams, today);
    const report = createReport(query, today);
    let before: number | undefined;
    while (!request.signal.aborted) {
      const rows = await listReportRows(query, before);
      for (const row of rows) accumulateReport(report, row);
      if (rows.length < 500) break;
      before = rows.at(-1)!.id;
    }
    if (request.signal.aborted) return new Response(null, { status: 499, headers });
    return Response.json({ report: finishReport(report) }, { headers });
  } catch (error) {
    if (error instanceof InvalidEquipmentQueryError) return Response.json({ error: error.message }, { status: 400, headers });
    console.error("Error al consultar indicadores:", error);
    return Response.json({ error: "No se pudo cargar el reporte." }, { status: 500, headers });
  }
}
