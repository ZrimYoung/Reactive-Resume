import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import type { UpdateUserDto } from "@reactive-resume/dto";
import { updateUserSchema } from "@reactive-resume/dto";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@reactive-resume/ui";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";

import { UserAvatar } from "@/client/components/user-avatar";
import { useToast } from "@/client/hooks/use-toast";
import { useUpdateUser, useUser } from "@/client/services/user";

export const AccountSettings = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { updateUser, loading } = useUpdateUser();

  const form = useForm<UpdateUserDto>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
    },
  });

  useEffect(() => {
    const onReset = () => {
      if (!user) return;

      form.reset({
        name: user.name,
        username: user.username,
        email: user.email,
      });
    };

    if (user) {
      onReset();
    }
  }, [user, form.reset]);

  const onSubmit = async (data: UpdateUserDto) => {
    if (!user) return;

    await updateUser({
      name: data.name,
      email: data.email,
      username: data.username,
    });

    toast({
      variant: "success",
      title: t`Your account information has been updated successfully.`,
    });

    form.reset(data);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold leading-relaxed tracking-tight">{t`Account`}</h3>
        <p className="leading-relaxed opacity-75">
          {t`Here, you can update your account information such as your name and username.`}
        </p>
      </div>

      <Form {...form}>
        <form className="grid gap-6 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex items-center gap-x-4 sm:col-span-2">
            <UserAvatar />
            <div className="text-muted-foreground text-sm">
              {t`Profile picture is not available in local mode.`}
            </div>
          </div>

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
            <Button
              type="reset"
              variant="ghost"
              onClick={() => {
                if (!user) return;

                form.reset({
                  name: user.name,
                  username: user.username,
                  email: user.email,
                });
              }}
            >
              {t`Reset`}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
