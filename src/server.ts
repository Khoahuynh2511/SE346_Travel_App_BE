import app from "./app.js";
import { env } from "./config/env.js";
import { validateSupabaseEnv } from "./config/validateSupabaseEnv.js";
import { logger } from "./utils/logger.js";

const supabaseWarnings = validateSupabaseEnv();
for (const w of supabaseWarnings) {
  logger.warn(`[supabase] ${w}`);
}

app.listen(env.port, () => {
  logger.info(`listening on http://localhost:${env.port}`);
  if (supabaseWarnings.length === 0 && env.supabaseUrl && env.supabaseServiceRoleKey) {
    logger.info("[supabase] Storage configured");
  }
});
