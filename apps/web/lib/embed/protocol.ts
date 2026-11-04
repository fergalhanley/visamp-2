export const EMBED_CHANNEL = "visamp:embed";
export const EMBED_VERSION = 1;
export type EmbedMode = "ambient" | "showcase";
export type EmbedEventType = "ready" | "rendered" | "error";

export function isHostState(value: unknown): value is {
  channel: typeof EMBED_CHANNEL;
  version: 1;
  type: "host-state";
  instance: string;
  active: boolean;
  userInitiated: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data.channel === EMBED_CHANNEL &&
    data.version === EMBED_VERSION &&
    data.type === "host-state" &&
    typeof data.instance === "string" &&
    typeof data.active === "boolean" &&
    typeof data.userInitiated === "boolean"
  );
}

/** A query string may select an allowed parent; it cannot expand the allowlist. */
export function exactOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.origin === value
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export const PRODUCTION_PARENTS = [
  "https://fergalflix.com",
  "https://www.fergalflix.com",
  "https://fergalhanley.com",
  "https://www.fergalhanley.com",
];

export function embedParentOrigins(extra = ""): string[] {
  return [
    ...new Set([
      ...PRODUCTION_PARENTS,
      ...extra
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => exactOrigin(origin) !== null),
    ]),
  ];
}

export function readEmbedOptions(
  params: Record<string, string | string[] | undefined>,
  allowed: string[],
) {
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const origin = value("parentOrigin");
  return {
    mode:
      value("mode") === "ambient"
        ? ("ambient" as const)
        : ("showcase" as const),
    parentOrigin: origin && allowed.includes(origin) ? origin : null,
    instance: (value("instance") ?? "").slice(0, 100),
    example: value("example") ?? "mandala",
    visualisation: value("vis"),
  };
}
