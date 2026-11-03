/**
 * e2e harness - boots the REAL AppModule over Fastify and exposes
 * fastify `inject()` for HTTP-level assertions. Shared wiring with
 * production (createAdapter + configureApp) is reused verbatim.
 */
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "../../src/app.module";
import { configureApp, createAdapter } from "../../src/app.setup";
import { loadAppConfig } from "../../src/config/app-config";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";
import { MailerService } from "../../src/modules/identity/mailer.service";
import { ProbeController } from "./probe.controller";

export interface TestAppOptions {
  /**
   * Replace the Prisma capability with a stub whose `ping` returns the given
   * value - used to simulate infrastructure outages at the health seam
   * (PrismaClient reconnects lazily, so a real outage cannot be simulated).
   */
  prismaPing?: () => Promise<boolean>;
}

export async function buildTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  MailerService.clearTestTransportOverride();
  // Explicitly pin auth delivery behavior before the memoized config is read.
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "true";
  process.env.SMTP_USER = "";
  process.env.SMTP_APP_PASSWORD = "";
  const config = loadAppConfig();

  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController],
  });

  if (options.prismaPing) {
    builder.overrideProvider(PrismaService).useValue({ ping: options.prismaPing });
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createAdapter(config),
    { logger: false },
  );

  await configureApp(app, config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
