/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush pending React effects. */
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useArtboardStore } from "../store/artboard";
import { ArtboardPage } from "./artboard";

let root: Root;
let host: HTMLDivElement;
const loadFonts = vi.fn().mockResolvedValue([]);
const waitForFrames = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const resume = structuredClone(defaultResumeData);
  resume.metadata.typography.font.family = "Roboto";
  useArtboardStore.setState({ resume });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: loadFonts, ready: Promise.resolve() },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => {
      callback(0);
    }, 0),
  );
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.artboardReady;
});

const render = async () => {
  await act(async () => {
    root.render(
      <HelmetProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<ArtboardPage />}>
              <Route path="/" element={<div data-page="1">Printable content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
  });
};

describe("print readiness", () => {
  it("waits for the custom-font response and local cached CSS, without requesting Internet fonts", async () => {
    const pending: { resolve?: (response: Response) => void } = {};
    const pendingFonts = new Promise<Response>((resolve) => {
      pending.resolve = resolve;
    });
    const fetcher = vi.fn((url: string) =>
      url.includes("/user/")
        ? pendingFonts
        : Promise.resolve(new Response("", { headers: { "X-Offline-Font-Status": "ready" } })),
    );
    vi.stubGlobal("fetch", fetcher);
    await render();
    await waitForFrames();
    expect(document.documentElement.dataset.artboardReady).toBe("false");
    await act(async () => {
      pending.resolve?.(new Response("[]"));
    });
    await waitForFrames();
    expect(document.documentElement.dataset.artboardReady).toBe("true");
    expect(document.documentElement.dataset.resumeFonts).toBe("ready");
    expect(fetcher.mock.calls.every(([url]) => url.startsWith("/api/fonts/"))).toBe(true);
    expect(loadFonts).toHaveBeenCalled();
  });

  it("finishes using the local fallback when a catalog font has not been downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.includes("/user/")
            ? new Response("[]")
            : new Response("", { headers: { "X-Offline-Font-Status": "missing" } }),
        ),
      ),
    );
    await render();
    await waitForFrames();
    expect(document.documentElement.dataset.artboardReady).toBe("true");
    expect(document.documentElement.dataset.resumeFonts).toBe("missing");
    expect(host.textContent).toContain("Printable content");
  });
});
