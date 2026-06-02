DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('invited', 'upcoming', 'promotion', 'like_comment');
  END IF;
END $$;

DROP TABLE IF EXISTS "NotificationRecipient";
DROP TABLE IF EXISTS "Notification";

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "actorId" INTEGER,
  "targetId" TEXT,
  "title" TEXT,
  "body" TEXT,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationRecipient" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_targetId_idx" ON "Notification"("targetId");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRecipient_notificationId_userId_key"
  ON "NotificationRecipient"("notificationId", "userId");
CREATE INDEX IF NOT EXISTS "NotificationRecipient_userId_isRead_idx"
  ON "NotificationRecipient"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "NotificationRecipient_userId_createdAt_idx"
  ON "NotificationRecipient"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_actorId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationRecipient_notificationId_fkey'
  ) THEN
    ALTER TABLE "NotificationRecipient"
      ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationRecipient_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationRecipient"
      ADD CONSTRAINT "NotificationRecipient_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
