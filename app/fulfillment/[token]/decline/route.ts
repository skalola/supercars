import { NextRequest, NextResponse } from "next/server";
import {
  executePartnerDecisionByAction,
  getPartnerFulfillmentPackage,
} from "@/lib/fulfillment/service";

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const data = await getPartnerFulfillmentPackage(token);

  if ("error" in data) {
    return confirmationResponse({
      request,
      token,
      action: "DECLINE",
      title: "Decline Request",
      status: 400,
      error: data.message,
    });
  }

  return confirmationResponse({
    request,
    token,
    action: "DECLINE",
    title: `Decline ${data.request.requestType.replaceAll("_", " ").toLowerCase()}`,
    vehicleSummary: data.request.vehicle
      ? `${data.request.vehicle.year} ${data.request.vehicle.make} ${data.request.vehicle.model}`
      : "Fulfillment request",
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  let note: string | undefined;
  let submittedVia: "FORM" | "JSON" | "SERVICE" = "SERVICE";

  try {
    const parsed = await readDecisionSubmission(request);
    note = parsed.note;
    submittedVia = parsed.submittedVia;
  } catch {
    // Body is optional
  }

  const result = await executePartnerDecisionByAction(token, "DECLINE", note, {
    ...buildAuditContext(request),
    submittedVia,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}

async function readDecisionSubmission(request: NextRequest): Promise<{
  note?: string;
  submittedVia: "FORM" | "JSON" | "SERVICE";
}> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      note: typeof body.note === "string" ? body.note : undefined,
      submittedVia: "JSON",
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const note = formData.get("note");
    return {
      note: typeof note === "string" ? note : undefined,
      submittedVia: "FORM",
    };
  }

  return { submittedVia: "SERVICE" };
}

function buildAuditContext(request: NextRequest) {
  return {
    requestMethod: request.method,
    routePath: request.nextUrl.pathname,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    referer: request.headers.get("referer") || undefined,
    contentType: request.headers.get("content-type") || undefined,
  };
}

function confirmationResponse(params: {
  request: NextRequest;
  token: string;
  action: "DECLINE";
  title: string;
  vehicleSummary?: string;
  status?: number;
  error?: string;
}) {
  const returnUrl = new URL(`/fulfillment/${params.token}`, params.request.url).toString();
  const heading = escapeHtml(params.error || params.title);
  const summary = escapeHtml(params.vehicleSummary || "the fulfillment request");
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #f8fafc; }
      main { max-width: 620px; margin: 0 auto; padding: 48px 24px; }
      section { border: 1px solid #334155; background: #1e293b; border-radius: 8px; padding: 28px; }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { color: #cbd5e1; line-height: 1.6; }
      textarea { width: 100%; box-sizing: border-box; min-height: 90px; margin: 12px 0; padding: 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; }
      button, a { display: inline-block; border-radius: 6px; padding: 10px 14px; font-weight: 800; font-size: 14px; text-decoration: none; }
      button { border: 0; background: #dc2626; color: white; cursor: pointer; }
      a { color: #cbd5e1; border: 1px solid #475569; margin-left: 8px; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${heading}</h1>
        <p>${params.error ? "" : `Confirming will formally decline this SUPERCARS fulfillment request for ${summary}.`}</p>
        ${
          params.error
            ? `<p>${escapeHtml(params.error)}</p><a href="${returnUrl}">Return to package</a>`
            : `<form method="post">
                <label>Partner note
                  <textarea name="note" placeholder="Optional decline reason"></textarea>
                </label>
                <button type="submit">Confirm Decline</button>
                <a href="${returnUrl}">Review package</a>
              </form>`
        }
      </section>
    </main>
  </body>
</html>`;

  return new NextResponse(body, {
    status: params.status || 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
