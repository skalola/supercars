import "server-only";

import { sendBasicEmail } from "@/lib/mail/mail-service";
import { buildUserPartOrderNotice } from "@/lib/mail/user-part-order-template";

export async function sendUserPartOrderNotice(input: {
  recipientEmail: string | null;
  recipientName: string;
  subject: string;
  heading: string;
  message: string;
  orderId: string;
}) {
  const notice = buildUserPartOrderNotice(input);
  return sendBasicEmail({
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
    text: notice.text,
    html: notice.html,
  });
}
