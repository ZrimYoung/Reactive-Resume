import { t } from "@lingui/macro";
import { useBreakpoint } from "@reactive-resume/hooks";
import type { SectionKey } from "@reactive-resume/schema";
import { Button } from "@reactive-resume/ui";
import type { PdfTextFinding, ResumeCheckFinding } from "@reactive-resume/utils";
import { checkResume } from "@reactive-resume/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import { axios } from "@/client/libs/axios";
import { flushResumeSaves } from "@/client/services/resume/update";
import { useBuilderStore } from "@/client/stores/builder";
import { useResumeStore } from "@/client/stores/resume";

import type { PdfReview } from "./pdf-review";
import { PdfReviewError, reviewSavedPdf } from "./pdf-review";
import { usePageMetrics } from "./use-page-metrics";

function findingMessage(finding: ResumeCheckFinding) {
  switch (finding.code) {
    case "missing-name": {
      return t`The name field is empty.`;
    }
    case "missing-email": {
      return t`The email field is empty.`;
    }
    case "invalid-email": {
      return t`Review the email address format.`;
    }
    case "missing-phone": {
      return t`No phone number is included. Keep it this way if intentional.`;
    }
    case "invalid-url": {
      return t`Review this link's format and protocol.`;
    }
    case "missing-date": {
      return t`This entry has no dates. Add them if relevant.`;
    }
    case "reversed-date": {
      return t`This entry's end date is earlier than its start date.`;
    }
    case "custom-date": {
      return t`Custom date wording is preserved; its order cannot be checked automatically.`;
    }
    case "hidden-section": {
      return t`This section contains content that is hidden from the printed resume.`;
    }
    case "hidden-items": {
      return t`This section contains hidden entries. Keep them hidden if intentional.`;
    }
    case "unplaced-section": {
      return t`This visible content is not placed on a page.`;
    }
    case "small-text": {
      return t`Configured body text is smaller than 12 px (9 pt). Review readability.`;
    }
    case "tight-lines": {
      return t`Configured line height is below 1.15. Review readability.`;
    }
    case "tight-margins": {
      return t`Configured margins are below 10.7 px (8 pt). Review the printed edges.`;
    }
    case "custom-css": {
      return t`Custom CSS can override these settings. Check the actual PDF too.`;
    }
  }
}

function pdfFindingMessage(finding: PdfTextFinding) {
  switch (finding.code) {
    case "no-text": {
      return t`No selectable text was extracted from this PDF.`;
    }
    case "empty-page": {
      return t`A PDF page has no extracted text. Check whether it is intentionally blank or contains only images.`;
    }
    case "replacement-characters": {
      return t`The extracted text contains replacement or control characters. Review the text below.`;
    }
    case "private-use-characters": {
      return t`Some extracted symbols use private-use characters, which can include icons. Review them in context.`;
    }
  }
}

