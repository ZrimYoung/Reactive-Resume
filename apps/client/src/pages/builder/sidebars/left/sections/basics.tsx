import { t } from "@lingui/macro";
import { basicsSchema } from "@reactive-resume/schema";
import { Input, Label } from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";

import { useBuilderStore } from "@/client/stores/builder";
import { useResumeStore } from "@/client/stores/resume";

import { CustomFieldsSection } from "./custom/section";
import { PictureSection } from "./picture/section";
import { SectionHeading } from "./shared/section-heading";
import { URLInput } from "./shared/url-input";

export const BasicsSection = () => {
  const collapsed = useBuilderStore((state) => state.collapsedSections.basics ?? false);
  const setValue = useResumeStore((state) => state.setValue);
  const basics = useResumeStore((state) => state.resume.data.basics);

  // Imported resume data can be incomplete at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!basics) return null;

  return (
    <section id="basics" className="grid gap-y-6">
      <SectionHeading id="basics" name={t`Basics`} />

      <div id="section-content-basics" hidden={collapsed} className={cn(collapsed && "hidden")}>
        <main className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PictureSection />
          </div>

          <div className="space-y-4 sm:col-span-2">
            <Label htmlFor="basics.name">{t`Full Name`}</Label>
            <Input
              id="basics.name"
              value={basics.name}
              hasError={!basicsSchema.pick({ name: true }).safeParse({ name: basics.name }).success}
              onChange={(event) => {
                setValue("basics.name", event.target.value);
              }}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="basics.headline">{t`Headline`}</Label>
            <Input
              id="basics.headline"
              value={basics.headline}
              onChange={(event) => {
                setValue("basics.headline", event.target.value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="basics.email">{t`Email`}</Label>
            <Input
              id="basics.email"
              placeholder="john.doe@example.com"
              value={basics.email}
              hasError={
                !basicsSchema.pick({ email: true }).safeParse({ email: basics.email }).success
              }
              onChange={(event) => {
                setValue("basics.email", event.target.value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="basics.url">{t`Website`}</Label>
            <URLInput
              id="basics.url"
              value={basics.url}
              placeholder="https://example.com"
              onChange={(value) => {
                setValue("basics.url", value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="basics.phone">{t`Phone`}</Label>
            <Input
              id="basics.phone"
              placeholder="+1 (123) 4567 7890"
              value={basics.phone}
              onChange={(event) => {
                setValue("basics.phone", event.target.value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="basics.location">{t`Location`}</Label>
            <Input
              id="basics.location"
              value={basics.location}
              onChange={(event) => {
                setValue("basics.location", event.target.value);
              }}
            />
          </div>

          <CustomFieldsSection className="sm:col-span-2" />
        </main>
      </div>
    </section>
  );
};
