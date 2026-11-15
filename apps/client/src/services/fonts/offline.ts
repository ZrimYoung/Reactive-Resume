export type OfflineFontRequest = { family: string; variants: string[]; subset: string };
export type OfflineFontStatus = {
  family: string;
  status: "ready" | "missing";
  requiredVariants: string[];
  cachedVariants: string[];
  missingVariants: string[];
  cssUrl: string;
  license?: { source: string; sha256: string };
};

const queryFor = (font: OfflineFontRequest) =>
  new URLSearchParams({
    family: font.family,
    variants: font.variants.join(","),
    subset: font.subset,
  });

export const offlineFontCssUrl = (font: OfflineFontRequest) =>
  `/api/fonts/offline/style.css?${queryFor(font)}`;

export async function getOfflineFontStatus(
  font: OfflineFontRequest,
  signal?: AbortSignal,
): Promise<OfflineFontStatus> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  const timer = setTimeout(abort, 15_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await fetch(`/api/fonts/offline?${queryFor(font)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Font cache could not be checked.");
    return (await response.json()) as OfflineFontStatus;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** This explicit action is the only client operation that asks the server to access a font host. */
export async function prepareOfflineFont(font: OfflineFontRequest): Promise<OfflineFontStatus> {
  const response = await fetch("/api/fonts/offline/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(font),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const licenseUnavailable =
      typeof failure?.message === "string" && /license/i.test(failure.message);
    throw new Error(licenseUnavailable ? "FONT_LICENSE_UNAVAILABLE" : "Font preparation failed.");
  }
  return response.json() as Promise<OfflineFontStatus>;
}
