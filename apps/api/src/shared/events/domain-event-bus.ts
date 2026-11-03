/**
 * In-process domain event bus (Phase 10 §17/§14).
 *
 * WHY: Session Live must SUBSCRIBE to canonical domain events ("Session Live
 * should subscribe to canonical domain/provider events. It must not become
 * the event source of truth") without creating module cycles - Trading Core
 * (the producer) and Session Live (the consumer) would otherwise have to
 * import each other. A tiny typed in-process bus breaks that coupling while
 * keeping the one-way dependency graph: both contexts depend on this leaf
 * infrastructure module, never on each other's write paths.
 *
 * WHY NOT @nestjs/event-emitter: the same capability is achievable with the
 * Node EventEmitter already in the runtime (dependency-check rule: native /
 * avoidable wins). Typed envelope + error isolation are added here.
 *
 * Semantics:
 *  - fire-and-forget: `emit` NEVER awaits subscribers and NEVER propagates
 *    subscriber failures to the producer (the producer's transaction already
 *    committed; a slow/broken consumer must not fail the producing request).
 *  - subscriber errors are logged (structured, ids only) and contained.
 *  - synchronous in-process delivery - no persistence, no retry, no
 *    cross-process fan-out. Persisted projections are the consumer's duty
 *    (Session Live persists TradingSessionEvent rows at delivery time).
 *  - teardown: `unsubscribeAll(subscriber)` - real-time contexts must not
 *    leak listeners on shutdown (Phase 10 §47 resource management).
 */
import { EventEmitter } from "node:events";

import type { RootLogger } from "../../infrastructure/logging/logger.factory";

/** Canonical domain events (grow the map additively - never re-shape). */
export interface DomainEventMap {
  /** Trading Core - a journal trade was created (manual capture path). */
  "trade.created": {
    userId: string;
    tradeId: string;
    symbol: string;
    direction: "BUY" | "SELL";
    /** Decimal wire string (trading core convention). */
    quantity: string;
    /** Decimal wire string. */
    entryPrice: string;
    /** Event instant (UTC ISO). */
    at: string;
  };
  /** Integrations (Phase 14 §21/§29) - a signature-verified inbound webhook
   * was accepted and normalized. Consumer domains (e.g. Calendar applying an
   * actual release) subscribe at their own pace; the Hub only publishes. */
  "integration.webhook.received": {
    userId: string;
    providerId: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    /** Normalized provider payload - signature already verified. */
    payload: Record<string, unknown>;
    /** Event instant (UTC ISO). */
    at: string;
  };
}

export type DomainEventName = keyof DomainEventMap;

export type DomainEventHandler<K extends DomainEventName> = (payload: DomainEventMap[K]) => void;

export const DOMAIN_EVENT_BUS = Symbol("DOMAIN_EVENT_BUS");

export class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly logger?: RootLogger) {
    // One subscriber type per event name is all the product needs today;
    // raising the limit guards against accidental listener leaks (§47).
    this.emitter.setMaxListeners(16);
  }

  /**
   * Fire-and-forget publish - never throws to the producer. Subscriber
   * handlers are wrapped by `wrap` (error-contained) and dispatched off the
   * producer's stack so subscriber work never lands in the producing request.
   */
  emit<K extends DomainEventName>(name: K, payload: DomainEventMap[K]): void {
    setImmediate(() => {
      this.emitter.emit(name, payload);
    });
  }

  subscribe<K extends DomainEventName>(name: K, handler: DomainEventHandler<K> & { subscriber?: object }): void {
    this.emitter.on(name, handler as (payload: unknown) => void);
  }

  /**
   * Register an error-contained handler attributed to `subscriber`:
   * handler failures are logged + contained (never propagated - §48 the
   * consumer's failure must not corrupt the producer), and
   * `unsubscribeAll(subscriber)` can release them at shutdown (§47).
   */
  wrap<K extends DomainEventName>(
    subscriber: object,
    name: K,
    handler: DomainEventHandler<K>,
  ): void {
    const wrapped = ((payload: DomainEventMap[K]): void => {
      try {
        handler(payload);
      } catch (error) {
        this.logger?.error(
          {
            event: name,
            subscriber: subscriber.constructor?.name ?? "unknown",
            err: error instanceof Error ? error.message : "unknown",
          },
          "domain event handler failed",
        );
      }
    }) as DomainEventHandler<K> & { subscriber: object };
    wrapped.subscriber = subscriber;
    this.emitter.on(name, wrapped as unknown as (...args: unknown[]) => void);
  }

  /** Release every listener registered via `wrap` by the given subscriber (§47). */
  unsubscribeAll(subscriber: object): void {
    for (const name of this.emitter.eventNames()) {
      for (const listener of this.emitter.rawListeners(name)) {
        if ((listener as { subscriber?: object }).subscriber === subscriber) {
          this.emitter.removeListener(name, listener as unknown as (...args: unknown[]) => void);
        }
      }
    }
  }
}
