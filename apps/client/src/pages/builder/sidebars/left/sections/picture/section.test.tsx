/* eslint-disable lingui/no-unlocalized-strings -- Synthetic fixtures and test descriptions. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React effects. */
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/client/hooks/use-toast";
import { debouncedUpdateResume } from "@/client/services/resume";
import { useResumeStore } from "@/client/stores/resume";

import { PictureSection } from "./section";

const { uploadImage } = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/client/services/storage", () => ({ useUploadImage: () => ({ uploadImage }) }));
vi.mock("@/client/services/resume", () => ({ debouncedUpdateResume: vi.fn() }));
vi.mock("./options", () => ({ PictureOptions: () => null }));
vi.mock("@/client/hooks/use-toast", () => ({ toast: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let mounted: boolean;

const deferred = () => {
  let resolve!: (response: { data: string }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ data: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

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
  mounted = true;
  useResumeStore.setState({
    resume: Object.assign({}, useResumeStore.getState().resume, {
      id: "picture-test",
      locked: false,
      data: structuredClone(defaultResumeData),
    }),
  });
  useResumeStore.temporal.getState().clear();
  vi.clearAllMocks();
  await act(async () => {
    root.render(<PictureSection />);
  });
});
afterEach(async () => {
  if (mounted)
    await act(async () => {
      root.unmount();
    });
  host.remove();
});

const choose = async (file = new File(["synthetic"], "picture.png", { type: "image/png" })) => {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Picture file input missing");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value: String.raw`C:\fakepath\picture.png`,
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(input.value).toBe("");
};
const url = () => useResumeStore.getState().resume.data.basics.picture.url;

describe("picture upload ownership", () => {
  it("ignores a slow upload after switching away and back to the same resume", async () => {
    const upload = deferred();
    uploadImage.mockReturnValueOnce(upload.promise);
    const original = useResumeStore.getState().resume;
    await choose();
    await act(async () => {
      useResumeStore.setState({ resume: Object.assign({}, original, { id: "another-resume" }) });
      useResumeStore.setState({ resume: original });
      upload.resolve({ data: "https://local.test/old-upload.png" });
    });
    expect(url()).toBe("");
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
  });

  it("does not replace a manual URL edit, even when the edit is undone before upload completion", async () => {
    const upload = deferred();
    uploadImage.mockReturnValueOnce(upload.promise);
    await choose();
    await act(async () => {
      useResumeStore.getState().setValue("basics.picture.url", "https://local.test/manual.png");
      useResumeStore.temporal.getState().undo();
      upload.resolve({ data: "https://local.test/stale.png" });
    });
    expect(url()).toBe("");
  });

  it("lets only the newest selected image win when uploads finish out of order", async () => {
    const first = deferred();
    const second = deferred();
    uploadImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await choose();
    await choose();
    await act(async () => {
      second.resolve({ data: "https://local.test/latest.png" });
    });
    await act(async () => {
      first.resolve({ data: "https://local.test/older.png" });
    });
    expect(url()).toBe("https://local.test/latest.png");
    expect(debouncedUpdateResume).toHaveBeenCalledTimes(1);
  });

  it("handles upload failure and allows the exact same file to be selected again", async () => {
    const upload = deferred();
    const file = new File(["synthetic"], "same.png", { type: "image/png" });
    uploadImage
      .mockReturnValueOnce(upload.promise)
      .mockResolvedValueOnce({ data: "https://local.test/retry.png" });
    await choose(file);
    await act(async () => {
      upload.reject(new Error("Upload failed"));
    });
    expect(toast).toHaveBeenCalledWith({
      variant: "error",
      title: "Couldn't upload the picture. Please try again.",
    });
    await choose(file);
    expect(uploadImage).toHaveBeenNthCalledWith(2, file);
    expect(url()).toBe("https://local.test/retry.png");
  });

  it("ignores an upload that finishes after the picture section unmounts", async () => {
    const upload = deferred();
    uploadImage.mockReturnValueOnce(upload.promise);
    await choose();
    await act(async () => {
      root.unmount();
    });
    mounted = false;
    await act(async () => {
      upload.resolve({ data: "https://local.test/stale.png" });
    });
    expect(url()).toBe("");
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
  });
});
