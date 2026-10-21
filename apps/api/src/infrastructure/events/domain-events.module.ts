/**
 * Domain events infrastructure — a tiny in-process, fire-and-forget event
 * bus (Node's built-in EventEmitter, typed, ZERO extra dependencies).
 *
 * WHY: bounded contexts must stay acyclic (§46). When Trades closes a trade,
 * Discipline needs to evaluate its rules — but Discipline consumes the
 * Trades read contract, so Trades cannot import Discipline without a module
 * cycle. A domain event breaks the coupling: Trades PUBLISHES a fact
 * ("trade.closed"), Discipline SUBSCRIBES and reacts. Delivery is
 * synchronous and in-process by design — no queue, no outbox; a failed
 * listener must not fail the trade write (listeners catch their own
 * errors).
 */
import { Injectable, Module, Global, OnModuleDestroy } from "@nestjs/common";
import { EventEmitter } from "node:events";

export interface TradeClosedEvent {
  userId: string;
  tradeId: string;
  accountId: string;
}

export interface DomainEvents {
  "trade.closed": TradeClosedEvent;
}


@Injectable()
export class DomainEventsService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Domain events stay process-local; the default warn at 11 listeners is
    // far below the number of subscribed contexts we expect, but bump it to
    // make adding the next five contexts frictionless.
    this.emitter.setMaxListeners(64);
  }

  /** Publish a domain fact. Fire-and-forget — never throws to the caller. */
  publish<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    try {
      this.emitter.emit(event, payload);
    } catch {
      // Publishing must never break the use case that produced the fact.
    }
  }

  /** Subscribe to a domain fact. Listener errors are contained. */
  subscribe<K extends keyof DomainEvents>(
    event: K,
    handler: (payload: DomainEvents[K]) => void | Promise<void>,
  ): void {
    this.emitter.on(event, (payload: DomainEvents[K]) => {
      void (async () => {
        try {
          await handler(payload);
        } catch (error) {
          // TODO(observability): route through the shared logger once the
          // event bus grows its first consumer-observed failure mode.
          console.error(`[domain-events] listener for "${String(event)}" failed`, error);
        }
      })();
    });
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}

/** Global so any context can publish facts without re-import plumbing. */
@Global()
@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
