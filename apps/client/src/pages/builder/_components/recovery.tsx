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
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { queryClient } from "@/client/libs/query-client";
import { assessResumeDraft, resumeDraftStorage } from "@/client/services/resume/drafts";
import { importResume } from "@/client/services/resume/import";
import { useResumeStore } from "@/client/stores/resume";

export const ResumeRecovery = () => {
  const resume = useResumeStore((state) => state.resume);
  const draft = useResumeStore((state) => state.recoveryDraft);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const discard = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await resumeDraftStorage.remove(draft.id, draft.token);
      useResumeStore.setState({ recoveryDraft: null });
    } catch {
      toast.error(t`The recovery draft could not be cleared. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // Always create a copy: a recovery draft never overwrites a newer saved document.
      const title = resume.title;
      const recovered = await importResume({
        title: t`${title} (Recovered)`,
        data: draft.data,
      });
      await resumeDraftStorage.remove(draft.id, draft.token).catch(() => {
        // The recovered copy is already saved; failed cleanup leaves the original draft available.
      });
      useResumeStore.setState({ recoveryDraft: null });
      void queryClient.invalidateQueries({ queryKey: ["resumes"] });
      await navigate(`/builder/${recovered.id}`);
    } catch {
      toast.error(t`The recovery copy could not be saved. Your draft is still on this device.`);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!draft) return;
    try {
      const json = JSON.stringify(draft.data, null, 2);
      const filename = `reactive_resume-${draft.id}-recovery.json`;
      if ("electron" in window) {
        await window.electron.downloadAndSave(
          `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
          filename,
        );
      } else saveAs(new Blob([json], { type: "application/json" }), filename);
    } catch {
      toast.error(t`The recovery draft could not be downloaded. Please try again.`);
    }
  };

  return (
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
  );
};
