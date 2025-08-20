import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(utc);

export const dayjsLocales: Record<string, () => Promise<ILocale>> = {
  "en-US": () => import("dayjs/locale/en"),
  "zh-CN": () => import("dayjs/locale/zh-cn"),
};
