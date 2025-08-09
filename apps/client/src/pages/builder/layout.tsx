import { t } from "@lingui/macro";
import { SidebarSimple } from "@phosphor-icons/react";
import { Outlet } from "react-router";
import { useBreakpoint } from "@reactive-resume/hooks";
import {
  Button,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  VisuallyHidden,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";

import { useBuilderStore } from "@/client/stores/builder";

import { BuilderHeader } from "./_components/header";
import { BuilderToolbar } from "./_components/toolbar";
import { LeftSidebar } from "./sidebars/left";
import { RightSidebar } from "./sidebars/right";

const onOpenAutoFocus = (event: Event) => {
  event.preventDefault();
};

const OutletSlot = () => (
  <>
    <BuilderHeader />

    <div className="absolute inset-0">
      <Outlet />
    </div>

    <BuilderToolbar />
  </>
);

export const BuilderLayout = () => {
  const { isDesktop } = useBreakpoint();

  const sheet = useBuilderStore((state) => state.sheet);

  const leftSetSize = useBuilderStore((state) => state.panel.left.setSize);
  const rightSetSize = useBuilderStore((state) => state.panel.right.setSize);

  const leftHandle = useBuilderStore((state) => state.panel.left.handle);
  const rightHandle = useBuilderStore((state) => state.panel.right.handle);
  const leftCollapsed = useBuilderStore((state) => state.panel.left.collapsed);
  const toggleLeftCollapsed = useBuilderStore((state) => state.panel.left.toggleCollapsed);
  const rightCollapsed = useBuilderStore((state) => state.panel.right.collapsed);
  const toggleRightCollapsed = useBuilderStore((state) => state.panel.right.toggleCollapsed);

  if (isDesktop) {
    return (
      <div className="relative size-full overflow-hidden">
        <PanelGroup direction="horizontal">
          {!leftCollapsed && (
            <>
              <Panel
                minSize={25}
                maxSize={45}
                defaultSize={30}
                className={cn("z-10 bg-background", !leftHandle.isDragging && "transition-[flex]")}
                onResize={leftSetSize}
              >
                <LeftSidebar />
              </Panel>
              <PanelResizeHandle
                isDragging={leftHandle.isDragging}
                onDragging={leftHandle.setDragging}
              />
            </>
          )}
          <Panel>
            <OutletSlot />
          </Panel>
          {!rightCollapsed && (
            <>
              <PanelResizeHandle
                isDragging={rightHandle.isDragging}
                onDragging={rightHandle.setDragging}
              />
              <Panel
                minSize={25}
                maxSize={45}
                defaultSize={30}
                className={cn("z-10 bg-background", !rightHandle.isDragging && "transition-[flex]")}
                onResize={rightSetSize}
              >
                <RightSidebar />
              </Panel>
            </>
          )}
        </PanelGroup>

        {leftCollapsed && (
          <div className="pointer-events-none absolute left-2 top-20 z-30 hidden lg:block">
            <div className="pointer-events-auto rounded-md bg-secondary-accent/50 backdrop-blur-md">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t`Expand Left Sidebar`}
                onClick={toggleLeftCollapsed}
              >
                <SidebarSimple />
              </Button>
            </div>
          </div>
        )}

        {rightCollapsed && (
          <div className="pointer-events-none absolute right-2 top-20 z-30 hidden lg:block">
            <div className="pointer-events-auto rounded-md bg-secondary-accent/50 backdrop-blur-md">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t`Expand Right Sidebar`}
                onClick={toggleRightCollapsed}
              >
                <SidebarSimple />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Sheet open={sheet.left.open} onOpenChange={sheet.left.setOpen}>
        <VisuallyHidden>
          <SheetHeader>
            <SheetTitle />
            <SheetDescription />
          </SheetHeader>
        </VisuallyHidden>

        <SheetContent
          side="left"
          showClose={false}
          className="top-16 p-0 sm:max-w-xl"
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <LeftSidebar />
        </SheetContent>
      </Sheet>

      <OutletSlot />

      <Sheet open={sheet.right.open} onOpenChange={sheet.right.setOpen}>
        <SheetContent
          side="right"
          showClose={false}
          className="top-16 p-0 sm:max-w-xl"
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <VisuallyHidden>
            <SheetHeader>
              <SheetTitle />
              <SheetDescription />
            </SheetHeader>
          </VisuallyHidden>

          <RightSidebar />
        </SheetContent>
      </Sheet>
    </div>
  );
};
