import { cn, isUrl } from "@reactive-resume/utils";

import { useArtboardStore } from "../store/artboard";

type PictureProps = {
  className?: string;
};

export const Picture = ({ className }: PictureProps) => {
  const picture = useArtboardStore((state) => state.resume.basics.picture);
  const fontSize = useArtboardStore((state) => state.resume.metadata.typography.font.size || 14);

  if (!isUrl(picture.url) || picture.effects.hidden) return null;

  return (
    <div
      className={cn(
        "relative z-20 overflow-hidden",
        picture.effects.border && "border-primary",
        className,
      )}
      style={{
        width: `${picture.size}px`,
        height: `${picture.size / picture.aspectRatio}px`,
        borderRadius: `${picture.borderRadius}px`,
        borderWidth: `${picture.effects.border ? fontSize / 3 : 0}px`,
        overflow: "hidden",
      }}
    >
      <img
        src={picture.url}
        alt="Profile"
        className={cn("size-full object-cover", picture.effects.grayscale && "grayscale")}
        style={{ width: "100%", height: "100%", borderRadius: `${picture.borderRadius}px` }}
      />
    </div>
  );
};
