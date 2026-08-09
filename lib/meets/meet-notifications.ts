import { shouldSendMarketingAutomation } from "@/lib/admin/marketing-automation";
import { prisma } from "@/lib/prisma";
import { sendBasicEmail } from "@/lib/mail/mail-service";

type MeetNotificationType =
  | "MEET_CREATED_HOST"
  | "MEET_RSVP_USER"
  | "MEET_RSVP_HOST"
  | "MEET_UPDATED_ATTENDEE"
  | "MEET_REMINDER_ATTENDEE"
  | "MEET_CANCELLED_ATTENDEE"
  | "MEET_CANCELLED_HOST";

type MeetEmailUser = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  trackerPreference?: { eventsTrackerEnabled: boolean } | null;
};

type MeetEmailContext = {
  id: string;
  slug: string;
  title: string;
  type: string;
  startsAt: Date;
  city: string;
  state: string;
  locationName: string;
  visibility: string;
  host: MeetEmailUser;
};

export async function notifyMeetCreated(meetId: string) {
  const meet = await getMeetEmailContext(meetId);
  if (!meet) return;
  await sendMeetNotification({
    meet,
    user: meet.host,
    type: "MEET_CREATED_HOST",
    subject: `[SUPERCAR DASH] Meet Published - ${meet.title}`,
    headline: "Your meet is live",
    body: `${meet.title} is now visible on the SUPERCAR DASH meets map.`,
    ctaLabel: "View Meet",
  });
}

export async function notifyMeetRsvp(meetId: string, userId: string, rsvpStatus: string) {
  const [meet, user] = await Promise.all([getMeetEmailContext(meetId), getMeetUser(userId)]);
  if (!meet || !user) return;

  await sendMeetNotification({
    meet,
    user,
    type: "MEET_RSVP_USER",
    subject: `[SUPERCAR DASH] RSVP ${formatStatus(rsvpStatus)} - ${meet.title}`,
    headline: "RSVP updated",
    body: `Your RSVP for ${meet.title} is marked ${formatStatus(rsvpStatus)}.`,
    ctaLabel: "View Meet",
  });

  if (meet.host.id !== user.id) {
    await sendMeetNotification({
      meet,
      user: meet.host,
      type: "MEET_RSVP_HOST",
      subject: `[SUPERCAR DASH] New RSVP - ${meet.title}`,
      headline: "A member updated their RSVP",
      body: `${displayName(user)} is now ${formatStatus(rsvpStatus)} for ${meet.title}.`,
      ctaLabel: "View Meet",
      bypassUserPreference: true,
    });
  }
}

export async function notifyMeetCancelled(meetId: string, actorUserId?: string | null) {
  const meet = await getMeetEmailContext(meetId);
  if (!meet) return;

  await sendMeetNotification({
    meet,
    user: meet.host,
    type: "MEET_CANCELLED_HOST",
    subject: `[SUPERCAR DASH] Meet Cancelled - ${meet.title}`,
    headline: "Meet cancelled",
    body: `${meet.title} has been marked cancelled.`,
    ctaLabel: "View Meet",
    bypassUserPreference: actorUserId === meet.host.id,
  });

  const attendees = await prisma.meetRsvp.findMany({
    where: { meetId, status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          trackerPreference: { select: { eventsTrackerEnabled: true } },
        },
      },
    },
    take: 500,
  });

  for (const attendee of attendees) {
    if (attendee.user.id === meet.host.id) continue;
    await sendMeetNotification({
      meet,
      user: attendee.user,
      type: "MEET_CANCELLED_ATTENDEE",
      subject: `[SUPERCAR DASH] Meet Cancelled - ${meet.title}`,
      headline: "Meet cancelled",
      body: `${meet.title} in ${meet.city}, ${meet.state} has been cancelled by the host or admin.`,
      ctaLabel: "View Meet",
    });
  }
}

export async function notifyMeetUpdated(meetId: string, actorUserId?: string | null) {
  const meet = await getMeetEmailContext(meetId);
  if (!meet) return;

  const attendees = await prisma.meetRsvp.findMany({
    where: { meetId, status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          trackerPreference: { select: { eventsTrackerEnabled: true } },
        },
      },
    },
    take: 500,
  });

  for (const attendee of attendees) {
    if (attendee.user.id === actorUserId) continue;
    await sendMeetNotification({
      meet,
      user: attendee.user,
      type: "MEET_UPDATED_ATTENDEE",
      subject: `[SUPERCAR DASH] Meet Updated - ${meet.title}`,
      headline: "Meet details updated",
      body: `${meet.title} has updated event details. Review the meet page before you arrive.`,
      ctaLabel: "View Meet",
    });
  }
}

export async function notifyMeetReminder(meetId: string, userId: string) {
  const [meet, user] = await Promise.all([getMeetEmailContext(meetId), getMeetUser(userId)]);
  if (!meet || !user) return;

  const existing = await prisma.meetNotification.findFirst({
    where: {
      meetId,
      userId,
      notificationType: "MEET_REMINDER_ATTENDEE",
    },
    select: { id: true },
  });
  if (existing) return;

  await sendMeetNotification({
    meet,
    user,
    type: "MEET_REMINDER_ATTENDEE",
    subject: `[SUPERCAR DASH] Meet Reminder - ${meet.title}`,
    headline: "Your meet is coming up",
    body: `${meet.title} is coming up soon. Review the meet page for location details, roll call, and arrival expectations.`,
    ctaLabel: "View Meet",
  });
}

