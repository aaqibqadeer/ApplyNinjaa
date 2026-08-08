import { NextResponse, type NextRequest } from "next/server";

import { auth, type OAuthProvider } from "@/lib/auth";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { appUrl } from "@/lib/auth/urls";

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
    return NextResponse.redirect(appUrl(LOGIN_PATH));
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? undefined;
  const next = request.nextUrl.searchParams.get("next") ?? DEFAULT_AUTHED_PATH;

  if (!code) {
    const url = appUrl(LOGIN_PATH);
    url.searchParams.set("error", "oauth");
    return NextResponse.redirect(url);
  }

  try {
    await auth.completeOAuth(provider as OAuthProvider, { code, state });
    return NextResponse.redirect(appUrl(next));
  } catch (err) {
    console.error(`[oauth callback] ${provider} failed:`, err);
    const url = appUrl(LOGIN_PATH);
    url.searchParams.set("error", "oauth");
    return NextResponse.redirect(url);
  }
}
