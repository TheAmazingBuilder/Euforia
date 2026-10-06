import { brokerHandlers } from "./broker";
import { authHandlers } from "./auth";
import { ocrHandlers } from "./ocr";
import { catalogHandlers } from "./catalogs";
import { preferencesHandlers } from "./preferences";
import { disciplineHandlers } from "./discipline";
import { ecoHandlers } from "./eco";
import { integrationHandlers } from "./integrations";
import { monitoringHandlers } from "./monitoring";
import { securityHandlers } from "./security";
import { ghostHandlers } from "./ghosts";
import { playbookHandlers } from "./playbook";
import { profileHandlers } from "./profile";
import { sessionHandlers } from "./session";
import { sessionLiveHandlers } from "./sessionLive";
import { statsHandlers } from "./stats";
import { tradeHandlers } from "./trades";
import { backupHandlers } from "./backup";
import { tradeReviewHandlers } from "./tradeReview";
import { academyHandlers } from "./academy";
import { nofyHandlers } from "./nofy";

/** Full §12 endpoint matrix, one file per domain. */
export const handlers = [
  ...authHandlers,
  ...ocrHandlers,
  ...catalogHandlers,
  ...playbookHandlers,
  ...tradeHandlers,
  ...tradeReviewHandlers,
  ...disciplineHandlers,
  ...ghostHandlers,
  ...statsHandlers,
  ...sessionHandlers,
  ...sessionLiveHandlers,
  ...ecoHandlers,
  ...backupHandlers,
  ...profileHandlers,
  ...preferencesHandlers,
  ...brokerHandlers,
  ...integrationHandlers,
  ...monitoringHandlers,
  ...securityHandlers,
  ...academyHandlers,
  ...nofyHandlers,
];
