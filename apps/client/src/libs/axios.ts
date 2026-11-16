import { t } from "@lingui/macro";
import type { ErrorMessage } from "@reactive-resume/utils";
import { deepSearchAndParseDates } from "@reactive-resume/utils";
import type { AxiosError } from "axios";
import _axios from "axios";

import { toast } from "../hooks/use-toast";
import { translateError } from "../services/errors/translate-error";
import { normalizeLocalAssetUrls } from "./local-assets";

export const axios = _axios.create({ baseURL: "/api" });

// Intercept responses to transform ISO dates to JS date objects
axios.interceptors.response.use(
  (response) => {
    const currentAssets = normalizeLocalAssetUrls(response.data, window.location.origin);
    const transformedResponse = deepSearchAndParseDates(currentAssets, ["createdAt", "updatedAt"]);
    return { ...response, data: transformedResponse };
  },
  (error: unknown) => {
    const failure = error as AxiosError<{ message?: ErrorMessage }>;
    const message = failure.response?.data.message;
    const description = message ? translateError(message) : undefined;

    if (description) {
      toast({
        variant: "error",
        title: t`Oops, the server returned an error.`,
        description,
      });
    }

    // Callers need the status and response body to distinguish a version conflict from a retryable outage.
    if (error instanceof Error) {
      if (message) error.message = message;
      return Promise.reject(error);
    }
    return Promise.reject(new Error(message));
  },
);
