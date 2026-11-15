import type { ResumeData, SectionKey } from "@reactive-resume/schema";
import { defaultExperience, defaultResumeData } from "@reactive-resume/schema";
import type { Template } from "@reactive-resume/utils";
import { templatesList } from "@reactive-resume/utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTemplate } from "./index";

const artboard = vi.hoisted(() => ({ resume: undefined as unknown as ResumeData }));

vi.mock("../store/artboard", () => ({
  useArtboardStore: (selector: (state: { resume: ResumeData }) => unknown) => selector(artboard),
}));

vi.mock("@reactive-resume/ui", () => ({ BrandIcon: () => null }));

const renderTemplate = (
  template: Template,
  columns: SectionKey[][] = [["experience"], []],
  isFirstPage = false,
) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    createElement(getTemplate(template), { columns, isFirstPage }),
  );
  return container;
};

beforeEach(() => {
  artboard.resume = structuredClone(defaultResumeData);
  artboard.resume.sections.experience.name = "Work history";
});

describe("template section visibility", () => {
  it.each(templatesList)("%s omits the heading when every entry is hidden", (template) => {
    artboard.resume.sections.experience.items = [
      { ...defaultExperience, id: "hidden-job", company: "Hidden employer", visible: false },
    ];

    const container = renderTemplate(template);

    expect(container.querySelector("#experience")).toBeNull();
    expect(container.textContent).not.toContain("Work history");
    expect(container.textContent).not.toContain("Hidden employer");
  });

  it.each(templatesList)("%s keeps a section with a visible entry", (template) => {
    artboard.resume.sections.experience.items = [
      { ...defaultExperience, id: "hidden-job", company: "Hidden employer", visible: false },
      { ...defaultExperience, id: "visible-job", company: "Visible employer", visible: true },
    ];

    const container = renderTemplate(template);

    expect(container.querySelector("#experience")).not.toBeNull();
    expect(container.textContent).toContain("Work history");
    expect(container.textContent).toContain("Visible employer");
    expect(container.textContent).not.toContain("Hidden employer");
  });
});

describe("Gengar summary placement", () => {
  beforeEach(() => {
    artboard.resume.sections.summary.content = "<p>Summary follows the selected column.</p>";
  });

  it("renders the summary once in the chosen sidebar", () => {
    const container = renderTemplate("gengar", [[], ["summary"]], true);

    expect(container.querySelectorAll("#summary")).toHaveLength(1);
    expect(container.querySelector(".sidebar #summary")?.textContent).toContain(
      "Summary follows the selected column.",
    );
    expect(container.querySelector(".main #summary")).toBeNull();
  });

  it("renders a main-column summary on the page that includes it", () => {
    const container = renderTemplate("gengar", [["summary"], []], false);

    expect(container.querySelectorAll("#summary")).toHaveLength(1);
    expect(container.querySelector(".main #summary")?.textContent).toContain(
      "Summary follows the selected column.",
    );
  });

  it("does not insert the summary on a page whose layout omits it", () => {
    const container = renderTemplate("gengar", [[], []], true);

    expect(container.querySelector("#summary")).toBeNull();
  });
});
