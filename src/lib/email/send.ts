import nodemailer from "nodemailer";

// League email goes out through the league's Gmail account (an app password, not the account
// password). Without GMAIL_USER / GMAIL_APP_PASSWORD, sending is skipped and reported as such.

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function siteUrl(): string {
  return process.env.SITE_URL ?? "https://dave-ffl.vercel.app";
}

/** Sends each email; returns how many were sent. Throws if Gmail isn't configured. */
export async function sendEmails(emails: Email[]): Promise<number> {
  if (!emailConfigured()) throw new Error("League email isn't set up (GMAIL_USER / GMAIL_APP_PASSWORD)");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  let sent = 0;
  for (const email of emails) {
    await transport.sendMail({ from: `"Dave FFL" <${process.env.GMAIL_USER}>`, ...email });
    sent++;
  }
  return sent;
}
