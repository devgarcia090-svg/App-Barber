import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { servicesRouter } from "./routes/services";
import { staffRouter } from "./routes/staff";
import { clientsRouter } from "./routes/clients";
import { appointmentsRouter } from "./routes/appointments";
import { settingsRouter } from "./routes/settings";
import { publicRouter } from "./routes/public";
import { clientRouter } from "./routes/client";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/client", clientRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
