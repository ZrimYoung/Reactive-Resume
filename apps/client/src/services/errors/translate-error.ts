import { t } from "@lingui/macro";
import { ErrorMessage } from "@reactive-resume/utils";

export const translateError = (error: ErrorMessage) => {
  switch (error) {
    case ErrorMessage.InvalidBrowserConnection: {
      return t`There was an error connecting to the browser. Please make sure 'chrome' is running and reachable.`;
    }
    case ErrorMessage.ResumeSlugAlreadyExists: {
      return t`A resume with this slug already exists, please pick a different unique identifier.`;
    }
    case ErrorMessage.ResumeNotFound: {
      return t`It looks like the resume you're looking for doesn't exist.`;
    }
    case ErrorMessage.ResumeLocked: {
      return t`The resume you want to update is locked, please unlock if you wish to make any changes to it.`;
    }
    case ErrorMessage.ResumePrinterError: {
      return t`Something went wrong while printing your resume. Please try again later or raise an issue on GitHub.`;
    }
    case ErrorMessage.ResumePreviewError: {
      return t`Something went wrong while grabbing a preview your resume. Please try again later or raise an issue on GitHub.`;
    }
    case ErrorMessage.SomethingWentWrong: {
      return t`Something went wrong while processing your request. Please try again later or raise an issue on GitHub.`;
    }

    default: {
      return null;
    }
  }
};
