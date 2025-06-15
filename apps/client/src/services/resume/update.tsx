import { t } from "@lingui/macro";
import type { ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import debounce from "lodash.debounce";
import { toast } from "sonner";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

export const updateResume = async (data: UpdateResumeDto) => {
  const response = await axios.patch<ResumeDto, AxiosResponse<ResumeDto>, UpdateResumeDto>(
    `/resume/${data.id}`,
    data,
  );

  queryClient.setQueryData<ResumeDto>(["resume", { id: response.data.id }], response.data);

  // Invalidate the resume list query to refetch the updated data
  void queryClient.invalidateQueries({ queryKey: ["resumes"] });

  return response.data;
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

export const debouncedUpdateResume = debounce(updateResume, 500);
