import { t } from "@lingui/macro";
import { DotsThreeVertical, Lock } from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";
import { useState } from "react";

import { toast } from "@/client/hooks/use-toast";
import type { ResumeSummary } from "@/client/services/resume/library";
import { previewResume } from "@/client/services/resume/preview";

export type ItemAction =
  | "open"
  | "rename"
  | "duplicate"
  | "lock"
  | "tags"
  | "history"
  | "trash"
  | "restore"
  | "permanent";
type Props = {
  resume: ResumeSummary;
  grid: boolean;
  disabled: boolean;
  onAction: (action: ItemAction, resume: ResumeSummary) => void;
  onTag: (tag: string) => void;
};

export const LibraryResumeItem = ({ resume, grid, disabled, onAction, onTag }: Props) => {
  const resumeTitle = resume.title;
  const trashed = Boolean(resume.trashedAt);
  const [previewKey, setPreviewKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const primary = () => {
    onAction(trashed ? "restore" : "open", resume);
  };
  const fallback = `/templates/jpg/${resume.template || "rhyhorn"}.jpg`;
  const previewUrl = `/api/storage/${resume.userId}/previews/${resume.id}.jpg?t=${previewKey || new Date(resume.editedAt ?? resume.updatedAt).getTime()}`;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await previewResume({ id: resume.id });
      setPreviewKey(Date.now());
    } catch (error) {
      toast({
        variant: "error",
        title: t`Preview could not be refreshed.`,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <article
      className={cn(
        "min-w-0 rounded border bg-background",
        grid ? "flex flex-col" : "flex items-center gap-3 p-3",
      )}
    >
      {grid && (
        <button
          type="button"
          disabled={disabled}
          className="aspect-[210/160] overflow-hidden rounded-t"
          aria-label={trashed ? t`Restore ${resumeTitle}` : t`Open ${resumeTitle}`}
          onClick={primary}
        >
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top"
            onError={(event) => {
              if (event.currentTarget.getAttribute("src") !== fallback)
                event.currentTarget.src = fallback;
            }}
          />
        </button>
      )}
      <div className={cn("flex min-w-0 flex-1 items-start justify-between gap-2", grid && "p-3")}>
        <div className="min-w-0 space-y-2">
          <button
            type="button"
            disabled={disabled}
            className="flex max-w-full items-center gap-2 text-left font-medium hover:underline"
            onClick={primary}
          >
            <span className="break-words">{resume.title}</span>
            {resume.locked && <Lock size={14} aria-label={t`Locked`} className="shrink-0" />}
          </button>
          <p className="text-xs opacity-65">
            {trashed ? t`Moved to Trash` : t`Last modified`}:{" "}
            {new Date(
              trashed
                ? (resume.trashedAt ?? resume.updatedAt)
                : (resume.editedAt ?? resume.updatedAt),
            ).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-1">
            {resume.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={disabled}
                className="rounded bg-secondary px-2 py-0.5 text-xs hover:bg-secondary-accent"
                aria-label={t`Filter by tag ${tag}`}
                onClick={() => {
                  onTag(tag);
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={t`Actions for ${resumeTitle}`}
            >
              <DotsThreeVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!trashed && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("open", resume);
                  }}
                >{t`Open`}</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={resume.locked}
                  onClick={() => {
                    if (!resume.locked) onAction("rename", resume);
                  }}
                >{t`Rename`}</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("duplicate", resume);
                  }}
                >{t`Duplicate`}</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={refreshing}
                  onClick={() => {
                    void refresh();
                  }}
                >{t`Refresh Preview`}</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("lock", resume);
                  }}
                >
                  {resume.locked ? t`Unlock` : t`Lock`}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={resume.locked}
                  onClick={() => {
                    if (!resume.locked) onAction("tags", resume);
                  }}
                >{t`Edit tags`}</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("history", resume);
                  }}
                >{t`Version history`}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-error"
                  disabled={resume.locked}
                  onClick={() => {
                    if (!resume.locked) onAction("trash", resume);
                  }}
                >{t`Move to Trash`}</DropdownMenuItem>
              </>
            )}
            {trashed && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("restore", resume);
                  }}
                >{t`Restore resume`}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-error"
                  onClick={() => {
                    onAction("permanent", resume);
                  }}
                >{t`Delete permanently`}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
};
