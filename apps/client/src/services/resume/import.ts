import type { ImportResumeDto, ResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

export const importResume = async (data: ImportResumeDto) => {
  const response = await axios.post<ResumeDto, AxiosResponse<ResumeDto>, ImportResumeDto>(
    "/resume/import",
    data,
  );

  return response.data;
};

export const useImportResume = () => {
  const {
    error,
    isPending: loading,
    mutateAsync: importResumeFn,
  } = useMutation({
    mutationFn: importResume,
    onSuccess: (data) => {
      const normalized: ResumeDto = {
        ...data,
        data: typeof (data as unknown as { data: unknown }).data === "string"
          ? JSON.parse((data as unknown as { data: string }).data)
          : (data as unknown as { data: unknown }).data,
      } as ResumeDto;

      queryClient.setQueryData<ResumeDto>(["resume", { id: normalized.id }], normalized);

      queryClient.setQueryData<ResumeDto[]>(["resumes"], (cache) => {
        if (!cache) return [normalized];
        return [...cache, normalized];
      });
    },
  });

  return { importResume: importResumeFn, loading, error };
};
