import Image from "next/image";

export interface BrandLogoProps {
  variant: "mark" | "lockup";
  tone: "light" | "dark";
  size: "sm" | "md" | "lg";
  withTagline?: boolean;
}

const MARK_PIXELS: Record<BrandLogoProps["size"], number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

const LOCKUP_PIXELS: Record<BrandLogoProps["size"], { width: number; height: number }> = {
  sm: { width: 136, height: 32 },
  md: { width: 170, height: 40 },
  lg: { width: 204, height: 48 },
};

const WORDMARK_TEXT_SIZE: Record<BrandLogoProps["size"], string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
};

function BrandTagline({ tone }: { tone: BrandLogoProps["tone"] }) {
  return (
    <span className={tone === "light" ? "text-xs text-white/75" : "text-xs text-foreground/75"}>
      Video analysis and AI coaching for fencers.
    </span>
  );
}

export function BrandLogo({
  variant,
  tone,
  size,
  withTagline = false,
}: BrandLogoProps) {
  const markPx = MARK_PIXELS[size];

  if (variant === "mark") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Image
          src={tone === "light" ? "/brand/logo-mark-mono-light.svg" : "/brand/logo-mark-mono-dark.svg"}
          alt="Engarde AI mark"
          width={markPx}
          height={markPx}
          priority
        />
        {withTagline ? <BrandTagline tone={tone} /> : null}
      </span>
    );
  }

  const lockup = LOCKUP_PIXELS[size];

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {tone === "light" ? (
        <Image
          src="/brand/logo-lockup.svg"
          alt="Engarde AI"
          width={lockup.width}
          height={lockup.height}
          priority
        />
      ) : (
        <span className="inline-flex items-center gap-2">
          <Image src="/brand/logo-mark.svg" alt="Engarde AI mark" width={markPx} height={markPx} priority />
          <span className={`${WORDMARK_TEXT_SIZE[size]} font-bold tracking-tight text-foreground`}>
            Engarde<span className="text-red-600">AI</span>
          </span>
        </span>
      )}
      {withTagline ? <BrandTagline tone={tone} /> : null}
    </span>
  );
}
