import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 8000,
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret",
  databaseUrl: process.env.DATABASE_URL,

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "review-images",
  supabaseBroadcastChannel: process.env.SUPABASE_BROADCAST_CHANNEL || "travel-app",

  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
};
