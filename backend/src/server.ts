import "dotenv/config";
import { createApp } from "./app";
import { startReminderDispatcherJob } from "./jobs/reminderDispatcher";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`App Barber API listening on port ${port}`);
  startReminderDispatcherJob();
});
