import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import { UploadSimple } from "@phosphor-icons/react";
import type { UpdateUserDto } from "@reactive-resume/dto";
import { updateUserSchema } from "@reactive-resume/dto";
import {
  Button,
  buttonVariants,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@reactive-resume/ui";
import { cn } from "@reactive-resume/utils";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";

import { UserAvatar } from "@/client/components/user-avatar";
import { useToast } from "@/client/hooks/use-toast";
import { useUploadImage } from "@/client/services/storage";
import { useUpdateUser, useUser } from "@/client/services/user";

export const AccountSettings = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { updateUser, loading } = useUpdateUser();
  const { uploadImage, loading: isUploading } = useUploadImage();

  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<UpdateUserDto>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      picture: "",
      name: "",
      username: "",
      email: "",
    },
  });

  useEffect(() => {
    user && onReset();
  }, [user]);

  const onReset = () => {
    if (!user) return;

    form.reset({
      picture: user.picture ?? "",
      name: user.name,
      username: user.username,
      email: user.email,
    });
  };

  const onSubmit = async (data: UpdateUserDto) => {
    if (!user) return;

    await updateUser({
      name: data.name,
      email: data.email,
      picture: data.picture,
      username: data.username,
    });

    toast({
      variant: "success",
      title: t`Your account information has been updated successfully.`,
    });

    form.reset(data);
  };

  const onSelectImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const response = await uploadImage(file);
      const url = response.data;

      await updateUser({ picture: url });
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold leading-relaxed tracking-tight">{t`Account`}</h3>
        <p className="leading-relaxed opacity-75">
          {t`Here, you can update your account information such as your profile picture, name and username.`}
        </p>
      </div>

      <Form {...form}>
        <form className="grid gap-6 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            name="picture"
            control={form.control}
            render={({ field, fieldState: { error } }) => (
              <div className={cn("flex items-end gap-x-4 sm:col-span-2", error && "items-center")}>
                <UserAvatar />

                <FormItem className="flex-1">
                  <FormLabel>{t`Picture`}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>

                {!user.picture && (
                  <>
                    <input ref={inputRef} hidden type="file" onChange={onSelectImage} />

                    <motion.button
                      disabled={isUploading}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
                      onClick={() => inputRef.current?.click()}
                    >
                      <UploadSimple />
                    </motion.button>
                  </>
                )}
              </div>
            )}
          />

          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t`Name`}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="username"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t`Username`}</FormLabel>
                <FormControl>
                  <Input autoComplete="username" className="lowercase" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="email"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t`Email`}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" className="lowercase" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex items-center space-x-2 self-center sm:col-start-2">
            <Button type="submit" disabled={loading}>
              {t`Save Changes`}
            </Button>
            <Button type="reset" variant="ghost" onClick={onReset}>
              {t`Reset`}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
