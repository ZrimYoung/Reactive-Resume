import type { ResumeData } from "@reactive-resume/schema";
import type { CheckedPdfExtraction, PdfTextFinding } from "@reactive-resume/utils";
import { checkExtractedPdf, resumeMeasurementKey } from "@reactive-resume/utils";

export type PdfReview = {
  resumeId: string;
  snapshot: string;
  extraction: CheckedPdfExtraction;
  findings: PdfTextFinding[];
};
export class PdfReviewError extends Error {
  constructor(readonly reason: "save" | "changed" | "local-pdf" | "unverified") {
    super(reason);
  }
}

type Dependencies = {
  getResume: () => { id: string; data: ResumeData };
  flush: (id: string) => Promise<boolean>;
  createPdf: (id: string, signal: AbortSignal) => Promise<{ url: string; dataHash?: string }>;
  extract: (blob: Blob, options: { signal: AbortSignal }) => Promise<CheckedPdfExtraction>;
  origin: string;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  snapshotKey?: typeof resumeMeasurementKey;
};

/** The same print endpoint used by Export, inspected only on request and tied to the authored snapshot. */
export async function reviewSavedPdf({
  getResume,
  flush,
  createPdf,
  extract,
  origin,
  signal,
  fetcher = fetch,
  snapshotKey = resumeMeasurementKey,
}: Dependencies): Promise<PdfReview> {
  const start = getResume();
  const snapshot = JSON.stringify(start.data);
  let expectedHash: string;
  try {
    expectedHash = await snapshotKey(start.data);
  } catch {
    throw new PdfReviewError("unverified");
  }
  signal.throwIfAborted();
  if (!(await flush(start.id))) throw new PdfReviewError("save");
  signal.throwIfAborted();
  const current = getResume();
  if (current.id !== start.id || JSON.stringify(current.data) !== snapshot)
    throw new PdfReviewError("changed");
  const result = await createPdf(start.id, signal);
  signal.throwIfAborted();
  if (!result.dataHash || !/^[\da-f]{64}$/i.test(result.dataHash))
    throw new PdfReviewError("unverified");
  if (result.dataHash.toLowerCase() !== expectedHash.toLowerCase())
    throw new PdfReviewError("changed");
  const url = new URL(result.url, origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.origin !== origin && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new PdfReviewError("local-pdf");
  const response = await fetcher(url.href, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error("PDF could not be read.");
  const blob = await response.blob();
  signal.throwIfAborted();
  const extraction = await extract(blob, { signal });
  signal.throwIfAborted();
  return { resumeId: start.id, snapshot, extraction, findings: checkExtractedPdf(extraction) };
}
