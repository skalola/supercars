/**
 * lib/mail/mail-service.ts
 *
 * Sprint 7.8 Centralized Mail Dispatcher Engine.
 * Single unified mail service that validates email syntax (Zero Guessed Emails Rule),
 * formats standardized templates, logs FulfillmentEvent records for every dispatch,
 * and records complete email dispatch audit logs.
 */

import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { shouldSendMarketingAutomation } from "@/lib/admin/marketing-automation";
import {
  generateEmailTemplate,
  EmailTemplateType,
  EmailTemplateParams,
} from "./email-templates";

export interface SendFulfillmentEmailInput extends Omit<EmailTemplateParams, "recipientEmail"> {
  fulfillmentRequestId: string;
  recipientEmail?: string | null;
  actorType?: "SYSTEM" | "BUYER" | "PARTNER" | "ADMIN";
  dispatchMode?: "DISPATCHED" | "RESENT";
}

export interface SendEmailResult {
  dispatched: boolean;
  recipientEmail?: string | null;
  templateType: EmailTemplateType;
  provider?: MailProviderName;
  providerMessageId?: string;
  eventId?: string;
  subject?: string;
  html?: string;
  text?: string;
  reason?: string;
  message: string;
}

type MailProviderName = "log" | "resend" | "sendgrid" | "postmark";

interface ProviderSendInput {
  to: string;
  recipientName: string;
  subject: string;
  html: string;
  text: string;
}

interface ProviderSendResult {
  provider: MailProviderName;
  providerMessageId?: string;
}

function getMailProvider(): MailProviderName {
  const provider = (process.env.MAIL_PROVIDER || "log").trim().toLowerCase();
  if (provider === "resend" || provider === "sendgrid" || provider === "postmark") {
    return provider;
  }
  return "log";
}

