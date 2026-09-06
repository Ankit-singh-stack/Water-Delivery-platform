import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'

const BASE = 'http://localhost:5174'
const OUTDIR = process.env.UI_OUTDIR || 'C:/Users/ankit/OneDrive/Desktop/TankerDrop/WaterManBackEnd'

interface SessionState {
  token: string
  session: { userId: string; name: string; email: string | null; phone: string; role: string }
}
interface FlowState {
  orderId: string
  orderNumber: string
  partnerProfileId: string
  vendor: SessionState
  partner: SessionState
}

function load(name: string): FlowState {
  return JSON.parse(fs.readFileSync(`${OUTDIR}/${name}`, 'utf8'))
}

async function seedSession(context: BrowserContext, s: SessionState) {
  await context.addInitScript(([token, session]) => {
    localStorage.setItem('wm_token', token)
    localStorage.setItem('wm_session', JSON.stringify(session))
  }, [s.token, s.session])
}

function trackErrors(page: Page, consoleErrors: string[], pageErrors: string[]) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push(String(e)))
}

test('full delivery flow through the real UI', async ({ browser }) => {
  const state = load('_ui_state_a.json')
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  // ── Vendor context ─────────────────────────────────────────────
  const vendorCtx = await browser.newContext()
  await seedSession(vendorCtx, state.vendor)
  const vendor = await vendorCtx.newPage()
  trackErrors(vendor, consoleErrors, pageErrors)

  await vendor.goto(`${BASE}/vendor`, { waitUntil: 'domcontentloaded' })
  await vendor.waitForSelector('.vorders-page', { timeout: 15000 })
  await vendor.getByRole('button', { name: /My Orders/ }).click()
  const orderCard = vendor.locator('.vorder-card', { hasText: state.orderNumber })
  await expect(orderCard.first()).toBeVisible({ timeout: 15000 })
  await orderCard.first().locator('.vorder-card__top').click()

  await orderCard.first().getByRole('button', { name: /Assign Partner/ }).click()
  await vendor.waitForSelector('.vorder-assign__select')
  await vendor.locator('.vorder-assign__select').selectOption(state.partnerProfileId)
  await orderCard.first().getByRole('button', { name: /^Assign$/ }).click()

  await expect(orderCard.first()).toContainText('Partner Assigned', { timeout: 15000 })

  // ── Partner context ────────────────────────────────────────────
  const partnerCtx = await browser.newContext()
  await seedSession(partnerCtx, state.partner)
  const partner = await partnerCtx.newPage()
  trackErrors(partner, consoleErrors, pageErrors)

  await partner.goto(`${BASE}/delivery`, { waitUntil: 'domcontentloaded' })
  await partner.waitForSelector('.dp-page', { timeout: 15000 })
  await expect(partner.locator('.dp-card--alert', { hasText: state.orderNumber })).toBeVisible({ timeout: 20000 })
  await partner.locator('.dp-card--alert', { hasText: state.orderNumber })
    .getByRole('button', { name: /^Accept$/ }).click()
  await expect(partner.locator('.dp-card--alert', { hasText: state.orderNumber })).toHaveCount(0, { timeout: 15000 })

  await partner.getByRole('button', { name: /^Active$/ }).click()
  await expect(partner.locator('.dp-flow')).toBeVisible({ timeout: 15000 })
  const advanceBtn = partner.locator('.dp-btn--lg')
  for (let i = 0; i < 4; i++) {
    await expect(advanceBtn).toBeVisible({ timeout: 10000 })
    await expect(advanceBtn).toBeEnabled({ timeout: 10000 })
    const resp = partner.waitForResponse(r => r.url().includes('/status') && r.request().method() === 'PATCH', { timeout: 20000 })
    await advanceBtn.click()
    await resp
    await partner.waitForTimeout(200)
  }
  await expect(partner.locator('.dp-otp-section')).toBeVisible({ timeout: 15000 })

  // ── Vendor generates OTP ───────────────────────────────────────
  await vendor.reload({ waitUntil: 'domcontentloaded' })
  await vendor.waitForSelector('.vorders-page')
  await vendor.getByRole('button', { name: /My Orders/ }).click()
  const card2 = vendor.locator('.vorder-card', { hasText: state.orderNumber }).first()
  await expect(card2.getByRole('button', { name: /Generate Delivery OTP/ })).toBeVisible({ timeout: 15000 })
  await card2.getByRole('button', { name: /Generate Delivery OTP/ }).click()
  await expect(vendor.locator('.vorders-toast')).toBeVisible({ timeout: 10000 })
  const toastText = (await vendor.locator('.vorders-toast').textContent()) || ''
  const devOtp = (toastText.match(/\b\d{6}\b/) || [''])[0]

  // ── Partner confirms OTP ───────────────────────────────────────
  await expect(partner.locator('.dp-otp-input')).toBeVisible()
  await partner.locator('.dp-otp-input').fill(devOtp)
  const confirmResp = partner.waitForResponse(r => r.url().includes('/confirm-otp') && r.request().method() === 'POST', { timeout: 20000 })
  await partner.getByRole('button', { name: /Confirm Delivery/ }).click()
  const confirmBody = await (await confirmResp).json()
  console.log('confirm-otp:', JSON.stringify(confirmBody))
  expect(confirmBody.status).toBe('delivered')

  await expect(partner.locator('.dp-error-text')).toHaveCount(0, { timeout: 8000 })
  await expect(partner.locator('.dp-otp-section')).toHaveCount(0, { timeout: 15000 })
  await expect(partner.locator('.dp-empty').filter({ hasText: 'No active delivery' })).toBeVisible({ timeout: 15000 })

  // ── Earnings reflects the delivery ─────────────────────────────
  await partner.getByRole('button', { name: /^Earnings$/ }).click()
  await expect(partner.locator('.dp-section', { hasText: 'Recent Deliveries' })).toBeVisible({ timeout: 15000 })
  await expect(partner.locator('.dp-section').filter({ hasText: state.orderNumber })).toBeVisible()

  await vendorCtx.close()
  await partnerCtx.close()

  expect(consoleErrors.filter(e => !e.toLowerCase().includes('favicon'))).toEqual([])
  expect(pageErrors).toEqual([])
})

