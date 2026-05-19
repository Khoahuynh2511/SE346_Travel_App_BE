import { env } from "./env.js";

export function validateSupabaseEnv(): string[] {
  const warnings: string[] = [];
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return warnings;
  }
  if (env.supabaseServiceRoleKey.startsWith("sb_publishable")) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is a publishable key. Use service_role (eyJ...) from Dashboard -> API for Storage uploads."
    );
  }
  return warnings;
}
