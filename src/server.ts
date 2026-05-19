import app from "./app.js";
import { env } from "./config/env.js";
import { validateSupabaseEnv } from "./config/validateSupabaseEnv.js";

const supabaseWarnings = validateSupabaseEnv();
for (const w of supabaseWarnings) {
  console.warn(`[supabase] ${w}`);
}

app.listen(env.port, () => {
  console.info(`listening on http://localhost:${env.port}`);
  if (supabaseWarnings.length === 0 && env.supabaseUrl && env.supabaseServiceRoleKey) {
    console.info("[supabase] Storage configured");
  }
});
