import { brokerHandlers } from "./broker";
import { catalogHandlers } from "./catalogs";
import { preferencesHandlers } from "./preferences";
import { disciplineHandlers } from "./discipline";
import { ecoHandlers } from "./eco";
import { integrationHandlers } from "./integrations";
import { securityHandlers } from "./security";
import { ghostHandlers } from "./ghosts";
import { playbookHandlers } from "./playbook";
import { profileHandlers } from "./profile";
import { sessionHandlers } from "./session";
import { statsHandlers } from "./stats";
import { tradeHandlers } from "./trades";
import { backupHandlers } from "./backup";

/** Full §12 endpoint matrix, one file per domain. */
export const handlers = [
  ...catalogHandlers,
  ...playbookHandlers,
  ...tradeHandlers,
  ...disciplineHandlers,
  ...ghostHandlers,
  ...statsHandlers,
  ...sessionHandlers,
  ...ecoHandlers,
  ...backupHandlers,
  ...profileHandlers,
  ...preferencesHandlers,
  ...brokerHandlers,
  ...integrationHandlers,
  ...securityHandlers,
];
