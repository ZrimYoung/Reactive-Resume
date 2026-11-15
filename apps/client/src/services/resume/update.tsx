import { t } from "@lingui/macro";
import type { ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import debounce from "lodash.debounce";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

import { resumeDraftStorage } from "./drafts";
import { previewResume } from "./preview";
import type { ResumeSaveRequest } from "./save-queue";
import { ResumeSaveQueue } from "./save-queue";

const sendResumeUpdate = async (data: UpdateResumeDto) => {
  const response = await axios.patch<ResumeDto, AxiosResponse<ResumeDto>, UpdateResumeDto>(
    `/resume/${data.id}`,
    data,
    { timeout: 10_000 },
  );

  queryClient.setQueryData<ResumeDto>(["resume", { id: response.data.id }], response.data);

  // Invalidate the resume list query to refetch the updated data
  void queryClient.invalidateQueries({ queryKey: ["resumes"] });

  // 成功保存后，调度一次“长尾沿防抖”的预览生成
  schedulePreviewGeneration(response.data.id);

  return response.data;
};

export const resumeSaveQueue = new ResumeSaveQueue(sendResumeUpdate, resumeDraftStorage, () =>
  crypto.randomUUID(),
);

export const updateResume = (data: UpdateResumeDto) => {
  if (!data.id) return Promise.reject(new Error("Missing resume ID"));
  return resumeSaveQueue.saveNow(toSaveRequest(data, data.id));
};

function toSaveRequest(data: UpdateResumeDto, id: string): ResumeSaveRequest {
  const request: ResumeSaveRequest = { id };
  if (data.data !== undefined) request.data = data.data;
  if (data.title !== undefined) request.title = data.title;
  if (data.slug !== undefined) request.slug = data.slug;
  if (data.locked !== undefined) request.locked = data.locked;
  if (data.updatedAt !== undefined) request.updatedAt = data.updatedAt;
  return request;
}

export const flushResumeSaves = (id?: string) => resumeSaveQueue.flush(id);
export const hasPendingResumeSaves = (id?: string) => resumeSaveQueue.hasPending(id);
export const useResumeSaveState = (id: string) =>
  useSyncExternalStore(resumeSaveQueue.subscribe, () => resumeSaveQueue.getState(id));

export const getResumeSaveExitState = async () => {
  resumeSaveQueue.persistAll();
  const saved = await flushResumeSaves();
  return { saved, durable: resumeSaveQueue.persistAll() };
};

export const useUpdateResume = () => {
  const {
    error,
    isPending: loading,
    mutateAsync: updateResumeFn,
  } = useMutation({
    mutationFn: updateResume,
    onSuccess: () => {
      toast.success(t`Changes saved successfully.`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return { loading, error, updateResume: updateResumeFn };
};

export const debouncedUpdateResume = (data: UpdateResumeDto) => {
  if (data.id) resumeSaveQueue.enqueue(toSaveRequest(data, data.id));
};

// 预览生成：按简历 id 做较长的尾沿防抖，避免频繁生成
const PREVIEW_DEBOUNCE_MS = 15_000; // 根据反馈，保存空闲期适当拉长
const previewDebouncers = new Map<string, ReturnType<typeof debounce>>();

function schedulePreviewGeneration(id: string) {
  let fn = previewDebouncers.get(id);
  if (!fn) {
    fn = debounce(async (resumeId: string) => {
      try {
        await previewResume({ id: resumeId });
      } catch {
        // 忽略生成失败；列表会回退模板图
      }
    }, PREVIEW_DEBOUNCE_MS);
    previewDebouncers.set(id, fn);
  }
  fn(id);
}
