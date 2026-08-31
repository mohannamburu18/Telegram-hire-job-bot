const nodemailer = require('nodemailer');

function getTransporter() {
  const emailUser = process.env.SMTP_EMAIL;
  const emailPass = process.env.SMTP_PASSWORD;

  if (!emailUser || !emailPass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

/**
 * Send OTP Verification Email
 * @param {string} toEmail
 * @param {string} otpCode
 * @param {string} name
 */
async function sendOtpEmail(toEmail, otpCode, name = 'Job Seeker') {
  const transporter = getTransporter();

  const mailOptions = {
    from: `"WhatsHire Verification" <${process.env.SMTP_EMAIL || 'support@whatshire.com'}>`,
    to: toEmail,
    subject: `🔐 WhatsHire Verification Code: ${otpCode}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #0088cc; text-align: center;">Welcome to WhatsHire!</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your one-time verification code for WhatsHire Telegram Job Apply Bot is:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111; background-color: #f3f4f6; padding: 12px 24px; border-radius: 8px; border: 1px dashed #0088cc;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #666; font-size: 14px;">This code is valid for <strong>5 minutes</strong>. Do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">WhatsHire Automated Job Applications</p>
      </div>
    `,
  };

  if (!transporter) {
    console.log(`[AUTH/OTP CONSOLE FALLBACK] SMTP not configured. OTP for ${toEmail} (${name}): >>> ${otpCode} <<<`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[AUTH/OTP EMAIL SENT] Message ID: ${info.messageId} to ${toEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[AUTH/OTP EMAIL ERROR] Failed to send email to ${toEmail}:`, error.message);
    console.log(`[AUTH/OTP CONSOLE FALLBACK] OTP for ${toEmail} (${name}): >>> ${otpCode} <<<`);
    return { success: true, fallback: true, error: error.message };
  }
}

module.exports = {
  sendOtpEmail,
};

