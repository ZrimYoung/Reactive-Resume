import { useLayoutEffect, useState } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Outlet, useLocation } from "react-router";

import { ErrorBoundary } from "../components/error-boundary";
import { helmetContext } from "../constants/helmet";
import { useArtboardStore } from "../store/artboard";
import { normalizeArtboardResume } from "../utils/resume";

export const Providers = () => {
  const { pathname } = useLocation();
  const [initialized, setInitialized] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.artboardReady = "false";
    const isPreview = pathname.endsWith("/preview");
    const announceReady = () => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "ARTBOARD_READY" }, window.location.origin);
      }
    };
    const handleMessage = (event: MessageEvent) => {
      if (
        isPreview ||
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      if (event.data.type === "ARTBOARD_PING") announceReady();
      if (event.data.type === "SET_RESUME" && event.data.payload) {
        document.documentElement.dataset.artboardReady = "false";
        useArtboardStore.getState().setResume(normalizeArtboardResume(event.data.payload));
      }
    };

    window.addEventListener("message", handleMessage);
    // Only a print page reads its isolated payload; the builder waits for its parent document.
    let payload: unknown;
    if (isPreview) {
      try {
        payload = JSON.parse(window.localStorage.getItem("resume") ?? "null");
      } catch {
        payload = undefined;
      }
    }
    useArtboardStore.getState().setResume(normalizeArtboardResume(payload));
    setInitialized(true);
    announceReady();
    return () => {
      window.removeEventListener("message", handleMessage);
      document.documentElement.dataset.artboardReady = "false";
    };
  }, [pathname]);

  return (
    <ErrorBoundary>
      <HelmetProvider context={helmetContext}>{initialized && <Outlet />}</HelmetProvider>
    </ErrorBoundary>
  );
};
