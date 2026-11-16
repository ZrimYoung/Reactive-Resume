type ParsedDate = { rank: number; earliest: number; latest: number };
type ParsedPeriod = { ongoing: boolean; end: number; start: number };

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNames =
  /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+([12]\d{3})$/i;

function parseDate(value: string): ParsedDate | null {
  const text = value.trim();
  const named = monthNames.exec(text);
  const numeric = /^([12]\d{3})(?:[./年-]\s*(\d{1,2})(?:[./月-]\s*(\d{1,2})日?)?月?)?年?$/.exec(
    text,
  );
  if (!named && !numeric) return null;

  const year = Number(named?.[2] ?? numeric?.[1]);
  const month = named
    ? months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1
    : Number(numeric?.[2] ?? 0);
  const day = Number(numeric?.[3] ?? 0);
  if (month < 0 || month > 12 || (numeric?.[2] !== undefined && month === 0)) return null;
  const lastDay = new Date(Date.UTC(year, month || 12, 0)).getUTCDate();
  if (day < 0 || day > lastDay || (numeric?.[3] !== undefined && day === 0)) return null;
  return {
    rank: year * 10_000 + month * 100 + day,
    earliest: year * 10_000 + (month || 1) * 100 + (day || 1),
    latest: year * 10_000 + (month || 12) * 100 + (day || lastDay),
  };
}

function parsePeriod(value: unknown): ParsedPeriod | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const ongoing = /(?:present|current|now|ongoing|至今|迄今|现在|現在|目前)$/i.exec(text);
  if (ongoing) {
    const prefix = text.slice(0, ongoing.index).trim();
    const startText = prefix.replace(/(?:[~–—到至～-]|\bto)\s*$/i, "").trim();
    const start = startText ? parseDate(startText) : null;
    if (startText && !start) return null;
    return { ongoing: true, start: start?.rank ?? 0, end: 0 };
  }

  const single = parseDate(text);
  if (single) return { ongoing: false, start: single.rank, end: single.rank };

  // Try each separator, since hyphens can also belong to either ISO date.
  for (const match of text.matchAll(/[~–—到至～-]|\bto\b/gi)) {
    const start = parseDate(text.slice(0, match.index));
    const end = parseDate(text.slice(match.index + match[0].length));
    if (start && end && end.latest >= start.earliest)
      return { ongoing: false, start: start.rank, end: end.rank };
  }
  return null;
}

/** Sort only on request. Keep all date text intact and unrecognized entries stable at the end. */
export function sortResumeItemsByDate<T>(items: readonly T[], getDate: (item: T) => unknown) {
  const decorated = items.map((item, index) => ({
    item,
    index,
    period: parsePeriod(getDate(item)),
  }));
  decorated.sort((left, right) => {
    if (!left.period && !right.period) return left.index - right.index;
    if (!left.period) return 1;
    if (!right.period) return -1;
    return (
      Number(right.period.ongoing) - Number(left.period.ongoing) ||
      right.period.end - left.period.end ||
      right.period.start - left.period.start ||
      left.index - right.index
    );
  });
  const sorted = decorated.map(({ item }) => item);
  return {
    items: sorted,
    changed: sorted.some((item, index) => item !== items[index]),
    unparsedCount: decorated.filter(({ period }) => !period).length,
  };
}