test('delivery OTP: invalid then valid confirmation', async ({ browser }) => {
  const state = load('_ui_state_b.json')
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  // Vendor: generate the OTP for the out_for_delivery order
  const vendorCtx = await browser.newContext()
  await seedSession(vendorCtx, state.vendor)
  const vendor = await vendorCtx.newPage()
  trackErrors(vendor, consoleErrors, pageErrors)
  await vendor.goto(`${BASE}/vendor`, { waitUntil: 'domcontentloaded' })
  await vendor.waitForSelector('.vorders-page')
  await vendor.getByRole('button', { name: /My Orders/ }).click()
  const card = vendor.locator('.vorder-card', { hasText: state.orderNumber }).first()
  await expect(card.getByRole('button', { name: /Generate Delivery OTP/ })).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: /Generate Delivery OTP/ }).click()
  await expect(vendor.locator('.vorders-toast')).toBeVisible({ timeout: 10000 })
  const devOtp = ((await vendor.locator('.vorders-toast').textContent()) || '').match(/\b\d{6}\b/)?.[0] || ''

  // Partner: confirm with a WRONG OTP first
  const partnerCtx = await browser.newContext()
  await seedSession(partnerCtx, state.partner)
  const partner = await partnerCtx.newPage()
  trackErrors(partner, consoleErrors, pageErrors)
  await partner.goto(`${BASE}/delivery`, { waitUntil: 'domcontentloaded' })
  await partner.waitForSelector('.dp-page')
  await partner.getByRole('button', { name: /^Active$/ }).click()

  await expect(partner.locator('.dp-otp-section')).toBeVisible({ timeout: 15000 })
  const wrong = devOtp === '000000' ? '111111' : '000000'
  await partner.locator('.dp-otp-input').fill(wrong)
  await partner.getByRole('button', { name: /Confirm Delivery/ }).click()

  // Wrong OTP should surface an error and keep the order un-delivered
  await expect(partner.locator('.dp-error-text')).toBeVisible({ timeout: 15000 })
  await expect(partner.locator('.dp-otp-section')).toBeVisible()

  // Now enter the correct OTP
  const confirmResp = partner.waitForResponse(r => r.url().includes('/confirm-otp') && r.request().method() === 'POST', { timeout: 20000 })
  await partner.locator('.dp-otp-input').fill(devOtp)
  await partner.getByRole('button', { name: /Confirm Delivery/ }).click()
  const confirmBody = await (await confirmResp).json()
  console.log('confirm-otp (valid):', JSON.stringify(confirmBody))
  expect(confirmBody.status).toBe('delivered')

  await expect(partner.locator('.dp-empty').filter({ hasText: 'No active delivery' })).toBeVisible({ timeout: 15000 })

  await vendorCtx.close()
  await partnerCtx.close()

  // The 400 Bad Request console message is from the intentionally-wrong OTP (expected).
  const unexpected = consoleErrors.filter(e =>
    !e.toLowerCase().includes('favicon') && !e.includes('400 (Bad Request)'))
  expect(unexpected).toEqual([])
  expect(pageErrors).toEqual([])
})
