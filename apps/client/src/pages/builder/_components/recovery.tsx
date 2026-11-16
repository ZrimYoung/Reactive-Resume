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
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { toast } from "@/client/hooks/use-toast";
import { queryClient } from "@/client/libs/query-client";
import { assessResumeDraft, resumeDraftStorage } from "@/client/services/resume/drafts";
import { importResume } from "@/client/services/resume/import";
import { findResumeById } from "@/client/services/resume/resume";
import { resumeSaveQueue, useResumeSaveState } from "@/client/services/resume/update";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

async function downloadDraft(id: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const filename = `reactive_resume-${id}-recovery.json`;
  if ("electron" in window) {
    await window.electron.downloadAndSave(
      `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
      filename,
    );
  } else saveAs(new Blob([json], { type: "application/json" }), filename);
}

const ResumeConflict = () => {
  const resume = useResumeStore((state) => state.resume);
  const open = useResumeStore((state) => state.reviewSaveConflict);
  const save = useResumeSaveState(resume.id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (save.status === "conflict") useResumeStore.setState({ reviewSaveConflict: true });
  }, [save.status, resume.id]);

  const keepAndReload = async () => {
    const draft = resumeSaveQueue.getDraft(resume.id);
    if (!draft) return;
    setBusy(true);
    try {
      const title = draft.title ?? resume.title;
      const copy = await importResume({
        title: t`${title} (Recovered)`,
        data: draft.data,
        autoNumber: true,
      });
      const remote = await findResumeById({ id: resume.id });
      const others = ((await resumeDraftStorage.list?.(resume.id)) ?? []).filter(
        (item) => item.token !== draft.token && assessResumeDraft(item, remote).hasChanges,
      );
      await resumeSaveQueue.acceptServer(remote, draft.token);
      if (useResumeStore.getState().resume.id === resume.id) loadResumeState(remote, others);
      queryClient.setQueryData(["resume", { id: remote.id }], remote);
      void queryClient.invalidateQueries({ queryKey: ["resumes"] });
      const copyTitle = copy.title;
      toast({
        variant: "success",
        title: t`Your local changes were saved as a separate copy: ${copyTitle}`,
      });
    } catch {
      toast({
        variant: "error",
        title: t`Your latest local changes are still open. Keep this window open and try again.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadDraft(resume.id, resumeSaveQueue.getDraft(resume.id)?.data ?? resume.data);
    } catch {
      toast({
        variant: "error",
        title: t`The recovery draft could not be downloaded. Please try again.`,
      });
    }
  };

  return (
    <AlertDialog open={open && save.status === "conflict"}>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t`This resume changed in another window`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`Automatic saving is paused to keep both versions. Save your local changes as a separate copy, then load the saved version. You can also download your local changes.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-y-2">
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => {
              useResumeStore.setState({ reviewSaveConflict: false });
            }}
          >{t`Keep editing locally`}</Button>
          <Button
            disabled={busy}
            variant="secondary"
            onClick={download}
          >{t`Download draft`}</Button>
          <Button disabled={busy} onClick={keepAndReload}>{t`Keep a copy and reload`}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const ResumeRecovery = () => {
  const resume = useResumeStore((state) => state.resume);
  const draft = useResumeStore((state) => state.recoveryDraft);
  const drafts = useResumeStore((state) => state.recoveryDrafts);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const dismissDraft = (token: string) => {
    useResumeStore.setState((state) => {
      const remaining = state.recoveryDrafts.filter((item) => item.token !== token);
      return { recoveryDrafts: remaining, recoveryDraft: remaining[0] ?? null };
    });
  };

  const discard = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await resumeDraftStorage.remove(draft.id, draft.token);
      dismissDraft(draft.token);
    } catch {
      toast({
        variant: "error",
        title: t`The recovery draft could not be cleared. Please try again.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // Always create a copy: a recovery draft never overwrites a newer saved document.
      const title = draft.title ?? resume.title;
      const recovered = await importResume({
        title: t`${title} (Recovered)`,
        data: draft.data,
        autoNumber: true,
      });
      await resumeDraftStorage.remove(draft.id, draft.token).catch(() => {
        // The recovered copy is already saved; failed cleanup leaves the original draft available.
      });
      dismissDraft(draft.token);
      void queryClient.invalidateQueries({ queryKey: ["resumes"] });
      await navigate(`/builder/${recovered.id}`);
    } catch {
      toast({
        variant: "error",
        title: t`The recovery copy could not be saved. Your draft is still on this device.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!draft) return;
    try {
      await downloadDraft(draft.id, draft.data);
    } catch {
      toast({
        variant: "error",
        title: t`The recovery draft could not be downloaded. Please try again.`,
      });
    }
  };

  return (
    <>
      <ResumeConflict />
      <AlertDialog open={Boolean(draft)}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Recover unsaved changes?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {draft && assessResumeDraft(draft, resume).baseChanged
                ? t`The saved resume has changed since this draft. Recover a separate copy to keep both versions.`
                : t`This device has unsaved changes from an earlier session. Recover them as a copy, download them, or discard the draft.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {drafts.length > 1 && (
            <label className="grid gap-2 text-sm">
              {t`Choose a recovery draft`}
              <select
                className="rounded border bg-background p-2"
                value={draft?.token}
                disabled={busy}
                onChange={(event) => {
                  useResumeStore.setState({
                    recoveryDraft: drafts.find((item) => item.token === event.target.value) ?? null,
                  });
                }}
              >
                {drafts.map((item, index) => (
                  <option key={item.token} value={item.token}>
                    {t`Draft`} {index + 1} — {new Date(item.updatedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AlertDialogFooter className="flex-wrap gap-y-2">
            <Button disabled={busy} variant="outline" onClick={discard}>{t`Discard draft`}</Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={download}
            >{t`Download draft`}</Button>
            <Button disabled={busy} onClick={recover}>{t`Recover as a copy`}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
