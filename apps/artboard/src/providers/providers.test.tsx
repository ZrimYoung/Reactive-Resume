/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush pending React effects. */
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { useArtboardStore } from "../store/artboard";
import { Providers } from "./index";

let root: Root;
let host: HTMLDivElement;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  localStorage.clear();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  localStorage.clear();
});

const Probe = () => <div>{useArtboardStore((state) => state.resume.basics.name)}</div>;
const render = async (mode: string) => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/artboard/${mode}`]}>
        <Routes>
          <Route element={<Providers />}>
            <Route path="artboard/:mode" element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
};

describe("artboard data isolation and handshake", () => {
  it("ignores a previous PDF payload in builder mode and accepts only the parent's current resume", async () => {
    const old = structuredClone(defaultResumeData);
    old.basics.name = "Previous PDF";
    localStorage.setItem("resume", JSON.stringify(old));
    await render("builder");
    expect(host.textContent).not.toContain("Previous PDF");
    const current = { basics: { name: "Current editor" }, metadata: { page: { format: "a4" } } };
    await act(async () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://unrelated.example",
          source: window,
          data: { type: "SET_RESUME", payload: current },
        }),
      ),
    );
    expect(host.textContent).not.toContain("Current editor");
    await act(async () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: window,
          data: { type: "SET_RESUME", payload: current },
        }),
      ),
    );
    expect(host.textContent).toContain("Current editor");
    expect(useArtboardStore.getState().resume.metadata.page.custom.enabled).toBe(false);
  });

  it("loads its print payload before rendering the preview, including legacy partial metadata", async () => {
    localStorage.setItem(
      "resume",
      JSON.stringify({
        basics: { name: "Printed document" },
        metadata: { page: { format: "a4" } },
      }),
    );
    await render("preview");
    expect(host.textContent).toContain("Printed document");
    expect(useArtboardStore.getState().resume.metadata.page.options.breakLine).toBe(true);
  });

  it("keeps the preview usable when its isolated payload is malformed", async () => {
    localStorage.setItem("resume", "{broken");
    await render("preview");
    expect(useArtboardStore.getState().resume.metadata.layout.length).toBe(1);
    expect(document.documentElement.dataset.artboardReady).toBe("false");
  });
});
