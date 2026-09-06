/**
 * mockAuth.ts — localStorage-based mock auth store.
 * Swap these functions for real API calls when the backend is ready.
 */

import type {
  MockUser,
  Session,
  RegisterResult,
  LoginResult,
  VerifyOtpResult,
  ResendOtpResult,
  ForgotPasswordResult,
} from '../types'

const USERS_KEY   = 'wm_users'
const SESSION_KEY = 'wm_session'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUsers(): MockUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as MockUser[] }
  catch { return [] }
}

function saveUsers(users: MockUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Register ──────────────────────────────────────────────────────────────────

export function mockRegister({
  firstName,
  lastName,
  email,
  phone,
  password,
}: {
  firstName: string
  lastName:  string
  email:     string
  phone:     string
  password:  string
}): RegisterResult {
  const users = getUsers()

  const byEmail = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  const byPhone = users.find(u => u.phone === phone)

  if (byEmail?.isOtpVerified) return { success: false, error: 'email_exists' }
  if (byPhone?.isOtpVerified) return { success: false, error: 'phone_exists' }

  // Unverified account exists — resend OTP
  const existing = byEmail ?? byPhone
  if (existing) {
    existing.otp      = generateOtp()
    existing.otpSentAt = Date.now()
    saveUsers(users)
    return {
      success:  true,
      needsOtp: true,
      userId:   existing.id,
      phone:    existing.phone,
      devOtp:   existing.otp,
      message:  'account_unverified_resend',
    }
  }

  // New user
  const otp = generateOtp()
  const user: MockUser = {
    id:            generateId(),
    firstName:     firstName.trim(),
    lastName:      lastName.trim(),
    email:         email.trim().toLowerCase(),
    phone:         phone.trim(),
    password,
    isOtpVerified: false,
    otp,
    otpSentAt:     Date.now(),
    createdAt:     new Date().toISOString(),
  }
  users.push(user)
  saveUsers(users)

  return { success: true, needsOtp: true, userId: user.id, phone: user.phone, devOtp: otp }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export function mockLogin(identifier: string, password: string): LoginResult {
  const users = getUsers()
  const id    = identifier.trim().toLowerCase()
  const user  = users.find(
    u => (u.email === id || u.phone === identifier.trim()) && u.password === password,
  )

  if (!user) return { success: false, error: 'invalid_credentials' }

  if (!user.isOtpVerified) {
    user.otp      = generateOtp()
    user.otpSentAt = Date.now()
    saveUsers(users)
    return {
      success:  false,
      needsOtp: true,
      userId:   user.id,
      phone:    user.phone,
      devOtp:   user.otp,
      message:  'account_unverified_resend',
    }
  }

  return { success: true, user: createSession(user) }
}

// ── OTP Verification ──────────────────────────────────────────────────────────

export function mockVerifyOtp(userId: string, enteredOtp: string): VerifyOtpResult {
  const users = getUsers()
  const user  = users.find(u => u.id === userId)

  if (!user)                   return { success: false, error: 'otp_invalid' }
  if (user.otp !== enteredOtp) return { success: false, error: 'otp_invalid' }

  user.isOtpVerified = true
  user.otp           = null
  user.otpSentAt     = null
  saveUsers(users)

  return { success: true, user: createSession(user) }
}

export function mockResendOtp(userId: string): ResendOtpResult {
  const users = getUsers()
  const user  = users.find(u => u.id === userId)
  if (!user) return { success: false, error: 'otp_invalid' }

  user.otp      = generateOtp()
  user.otpSentAt = Date.now()
  saveUsers(users)

  return { success: true, devOtp: user.otp }
}

// ── Forgot Password ───────────────────────────────────────────────────────────

export function mockForgotPassword(identifier: string): ForgotPasswordResult {
  const users = getUsers()
  const id    = identifier.trim().toLowerCase()
  const user  = users.find(u => u.email === id || u.phone === identifier.trim())
  if (!user) return { success: false, error: 'no_account' }
  return { success: true }
}

// ── Session ───────────────────────────────────────────────────────────────────

function createSession(user: MockUser): Session {
  const session: Session = {
    userId: user.id,
    name:   `${user.firstName} ${user.lastName}`,
    email:  user.email,
    phone:  user.phone,
    role:   'user',
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null }
  catch { return null }
}

export function mockLogout(): void {
  localStorage.removeItem(SESSION_KEY)
}
