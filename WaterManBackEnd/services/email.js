const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    console.warn(
      "[Email] SMTP is not configured. Email will not be sent."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    // Fail fast instead of hanging for minutes: in some hosting environments
    // outbound SMTP is blackholed, and an un-awaited sendEmail() that never
    // resolves previously tied up request handling (orders/accepts hung until
    // the pool of DB connections was exhausted).
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return transporter;
}

async function sendEmail(to, subject, html) {
  const transport = getTransporter();

  const from =
    process.env.SMTP_FROM ||
    `WaterMan <${process.env.SMTP_USER}>`;

  if (!transport) {
    console.log(
      `[Email] Not sent - SMTP not configured. To: ${to}`
    );

    return {
      success: false,
      simulated: true,
      error: "SMTP_NOT_CONFIGURED",
    };
  }

  try {
    console.log(
      `[Email] Sending email to: ${to}`
    );

    const info = await transport.sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log(
      `[Email] Successfully sent to ${to} - messageId: ${info.messageId}`
    );

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(
      `[Email] Failed to send to ${to}:`,
      error.message
    );

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  sendEmail,
};