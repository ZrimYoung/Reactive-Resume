import { t } from "@lingui/macro";
import type { ErrorMessage } from "@reactive-resume/utils";
import { deepSearchAndParseDates } from "@reactive-resume/utils";
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
  (error) => {
    const message = error.response?.data.message as ErrorMessage;
    const description = translateError(message);

    if (description) {
      toast({
        variant: "error",
        title: t`Oops, the server returned an error.`,
        description,
      });
    }

    return Promise.reject(new Error(message));
  },
);
