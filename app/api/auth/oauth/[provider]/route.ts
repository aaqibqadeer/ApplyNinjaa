import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/config/env.schema";
import { features } from "@/config/features";
import { auth, type OAuthProvider } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/auth/constants";

const CLIENT_ID: Record<OAuthProvider, () => string | undefined> = {
  google: () => env.GOOGLE_CLIENT_ID,
  github: () => env.GITHUB_CLIENT_ID,
  linkedin: () => env.LINKEDIN_CLIENT_ID,
};

/** Enabled = flag on AND a client id is actually configured (§step 2). */
function isEnabled(provider: string): provider is OAuthProvider {
  if (provider !== "google" && provider !== "github" && provider !== "linkedin")
    return false;
  return features.auth.oauth[provider] && Boolean(CLIENT_ID[provider]());
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (!isEnabled(provider)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }
  const next = request.nextUrl.searchParams.get("next") ?? undefined;
  try {
    const url = await auth.getOAuthUrl(provider, next);
    return NextResponse.redirect(url);
  } catch {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("error", "oauth");
    return NextResponse.redirect(url);
  }
}
