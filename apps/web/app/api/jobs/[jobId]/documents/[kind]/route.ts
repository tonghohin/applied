import { getSession } from "@/lib/session";
import { renderTailoredDocumentPdf, tailoredDocumentKindSchema } from "@repo/api";
import { getDb } from "@repo/db";
import { create as createContentDisposition } from "content-disposition";
import type { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const paramsSchema = z.object({ jobId: z.uuid(), kind: tailoredDocumentKindSchema });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; kind: string }> }
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response("Invalid document", { status: 400 });

  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  let document: Awaited<ReturnType<typeof renderTailoredDocumentPdf>>;
  try {
    document = await renderTailoredDocumentPdf(
      getDb(),
      session.user.id,
      parsed.data.jobId,
      parsed.data.kind
    );
  } catch (error) {
    // Usually a failed font download (fonts come from Google Fonts on first render)
    console.error("[documents] PDF render failed:", error);
    return new Response("Couldn't create the PDF right now. Please try again in a moment.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "10" },
    });
  }
  if (!document) return new Response("Not found", { status: 404 });

  const disposition =
    request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(document.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": createContentDisposition(document.fileName, { type: disposition }),
      "Cache-Control": "private, no-store",
    },
  });
}
