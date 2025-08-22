import type { CreateResumeDto, ResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

export const createResume = async (data: CreateResumeDto) => {
  const response = await axios.post<ResumeDto, AxiosResponse<ResumeDto>, CreateResumeDto>(
    "/resume",
    data,
  );

  return response.data;
};

export const useCreateResume = () => {
  const {
    error,
    isPending: loading,
    mutateAsync: createResumeFn,
  } = useMutation({
    mutationFn: createResume,
    onSuccess: (data) => {
      // 注意：直接对类实例使用展开会丢失原型，先转为普通对象再处理
      type AnyRecord = Record<string, unknown> & { data?: unknown };
      const plain = JSON.parse(JSON.stringify(data)) as AnyRecord;
      const raw = plain.data;
      const normalizedData = typeof raw === "string" ? JSON.parse(raw) : raw;
      const normalized: ResumeDto = {
        ...(plain as Record<string, unknown>),
        data: normalizedData as unknown,
      } as ResumeDto;

      queryClient.setQueryData<ResumeDto>(["resume", { id: normalized.id }], normalized);

      queryClient.setQueryData<ResumeDto[]>(["resumes"], (cache) => {
        if (!cache) return [normalized];
        return [...cache, normalized];
      });
    },
  });

  return { createResume: createResumeFn, loading, error };
};