export const ResumeCheckPanel = () => {
  const resume = useResumeStore((state) => state.resume);
  const frame = useBuilderStore((state) => state.frame.ref);
  const { isDesktop } = useBreakpoint();
  const findings = useMemo(() => checkResume(resume.data), [resume.data]);
  const metrics = usePageMetrics(resume.id, resume.data, frame);
  const [review, setReview] = useState<PdfReview>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController>();
  const generation = useRef(0);
  const shownReview = review?.resumeId === resume.id ? review : undefined;
  const stale = !!shownReview && shownReview.snapshot !== JSON.stringify(resume.data);

  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setReview(undefined);
    setError("");
    setRunning(false);
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [resume.id]);

  const openSection = (id: string) => {
    const right = ["typography", "page", "css"].includes(id);
    if (!right) {
      const builder = useBuilderStore.getState();
      builder.setSectionCollapsed(id as SectionKey, false);
      builder.panel.left.setCollapsed(false);
      if (!isDesktop) builder.sheet.left.setOpen(true);
    }
    requestAnimationFrame(() => {
      document
        .querySelector(`#${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const checkPdf = async () => {
    const run = ++generation.current;
    const id = resume.id;
    controller.current?.abort();
    const request = new AbortController();
    const progress = { timedOut: false };
    const timeout = setTimeout(() => {
      progress.timedOut = true;
      request.abort();
    }, 60_000);
    controller.current = request;
    setRunning(true);
    setError("");
    try {
      const result = await reviewSavedPdf({
        getResume: () => useResumeStore.getState().resume,
        flush: flushResumeSaves,
        createPdf: async (resumeId, signal) => {
          const response = await axios.get<{ url: string; dataHash?: string }>(
            `/resume/print/${encodeURIComponent(resumeId)}`,
            { signal, timeout: 45_000 },
          );
          return response.data;
        },
        extract: async (blob, options) => {
          const { extractPdf } = await import("@/client/libs/pdf");
          return extractPdf(blob, options);
        },
        origin: window.location.origin,
        signal: request.signal,
      });
      if (
        run === generation.current &&
        !request.signal.aborted &&
        useResumeStore.getState().resume.id === id
      )
        setReview(result);
    } catch (error_) {
      if (run !== generation.current || (request.signal.aborted && !progress.timedOut)) return;
      let message = t`The PDF could not be checked. Try again.`;
      if (progress.timedOut)
        message = t`The PDF check took too long. Try again with a smaller document.`;
      if (error_ instanceof PdfReviewError && error_.reason === "save")
        message = t`Save the current resume successfully before checking its PDF.`;
      if (error_ instanceof PdfReviewError && error_.reason === "changed")
        message = t`The resume changed while preparing its PDF. Save or reload and run the check again.`;
      if (error_ instanceof PdfReviewError && error_.reason === "unverified")
        message = t`This PDF could not be matched to the current resume snapshot. Run the check again after reloading the app.`;
      setError(message);
    } finally {
      clearTimeout(timeout);
      if (run === generation.current) setRunning(false);
    }
  };

  return (
    <section id="resume-checks" className="grid gap-y-5">
      <header>
        <h2 className="text-2xl font-bold lg:text-3xl">{t`Review resume`}</h2>
        <p className="mt-2 text-xs leading-relaxed opacity-70">{t`Local checks highlight missing details and formatting choices. They do not predict hiring results.`}</p>
      </header>

      <details>
        <summary className="cursor-pointer font-medium">
          {t`Content and settings`} ({findings.length})
        </summary>
        {findings.length === 0 && (
          <p className="mt-3 text-sm">{t`No issues were found in these content and settings checks.`}</p>
        )}
        <ul className="mt-3 space-y-3">
          {findings.map((finding) => (
            <li key={finding.key} className="space-y-1 rounded border p-3 text-sm">
              <p>{findingMessage(finding)}</p>
              {(finding.sectionName ?? finding.itemName) && (
                <p className="text-xs opacity-70">
                  {[finding.sectionName, finding.itemName].filter(Boolean).join(" · ")}
                </p>
              )}
              {finding.value !== undefined && (
                <p className="break-words text-xs opacity-70">{finding.value}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  openSection(finding.sectionId);
                }}
              >{t`Open section`}</Button>
            </li>
          ))}
        </ul>
      </details>

      <div className="space-y-2 rounded border p-3 text-sm" aria-live="polite">
        <h3 className="font-medium">{t`Page fit`}</h3>
        {!metrics && (
          <p className="text-xs opacity-70">{t`Canvas measurements appear after fonts and layout finish loading.`}</p>
        )}
        {metrics && (
          <>
            <p>
              {t`Planned pages`}: {metrics.plannedPages} · {t`Estimated printed pages`}:{" "}
              {metrics.estimatedPages}
            </p>
            {metrics.pages
              .filter((page) => page.overflowPx > 0)
              .map(({ pageNumber, overflowLines }) => (
                <p
                  key={pageNumber}
                >{t`Page ${pageNumber}: approximately ${overflowLines} extra lines.`}</p>
              ))}
            {metrics.pages.some((page) => page.horizontalOverflowPx > 0) && (
              <p>{t`Some content extends beyond a page's width. Review the PDF edges.`}</p>
            )}
            <p className="text-xs opacity-70">{t`This is a canvas estimate. The exported PDF provides the actual page count.`}</p>
          </>
        )}
        {shownReview && !stale && (
          <p>
            {t`Actual PDF pages`}: {shownReview.extraction.pageCount}
          </p>
        )}
        {shownReview &&
          !stale &&
          metrics &&
          shownReview.extraction.pageCount !== metrics.estimatedPages && (
            <p>{t`The PDF page count differs from the canvas estimate. Use the PDF count.`}</p>
          )}
      </div>

      <div className="space-y-3">
        <Button variant="outline" disabled={running} onClick={checkPdf}>
          {running ? t`Checking PDF…` : t`Check exported PDF`}
        </Button>
        {running && (
          <Button
            variant="ghost"
            onClick={() => {
              controller.current?.abort();
              generation.current++;
              setRunning(false);
            }}
          >{t`Cancel`}</Button>
        )}
        <p className="text-xs leading-relaxed opacity-70">{t`This generates the saved PDF and reads it on this device. Nothing is uploaded to a checking service.`}</p>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {shownReview && (
          <div className="space-y-3">
            {stale && (
              <p
                role="status"
                className="rounded border p-2 text-sm"
              >{t`This PDF result is out of date because the resume changed. Run the check again.`}</p>
            )}
            {shownReview.findings.length === 0 && (
              <p className="text-sm">{t`Selectable text was extracted without replacement-character warnings. Review its reading order below.`}</p>
            )}
            {shownReview.findings.map((finding, index) => (
              <p key={`${finding.code}:${index}`} className="text-sm">
                {pdfFindingMessage(finding)}{" "}
                {finding.pageNumber !== undefined && `${t`Page`} ${finding.pageNumber}`}
              </p>
            ))}
            {shownReview.extraction.warnings.length > 0 && (
              <p className="text-sm">{t`The PDF reader reported warnings. Review the extracted text carefully.`}</p>
            )}
            <details>
              <summary className="cursor-pointer font-medium">{t`Text in PDF reading order`}</summary>
              <p className="my-2 text-xs opacity-70">{t`Lines follow the PDF content stream, not the visual columns. Check names, dates, Chinese text and the last entry.`}</p>
              <textarea
                readOnly
                rows={14}
                aria-label={t`Extracted PDF text`}
                value={shownReview.extraction.text}
                className="w-full rounded border bg-transparent p-2 font-mono text-xs leading-relaxed"
              />
            </details>
          </div>
        )}
      </div>
    </section>
  );
};
