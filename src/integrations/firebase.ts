import admin from "firebase-admin";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App | null {
  if (!firebaseApp && env.firebaseServiceAccountKey) {
    try {
      const serviceAccount = JSON.parse(env.firebaseServiceAccountKey);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      logger.info("Firebase Admin initialized successfully");
    } catch (error) {
      logger.warn({ error }, "Failed to initialize Firebase Admin");
    }
  }
  return firebaseApp;
}
