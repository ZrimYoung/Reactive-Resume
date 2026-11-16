type Identity = { title: string; slug: string };

/** Number copies against both display names and URLs, preserving Unicode identifiers. */
export function nextResumeCopy(source: Identity, existing: Identity[]): Identity {
  const titles = new Set(existing.map((item) => item.title));
  const slugs = new Set(existing.map((item) => item.slug));
  const titleSuffix = /^(.*) \((?:\d+|copy)\)$/i.exec(source.title);
  const slugSuffix = /^(.*)-copy(?:-\d+)?$/i.exec(source.slug);
  const title = titleSuffix && titles.has(titleSuffix[1]) ? titleSuffix[1] : source.title;
  const slug = slugSuffix && slugs.has(slugSuffix[1]) ? slugSuffix[1] : source.slug;
  for (let number = 2; ; number++) {
    const candidate = { title: `${title} (${number})`, slug: `${slug}-copy-${number}` };
    if (!titles.has(candidate.title) && !slugs.has(candidate.slug)) return candidate;
  }
}
