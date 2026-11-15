import { t } from "@lingui/macro";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@reactive-resume/ui";
import { useEffect, useState } from "react";
import { useBlocker, useLocation } from "react-router";

import {
  flushResumeSaves,
  getResumeSaveExitState,
  hasPendingResumeSaves,
  resumeSaveQueue,
} from "../services/resume/update";

export const ResumeSaveProvider = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const resumeId = /^\/builder\/([^/]+)/.exec(pathname)?.[1];
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    Boolean(
      resumeId &&
        currentLocation.pathname !== nextLocation.pathname &&
        hasPendingResumeSaves(resumeId),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [durable, setDurable] = useState(false);
  const { state, proceed } = blocker;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      resumeSaveQueue.persistAll();
      if (!hasPendingResumeSaves()) return;
      void flushResumeSaves();
      event.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Required by browsers that ignore preventDefault alone.
      event.returnValue = "";
    };
    const retryOnline = () => void flushResumeSaves();
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", retryOnline);
    const unsubscribe =
      "electron" in window ? window.electron.onBeforeClose(getResumeSaveExitState) : undefined;
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", retryOnline);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (state !== "blocked" || !resumeId) return;
    let active = true;
    setSaving(true);
    void flushResumeSaves(resumeId).then((saved) => {
      if (!active) return;
      setSaving(false);
      if (saved) proceed();
      else setDurable(resumeSaveQueue.persistAll());
    });
    return () => {
      active = false;
    };
  }, [state, proceed, resumeId]);

  const retry = async () => {
    setSaving(true);
    const saved = await flushResumeSaves(resumeId);
    setSaving(false);
    if (saved) blocker.proceed?.();
    else setDurable(resumeSaveQueue.persistAll());
  };

  return (
    <>
      {children}
      <AlertDialog open={state === "blocked" && !saving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Your latest changes are not saved yet`}</AlertDialogTitle>
            <AlertDialogDescription>
              {durable
                ? t`A recovery draft is saved on this device. Retry saving, or leave and recover it later.`
                : t`The recovery draft could not be saved. Keep this window open and retry.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>{t`Stay in editor`}</Button>
            {durable && (
              <Button
                variant="secondary"
                onClick={() => blocker.proceed?.()}
              >{t`Leave with recovery draft`}</Button>
            )}
            <Button onClick={retry}>{t`Retry saving`}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
