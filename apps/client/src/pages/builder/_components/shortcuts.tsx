import { t } from "@lingui/macro";
import { Question } from "@phosphor-icons/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@reactive-resume/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBuilderStore } from "@/client/stores/builder";
import { useDialogStore } from "@/client/stores/dialog";

const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector, not UI text.
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );

const overlayOpen = () => {
  if (useDialogStore.getState().dialog) return true;
  const { sheet } = useBuilderStore.getState();
  if (sheet.left.open || sheet.right.open) return true;
  // eslint-disable-next-line unicorn/prefer-spread -- The client DOM lib does not include DOM.Iterable.
  return Array.from(
    document.querySelectorAll(
      // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector, not UI text.
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
    ),
  ).some(
    (element) =>
      // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector, not UI text.
      !element.closest('[hidden], [aria-hidden="true"], [data-state="closed"]'),
  );
};

export const BuilderShortcuts = () => {
  const [open, setOpen] = useState(false);
  const frame = useBuilderStore((state) => state.frame.ref);
  const trigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const showHelp = useCallback(() => {
    if (overlayOpen()) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "?" ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Some IMEs signal composition only with legacy code 229.
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditable(event.target)
      )
        return;
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (!overlayOpen()) {
        event.preventDefault();
        showHelp();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (
        !open &&
        event.origin === window.location.origin &&
        event.source === frame?.contentWindow &&
        event.data?.type === "ARTBOARD_SHORTCUT_HELP" &&
        !isEditable(document.activeElement)
      )
        showHelp();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [frame, open, showHelp]);

  return (
    <>
      <Button
        ref={trigger}
        size="icon"
        variant="ghost"
        className="absolute right-3 top-[4.5rem] z-20 bg-background/80"
        aria-label={t`Keyboard shortcuts`}
        aria-keyshortcuts="?"
        onClick={showHelp}
      >
        <Question />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (opener.current?.isConnected ? opener.current : trigger.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t`Keyboard shortcuts`}</DialogTitle>
            <DialogDescription>{t`Shortcuts stay out of the way while you type or use a dialog.`}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-4 text-sm">
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>{t`Open or close shortcut help`}</dd>
            <dt>
              <kbd>{t`Ctrl/Cmd + mouse wheel`}</kbd>
            </dt>
            <dd>{t`Zoom around the pointer on the canvas`}</dd>
            <dt>
              <kbd>{t`Mouse wheel`}</kbd>
            </dt>
            <dd>{t`Pan or zoom according to the toolbar mode`}</dd>
            <dt>
              <kbd>{t`Esc`}</kbd>
            </dt>
            <dd>{t`Close this dialog`}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
};
