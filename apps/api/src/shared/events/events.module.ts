/**
 * EventsModule — shared in-process domain event bus (Foundation leaf).
 *
 * A LEAF module on purpose: every bounded context may import it without
 * creating cycles. It owns no Prisma, no config, no routes — just the typed
 * bus singleton wired to the root logger.
 */
import { Module } from "@nestjs/common";
import type { Provider } from "@nestjs/common";

import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";
import { DomainEventBus, DOMAIN_EVENT_BUS } from "./domain-event-bus";

const domainEventBusProvider: Provider = {
  provide: DOMAIN_EVENT_BUS,
  useFactory: (logger: RootLogger) => new DomainEventBus(logger),
  inject: [ROOT_LOGGER],
};

@Module({
  providers: [domainEventBusProvider],
  exports: [domainEventBusProvider],
})
export class EventsModule {}
