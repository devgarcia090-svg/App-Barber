import cron from "node-cron";
import { dispatchDueReminders } from "../notifications/dispatcher";

export function startReminderDispatcherJob(): void {
  const expression = process.env.REMINDER_CRON ?? "*/5 * * * *";
  cron.schedule(expression, async () => {
    try {
      const { sent, failed } = await dispatchDueReminders();
      if (sent || failed) {
        console.log(`[reminders] dispatched ${sent} reminder(s), ${failed} failed`);
      }
    } catch (err) {
      console.error("[reminders] dispatch run failed", err);
    }
  });
  console.log(`[reminders] dispatcher scheduled with cron "${expression}"`);
}
