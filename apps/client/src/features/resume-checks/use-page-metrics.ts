import type { ResumeData } from "@reactive-resume/schema";
import type { ResumePageMetrics } from "@reactive-resume/utils";
import { parseResumePageMetrics, resumeMeasurementKey } from "@reactive-resume/utils";
import { useEffect, useState } from "react";

import { useResumeStore } from "@/client/stores/resume";

export function usePageMetrics(id: string, data: ResumeData, frame: HTMLIFrameElement | null) {
  const [result, setResult] = useState<{ snapshot: string; metrics: ResumePageMetrics }>();
  const snapshot = JSON.stringify(data);
  useEffect(() => {
    let active = true;
    let expected: string | undefined;
    setResult(undefined);
    const onMessage = (event: MessageEvent) => {
      if (
        !active ||
        !frame?.contentWindow ||
        event.origin !== window.location.origin ||
        event.source !== frame.contentWindow ||
        event.data?.type !== "RESUME_PAGE_METRICS" ||
        !expected ||
        event.data.snapshotKey !== expected
      )
        return;
      const current = useResumeStore.getState().resume;
      if (current.id !== id || JSON.stringify(current.data) !== snapshot) return;
      const metrics = parseResumePageMetrics(event.data.metrics);
      if (metrics) setResult({ snapshot, metrics });
    };
    window.addEventListener("message", onMessage);
    void resumeMeasurementKey(data)
      .then((key) => {
        if (!active) return;
        expected = key;
        frame?.contentWindow?.postMessage(
          { type: "REQUEST_RESUME_PAGE_METRICS" },
          window.location.origin,
        );
      })
      .catch(() => {
        /* Optional metrics do not block checks on older browser environments. */
      });
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, [id, data, frame, snapshot]);
  return result?.snapshot === snapshot ? result.metrics : undefined;
}
