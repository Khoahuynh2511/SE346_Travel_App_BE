import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 8000,
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret",
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "review-images",
  supabaseBroadcastChannel: process.env.SUPABASE_BROADCAST_CHANNEL || "travel-app",

  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",
  groqApiKey: process.env.GROQ_API_KEY || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",

  // Email Configuration
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  emailFrom: process.env.EMAIL_FROM || '"Travel App" <noreply@travelapp.com>',
  appUrl: process.env.APP_URL || "http://localhost:8000",
};
