import type { SectionKey } from "@reactive-resume/schema";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

type Sheet = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

type PanelHandle = {
  isDragging: boolean;
  setDragging: (dragging: boolean) => void;
};

type Panel = {
  size: number;
  setSize: (size: number) => void;
  handle: PanelHandle;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
};

type BuilderState = {
  collapsedSections: Partial<Record<SectionKey, boolean>>;
  frame: {
    ref: HTMLIFrameElement | null;
    setRef: (ref: HTMLIFrameElement | null) => void;
  };
  sheet: {
    left: Sheet;
    right: Sheet;
  };
  panel: {
    left: Panel;
    right: Panel;
  };
};

type BuilderActions = {
  setSectionCollapsed: (id: SectionKey, collapsed: boolean) => void;
  toggleSectionCollapsed: (id: SectionKey) => void;
  setAllSectionsCollapsed: (ids: SectionKey[], collapsed: boolean) => void;
  toggle: (side: "left" | "right") => void;
};

export const useBuilderStore = create<BuilderState & BuilderActions>()(
  immer((set) => ({
    collapsedSections: {},
    setSectionCollapsed: (id, collapsed) => {
      set((state) => {
        state.collapsedSections[id] = collapsed;
      });
    },
    toggleSectionCollapsed: (id) => {
      set((state) => {
        state.collapsedSections[id] = !state.collapsedSections[id];
      });
    },
    setAllSectionsCollapsed: (ids, collapsed) => {
      set((state) => {
        for (const id of ids) state.collapsedSections[id] = collapsed;
      });
    },
    frame: {
      ref: null,
      setRef: (ref) => {
        set((state) => {
          // @ts-expect-error Unable to set ref type
          state.frame.ref = ref;
        });
      },
    },
    sheet: {
      left: {
        open: false,
        setOpen: (open) => {
          set((state) => {
            state.sheet.left.open = open;
          });
        },
      },
      right: {
        open: false,
        setOpen: (open) => {
          set((state) => {
            state.sheet.right.open = open;
          });
        },
      },
    },
    panel: {
      left: {
        size: 0,
        setSize: (size) => {
          set((state) => {
            state.panel.left.size = size;
          });
        },
        handle: {
          isDragging: false,
          setDragging: (dragging) => {
            set((state) => {
              state.panel.left.handle.isDragging = dragging;
            });
          },
        },
        collapsed: false,
        setCollapsed: (collapsed) => {
          set((state) => {
            state.panel.left.collapsed = collapsed;
          });
        },
        toggleCollapsed: () => {
          set((state) => {
            state.panel.left.collapsed = !state.panel.left.collapsed;
          });
        },
      },
      right: {
        size: 0,
        setSize: (size) => {
          set((state) => {
            state.panel.right.size = size;
          });
        },
        handle: {
          isDragging: false,
          setDragging: (dragging) => {
            set((state) => {
              state.panel.right.handle.isDragging = dragging;
            });
          },
        },
        collapsed: false,
        setCollapsed: (collapsed) => {
          set((state) => {
            state.panel.right.collapsed = collapsed;
          });
        },
        toggleCollapsed: () => {
          set((state) => {
            state.panel.right.collapsed = !state.panel.right.collapsed;
          });
        },
      },
    },
    toggle: (side) => {
      set((state) => {
        state.sheet[side].open = !state.sheet[side].open;
      });
    },
  })),
);
