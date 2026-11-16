import { t } from "@lingui/macro";
import type { ResumeDto } from "@reactive-resume/dto";
import { useCallback, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import type { LoaderFunction } from "react-router";
import { redirect } from "react-router";

import { toast } from "@/client/hooks/use-toast";
import { queryClient } from "@/client/libs/query-client";
import { findResumeById } from "@/client/services/resume";
import { assessResumeDraft, resumeDraftStorage } from "@/client/services/resume/drafts";
import { resumeSaveQueue } from "@/client/services/resume/update";
import { useBuilderStore } from "@/client/stores/builder";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

import { ResumeRecovery } from "./_components/recovery";

export const BuilderPage = () => {
  const frameRef = useBuilderStore((state) => state.frame.ref);
  const setFrameRef = useBuilderStore((state) => state.frame.setRef);

  const resume = useResumeStore((state) => state.resume);
  const title = useResumeStore((state) => state.resume.title);
  const latestResume = useRef(resume.data);
  latestResume.current = resume.data;

  const syncResumeToArtboard = useCallback(() => {
    frameRef?.contentWindow?.postMessage(
      { type: "SET_RESUME", payload: latestResume.current },
      window.location.origin,
    );
  }, [frameRef]);

  // The iframe announces when its React listener exists; DOM load alone is too early.
  useEffect(() => {
    if (!frameRef) return;

    const ping = () =>
      frameRef.contentWindow?.postMessage({ type: "ARTBOARD_PING" }, window.location.origin);
    const onReady = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.contentWindow &&
        event.data?.type === "ARTBOARD_READY"
      )
        syncResumeToArtboard();
    };
    frameRef.addEventListener("load", ping);
    window.addEventListener("message", onReady);
    ping();

    return () => {
      frameRef.removeEventListener("load", ping);
      window.removeEventListener("message", onReady);
    };
  }, [frameRef, syncResumeToArtboard]);

  // Send resume data to iframe on change of resume data
  useEffect(syncResumeToArtboard, [resume.data, syncResumeToArtboard]);

  return (
    <>
      <Helmet>
        <title>
          {title} - {t`Reactive Resume`}
        </title>
      </Helmet>

      <ResumeRecovery />

      <iframe
        key={resume.id}
        ref={setFrameRef}
        title={resume.id}
        src="/artboard/builder"
        className="mt-16 w-full"
        style={{ height: `calc(100vh - 64px)` }}
      />
    </>
  );
};

export const builderLoader: LoaderFunction<ResumeDto> = async ({ params }) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const id = params.id!;

    const resume = await queryClient.fetchQuery({
      queryKey: ["resume", { id }],
      queryFn: () => findResumeById({ id }),
      staleTime: 0,
    });

    const inMemory = resumeSaveQueue.hasPending(id) ? resumeSaveQueue.getDraft(id) : undefined;
    resumeSaveQueue.register(resume);
    if (inMemory) {
      loadResumeState(
        Object.assign({}, resume, {
          data: inMemory.data,
          title: inMemory.title ?? resume.title,
          slug: inMemory.slug ?? resume.slug,
          locked: inMemory.locked ?? resume.locked,
        }),
      );
    } else {
      let recovery = null;
      try {
        const stored = (await resumeDraftStorage.list?.(id)) ?? [];
        // A different session owns its draft: an acknowledgement here must not remove it.
        recovery = stored.filter((draft) => assessResumeDraft(draft, resume).hasChanges);
      } catch {
        toast({
          variant: "error",
          title: t`Recovery drafts could not be read. Keep any backup files before editing.`,
        });
      }
      loadResumeState(resume, recovery);
    }

    return resume;
  } catch {
    return redirect("/dashboard");
  }
};
