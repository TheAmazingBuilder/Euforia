/**
 * Recognition service provider — the ONLY service binding the UI imports.
 *
 * V1 ships with the mock implementation (spec §40/§41). When the NestJS OCR
 * orchestrator defines its contract (spec §69), an `ApiRecognitionService`
 * replaces the binding HERE and nowhere else:
 *
 *   export const recognitionService: RecognitionService = new ApiRecognitionService(apiClient);
 */

import { mockRecognitionService } from "./mock-service";
import type { RecognitionService } from "./service";

export const recognitionService: RecognitionService = mockRecognitionService;
