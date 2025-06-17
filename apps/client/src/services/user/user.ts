// 本地用户服务 - 不再依赖服务器
import { detect, fromStorage } from "@lingui/detect-locale";

import { defaultLocale } from "@/client/libs/lingui";

const detectedLocale = detect(fromStorage("locale"), defaultLocale) ?? defaultLocale;

// 将用户对象定义为常量，确保其在多次调用之间保持稳定
const localUser = {
  id: "local-user",
  name: "Local User", // eslint-disable-line lingui/no-unlocalized-strings
  email: "local@example.com",
  username: "local-user",
  locale: detectedLocale,
};

export const fetchUser = () => {
  // 返回稳定的本地用户数据
  return localUser;
};

export const useUser = () => {
  // 直接返回稳定的本地用户数据，不需要查询服务器
  return {
    user: localUser,
    loading: false,
    error: null,
  };
};
