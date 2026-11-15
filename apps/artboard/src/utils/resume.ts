import type { Metadata, ResumeData } from "@reactive-resume/schema";
import { defaultResumeData } from "@reactive-resume/schema";
import { pageSizeMap } from "@reactive-resume/utils";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function mergeDefaults(defaults: unknown, value: unknown): unknown {
  if (Array.isArray(defaults)) return structuredClone(Array.isArray(value) ? value : defaults);
  if (!isRecord(defaults)) {
    return value !== null && typeof value === typeof defaults ? value : defaults;
  }
  const input = isRecord(value) ? value : {};
  const result: Record<string, unknown> = { ...input };
  for (const [key, fallback] of Object.entries(defaults)) {
    result[key] = mergeDefaults(fallback, input[key]);
  }
  return result;
}

function restoreLocalAssets(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1])(?::\d+)?(?=\/api\/storage\/)/gi,
      () => window.location.origin,
    );
  }
  if (Array.isArray(value)) return value.map((item) => restoreLocalAssets(item));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreLocalAssets(item)]),
    );
  }
  return value;
}

/** Complete older/imported resumes without sharing mutable defaults across documents. */
export function normalizeArtboardResume(value: unknown): ResumeData {
  const resume = restoreLocalAssets(mergeDefaults(defaultResumeData, value)) as ResumeData;
  const layout = resume.metadata.layout;
  if (
    layout.length === 0 ||
    !layout.every(
      (page) =>
        Array.isArray(page) &&
        page.length > 0 &&
        page.every(
          (column) => Array.isArray(column) && column.every((id) => typeof id === "string"),
        ),
    )
  ) {
    resume.metadata.layout = structuredClone(defaultResumeData.metadata.layout);
  }
  return resume;
}

const positive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export function getPageDimensions(page: Metadata["page"]) {
  const presets: Partial<Record<string, { width: number; height: number }>> = pageSizeMap;
  const preset = presets[page.format] ?? pageSizeMap.a4;
  const width = page.custom.enabled ? positive(page.custom.width, preset.width) : preset.width;
  const height = page.custom.enabled ? positive(page.custom.height, preset.height) : preset.height;
  return page.orientation === "landscape" ? { width: height, height: width } : { width, height };
}
