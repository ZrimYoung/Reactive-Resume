import type { DeleteResumeDto, ResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

export const deleteResume = async (data: DeleteResumeDto & { expectedUpdatedAt: Date }) => {
  const response = await axios.delete<
    ResumeDto,
    AxiosResponse<ResumeDto>,
    { expectedUpdatedAt: Date }
  >(`/resume/${data.id}`, { data: { expectedUpdatedAt: data.expectedUpdatedAt } });

  return response.data;
};

export const useDeleteResume = () => {
  const {
    error,
    isPending: loading,
    mutateAsync: deleteResumeFn,
  } = useMutation({
    mutationFn: deleteResume,
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: ["resume", { id: data.id }] });

      queryClient.setQueryData<ResumeDto[]>(["resumes"], (cache) => {
        if (!cache) return [];
        return cache.filter((resume) => resume.id !== data.id);
      });
      void queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
  });

  return { deleteResume: deleteResumeFn, loading, error };
};
