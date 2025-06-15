import { t } from "@lingui/macro";
import { createId } from "@paralleldrive/cuid2";
import type { ResumeDto } from "@reactive-resume/dto";
import type { CustomSectionGroup, SectionKey } from "@reactive-resume/schema";
import { defaultResumeData, defaultSection } from "@reactive-resume/schema";
import { removeItemInLayout } from "@reactive-resume/utils";
import _set from "lodash.set";
import type { TemporalState } from "zundo";
import { temporal } from "zundo";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { debouncedUpdateResume } from "../services/resume";

type ResumeStore = {
  resume: ResumeDto;

  // Actions
  setValue: (path: string, value: unknown) => void;

  // Custom Section Actions
  addSection: () => void;
  removeSection: (sectionId: SectionKey) => void;
};

// Create a default resume object
const defaultResume: ResumeDto = {
  id: "temp",
  title: "",
  slug: "",
  userId: "local-user-id",
  locked: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  data: defaultResumeData,
};

export const useResumeStore = create<ResumeStore>()(
  temporal(
    immer((set) => ({
      resume: defaultResume,
      setValue: (path, value) => {
        set((state) => {
          state.resume.data = _set(state.resume.data, path, value);
          const { id, data } = state.resume;
          debouncedUpdateResume({ id, data: JSON.parse(JSON.stringify(data)) });
        });
      },
      addSection: () => {
        const section: CustomSectionGroup = {
          ...defaultSection,
          id: createId(),
          name: t`Custom Section`,
          items: [],
        };

        set((state) => {
          const layout = state.resume.data.metadata.layout;
          const lastPageIndex = layout.length - 1;
          layout[lastPageIndex][0].push(`custom.${section.id}`);
          state.resume.data = _set(state.resume.data, `sections.custom.${section.id}`, section);

          const { id, data } = state.resume;
          debouncedUpdateResume({ id, data: JSON.parse(JSON.stringify(data)) });
        });
      },
      removeSection: (sectionId: SectionKey) => {
        if (sectionId.startsWith("custom.")) {
          const id = sectionId.split("custom.")[1];

          set((state) => {
            const layout = state.resume.data.metadata.layout;
            removeItemInLayout(sectionId, layout);

            // Remove the custom section using spread syntax instead of delete
            const { [id]: removed, ...remainingCustomSections } = state.resume.data.sections.custom;
            state.resume.data.sections.custom = remainingCustomSections;

            const { id: resumeId, data } = state.resume;
            debouncedUpdateResume({ id: resumeId, data: JSON.parse(JSON.stringify(data)) });
          });
        }
      },
    })),
    {
      limit: 100,
      wrapTemporal: (fn) => devtools(fn),
      partialize: ({ resume }) => ({ resume }),
    },
  ),
);

export const useTemporalResumeStore = <T>(
  selector: (state: TemporalState<Pick<ResumeStore, "resume">>) => T,
  equality?: (a: T, b: T) => boolean,
) => useStoreWithEqualityFn(useResumeStore.temporal, selector, equality);
