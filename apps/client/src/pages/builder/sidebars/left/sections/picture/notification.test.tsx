/* eslint-disable lingui/no-unlocalized-strings -- Synthetic fixtures and test descriptions. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React and toast effects. */
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { Toaster } from "@/client/providers/toaster";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

import { PictureSection } from "./section";

const { uploadImage } = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/client/services/storage", () => ({ useUploadImage: () => ({ uploadImage }) }));
vi.mock("@/client/services/resume", () => ({ debouncedUpdateResume: vi.fn() }));
vi.mock("./options", () => ({ PictureOptions: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  loadResumeState(
    Object.assign({}, useResumeStore.getState().resume, {
      id: "picture-notification",
      locked: false,
      data: structuredClone(defaultResumeData),
    }),
  );
  await act(async () => {
    root.render(
      <>
        <PictureSection />
        <Toaster />
      </>,
    );
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
});

it("shows a failed picture upload through the app's actual mounted Toaster", async () => {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Picture file input missing");
  uploadImage.mockRejectedValueOnce(new Error("Synthetic upload failure"));
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["synthetic"], "picture.png", { type: "image/png" })],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const message = "Couldn't upload the picture. Please try again.";
  // eslint-disable-next-line unicorn/prefer-spread -- The client DOM lib does not include DOM.Iterable.
  const notification = Array.from(
    document.querySelectorAll<HTMLElement>('[data-state="open"]'),
  ).find((element) => element.textContent?.includes(message));
  expect(notification).toBeDefined();
  expect(notification?.hidden).toBe(false);
  expect(notification?.classList.contains("group/error")).toBe(true);
  expect(input.value).toBe("");
  expect(useResumeStore.getState().resume.data.basics.picture.url).toBe("");
});
