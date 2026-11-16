import type { ResumeData } from "@reactive-resume/schema";

export type EditableFormat = "docx" | "odt";

/** These exporters are lazy: opening the editor never loads the document/ZIP packages. */
export async function buildEditableResume(data: ResumeData, format: EditableFormat) {
  const { buildResumeDocument } = await import("./model");
  const model = buildResumeDocument(data);
  if (format === "odt") {
    const { buildOdt, ODT_MIME } = await import("./odt");
    return { bytes: buildOdt(model), mimeType: ODT_MIME };
  }
  const { buildDocx } = await import("./docx");
  return {
    bytes: await buildDocx(model),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
