import { t } from "@lingui/macro";
import { List, SquaresFour } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router";
import { useDebounceValue, useLocalStorage } from "usehooks-ts";

import { toast } from "@/client/hooks/use-toast";
import type {
  LibraryAction,
  LibraryFilters,
  ResumeSummary,
} from "@/client/services/resume/library";
import { changeResumeTrash, useResumeLibrary } from "@/client/services/resume/library";
import { findResumeById } from "@/client/services/resume/resume";
import { flushResumeSaves } from "@/client/services/resume/update";
import { useDialog, useDialogStore } from "@/client/stores/dialog";

import { ResumeHistoryDialog } from "./_components/history-dialog";
import type { ItemAction } from "./_components/library-item";
import { LibraryResumeItem } from "./_components/library-item";
import { ResumeTagsDialog } from "./_components/tags-dialog";

type PendingAction = { kind: LibraryAction; resume?: ResumeSummary };

const actionLabels = (kind: LibraryAction | undefined) => {
  switch (kind) {
    case "empty": {
      return {
        title: t`Empty Trash permanently?`,
        description: t`Every resume currently in Trash and its version history will be permanently deleted. This cannot be undone.`,
        confirm: t`Empty Trash`,
      };
    }
    case "permanent": {
      return {
        title: t`Permanently delete this resume?`,
        description: t`This permanently deletes the resume and its version history. This cannot be undone.`,
        confirm: t`Delete permanently`,
      };
    }
    case "restore": {
      return {
        title: t`Restore this resume?`,
        description: t`The resume and its history will return to your library.`,
        confirm: t`Restore resume`,
      };
    }
    default: {
      return {
        title: t`Move this resume to Trash?`,
        description: t`The resume will be hidden from your library. You can restore it from Trash.`,
        confirm: t`Move to Trash`,
      };
    }
  }
};

