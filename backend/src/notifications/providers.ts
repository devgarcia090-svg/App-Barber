import nodemailer, { type Transporter } from "nodemailer";
import twilio from "twilio";

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface MessageProvider {
  sendWhatsApp(to: string, body: string): Promise<void>;
  sendSMS(to: string, body: string): Promise<void>;
}

/** Logs to the console instead of calling a real provider. Used whenever
 * credentials are missing so the whole reminder pipeline stays exercisable
 * in dev/CI without a paid account. */
class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${body}`);
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    this.from = process.env.SMTP_FROM ?? "App Barber <no-reply@appbarber.com>";
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text: body });
  }
}

class ConsoleMessageProvider implements MessageProvider {
  async sendWhatsApp(to: string, body: string): Promise<void> {
    console.log(`[whatsapp:dev] to=${to}\n${body}`);
  }
  async sendSMS(to: string, body: string): Promise<void> {
    console.log(`[sms:dev] to=${to}\n${body}`);
  }
}

class TwilioMessageProvider implements MessageProvider {
  private client: ReturnType<typeof twilio>;
  private whatsappFrom: string;
  private smsFrom?: string;

  constructor() {
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.whatsappFrom = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
    this.smsFrom = process.env.TWILIO_SMS_FROM;
  }

  async sendWhatsApp(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      from: this.whatsappFrom,
      to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      body,
    });
  }

  async sendSMS(to: string, body: string): Promise<void> {
    if (!this.smsFrom) throw new Error("TWILIO_SMS_FROM is not configured");
    await this.client.messages.create({ from: this.smsFrom, to, body });
  }
}

export function createEmailProvider(): EmailProvider {
  return process.env.SMTP_HOST ? new SmtpEmailProvider() : new ConsoleEmailProvider();
}

export function createMessageProvider(): MessageProvider {
  return process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? new TwilioMessageProvider()
    : new ConsoleMessageProvider();
}
