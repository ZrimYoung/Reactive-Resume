/* eslint-disable lingui/no-unlocalized-strings -- Synthetic fixtures and test descriptions. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React effects. */
import { i18n } from "@lingui/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useBuilderStore } from "@/client/stores/builder";
import { useDialogStore } from "@/client/stores/dialog";

import { BuilderShortcuts } from "./shortcuts";

let host: HTMLDivElement;
let root: Root;
let frame: HTMLIFrameElement;

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
  frame = document.createElement("iframe");
  host.append(frame);
  useBuilderStore.getState().frame.setRef(frame);
  useBuilderStore.getState().sheet.left.setOpen(false);
  useBuilderStore.getState().sheet.right.setOpen(false);
  useDialogStore.setState({ dialog: null });
  const mount = document.createElement("div");
  host.append(mount);
  root = createRoot(mount);
  await act(async () => {
    root.render(<BuilderShortcuts />);
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  useBuilderStore.getState().frame.setRef(null);
  host.remove();
});

const pressHelp = async (target: Element = document.body, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key: "?",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};
const dialog = () => document.querySelector('[role="dialog"]');

describe("builder shortcut help", () => {
  it("opens with ? or its visible button, closes with ?, and restores focus", async () => {
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Keyboard shortcuts"]',
    );
    if (!trigger) throw new Error("Shortcut help button missing");
    trigger.focus();
    const event = await pressHelp(trigger);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog()?.textContent).toContain("Zoom around the pointer on the canvas");
    await pressHelp();
    expect(dialog()).toBeNull();
    // Radix dispatches its unmount autofocus event in setTimeout(0), after the dialog leaves the DOM.
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });
    await act(async () => {
      trigger.click();
    });
    expect(dialog()).not.toBeNull();
  });

  it("leaves input, rich text, repeated keys and Chinese composition untouched", async () => {
    for (const tag of ["input", "textarea", "select"]) {
      const input = document.createElement(tag);
      host.append(input);
      const event = await pressHelp(input);
      expect(event.defaultPrevented).toBe(false);
      input.remove();
    }
    const rich = document.createElement("div");
    host.append(rich);
    rich.contentEditable = "true";
    rich.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    rich.append(child);
    await pressHelp(child);
    await pressHelp(document.body, { isComposing: true });
    await pressHelp(document.body, { keyCode: 229 });
    await pressHelp(document.body, { repeat: true });
    await pressHelp(document.body, { ctrlKey: true });
    expect(dialog()).toBeNull();
  });

  it("does not open over section dialogs, menus or an open sidebar sheet", async () => {
    useDialogStore.setState({ dialog: { name: "education", mode: "create" } });
    await pressHelp();
    expect(dialog()).toBeNull();
    useDialogStore.setState({ dialog: null });
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    host.append(menu);
    await pressHelp();
    expect(dialog()).toBeNull();
    menu.remove();
    useBuilderStore.getState().sheet.left.setOpen(true);
    await pressHelp();
    expect(dialog()).toBeNull();
  });

  it("accepts help from the current same-origin artboard only", async () => {
    const request = async (origin: string, source: MessageEventSource | null) => {
      await act(async () =>
        window.dispatchEvent(
          new MessageEvent("message", {
            origin,
            source,
            data: { type: "ARTBOARD_SHORTCUT_HELP" },
          }),
        ),
      );
    };
    await request("https://unrelated.example", frame.contentWindow);
    await request(window.location.origin, window);
    expect(dialog()).toBeNull();
    frame.focus();
    await request(window.location.origin, frame.contentWindow);
    expect(dialog()).not.toBeNull();
  });
});