export const ResumesPage = () => {
  const navigate = useNavigate();
  const resumeDialog = useDialog("resume");
  const lockDialog = useDialog("lock");
  const importDialog = useDialog("import");
  const globalDialog = useDialogStore((state) => state.dialog);
  const previousDialog = useRef(globalDialog);
  const [layout, setLayout] = useLocalStorage<"grid" | "list">("dashboard-layout", "grid");
  const [search, setSearch] = useState("");
  const [query] = useDebounceValue(search, 200);
  const [sorting, setSorting] = useState("updated:desc");
  const [tag, setTag] = useState("");
  const [trashed, setTrashed] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [tagsTarget, setTagsTarget] = useState<ResumeSummary | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ResumeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const operation = useRef(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const filters = useMemo<LibraryFilters>(() => {
    const [sort, order] = sorting.split(":") as [LibraryFilters["sort"], LibraryFilters["order"]];
    return { q: query.trim(), sort, order, tag, trashed, page, pageSize: 20 };
  }, [query, sorting, tag, trashed, page]);
  const context = useRef("");
  context.current = JSON.stringify({ ...filters, q: search.trim() });
  const library = useResumeLibrary(filters);
  const { refetch } = library;
  const loading = library.isFetching || query.trim() !== search.trim();
  const total = library.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    if (!loading && library.data && page > pages) setPage(pages);
  }, [page, pages, loading, library.data]);
  useEffect(() => {
    if (previousDialog.current && !globalDialog) void refetch();
    previousDialog.current = globalDialog;
  }, [globalDialog, refetch]);

  const itemAction = async (kind: ItemAction, resume: ResumeSummary) => {
    if (busy || loading) return;
    if (kind === "open") {
      await navigate(`/builder/${resume.id}`);
      return;
    }
    if (kind === "tags") {
      setTagsTarget(resume);
      return;
    }
    if (kind === "history") {
      setHistoryTarget(resume);
      return;
    }
    if (kind === "trash" || kind === "restore" || kind === "permanent") {
      if (kind === "trash" && resume.locked) {
        toast({ variant: "warning", title: t`Unlock this resume before moving it to Trash.` });
        return;
      }
      setActionError(null);
      setAction({ kind, resume });
      return;
    }
    const generation = ++request.current;
    const currentContext = context.current;
    setBusy(true);
    try {
      if (!(await flushResumeSaves(resume.id)))
        throw new Error(t`Open the resume to review unsaved changes before continuing.`);
      const full = await findResumeById({ id: resume.id });
      if (!mounted.current || request.current !== generation || context.current !== currentContext)
        return;
      if (kind === "lock")
        lockDialog.open(full.locked ? "update" : "create", { id: "lock", item: full });
      else
        resumeDialog.open(kind === "rename" ? "update" : "duplicate", { id: "resume", item: full });
    } catch (error) {
      if (mounted.current && request.current === generation && context.current === currentContext)
        toast({
          variant: "error",
          title: t`This resume could not be opened.`,
          description: error instanceof Error ? error.message : undefined,
        });
    } finally {
      if (mounted.current && request.current === generation) setBusy(false);
    }
  };

  const confirmAction = async () => {
    if (!action || operation.current) return;
    operation.current = true;
    setBusy(true);
    setActionError(null);
    try {
      if (action.resume && !(await flushResumeSaves(action.resume.id)))
        throw new Error(t`Open the resume to review unsaved changes before continuing.`);
      await changeResumeTrash(action.kind, action.resume);
      if (mounted.current) {
        setAction(null);
        await refetch();
      }
    } catch (error) {
      if (mounted.current) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 409)
          setActionError(
            t`This resume changed. Cancel, reload the library, and review it before trying again.`,
          );
        else
          setActionError(
            error instanceof Error ? error.message : t`The operation failed. Please try again.`,
          );
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const tags = [...new Set([...(library.data?.tags ?? []), ...(tag ? [tag] : [])])];
  const labels = actionLabels(action?.kind);
  return (
    <>
      <Helmet>
        <title>
          {trashed ? t`Trash` : t`Resumes`} - {t`Reactive Resume`}
        </title>
      </Helmet>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{trashed ? t`Trash` : t`Resumes`}</h1>
          <div className="flex flex-wrap gap-2">
            {!trashed && (
              <>
                <Button
                  onClick={() => {
                    resumeDialog.open("create");
                  }}
                >{t`Create a new resume`}</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    importDialog.open("create");
                  }}
                >{t`Import an existing resume`}</Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setTrashed(!trashed);
                setPage(1);
              }}
            >
              {trashed ? t`Back to resumes` : t`Trash`}
            </Button>
            {trashed && (
              <Button
                variant="error"
                disabled={busy || loading || (total === 0 && !search.trim() && !tag)}
                onClick={() => {
                  setActionError(null);
                  setAction({ kind: "empty" });
                }}
              >{t`Empty Trash`}</Button>
            )}
            <Button
              size="icon"
              variant={layout === "grid" ? "secondary" : "ghost"}
              aria-label={t`Grid`}
              onClick={() => {
                setLayout("grid");
              }}
            >
              <SquaresFour />
            </Button>
            <Button
              size="icon"
              variant={layout === "list" ? "secondary" : "ghost"}
              aria-label={t`List`}
              onClick={() => {
                setLayout("list");
              }}
            >
              <List />
            </Button>
          </div>
        </div>
        {trashed && (
          <p className="text-sm opacity-70">{t`Resumes in Trash can be restored. Permanent deletion removes the resume and its version history.`}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto_auto]">
          <Input
            type="search"
            aria-label={t`Search resumes`}
            placeholder={t`Search by resume name`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label={t`Sort resumes`}
            className="rounded border bg-background px-3 py-2 text-sm"
            value={sorting}
            onChange={(event) => {
              setSorting(event.target.value);
              setPage(1);
            }}
          >
            <option value="updated:desc">{t`Last modified: newest first`}</option>
            <option value="updated:asc">{t`Last modified: oldest first`}</option>
            <option value="created:desc">{t`Created: newest first`}</option>
            <option value="created:asc">{t`Created: oldest first`}</option>
            <option value="name:asc">{t`Name: A to Z`}</option>
            <option value="name:desc">{t`Name: Z to A`}</option>
          </select>
          <select
            aria-label={t`Filter by tag`}
            className="rounded border bg-background px-3 py-2 text-sm"
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t`All tags`}</option>
            {tags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>{t`${total} resumes`}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || busy}
            onClick={() => {
              void refetch();
            }}
          >{t`Reload library`}</Button>
        </div>
        {loading && <p role="status">{t`Loading resumes…`}</p>}
        {!loading && library.isError && (
          <div role="alert" className="space-y-2">
            <p>{t`The library could not be loaded. This does not mean it is empty.`}</p>
            <Button
              variant="outline"
              onClick={() => {
                void refetch();
              }}
            >{t`Retry`}</Button>
          </div>
        )}
        {!loading && !library.isError && library.data?.items.length === 0 && (
          <p className="py-8 text-sm opacity-70">
            {trashed && !search.trim() && !tag
              ? t`Trash is empty.`
              : t`No resumes match these filters.`}
          </p>
        )}
        {!loading && !library.isError && (
          <div
            className={cn(
              layout === "grid"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                : "grid gap-2",
            )}
          >
            {library.data?.items.map((resume) => (
              <LibraryResumeItem
                key={resume.id}
                resume={resume}
                grid={layout === "grid"}
                disabled={busy}
                onAction={(kind, item) => {
                  void itemAction(kind, item);
                }}
                onTag={(value) => {
                  setTag(value);
                  setPage(1);
                }}
              />
            ))}
          </div>
        )}
        <nav className="flex items-center justify-center gap-3 py-3" aria-label={t`Resume pages`}>
          <Button
            variant="outline"
            disabled={loading || busy || page <= 1}
            onClick={() => {
              setPage(page - 1);
            }}
          >{t`Previous`}</Button>
          <span className="text-sm">{t`Page ${page} of ${pages}`}</span>
          <Button
            variant="outline"
            disabled={loading || busy || page >= pages}
            onClick={() => {
              setPage(page + 1);
            }}
          >{t`Next`}</Button>
        </nav>
      </div>
      {tagsTarget && (
        <ResumeTagsDialog
          resume={tagsTarget}
          onClose={() => {
            setTagsTarget(null);
            void refetch();
          }}
        />
      )}
      {historyTarget && (
        <ResumeHistoryDialog
          open
          resumeId={historyTarget.id}
          title={historyTarget.title}
          onOpenChange={(open) => {
            if (!open) {
              setHistoryTarget(null);
              void refetch();
            }
          }}
        />
      )}
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.description}
              {action?.resume && (
                <span className="mt-2 block font-medium">{action.resume.title}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-error">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t`Cancel`}</AlertDialogCancel>
            <Button
              disabled={busy}
              variant={action?.kind === "restore" ? "primary" : "error"}
              onClick={() => {
                void confirmAction();
              }}
            >
              {labels.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
