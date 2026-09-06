const { randomInt } = require('crypto')

/** Generate a 6-digit OTP string */
function generateOtp() {
  return String(randomInt(100000, 1000000));
}

/** OTP valid for 10 minutes */
function otpExpiresAt() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

module.exports = { generateOtp, otpExpiresAt };
