import { catalogHandlers } from "./catalogs";
import { disciplineHandlers } from "./discipline";
import { ghostHandlers } from "./ghosts";
import { sessionHandlers } from "./session";
import { statsHandlers } from "./stats";
import { tradeHandlers } from "./trades";

/** Full §12 endpoint matrix, one file per domain. */
export const handlers = [
  ...catalogHandlers,
  ...tradeHandlers,
  ...disciplineHandlers,
  ...ghostHandlers,
  ...statsHandlers,
  ...sessionHandlers,
];
