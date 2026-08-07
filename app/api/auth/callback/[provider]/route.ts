import { NextResponse, type NextRequest } from "next/server";

import { auth, type OAuthProvider } from "@/lib/auth";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/auth/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (
    provider !== "google" &&
    provider !== "github" &&
    provider !== "linkedin"
  ) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? undefined;
  const next = request.nextUrl.searchParams.get("next") ?? DEFAULT_AUTHED_PATH;

  if (!code) {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("error", "oauth");
    return NextResponse.redirect(url);
  }

  try {
    await auth.completeOAuth(provider as OAuthProvider, { code, state });
    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("error", "oauth");
    return NextResponse.redirect(url);
  }
}
