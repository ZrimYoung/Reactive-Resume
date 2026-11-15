import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "@lingui/macro";
import { DotsSixVertical, X } from "@phosphor-icons/react";
import { Badge } from "@reactive-resume/ui";
import { useId, useMemo } from "react";

type KeywordProps = {
  id: string;
  keyword: string;
  onRemove: () => void;
  onMove: (offset: number) => void;
};

const SortableKeyword = ({ id, keyword, onRemove, onMove }: KeywordProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <Badge className="gap-x-1 p-0">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${t`Reorder keyword`}: ${keyword}`}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
          className="cursor-grab touch-none rounded-l p-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing"
          onKeyDown={(event) => {
            if (
              event.altKey &&
              ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)
            ) {
              event.preventDefault();
              event.stopPropagation();
              onMove(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
              return;
            }
            listeners?.onKeyDown(event);
          }}
        >
          <DotsSixVertical size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`${t`Remove keyword`}: ${keyword}`}
          className="flex items-center gap-x-1 rounded-r py-1.5 pr-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          onClick={onRemove}
        >
          <span>{keyword}</span>
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </Badge>
    </div>
  );
};

type Props = {
  keywords: string[];
  onChange: (keywords: string[]) => void;
};

export const SortableKeywords = ({ keywords, onChange }: Props) => {
  const id = useId();
  const instructionsId = `${id}-instructions`;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Imported resumes can contain duplicate keywords, so the keyword alone is not a unique ID.
  const items = useMemo(() => {
    const occurrences = new Map<string, number>();
    return keywords.map((keyword) => {
      const occurrence = occurrences.get(keyword) ?? 0;
      occurrences.set(keyword, occurrence + 1);
      return { id: JSON.stringify([keyword, occurrence]), keyword };
    });
  }, [keywords]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(keywords, from, to));
  };

  if (keywords.length === 0) return null;

  return (
    <div className="space-y-2">
      <p id={instructionsId} className="text-xs leading-relaxed opacity-60">
        {t`Drag keywords to reorder, or focus a drag handle and use Alt + arrow keys.`}
      </p>
      <DndContext
        id={id}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToParentElement]}
        accessibility={{
          screenReaderInstructions: {
            draggable: t`Press space to pick up a keyword, use arrow keys to move it, and press space again to drop.`,
          },
        }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div
            role="list"
            aria-label={t`Keywords`}
            aria-describedby={instructionsId}
            className="flex flex-wrap items-center gap-x-2 gap-y-3"
          >
            {items.map((item, index) => (
              <SortableKeyword
                key={item.id}
                id={item.id}
                keyword={item.keyword}
                onRemove={() => {
                  onChange(keywords.filter((_, keywordIndex) => keywordIndex !== index));
                }}
                onMove={(offset) => {
                  const to = index + offset;
                  if (to >= 0 && to < keywords.length) onChange(arrayMove(keywords, index, to));
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