function getFromAddress(): string {
  return (process.env.MAIL_FROM || "SUPERCAR DASH <no-reply@supercars.market>").replace(
    /^SUPERCARDASH\s*</i,
    "SUPERCAR DASH <",
  );
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ id?: string; messageId?: string; MessageID?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: { id?: string; messageId?: string; MessageID?: string; errors?: unknown; message?: string } = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { message: responseText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const reason = parsed.message || JSON.stringify(parsed.errors || parsed).slice(0, 500) || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${reason}`);
  }

  return parsed;
}

async function deliverWithProvider(input: ProviderSendInput): Promise<ProviderSendResult> {
  const provider = getMailProvider();
  const from = getFromAddress();
  const replyTo = process.env.MAIL_REPLY_TO || process.env.SUPPORT_EMAIL || "support@supercars.market";

  if (provider === "log") {
    return { provider };
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is required when MAIL_PROVIDER=resend.");
    const result = await postJson(
      "https://api.resend.com/emails",
      { authorization: `Bearer ${apiKey}` },
      {
        from,
        to: [input.to],
        reply_to: replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
    );
    return { provider, providerMessageId: result.id };
  }

  if (provider === "sendgrid") {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("SENDGRID_API_KEY is required when MAIL_PROVIDER=sendgrid.");
    await postJson(
      "https://api.sendgrid.com/v3/mail/send",
      { authorization: `Bearer ${apiKey}` },
      {
        personalizations: [{ to: [{ email: input.to, name: input.recipientName }] }],
        from: parseEmailIdentity(from),
        reply_to: parseEmailIdentity(replyTo),
        subject: input.subject,
        content: [
          { type: "text/plain", value: input.text },
          { type: "text/html", value: input.html },
        ],
      },
    );
    return { provider };
  }

  const apiKey = process.env.POSTMARK_SERVER_TOKEN;
  if (!apiKey) throw new Error("POSTMARK_SERVER_TOKEN is required when MAIL_PROVIDER=postmark.");
  const result = await postJson(
    "https://api.postmarkapp.com/email",
    {
      "x-postmark-server-token": apiKey,
      accept: "application/json",
    },
    {
      From: from,
      To: input.to,
      ReplyTo: replyTo,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
    },
  );
  return { provider, providerMessageId: result.MessageID };
}

function parseEmailIdentity(value: string): { email: string; name?: string } {
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (!match) return { email: value.trim() };
  const name = match[1].trim().replace(/^"|"$/g, "");
  return { email: match[2].trim(), ...(name ? { name } : {}) };
}

/**
 * Single unified mail service for all fulfillment emails.
 * Creates an immutable FulfillmentEvent record for every dispatch or dispatch hold.
 */
export async function sendFulfillmentEmail(input: SendFulfillmentEmailInput): Promise<SendEmailResult> {
  const request = await prisma.fulfillmentRequest.findUnique({
    where: { id: input.fulfillmentRequestId },
    select: { status: true },
  });
  const currentStatus = request?.status || "SENT";
  const transactionFlowGate = await shouldSendMarketingAutomation("transaction_flow_alerts");

  if (!transactionFlowGate.enabled) {
    const holdNote = `Email dispatch HELD for '${input.recipientName}' (${input.templateType}) — Transaction Flow Alerts are disabled in admin marketing controls.`;
    const event = await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: input.fulfillmentRequestId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        actorType: input.actorType || "SYSTEM",
        note: holdNote,
      },
    });

    console.log(`[Mail Service] BLOCKED: ${holdNote}`);

    return {
      dispatched: false,
      templateType: input.templateType,
      eventId: event.id,
      reason: "TRANSACTION_FLOW_ALERTS_DISABLED",
      message: "Email dispatch held — Transaction Flow Alerts are disabled.",
    };
  }

  const emailValid = isValidEmail(input.recipientEmail);

  if (!emailValid || !input.recipientEmail) {
    const holdNote = `Email dispatch HELD for '${input.recipientName}' (${input.templateType}) — Recipient email unresolved. Dispatch blocked to avoid guessed emails.`;

    // Log audit event for blocked email
    const event = await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: input.fulfillmentRequestId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        actorType: input.actorType || "SYSTEM",
        note: holdNote,
      },
    });

    console.log(`[Mail Service] BLOCKED: ${holdNote}`);

    return {
      dispatched: false,
      templateType: input.templateType,
      eventId: event.id,
      reason: "UNRESOLVED_EMAIL",
      message: `Email dispatch held — Recipient email for '${input.recipientName}' is unresolved.`,
    };
  }

  const recipientEmail = input.recipientEmail.trim().toLowerCase();

  // Generate standardized template
  const { subject, html, text } = generateEmailTemplate({
    ...input,
    recipientEmail,
  });

  const dispatchMode = input.dispatchMode || "DISPATCHED";
  const provider = getMailProvider();

  let providerResult: ProviderSendResult;
  try {
    providerResult = await deliverWithProvider({
      to: recipientEmail,
      recipientName: input.recipientName,
      subject,
      html,
      text,
    });
  } catch (error) {
    const providerError = error instanceof Error ? error.message : "Unknown provider error.";
    const failNote = `Email FAILED: [${input.templateType}] to ${input.recipientName} (${recipientEmail}) via ${provider} — ${providerError}`;

    const event = await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: input.fulfillmentRequestId,
        previousStatus: currentStatus,
        newStatus: currentStatus,
        actorType: input.actorType || "SYSTEM",
        note: failNote,
      },
    });

    console.error(`[Mail Service] ${failNote}`);

    return {
      dispatched: false,
      recipientEmail,
      templateType: input.templateType,
      provider,
      eventId: event.id,
      subject,
      html,
      text,
      reason: "PROVIDER_SEND_FAILED",
      message: `Email dispatch failed via ${provider}: ${providerError}`,
    };
  }

  const providerLabel = providerResult.provider === "log" ? "log" : providerResult.provider;
  const messageIdLabel = providerResult.providerMessageId ? ` Provider Message ID: ${providerResult.providerMessageId}.` : "";
  const sendNote = `Email ${dispatchMode}: [${input.templateType}] to ${input.recipientName} (${recipientEmail}) via ${providerLabel} — Subject: "${subject}".${messageIdLabel}`;

  // Log immutable audit event for successful dispatch
  const event = await prisma.fulfillmentEvent.create({
    data: {
      fulfillmentRequestId: input.fulfillmentRequestId,
      previousStatus: currentStatus,
      newStatus: currentStatus,
      actorType: input.actorType || "SYSTEM",
      note: sendNote,
    },
  });

  console.log(`[Mail Service] ${sendNote}`);

  return {
    dispatched: true,
    recipientEmail,
    templateType: input.templateType,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId,
    eventId: event.id,
    subject,
    html,
    text,
    message: `Email successfully dispatched to ${recipientEmail}.`,
  };
}
