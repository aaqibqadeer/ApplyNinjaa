import { features } from "@/config/features";
import { Button } from "@/components/ui/button";

interface OAuthButtonsProps {
  /** Path to return to after a successful sign-in. */
  next?: string;
}

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "linkedin", label: "Continue with LinkedIn" },
  { id: "github", label: "Continue with GitHub" },
] as const;

/**
 * Renders a sign-in button for each enabled OAuth provider. Reads
 * `config/features.ts`, so providers whose flag is off never render. Each button
 * links to the server OAuth-start route, which additionally verifies a client id
 * is configured before redirecting.
 */
export function OAuthButtons({ next }: OAuthButtonsProps) {
  const enabled = PROVIDERS.filter((p) => features.auth.oauth[p.id]);
  if (enabled.length === 0) return null;

  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="flex flex-col gap-2">
      {enabled.map((provider) => (
        <Button key={provider.id} variant="outline" asChild>
          <a href={`/api/auth/oauth/${provider.id}${query}`}>
            {provider.label}
          </a>
        </Button>
      ))}
    </div>
  );
}
