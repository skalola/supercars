function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

export function buildUserPartOrderNotice(input: {
  heading: string;
  message: string;
  orderId: string;
}, configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000") {
  const baseUrl = configuredBaseUrl.replace(/\/$/, "");
  const orderUrl = `${baseUrl}/parts/orders/${input.orderId}`;
  const heading = escapeHtml(input.heading);
  const message = escapeHtml(input.message);
  return {
    orderUrl,
    text: `${input.heading}\n\n${input.message}\n\nView transaction: ${orderUrl}`,
    html: `<div style="background:#090a0c;color:#fff;font-family:Arial,sans-serif;padding:32px"><div style="max-width:620px;margin:auto;border:1px solid #292b30;padding:28px"><p style="color:#ef233c;font-size:12px;font-weight:700">SUPERCAR DASH</p><h1 style="font-size:26px">${heading}</h1><p style="color:#c6c7ca;line-height:1.6">${message}</p><a href="${orderUrl}" style="display:inline-block;margin-top:16px;background:#e20f1b;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">VIEW TRANSACTION</a></div></div>`,
  };
}
