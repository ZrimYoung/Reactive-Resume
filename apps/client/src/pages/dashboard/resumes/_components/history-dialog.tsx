import { t } from "@lingui/macro";
import type { ResumeDto } from "@reactive-resume/dto";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@reactive-resume/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { toast } from "@/client/hooks/use-toast";
import { queryClient } from "@/client/libs/query-client";
import { invalidateResumeLibrary } from "@/client/services/resume/library";
import { previewResume } from "@/client/services/resume/preview";
import { findResumeById } from "@/client/services/resume/resume";
import { flushResumeSaves, resumeSaveQueue } from "@/client/services/resume/update";
import {
  createResumeVersion,
  deleteSavedResumeVersion,
  listResumeVersions,
  readResumeVersion,
  restoreResumeVersion,
} from "@/client/services/resume/versions";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

type Props = {
  resumeId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const errorMessage = (error: unknown) => {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 409)
    return t`This resume changed. Reload history and review it before trying again.`;
  return error instanceof Error
    ? error.message
    : t`The history operation failed. Please try again.`;
};

export const ResumeHistoryDialog = ({ open, onOpenChange, ...props }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <HistoryContent key={props.resumeId} {...props} />}
  </Dialog>
);

const HistoryContent = ({ resumeId, title }: Omit<Props, "open" | "onOpenChange">) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);
  const mounted = useRef(true);
  const isMounted = () => mounted.current;
  const operation = useRef(false);
  const preview = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const baseline = useQuery({
    queryKey: ["history-resume", resumeId],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async ({ signal }) => {
      if (!(await flushResumeSaves(resumeId)))
        throw new Error(t`Save or resolve your local changes before using history.`);
      signal.throwIfAborted();
      const resume = await findResumeById({ id: resumeId });
      signal.throwIfAborted();
      return resume;
    },
  });
  const versions = useQuery({
    queryKey: ["resume-history", resumeId],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: ({ signal }) => listResumeVersions(resumeId, signal),
  });
  const detail = useQuery({
    queryKey: ["resume-history-detail", resumeId, selected],
    enabled: selected !== null,
    queryFn: ({ signal }) => readResumeVersion(resumeId, selected ?? "", signal),
  });
  const selectedVersion = detail.data?.id === selected ? detail.data : undefined;
  const canChange = !busy && !baseline.isFetching && Boolean(baseline.data) && !baseline.isError;

  useEffect(() => {
    const frame = preview.current;
    if (!frame || !selectedVersion || detail.isFetching) return;
    const send = () =>
      frame.contentWindow?.postMessage(
        { type: "SET_RESUME", payload: selectedVersion.data },
        window.location.origin,
      );
    const ping = () =>
      frame.contentWindow?.postMessage({ type: "ARTBOARD_PING" }, window.location.origin);
    const onReady = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frame.contentWindow &&
        event.data?.type === "ARTBOARD_READY"
      )
        send();
    };
    frame.addEventListener("load", ping);
    window.addEventListener("message", onReady);
    ping();
    return () => {
      frame.removeEventListener("load", ping);
      window.removeEventListener("message", onReady);
    };
  }, [selectedVersion, detail.isFetching]);

  const reload = () => {
    setError(null);
    setConfirm(null);
    setSelected(null);
    void baseline.refetch();
    void versions.refetch();
  };

  const run = async (action: "name" | "restore" | "delete") => {
    if (operation.current || !baseline.data || !canChange) return;
    const observed = baseline.data;
    const versionId = selected;
    if (action !== "name" && !versionId) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!(await flushResumeSaves(resumeId)))
        throw new Error(t`Save or resolve your local changes before using history.`);
      if (!isMounted()) return;
      if (action === "name") {
        const result = await createResumeVersion(resumeId, name.trim(), observed.updatedAt);
        if (mounted.current) {
          setName("");
          setSelected(result.id);
        }
      } else if (action === "delete") {
        await deleteSavedResumeVersion(resumeId, versionId ?? "");
        if (mounted.current) setSelected(null);
      } else {
        const before = useResumeStore.getState().resume;
        const restored = await restoreResumeVersion(resumeId, versionId ?? "", observed.updatedAt);
        void previewResume({ id: resumeId })
          .then(invalidateResumeLibrary)
          .catch(() => {
            // Restoring content remains successful even if the optional thumbnail cannot be regenerated.
          });
        const current = useResumeStore.getState().resume;
        let adopted = true;
        if (current.id === resumeId && before.id === resumeId) {
          if (current.data !== before.data || resumeSaveQueue.hasPending(resumeId)) {
            adopted = false;
            void flushResumeSaves(resumeId);
            toast({
              variant: "warning",
              title: t`The version was restored on disk. New local edits were kept; review the save conflict.`,
            });
          } else {
            await resumeSaveQueue.acceptServer(restored);
            if (
              useResumeStore.getState().resume.id === resumeId &&
              !resumeSaveQueue.hasPending(resumeId)
            )
              loadResumeState(restored);
          }
        } else resumeSaveQueue.register(restored);
        queryClient.setQueryData<ResumeDto>(["history-resume", resumeId], restored);
        if (mounted.current && adopted) toast({ variant: "success", title: t`Version restored.` });
      }
      if (mounted.current) {
        setConfirm(null);
        await versions.refetch();
      }
    } catch (error_) {
      if (mounted.current) {
        setError(errorMessage(error_));
        setConfirm(null);
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-6xl">
      <DialogHeader>
        <DialogTitle>
          {t`Version history`} — {title}
        </DialogTitle>
        <DialogDescription>{t`Preview saved content without changing your resume. Restoring keeps the current saved content in history.`}</DialogDescription>
      </DialogHeader>
      {(baseline.isError || versions.isError || error) && (
        <div role="alert" className="space-y-2 text-sm text-error">
          <p>{error ?? errorMessage(baseline.error ?? versions.error)}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={reload}
          >{t`Reload history`}</Button>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run("name");
        }}
      >
        <Input
          aria-label={t`Snapshot name`}
          placeholder={t`Name this snapshot`}
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button
          type="submit"
          disabled={!canChange || name.trim().length === 0}
        >{t`Save snapshot`}</Button>
      </form>
      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto" aria-label={t`Saved versions`}>
          {versions.isFetching && <p role="status" className="text-sm">{t`Loading history…`}</p>}
          {!versions.isFetching && !versions.isError && versions.data?.length === 0 && (
            <p className="text-sm opacity-70">{t`No saved versions yet. Save a named snapshot to start.`}</p>
          )}
          {versions.data?.map((version) => (
            <Button
              key={version.id}
              className="h-auto w-full flex-col items-start whitespace-normal text-left"
              variant={selected === version.id ? "secondary" : "ghost"}
              disabled={busy}
              onClick={() => {
                setSelected(version.id);
                setConfirm(null);
              }}
            >
              <span>
                {version.name ??
                  (version.kind === "before-restore" ? t`Before restore` : t`Automatic checkpoint`)}
              </span>
              <span className="text-xs opacity-70">
                {new Date(version.createdAt).toLocaleString()}
              </span>
            </Button>
          ))}
        </div>
        <div className="min-w-0 space-y-3">
          {!selected && <p className="p-4 text-sm opacity-70">{t`Choose a version to preview.`}</p>}
          {selected && detail.isFetching && <p role="status">{t`Loading preview…`}</p>}
          {selected && detail.isError && (
            <div role="alert">
              <p>{errorMessage(detail.error)}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void detail.refetch();
                }}
              >{t`Retry`}</Button>
            </div>
          )}
          {selectedVersion && !detail.isFetching && (
            <>
              <p className="text-xs opacity-70">{t`Read-only preview`}</p>
              <iframe
                key={selectedVersion.id}
                ref={preview}
                title={t`Saved version preview`}
                src="/artboard/builder"
                className="h-[52vh] w-full rounded border bg-white"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canChange || baseline.data?.locked}
                  onClick={() => {
                    setConfirm("restore");
                  }}
                >{t`Restore this version`}</Button>
                {selectedVersion.kind !== "auto" && (
                  <Button
                    variant="outline"
                    disabled={!canChange}
                    onClick={() => {
                      setConfirm("delete");
                    }}
                  >{t`Delete snapshot`}</Button>
                )}
              </div>
              {baseline.data?.locked && (
                <p className="text-sm opacity-70">{t`Unlock this resume before restoring a version.`}</p>
              )}
            </>
          )}
        </div>
      </div>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(value) => {
          if (!value && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "restore"
                ? t`Restore this saved version?`
                : t`Delete this saved snapshot?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "restore"
                ? t`This replaces the current resume content. The current saved content will remain in history so you can return to it.`
                : t`This removes only the saved snapshot. Your current resume is not changed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t`Cancel`}</AlertDialogCancel>
            <Button
              disabled={busy || !canChange}
              variant={confirm === "delete" ? "error" : "primary"}
              onClick={() => {
                if (confirm) void run(confirm);
              }}
            >
              {confirm === "restore" ? t`Restore version` : t`Delete snapshot`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  );
};
