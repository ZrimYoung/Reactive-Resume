import type { ResumeDto } from "@reactive-resume/dto";
import { useQuery } from "@tanstack/react-query";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

export type ResumeSummary = {
  id: string;
  userId: string;
  title: string;
  slug: string;
  locked: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  editedAt?: Date | string;
  trashedAt: Date | string | null;
  tags: string[];
  template: string;
};

export type LibraryFilters = {
  q: string;
  sort: "name" | "created" | "updated";
  order: "asc" | "desc";
  tag: string;
  trashed: boolean;
  page: number;
  pageSize: number;
};

export type ResumeLibrary = {
  items: ResumeSummary[];
  total: number;
  page: number;
  pageSize: number;
  tags: string[];
};

export const fetchResumeLibrary = async (filters: LibraryFilters, signal?: AbortSignal) => {
  const { data } = await axios.get<ResumeLibrary>("/resume/library", {
    signal,
    params: { ...filters, trashed: filters.trashed ? "1" : "0", tag: filters.tag || undefined },
  });
  return data;
};

export const useResumeLibrary = (filters: LibraryFilters) =>
  useQuery({
    queryKey: ["resumes", "library", filters],
    queryFn: ({ signal }) => fetchResumeLibrary(filters, signal),
    staleTime: 0,
    refetchOnMount: true,
  });

export const invalidateResumeLibrary = () => {
  void queryClient.invalidateQueries({ queryKey: ["resumes"] });
};

const forgetArchivedQueries = (id?: string) => {
  queryClient.removeQueries({ queryKey: id ? ["resume", { id }] : ["resume"] });
  for (const key of [
    "history-resume",
    "resume-history",
    "resume-history-detail",
    "resume-tag-edit",
  ]) {
    queryClient.removeQueries({ queryKey: id ? [key, id] : [key] });
  }
};

export const cacheResumeRevision = (resume: ResumeDto) => {
  queryClient.setQueryData(["resume", { id: resume.id }], resume);
  queryClient.setQueryData<ResumeDto[]>(["resumes"], (items) =>
    items?.map((item) => (item.id === resume.id ? resume : item)),
  );
  invalidateResumeLibrary();
};

export const saveResumeTags = async (
  id: string,
  tags: string[],
  expectedUpdatedAt: Date | string,
) => {
  const { data } = await axios.patch<ResumeDto>(`/resume/${id}`, { tags, expectedUpdatedAt });
  cacheResumeRevision(data);
  return data;
};

export type LibraryAction = "trash" | "restore" | "permanent" | "empty";

export const changeResumeTrash = async (action: LibraryAction, resume?: ResumeSummary) => {
  if (action === "empty") {
    const { data } = await axios.delete<{ deleted: number }>("/resume/trash", {
      data: { confirm: true },
    });
    forgetArchivedQueries();
    invalidateResumeLibrary();
    return data;
  }
  if (!resume) throw new Error("Missing resume");
  const body = { expectedUpdatedAt: resume.updatedAt };
  if (action === "permanent") {
    await axios.delete(`/resume/${resume.id}/permanent`, { data: body });
    forgetArchivedQueries(resume.id);
  } else {
    const { data } = await axios.post<ResumeDto>(`/resume/${resume.id}/${action}`, body);
    if (action === "restore") cacheResumeRevision(data);
    else {
      queryClient.removeQueries({ queryKey: ["resume", { id: resume.id }] });
      queryClient.setQueryData<ResumeDto[]>(["resumes"], (items) =>
        items?.filter((item) => item.id !== resume.id),
      );
    }
  }
  invalidateResumeLibrary();
};
