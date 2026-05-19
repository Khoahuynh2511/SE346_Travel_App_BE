import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

let admin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return null;
  if (!admin) {
    admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return admin;
}

export function supabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
