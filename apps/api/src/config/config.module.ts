import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, loadAppConfig } from "./app-config";

/**
 * Global configuration module — provides the validated {@link AppConfig}
 * under the {@link APP_CONFIG} token. Validation happens when the provider
 * is first resolved (i.e. at application bootstrap), so an invalid
 * environment produces a controlled startup failure before any route,
 * database pool or listener is created.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadAppConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
