import { t } from "@lingui/macro";
import {
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

import type { ResumeSummary } from "@/client/services/resume/library";
import { saveResumeTags } from "@/client/services/resume/library";
import { findResumeById } from "@/client/services/resume/resume";
import { flushResumeSaves, resumeSaveQueue } from "@/client/services/resume/update";

export const normalizeTags = (tags: string[]) => {
  const unique = new Map<string, string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed);
  }
  return [...unique.values()];
};

export const ResumeTagsDialog = ({
  resume,
  onClose,
}: {
  resume: ResumeSummary;
  onClose: () => void;
}) => (
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <TagContent key={resume.id} resume={resume} onClose={onClose} />
  </Dialog>
);

const TagContent = ({ resume, onClose }: { resume: ResumeSummary; onClose: () => void }) => {
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const isMounted = () => mounted.current;
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = useQuery({
    queryKey: ["resume-tag-edit", resume.id],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async ({ signal }) => {
      if (!(await flushResumeSaves(resume.id)))
        throw new Error(t`Save or resolve your local changes before editing tags.`);
      signal.throwIfAborted();
      const data = await findResumeById({ id: resume.id });
      signal.throwIfAborted();
      return data;
    },
  });
  useEffect(() => {
    if (current.data && !current.isFetching) {
      setTags(current.data.tags ?? []);
      setPending("");
    }
  }, [current.data, current.isFetching]);

  const validate = (values: string[]) => {
    if (values.length > 20 || values.some((tag) => tag.length > 40)) {
      setError(t`Use at most 20 tags, with no more than 40 characters per tag.`);
      return false;
    }
    setError(null);
    return true;
  };
  const add = () => {
    const values = normalizeTags([...tags, ...pending.split(",")]);
    if (validate(values)) {
      setTags(values);
      setPending("");
    }
  };
  const save = async () => {
    if (inFlight.current || !current.data || current.isFetching || current.data.locked) return;
    const values = normalizeTags([...tags, ...pending.split(",")]);
    if (!validate(values)) return;
    const observed = current.data;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!(await flushResumeSaves(resume.id)))
        throw new Error(t`Save or resolve your local changes before editing tags.`);
      if (!isMounted()) return;
      const updated = await saveResumeTags(resume.id, values, observed.updatedAt);
      resumeSaveQueue.register(updated);
      if (mounted.current) onClose();
    } catch (error_) {
      if (mounted.current) {
        const status = (error_ as { response?: { status?: number } }).response?.status;
        if (status === 409)
          setError(t`This resume changed. Close and reopen tags to review the latest version.`);
        else setError(error_ instanceof Error ? error_.message : t`Tags could not be saved.`);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const loading = busy || current.isFetching;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {t`Edit tags`} — {resume.title}
        </DialogTitle>
        <DialogDescription>{t`Use tags to organize and filter your resumes. Add a tag with Enter or separate several tags with commas.`}</DialogDescription>
      </DialogHeader>
      {(error !== null || current.isError) && (
        <p role="alert" className="text-sm text-error">
          {error ??
            (current.error instanceof Error ? current.error.message : t`Tags could not be loaded.`)}
        </p>
      )}
      {current.isFetching && <p role="status">{t`Loading tags…`}</p>}
      {current.data?.locked && (
        <p role="alert" className="text-sm">{t`Unlock this resume before editing tags.`}</p>
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex gap-2">
          <Input
            aria-label={t`New tags`}
            value={pending}
            disabled={loading || current.isError}
            onChange={(event) => {
              setPending(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading || !pending.trim()}
            onClick={add}
          >{t`Add`}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-2 rounded border px-2 py-1 text-sm"
            >
              {tag}
              <button
                type="button"
                disabled={loading}
                aria-label={t`Remove tag ${tag}`}
                onClick={() => {
                  setTags(tags.filter((value) => value !== tag));
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >{t`Cancel`}</Button>
          <Button
            type="submit"
            disabled={loading || current.isError || current.data?.locked}
          >{t`Save tags`}</Button>
        </div>
      </form>
    </DialogContent>
  );
};
