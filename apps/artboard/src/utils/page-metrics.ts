import type { ResumeData } from "@reactive-resume/schema";
import type { ResumePageMetrics } from "@reactive-resume/utils";
import { resumeMeasurementKey } from "@reactive-resume/utils";

type Plan = { widthPx: number; heightPx: number; lineHeightPx: number };

/** CSS layout sizes deliberately ignore canvas zoom. A small tolerance excludes the page-boundary border. */
export function measureResumePages(
  elements: readonly HTMLElement[],
  plan: Plan,
): ResumePageMetrics {
  const pages = elements.map((element, index) => {
    const contentHeightPx = Math.max(element.scrollHeight, element.offsetHeight);
    const rawOverflow = contentHeightPx - plan.heightPx;
    const overflowPx = rawOverflow > 2 ? Math.ceil(rawOverflow) : 0;
    const horizontal = element.scrollWidth - plan.widthPx;
    return {
      pageNumber: index + 1,
      widthPx: plan.widthPx,
      heightPx: plan.heightPx,
      contentHeightPx,
      overflowPx,
      overflowLines:
        overflowPx > 0 ? Math.max(1, Math.ceil(overflowPx / Math.max(1, plan.lineHeightPx))) : 0,
      horizontalOverflowPx: horizontal > 2 ? Math.ceil(horizontal) : 0,
    };
  });
  return {
    plannedPages: pages.length,
    estimatedPages: pages.reduce(
      (sum, page) =>
        sum + Math.max(1, Math.ceil((page.contentHeightPx - 2) / Math.max(1, plan.heightPx))),
      0,
    ),
    pages,
  };
}

type Options = {
  getResume: () => ResumeData;
  getPlan: () => Plan;
  publish: (snapshotKey: string, metrics: ResumePageMetrics) => void;
  snapshotKey?: typeof resumeMeasurementKey;
};

/** Observes local layout only; neither editing nor measuring starts a print job or changes resume data. */
export function observeResumePages({
  getResume,
  getPlan,
  publish,
  snapshotKey = resumeMeasurementKey,
}: Options) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let resize: ResizeObserver | undefined;
  const observed = new WeakSet<Element>();
  const measure = async () => {
    if (
      disposed ||
      document.documentElement.dataset.artboardReady !== "true" ||
      document.documentElement.dataset.resumeFonts === "loading"
    )
      return;
    const data = getResume();
    const run = ++generation;
    // eslint-disable-next-line unicorn/prefer-spread -- Artboard's DOM lib intentionally excludes DOM.Iterable.
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>('[data-page][data-mode="builder"]'),
    );
    if (pages.length === 0 || pages.length > 100) return;
    for (const page of pages)
      if (!observed.has(page)) {
        resize?.observe(page);
        observed.add(page);
      }
    const metrics = measureResumePages(pages, getPlan());
    try {
      const key = await snapshotKey(data);
      // Disposal can happen while the digest promise is pending.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!disposed && run === generation && getResume() === data) publish(key, metrics);
    } catch {
      /* A missing secure-context digest API disables only optional page measurements. */
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void measure();
    }, 250);
  };
  if (typeof ResizeObserver !== "undefined") resize = new ResizeObserver(schedule);
  const mutation = new MutationObserver(schedule);
  mutation.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-artboard-ready", "data-resume-fonts"],
  });
  const onMessage = (event: MessageEvent) => {
    if (
      event.origin === window.location.origin &&
      event.source === window.parent &&
      event.data?.type === "REQUEST_RESUME_PAGE_METRICS"
    )
      schedule();
  };
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    disposed = true;
    generation++;
    clearTimeout(timer);
    resize?.disconnect();
    mutation.disconnect();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("resize", schedule);
  };
}
