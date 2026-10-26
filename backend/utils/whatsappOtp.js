const WA_API = "https://graph.facebook.com/v20.0";

// Sends a one-time code via the platform's own WhatsApp Business number
// (not a tenant's connected number — this is for NestGym's own users,
// e.g. password reset), using a pre-approved AUTHENTICATION template.
async function sendWhatsAppOtp(phone, code) {
  const accessToken = process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || "user_otp";
  const languageCode = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US";
  const hasCopyCodeButton = process.env.WHATSAPP_OTP_HAS_BUTTON !== "false";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp platform number is not configured");
  }

  const components = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];
  if (hasCopyCodeButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }

  const res = await fetch(`${WA_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "WhatsApp API error");
  return data;
}

// Sends any approved text-only template from the platform number (e.g. fee payment links).
// `charge` = { tenantId, kind }: the message is paid for with the gym's WhatsApp credits (utils/credits.js), taken before
// sending and given back if Meta rejects it. Without `charge` it is a platform message and free.
async function sendPlatformTemplate(phone, templateName, params, languageCode = "en", charge = null) {
  const accessToken = process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp platform number is not configured");
  }
  const credits = charge ? require("./credits") : null;
  const hold = charge ? await credits.reserve(charge.tenantId, { kind: charge.kind, phone }) : null;
  if (hold && !hold.ok) {
    throw Object.assign(
      new Error(`WhatsApp not sent: ${hold.reason === "daily_cap" ? "daily message limit reached" : "not enough credits"}`),
      { code: "NO_CREDITS" },
    );
  }
  let data;
  try {
    data = await postTemplate(phone, templateName, params, languageCode, accessToken, phoneNumberId);
  } catch (err) {
    if (hold) await credits.refund(hold);
    throw err;
  }
  if (hold) await credits.commit(hold, data?.messages?.[0]?.id);
  return data;
}

async function postTemplate(phone, templateName, params, languageCode, accessToken, phoneNumberId) {
  const res = await fetch(`${WA_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: String(text) })) }],
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "WhatsApp API error");
  return data;
}

module.exports = { sendWhatsAppOtp, sendPlatformTemplate };
