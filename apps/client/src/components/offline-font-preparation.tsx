import { t } from "@lingui/macro";
import { Button } from "@reactive-resume/ui";
import { useEffect, useState } from "react";

import type { OfflineFontRequest, OfflineFontStatus } from "@/client/services/fonts/offline";
import {
  getOfflineFontStatus,
  offlineFontCssUrl,
  prepareOfflineFont,
} from "@/client/services/fonts/offline";
import { useBuilderStore } from "@/client/stores/builder";

export const OfflineFontPreparation = ({ family, variants, subset }: OfflineFontRequest) => {
  const [status, setStatus] = useState<OfflineFontStatus>();
  const [checking, setChecking] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [licenseFailure, setLicenseFailure] = useState(false);
  const [revision, setRevision] = useState(0);
  const variantKey = variants.join(",");

  useEffect(() => {
    const controller = new AbortController();
    setStatus(undefined);
    setChecking(true);
    setFailed(false);
    setLicenseFailure(false);
    void getOfflineFontStatus(
      { family, variants: variantKey.split(",").filter(Boolean), subset },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setStatus(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => {
      controller.abort();
    };
  }, [family, variantKey, subset]);

  const prepare = async () => {
    setPreparing(true);
    setFailed(false);
    setLicenseFailure(false);
    try {
      const result = await prepareOfflineFont({ family, variants, subset });
      setStatus(result);
      setRevision((value) => value + 1);
      useBuilderStore
        .getState()
        .frame.ref?.contentWindow?.postMessage({ type: "REFETCH_FONTS" }, window.location.origin);
      window.dispatchEvent(new Event("LOCAL_FONTS_UPDATED"));
    } catch (error) {
      setLicenseFailure(error instanceof Error && error.message === "FONT_LICENSE_UNAVAILABLE");
      setFailed(true);
    } finally {
      setPreparing(false);
    }
  };

  let message = t`Font is not downloaded. Preview and PDF will use a substitute font.`;
  if (preparing) message = t`Preparing font for offline use…`;
  else if (checking) message = t`Checking offline font…`;
  else if (failed && licenseFailure)
    message = t`The original font license could not be downloaded. Choose another font or upload a local font.`;
  else if (failed)
    message = t`Font preparation failed. Check your connection and try again, or upload a font.`;
  else if (status?.status === "ready") message = t`This font's required styles are cached locally.`;

  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      {status?.status === "ready" && (
        <link
          rel="stylesheet"
          href={`${offlineFontCssUrl({ family, variants, subset })}&revision=${revision}`}
        />
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {status?.status !== "ready" && (
        <Button variant="outline" size="sm" disabled={preparing || checking} onClick={prepare}>
          {failed ? t`Retry font download` : t`Prepare font for offline use`}
        </Button>
      )}
    </div>
  );
};
