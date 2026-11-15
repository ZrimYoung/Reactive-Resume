/** Local asset URLs survive the desktop backend selecting a new free port on restart. */
export function normalizeLocalAssetUrls<T>(data: T, origin: string): T {
  const rewrite = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1])(?::\d+)?(?=\/api\/storage\/)/gi,
        () => origin,
      );
    }
    if (Array.isArray(value)) return value.map((item) => rewrite(item));
    if (value !== null && typeof value === "object") {
      const prototype: unknown = Object.getPrototypeOf(value);
      if (prototype === Object.prototype || prototype === null) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
      }
    }
    return value;
  };
  return rewrite(data) as T;
}
