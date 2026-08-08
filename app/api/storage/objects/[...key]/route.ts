import { NextResponse } from "next/server";

import { env } from "@/config/env.schema";
import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import type { Session } from "@/lib/auth/types";
import { getObject, putObject } from "@/lib/storage/mongodb/adapter";

/** GridFS streaming needs Node APIs. */
export const runtime = "nodejs";

type Params = { params: Promise<{ key: string[] }> };

/** Matches the client-side guard in FileUpload and the résumé cap. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * The GridFS provider's stand-in for a presigned URL (lib/storage/mongodb).
 * Because the URL carries no signature, authority comes from the caller's own
 * session plus this check: `/api/storage/upload-url` mints keys shaped
 * `uploads/<org-or-user-id>/…`, so a key whose scope segment isn't the
 * caller's own is somebody else's file.
 */
function ownsKey(session: Session, key: string): boolean {
  const scope = key.split("/")[1];
  if (!scope) return false;
  return scope === session.organizationId || scope === session.user.id;
}

function keyFrom(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/");
}

function unavailable(): NextResponse {
  return NextResponse.json({ error: "Not available" }, { status: 404 });
}

/** Upload bytes for a key previously minted by /api/storage/upload-url. */
export async function PUT(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.storage || env.STORAGE_PROVIDER === "s3") return unavailable();
  try {
    const session = await authorizeApi(request);
    const key = keyFrom((await params).key);
    if (!ownsKey(session, key)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty upload" }, { status: 400 });
    }
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large — 10 MB max" },
        { status: 413 },
      );
    }
    await putObject(
      key,
      buffer,
      request.headers.get("content-type") ?? "application/octet-stream",
    );
    return NextResponse.json({ ok: true, key });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Stream an object back. Bearer-capable so the extension can fetch a stored CV
 * and hand it to a page's file input.
 */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<Response> {
  if (!features.storage || env.STORAGE_PROVIDER === "s3") return unavailable();
  try {
    const session = await authorizeApi(request);
    const key = keyFrom((await params).key);
    if (!ownsKey(session, key)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const object = await getObject(key);
    if (!object) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new Response(object.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.length),
        "Content-Disposition": `inline; filename="${object.filename.replace(/"/g, "")}"`,
        // Private: these are one user's documents, never a shared CDN asset.
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
