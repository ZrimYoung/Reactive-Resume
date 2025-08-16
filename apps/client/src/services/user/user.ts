import { detect, fromStorage } from "@lingui/detect-locale";
import type { UserDto } from "@reactive-resume/dto";
import { useQuery } from "@tanstack/react-query";

import { USER_KEY } from "@/client/constants/query-keys";
import { axios } from "@/client/libs/axios";
import { defaultLocale } from "@/client/libs/lingui";

const detectedLocale = detect(fromStorage("locale"), defaultLocale) ?? defaultLocale;

export const fetchUser = async (): Promise<UserDto> => {
  const response = await axios.get<UserDto>("/user/me");
  return response.data;
};

export const useUser = () => {
  const {
    data,
    isPending: loading,
    error,
  } = useQuery<UserDto>({
    queryKey: USER_KEY,
    queryFn: fetchUser,
    placeholderData: () => ({
      // 使用与服务端一致的本地用户标识，避免前后端不一致
      id: "local-user-id",
      name: "本地用户",
      email: "local@example.com",
      username: "local-user",
      locale: detectedLocale,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  });

  return { user: data, loading, error };
};
