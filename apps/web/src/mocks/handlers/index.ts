import { catalogHandlers } from "./catalogs";
import { disciplineHandlers } from "./discipline";
import { ecoHandlers } from "./eco";
import { ghostHandlers } from "./ghosts";
import { playbookHandlers } from "./playbook";
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
];
