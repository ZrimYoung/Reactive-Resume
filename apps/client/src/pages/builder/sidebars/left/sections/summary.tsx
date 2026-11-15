import { defaultSections } from "@reactive-resume/schema";
import { RichInput } from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";

import { useBuilderStore } from "@/client/stores/builder";
import { useResumeStore } from "@/client/stores/resume";

import { SectionHeading } from "./shared/section-heading";
import { SectionOptions } from "./shared/section-options";

export const SummarySection = () => {
  const collapsed = useBuilderStore((state) => state.collapsedSections.summary ?? false);
  const setValue = useResumeStore((state) => state.setValue);
  const section = useResumeStore(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (state) => state.resume.data.sections.summary ?? defaultSections.summary,
  );

  return (
    <section id="summary" className="grid gap-y-6">
      <SectionHeading id="summary" name={section.name}>
        <SectionOptions id="summary" />
      </SectionHeading>

      <main
        id="section-content-summary"
        hidden={collapsed}
        className={cn(collapsed && "hidden", !section.visible && "opacity-50")}
      >
        <RichInput
          content={section.content}
          onChange={(value) => {
            setValue("sections.summary.content", value);
          }}
        />
      </main>
    </section>
  );
};
