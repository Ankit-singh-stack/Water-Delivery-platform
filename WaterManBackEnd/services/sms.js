/**
 * SMS provider abstraction.
 *
 * Configure via env vars:
 *   SMS_PROVIDER   — "twilio" | "msg91" | "console" (default)
 *   SMS_API_KEY    — provider API key / account SID
 *   SMS_API_SECRET — provider API secret / auth token
 *   SMS_FROM_NUMBER — sender ID or phone number
 *
 * Add new providers by extending the `providers` map below.
 */

const providers = {
  console: async (phoneNumber, message) => {
    console.log(`[SMS] (dev) To: ${phoneNumber} | Message: ${message}`);
    return { success: true, simulated: true };
  },

  twilio: async (phoneNumber, message) => {
    const accountSid = process.env.SMS_API_KEY;
    const authToken  = process.env.SMS_API_SECRET;
    const fromNumber = process.env.SMS_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      console.warn("[SMS] Twilio credentials not configured — falling back to console");
      return providers.console(phoneNumber, message);
    }
    // Lazy-require twilio so it's only needed when actually configured
    const twilio = require("twilio")(accountSid, authToken);
    const result = await twilio.messages.create({
      body: message,
      from: fromNumber,
      to: phoneNumber,
    });
    return { success: true, messageId: result.sid };
  },

  msg91: async (phoneNumber, message) => {
    const apiKey  = process.env.SMS_API_KEY;
    const from    = process.env.SMS_FROM_NUMBER;
    if (!apiKey) {
      console.warn("[SMS] MSG91 credentials not configured — falling back to console");
      return providers.console(phoneNumber, message);
    }
    const res = await fetch("https://api.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: apiKey },
      body: JSON.stringify({
        flow_id: process.env.SMS_FLOW_ID || "",
        mobiles: phoneNumber,
        VAR1: message,
        sender: from || "WTRMEN",
      }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, messageId: data.request_id || null };
    return { success: false, error: JSON.stringify(data) };
  },
};

async function sendSMS(phoneNumber, message) {
  const providerName = process.env.SMS_PROVIDER || "console";
  const provider = providers[providerName] || providers.console;
  try {
    return await provider(phoneNumber, message);
  } catch (err) {
    console.error(`[SMS] Provider "${providerName}" error:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSMS };
