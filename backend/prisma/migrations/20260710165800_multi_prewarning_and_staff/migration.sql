-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "reminderHoursBefore" TEXT NOT NULL DEFAULT '24,2',
    "lateCancelThresholdHours" INTEGER NOT NULL DEFAULT 4,
    "riskyThreshold" INTEGER NOT NULL DEFAULT 2,
    "watchThreshold" INTEGER NOT NULL DEFAULT 1,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "barberPrewarningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "barberPrewarningHoursBefore" TEXT NOT NULL DEFAULT '24,1',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationSettings_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationSettings" ("barberId", "barberPrewarningEnabled", "barberPrewarningHoursBefore", "emailEnabled", "id", "lateCancelThresholdHours", "reminderHoursBefore", "riskyThreshold", "smsEnabled", "updatedAt", "watchThreshold", "whatsappEnabled") SELECT "barberId", "barberPrewarningEnabled", "barberPrewarningHoursBefore", "emailEnabled", "id", "lateCancelThresholdHours", "reminderHoursBefore", "riskyThreshold", "smsEnabled", "updatedAt", "watchThreshold", "whatsappEnabled" FROM "NotificationSettings";
DROP TABLE "NotificationSettings";
ALTER TABLE "new_NotificationSettings" RENAME TO "NotificationSettings";
CREATE UNIQUE INDEX "NotificationSettings_barberId_key" ON "NotificationSettings"("barberId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