async function sendMeetNotification({
  meet,
  user,
  type,
  subject,
  headline,
  body,
  ctaLabel,
  bypassUserPreference = false,
}: {
  meet: MeetEmailContext;
  user: MeetEmailUser;
  type: MeetNotificationType;
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  bypassUserPreference?: boolean;
}) {
  const gate = await shouldSendMarketingAutomation("event_alerts");
  const emailAllowed = bypassUserPreference || user.trackerPreference?.eventsTrackerEnabled === true;
  const baseUrl = getAppBaseUrl();
  const meetUrl = `${baseUrl}/meets/${meet.slug}`;

  if (!gate.enabled || !emailAllowed) {
    await logMeetNotification({
      meetId: meet.id,
      userId: user.id,
      type,
      email: user.email,
      status: "HELD",
      subject,
      reason: !gate.enabled ? gate.skipped || "EVENT_ALERTS_DISABLED" : "USER_EVENT_ALERTS_DISABLED",
    });
    return;
  }

  const email = buildMeetEmail({
    recipientName: displayName(user),
    headline,
    body,
    meet,
    ctaLabel,
    meetUrl,
  });
  const result = await sendBasicEmail({
    recipientEmail: user.email,
    recipientName: displayName(user),
    subject,
    ...email,
  });

  await logMeetNotification({
    meetId: meet.id,
    userId: user.id,
    type,
    email: result.recipientEmail || user.email,
    status: result.dispatched ? "DISPATCHED" : "FAILED",
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    subject,
    reason: result.dispatched ? null : result.reason || result.message,
  });
}

async function logMeetNotification({
  meetId,
  userId,
  type,
  email,
  status,
  provider,
  providerMessageId,
  subject,
  reason,
}: {
  meetId: string;
  userId: string | null;
  type: MeetNotificationType;
  email?: string | null;
  status: string;
  provider?: string;
  providerMessageId?: string;
  subject: string;
  reason?: string | null;
}) {
  await prisma.meetNotification.create({
    data: {
      meetId,
      userId,
      notificationType: type,
      recipientEmail: email || null,
      status,
      provider,
      providerMessageId,
      subject,
      reason,
    },
  });
}

async function getMeetEmailContext(meetId: string): Promise<MeetEmailContext | null> {
  return prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      startsAt: true,
      city: true,
      state: true,
      locationName: true,
      visibility: true,
      host: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          trackerPreference: { select: { eventsTrackerEnabled: true } },
        },
      },
    },
  });
}

async function getMeetUser(userId: string): Promise<MeetEmailUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      trackerPreference: { select: { eventsTrackerEnabled: true } },
    },
  });
}

function buildMeetEmail({
  recipientName,
  headline,
  body,
  meet,
  ctaLabel,
  meetUrl,
}: {
  recipientName: string;
  headline: string;
  body: string;
  meet: MeetEmailContext;
  ctaLabel: string;
  meetUrl: string;
}) {
  const details = [
    ["Meet", meet.title],
    ["Format", meet.type],
    ["Date", `${formatDate(meet.startsAt)} at ${formatTime(meet.startsAt)}`],
    ["Location", `${meet.city}, ${meet.state}`],
    ["Venue", meet.locationName],
  ];

  const rows = details
    .map(
      ([label, value]) => `
      <div style="display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-bottom:1px solid #ededeb;">
        <span style="color:#666a70; font-size:13px;">${escapeHtml(label)}</span>
        <strong style="color:#111111; font-size:14px; text-align:right;">${escapeHtml(value)}</strong>
      </div>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, system-ui, -apple-system, sans-serif; background:#f7f7f5; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #dedfda; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; background:#111111; color:#ffffff; font-weight:900; letter-spacing:1.8px; text-align:center;">SUPERCAR DASH</div>
    <div style="padding:24px;">
      <div style="font-size:12px; color:#666a70; font-weight:800; text-transform:uppercase;">SUPERCAR DASH MEETS</div>
      <h1 style="margin:6px 0 12px; font-size:24px; line-height:1.2; color:#111111;">${escapeHtml(headline)}</h1>
      <p style="margin:0 0 18px; color:#34373b; font-size:14px; line-height:1.55;">Hello ${escapeHtml(recipientName)}, ${escapeHtml(body)}</p>
      <div style="border:1px solid #ededeb; border-radius:8px; padding:14px; background:#fafafa;">${rows}</div>
      <div style="margin-top:22px; text-align:center;">
        <a href="${escapeHtml(meetUrl)}" style="display:inline-block; padding:12px 22px; background:#111111; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:800;">${escapeHtml(ctaLabel)}</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `SUPERCAR DASH MEETS

Hello ${recipientName},

${headline}

${body}

${details.map(([label, value]) => `${label}: ${value}`).join("\n")}

${ctaLabel}: ${meetUrl}
`;

  return { html, text };
}

function displayName(user: MeetEmailUser) {
  return user.name || user.username || "there";
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://supercardash.vercel.app"
  ).replace(/\/$/, "");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
