import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { exportLeadsCsv } from "@/lib/leads/service";

/**
 * Stream a filtered CSV of leads (not capped by pageSize). Respects the same
 * filter/sort query params as the listing, plus a `columns` param (comma-
 * separated column keys) selecting which columns to export.
 */
export async function GET(request: Request): Promise<Response> {
  if (!features.scraper.enabled) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const session = await authorizeApi(request);
    const searchParams = new URL(request.url).searchParams;
    const columnsParam = searchParams.get("columns");
    const columns = columnsParam
      ? columnsParam
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      : undefined;
    const stream = await exportLeadsCsv(session, searchParams, columns);
    const filename = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
