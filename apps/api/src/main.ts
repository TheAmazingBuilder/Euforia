/**
 * COSMOZ API - production entrypoint (Foundation).
 *
 * Bootstrap order (Phase 1 mandate §34):
 *   1. Configuration (validated env - controlled failure on invalid config)
 *   2. Logger
 *   3. Application + adapter (body limit, trust proxy)
 *   4. HTTP wiring (logging/correlation, helmet, CORS, versioning)
 *   5. Nest lifecycle (module init connects Prisma - DB down fails the boot)
 *   6. Listen
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp, createAdapter } from "./app.setup";
import { loadAppConfig, type AppConfig } from "./config/app-config";
import { EnvValidationError } from "./config/env.schema";
import { getOrCreateRootLogger, NestPinoLogger } from "./infrastructure/logging/logger.factory";

async function bootstrap(): Promise<void> {
  // 1. Configuration - fail fast, safely (no secret values in output).
  let config: AppConfig;
  try {
    config = loadAppConfig();
  } catch (error) {
    if (error instanceof EnvValidationError) {
       
      console.error(`[config] ${error.name}: startup aborted.`);
      for (const issue of error.issues) {
         
        console.error(`[config]   - ${issue.path}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }

  // 2. Logger (shared by pino-http, Nest lifecycle and diagnostics).
  const logger = getOrCreateRootLogger(config);

  // 3–5. Application.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createAdapter(config),
    { bufferLogs: true },
  );
  await configureApp(app, config);
  app.useLogger(app.get(NestPinoLogger));

  await app.listen(config.port, "0.0.0.0");

  logger.info(
    {
      port: config.port,
      env: config.env,
      corsOrigins: config.corsOrigins,
    },
    "cosmoz-api listening",
  );
}

bootstrap().catch((error: unknown) => {
  // Unknown bootstrap failure: print message + stack (stdout only), exit 1.
   
  console.error("[bootstrap] fatal failure:", error instanceof Error ? error.stack : error);
  process.exit(1);
});
