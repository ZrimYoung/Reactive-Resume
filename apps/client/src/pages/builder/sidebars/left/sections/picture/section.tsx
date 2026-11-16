import { t } from "@lingui/macro";
import { Aperture, Trash, UploadSimple } from "@phosphor-icons/react";
import {
  Avatar,
  AvatarImage,
  buttonVariants,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";

import { toast } from "@/client/hooks/use-toast";
import { useUploadImage } from "@/client/services/storage";
import { useResumeStore } from "@/client/stores/resume";

import { PictureOptions } from "./options";

export const PictureSection = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  const { uploadImage } = useUploadImage();

  const setValue = useResumeStore((state) => state.setValue);
  const picture = useResumeStore((state) => state.resume.data.basics.picture);

  const isValidUrl = useMemo(() => z.string().url().safeParse(picture.url).success, [picture.url]);

  useEffect(() => {
    const unsubscribe = useResumeStore.subscribe((state, previous) => {
      // A round trip through another resume must invalidate the old upload too.
      if (
        state.resume.id !== previous.resume.id ||
        state.resume.data.basics.picture.url !== previous.resume.data.basics.picture.url
      )
        uploadVersion.current += 1;
    });
    return () => {
      unsubscribe();
      uploadVersion.current += 1;
    };
  }, []);

  const onSelectImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Reset immediately, including on failure, so selecting the same file triggers change again.
    event.currentTarget.value = "";
    if (!file) return;

    const version = ++uploadVersion.current;
    const { id, locked, data } = useResumeStore.getState().resume;
    const originalUrl = data.basics.picture.url;
    if (locked) return;

    try {
      const response = await uploadImage(file);
      const current = useResumeStore.getState().resume;
      if (
        version === uploadVersion.current &&
        current.id === id &&
        !current.locked &&
        current.data.basics.picture.url === originalUrl
      )
        setValue("basics.picture.url", response.data);
    } catch {
      if (version === uploadVersion.current && useResumeStore.getState().resume.id === id)
        toast({ variant: "error", title: t`Couldn't upload the picture. Please try again.` });
    }
  };

  const onAvatarClick = () => {
    uploadVersion.current += 1;
    if (isValidUrl) {
      setValue("basics.picture.url", "");
    } else {
      inputRef.current?.click();
    }
  };

  return (
    <div className="flex items-center gap-x-4">
      <div className="group relative cursor-pointer" onClick={onAvatarClick}>
        <Avatar className="size-14 bg-secondary">
          <AvatarImage src={picture.url} />
        </Avatar>

        {isValidUrl ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Trash size={16} weight="bold" />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
            <UploadSimple size={16} weight="bold" />
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-y-1.5">
        <Label htmlFor="basics.picture.url">{t`Picture`}</Label>
        <div className="flex items-center gap-x-2">
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={onSelectImage} />

          <Input
            id="basics.picture.url"
            placeholder="https://..."
            value={picture.url}
            onChange={(event) => {
              uploadVersion.current += 1;
              setValue("basics.picture.url", event.target.value);
            }}
          />

          {isValidUrl && (
            <Popover>
              <PopoverTrigger asChild>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
                >
                  <Aperture />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px]">
                <PictureOptions />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
};
