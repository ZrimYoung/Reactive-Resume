import { t } from "@lingui/macro";
import { CaretDown } from "@phosphor-icons/react";
import type { SectionKey } from "@reactive-resume/schema";
import { cn } from "@reactive-resume/utils";
import type { ReactNode } from "react";

import { useBuilderStore } from "@/client/stores/builder";

import { getSectionIcon } from "./section-icon";

type Props = {
  id: SectionKey;
  name: string;
  children?: ReactNode;
};

export const SectionHeading = ({ id, name, children }: Props) => {
  const collapsed = useBuilderStore((state) => state.collapsedSections[id] ?? false);
  const toggle = useBuilderStore((state) => state.toggleSectionCollapsed);

  return (
    <header className="flex items-center justify-between gap-x-2">
      <h2 className="min-w-0 flex-1 text-2xl font-bold lg:text-3xl">
        <button
          type="button"
          className="flex w-full items-center gap-x-4 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-expanded={!collapsed}
          aria-controls={`section-content-${id}`}
          aria-label={`${collapsed ? t`Expand section` : t`Collapse section`}: ${name}`}
          onClick={() => {
            toggle(id);
          }}
        >
          <span className="flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
            {getSectionIcon(id)}
          </span>
          <span className="truncate">{name}</span>
          <CaretDown
            size={16}
            aria-hidden="true"
            className={cn("shrink-0 transition-transform", collapsed && "-rotate-90")}
          />
        </button>
      </h2>
      {children && <div className="flex shrink-0 items-center gap-x-2">{children}</div>}
    </header>
  );
};
