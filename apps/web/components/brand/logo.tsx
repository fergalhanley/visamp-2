import { cn } from "@/lib/utils";

/**
 * The mark on its own. `logo-dark.svg` has no background plate, so it can be
 * masked and tinted with currentColor like an icon.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block h-6 w-6", className)}
      style={{
        maskImage: "url(/logo-dark.svg)",
        WebkitMaskImage: "url(/logo-dark.svg)",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        backgroundColor: "currentColor",
      }}
    />
  );
}

/**
 * Full lockup — mark plus wordmark.
 *
 * The file bakes in an opaque black rectangle, so it cannot be masked or
 * recoloured. `mix-blend-screen` drops that black against any dark backdrop
 * while leaving the white artwork intact, which is exactly the case these
 * assets were drawn for.
 */
export function BrandLockup({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG; next/image would need dangerouslyAllowSVG
    <img
      src="/logo-title-landscape.svg"
      alt="VisAmp"
      className={cn("h-6 w-auto mix-blend-screen", className)}
    />
  );
}
