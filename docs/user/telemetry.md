# Product usage data and diagnostics

This build of T3 Code sends no product usage data, relay connection traces, or mobile crash
reports, and it does not include T3 Connect. `T3CODE_TELEMETRY_ENABLED` and managed-policy
telemetry settings have nothing left to turn off.

Agent feedback reports are still saved on your machine, but never sent. `t3 feedback list` shows
them. The mobile app keeps crash logs on the device under **Settings > About T3 Code >
Diagnostics** and does not upload them.

## Export diagnostics to your own OpenTelemetry receiver

Open **Settings → Maintenance → Diagnostics** (per environment) and enter OTLP HTTP endpoints (e.g. `http://localhost:4318/v1/traces`), save, and restart the server. Use **Test** to verify connectivity.

`T3CODE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` env vars override saved settings (use `T3CODE_OTLP_HEADERS` / `T3CODE_OTLP_PROTOCOL=http/protobuf` or the standard `OTEL_EXPORTER_OTLP_*` equivalents for auth and protobuf).
