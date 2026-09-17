import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/**
 * Browser worker — started by MockProvider before children render, ONLY when
 * NEXT_PUBLIC_API_MOCKED === "true". Components never import this module.
 */
export const worker = setupWorker(...handlers);
