import { Module, type Provider } from "@nestjs/common";

import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsRepository } from "./integrations.repository";

/** Injectable clock - deterministic in tests, wall clock in production. */
const INTEGRATION_NOW: Provider = {
  provide: "INTEGRATION_NOW",
  useValue: () => Date.now(),
};

@Module({
  controllers: [IntegrationsController],
  providers: [INTEGRATION_NOW, IntegrationsService, IntegrationsRepository],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
