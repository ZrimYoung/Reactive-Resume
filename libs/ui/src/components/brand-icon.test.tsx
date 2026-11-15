import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandIcon } from "./brand-icon";

describe("offline brand icons", () => {
  it.each(["LinkedIn", "github", "An unknown service"])(
    "%s renders without a network-backed image",
    (slug) => {
      const markup = renderToStaticMarkup(createElement(BrandIcon, { slug }));
      expect(markup).toContain("<svg");
      expect(markup).not.toContain("<img");
      expect(markup).not.toContain("https://");
      expect(markup).toContain(`aria-label="${slug}"`);
    },
  );
});
