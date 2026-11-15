/* eslint-disable lingui/no-unlocalized-strings -- Test fixtures and assertions are not product text. */
/* eslint-disable @typescript-eslint/require-await -- React's async act flushes effects and promise callbacks. */
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OfflineFontPreparation } from "./offline-font-preparation";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

const status = (ready: boolean) => ({
  family: "Lato",
  status: ready ? "ready" : "missing",
  requiredVariants: ["regular", "700", "italic", "700italic"],
  cachedVariants: ready ? ["regular", "700", "italic", "700italic"] : [],
  missingVariants: ready ? [] : ["regular", "700", "italic", "700italic"],
  cssUrl: "/api/fonts/offline/style.css?family=Lato",
});

it("only checks local state on mount, requires an explicit Prepare click, then refreshes the local stylesheet", async () => {
  const fetcher = vi.fn<typeof fetch>((url, init) =>
    Promise.resolve(new Response(JSON.stringify(status(init?.method === "POST")))),
  );
  vi.stubGlobal("fetch", fetcher);
  await act(async () => {
    root.render(<OfflineFontPreparation family="Lato" variants={["regular"]} subset="latin" />);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toEqual(expect.stringMatching(/^\/api\/fonts\/offline\?/));
  expect(container.textContent).toContain("substitute font");
  const prepare = container.querySelector("button");
  if (!prepare) throw new Error("Prepare button was not rendered");
  await act(async () => {
    prepare.click();
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe("/api/fonts/offline/prepare");
  expect(fetcher.mock.calls[1][1]?.method).toBe("POST");
  expect(container.textContent).toContain("cached locally");
  expect(container.querySelector("link")?.getAttribute("href")).toMatch(
    /^\/api\/fonts\/offline\/style\.css\?/,
  );
});

it("offers an explicit retry after a download fails instead of automatically issuing another request", async () => {
  const fetcher = vi.fn<typeof fetch>((_url, init) =>
    init?.method === "POST"
      ? Promise.reject(new TypeError("Offline"))
      : Promise.resolve(new Response(JSON.stringify(status(false)))),
  );
  vi.stubGlobal("fetch", fetcher);
  await act(async () => {
    root.render(<OfflineFontPreparation family="Lato" variants={["regular"]} subset="latin" />);
  });
  const prepare = container.querySelector("button");
  if (!prepare) throw new Error("Prepare button was not rendered");
  await act(async () => {
    prepare.click();
  });
  expect(container.textContent).toContain("Retry font download");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(container.querySelector("link")).toBeNull();
});

it("explains missing original license notices without presenting the cache as ready", async () => {
  const fetcher = vi.fn<typeof fetch>((_url, init) =>
    Promise.resolve(
      init?.method === "POST"
        ? new Response(JSON.stringify({ message: "The original font license is unavailable." }), {
            status: 400,
          })
        : new Response(JSON.stringify(status(false))),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await act(async () => {
    root.render(<OfflineFontPreparation family="Lato" variants={["regular"]} subset="latin" />);
  });
  const prepare = container.querySelector("button");
  if (!prepare) throw new Error("Prepare button was not rendered");
  await act(async () => {
    prepare.click();
  });
  expect(container.textContent).toContain("original font license could not be downloaded");
  expect(container.querySelector("link")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
