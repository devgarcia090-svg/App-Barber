-- DropIndex
DROP INDEX "StaffWorkingHours_staffId_dayOfWeek_key";

-- CreateIndex
CREATE INDEX "StaffWorkingHours_staffId_dayOfWeek_idx" ON "StaffWorkingHours"("staffId", "dayOfWeek");
