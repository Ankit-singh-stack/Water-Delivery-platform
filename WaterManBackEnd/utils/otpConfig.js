/** OTP verification is opt-in — disabled by default, which auto-approves accounts
 *  and skips OTP step-ups on profile/password changes. Set OTP_ENABLED=true to require it. */
function isOtpEnabled() {
  return process.env.OTP_ENABLED === 'true';
}

module.exports = { isOtpEnabled };
