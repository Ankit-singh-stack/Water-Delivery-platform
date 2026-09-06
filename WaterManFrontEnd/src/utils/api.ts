/**
 * api.ts — TankerDrop API client.
 */

import type {
  Session,
  RegisterResult,
  LoginResult,
  VerifyOtpResult,
  ResendOtpResult,
  ForgotPasswordResult,
  UserProfile,
  Address,
  AddressInput,
  Order,
  OrderSummary,
  ApiResult,
  OtpRequestResult,
  Notification,
  SupportTicket,
  State,
  City,
  VendorRegisterInput,
  DeliveryPartnerRegisterInput,
  VendorProfile,
  VendorProfileInput,
  VendorOrder,
  PublicCity,
  PlaceOrderInput,
  PlacedOrder,
  ManagedUser,
  AssignableRole,
  RoleHistoryEntry,
  TankerType,
  PaymentInitResult,
  VendorTanker,
  ServerNotificationPrefs,
} from '../types'

const BASE        = (import.meta.env.SITE_API_URL as string | undefined) ?? 'http://localhost:3000'
const TOKEN_KEY   = 'wm_token'
const SESSION_KEY = 'wm_session'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

interface ApiResponse<T> { ok: boolean; status: number; data: T }

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

function handleUnauthorized(status: number): void {
  if (status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(SESSION_KEY)
    window.dispatchEvent(new CustomEvent('wm:logout'))
  }
}

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  })
  const data = await res.json() as T
  handleUnauthorized(res.status)
  return { ok: res.ok, status: res.status, data }
}

async function get<T>(path: string): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  const data = await res.json() as T
  handleUnauthorized(res.status)
  return { ok: res.ok, status: res.status, data }
}

async function put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  })
  const data = await res.json() as T
  handleUnauthorized(res.status)
  return { ok: res.ok, status: res.status, data }
}

async function httpPatch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as T
  handleUnauthorized(res.status)
  return { ok: res.ok, status: res.status, data }
}

async function del<T>(path: string): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  const data = await res.json() as T
  handleUnauthorized(res.status)
  return { ok: res.ok, status: res.status, data }
}

// ── Session helpers ───────────────────────────────────────────────────────────

interface RawUser {
  id:          string
  first_name?: string
  firstName?:  string
  last_name?:  string
  lastName?:   string
  email:       string
  phone:       string
  role?:       string
}

function persistSession(token: string, raw: RawUser): Session {
  const session: Session = {
    userId: raw.id,
    name:   `${raw.first_name ?? raw.firstName ?? ''} ${raw.last_name ?? raw.lastName ?? ''}`.trim(),
    email:  raw.email,
    phone:  raw.phone,
    role:   raw.role ?? 'user',
  }
  localStorage.setItem(TOKEN_KEY,   token)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new CustomEvent('wm:login', { detail: session }))
  return session
}

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null }
  catch { return null }
}

export function updateSessionName(firstName: string, lastName: string): void {
  const s = getSession()
  if (!s) return
  s.name = `${firstName} ${lastName}`.trim()
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

// ── Public (no-auth) helpers ──────────────────────────────────────────────────

async function publicGet<T>(path: string): Promise<ApiResponse<T>> {
  const res  = await fetch(`${BASE}${path}`)
  const data = await res.json() as T
  return { ok: res.ok, status: res.status, data }
}

export async function getPublicStates(): Promise<ApiResult<State[]>> {
  try {
    const { ok, data } = await publicGet<Array<{ id: string; name: string; state_code: string; country_code: string }> | { error?: string }>('/public/states')
    if (ok) return { success: true, data: (data as Array<{ id: string; name: string; state_code: string; country_code: string }>).map(r => ({ id: r.id, name: r.name, stateCode: r.state_code, countryCode: r.country_code })) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

interface RawPublicCity { id: string; name: string; state_id: string; state_name: string; state_code: string }

function mapPublicCity(r: RawPublicCity): PublicCity {
  return { id: r.id, name: r.name, stateId: r.state_id, stateName: r.state_name, stateCode: r.state_code }
}

export async function getPublicCities(stateId?: string): Promise<ApiResult<PublicCity[]>> {
  try {
    const path = stateId ? `/public/cities?stateId=${stateId}` : '/public/cities'
    const { ok, data } = await publicGet<RawPublicCity[] | { error?: string }>(path)
    if (ok) return { success: true, data: (data as RawPublicCity[]).map(mapPublicCity) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function register(params: {
  firstName: string; lastName: string; email: string; phone: string; password: string
}): Promise<RegisterResult> {
  try {
    const { ok, data } = await post<{ userId?: string; phone?: string; devOtp?: string; token?: string; user?: RawUser; error?: string }>(
      '/auth/signup', params
    )
    if (!ok) return { success: false, error: data.error ?? 'server_error' }
    if (data.token && data.user) return { success: true, needsOtp: false, user: persistSession(data.token, data.user) }
    if (!data.userId) return { success: false, error: 'server_error' }
    return { success: true, needsOtp: true, userId: data.userId, phone: data.phone!, devOtp: data.devOtp }
  } catch { return { success: false, error: 'network_error' } }
}

export async function registerVendor(params: VendorRegisterInput): Promise<RegisterResult> {
  try {
    const { ok, data } = await post<{ userId?: string; phone?: string; devOtp?: string; token?: string; user?: RawUser; error?: string }>(
      '/auth/vendor-register', params
    )
    if (!ok) return { success: false, error: data.error ?? 'server_error' }
    if (data.token && data.user) return { success: true, needsOtp: false, user: persistSession(data.token, data.user) }
    if (!data.userId) return { success: false, error: 'server_error' }
    return { success: true, needsOtp: true, userId: data.userId, phone: data.phone!, devOtp: data.devOtp }
  } catch { return { success: false, error: 'network_error' } }
}

export async function registerDeliveryPartner(params: DeliveryPartnerRegisterInput): Promise<RegisterResult> {
  try {
    const { ok, data } = await post<{ userId?: string; phone?: string; devOtp?: string; token?: string; user?: RawUser; error?: string }>(
      '/auth/delivery-partner-register', params
    )
    if (!ok) return { success: false, error: data.error ?? 'server_error' }
    if (data.token && data.user) return { success: true, needsOtp: false, user: persistSession(data.token, data.user) }
    if (!data.userId) return { success: false, error: 'server_error' }
    return { success: true, needsOtp: true, userId: data.userId, phone: data.phone!, devOtp: data.devOtp }
  } catch { return { success: false, error: 'network_error' } }
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  try {
    const { ok, status, data } = await post<{
      token?: string; user?: RawUser; error?: string; userId?: string; phone?: string; devOtp?: string
    }>('/auth/login', { identifier, password })

    if (ok && data.token && data.user) {
      const session = persistSession(data.token, data.user)
      if ((data.user.role ?? 'user') === 'user') {
        await getProfile()
      } else {
        await getVendorProfile()
      }
      return { success: true, user: session }
    }
    if (status === 403 && data.error === 'unverified' && data.userId) {
      return { success: false, needsOtp: true, userId: data.userId, phone: data.phone!, devOtp: data.devOtp, message: 'account_unverified_resend' }
    }
    return { success: false, error: data.error ?? 'invalid_credentials' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function verifyOtp(userId: string, code: string): Promise<VerifyOtpResult> {
  try {
    const { ok, data } = await post<{ token?: string; user?: RawUser; error?: string }>(
      '/auth/verify-otp', { userId, code }
    )
    if (ok && data.token && data.user) return { success: true, user: persistSession(data.token, data.user) }
    return { success: false, error: data.error ?? 'otp_invalid' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function resendOtp(userId: string): Promise<ResendOtpResult> {
  try {
    const { ok, data } = await post<{ message?: string; devOtp?: string; error?: string }>(
      '/auth/resend-otp', { userId }
    )
    if (ok) return { success: true, devOtp: data.devOtp }
    return { success: false, error: data.error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function forgotPassword(identifier: string): Promise<ForgotPasswordResult> {
  try {
    const { ok, data } = await post<{ message?: string; devToken?: string; error?: string }>('/auth/forgot-password', { identifier })
    if (ok) return { success: true, devToken: (data as { devToken?: string }).devToken }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function resetPassword(token: string, password: string): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ message?: string; error?: string }>('/auth/reset-password', { token, password })
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export function logout(): void {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    fetch(`${BASE}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
  }
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new CustomEvent('wm:logout'))
}

// ── Profile ───────────────────────────────────────────────────────────────────

interface RawProfile {
  id: string; first_name: string; last_name: string
  email: string | null; phone: string; phone_verified: boolean; created_at: string
}

function mapProfile(r: RawProfile): UserProfile {
  return { id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, phoneVerified: r.phone_verified, createdAt: r.created_at }
}

export async function getProfile(): Promise<ApiResult<UserProfile>> {
  try {
    const { ok, data } = await get<RawProfile & { error?: string }>('/user/profile')
    if (ok) return { success: true, data: mapProfile(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function requestProfileUpdate(firstName: string, lastName: string): Promise<OtpRequestResult> {
  try {
    const { ok, data } = await post<{ message?: string; phone?: string; devOtp?: string; otpRequired?: boolean; error?: string }>(
      '/user/profile/request-update', { firstName, lastName }
    )
    if (ok) return { success: true, phone: data.phone!, devOtp: data.devOtp, otpRequired: data.otpRequired ?? true }
    return { success: false, error: data.error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function confirmProfileUpdate(params: {
  firstName: string; lastName: string; email: string; otp?: string
}): Promise<ApiResult<UserProfile>> {
  try {
    const { ok, data } = await post<RawProfile & { error?: string }>('/user/profile/confirm-update', params)
    if (ok) return { success: true, data: mapProfile(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Addresses ─────────────────────────────────────────────────────────────────

interface RawAddress {
  id: string; user_id: string; label: string | null
  door_no: string | null; plot_no: string | null; building_name: string | null
  street_name: string; area_name: string; city: string; state: string; country: string
  pincode?: string | null
  is_default: boolean; created_at: string; updated_at: string
}

function mapAddress(r: RawAddress): Address {
  return {
    id: r.id, userId: r.user_id, label: r.label,
    doorNo: r.door_no, plotNo: r.plot_no, buildingName: r.building_name,
    streetName: r.street_name, areaName: r.area_name, city: r.city,
    state: r.state, pincode: r.pincode ?? null,
    country: r.country, isDefault: r.is_default,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function getAddresses(): Promise<ApiResult<Address[]>> {
  try {
    const { ok, data } = await get<RawAddress[] | { error?: string }>('/user/addresses')
    if (ok) return { success: true, data: (data as RawAddress[]).map(mapAddress) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function addAddress(input: AddressInput): Promise<ApiResult<Address>> {
  try {
    const { ok, data } = await post<RawAddress & { error?: string }>('/user/addresses', input)
    if (ok) return { success: true, data: mapAddress(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateAddress(id: string, input: AddressInput): Promise<ApiResult<Address>> {
  try {
    const { ok, data } = await put<RawAddress & { error?: string }>(`/user/addresses/${id}`, input)
    if (ok) return { success: true, data: mapAddress(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function deleteAddress(id: string): Promise<ApiResult> {
  try {
    const { ok, data } = await del<{ message?: string; error?: string }>(`/user/addresses/${id}`)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Orders ────────────────────────────────────────────────────────────────────

interface RawOrder {
  id: string; order_number: string; status: string; delivered_by: string | null
  delivery_door_no: string | null; delivery_plot_no: string | null; delivery_building_name: string | null
  delivery_street_name: string; delivery_area_name: string; delivery_city: string
  delivery_state: string; delivery_country: string
  delivery_pincode?: string | null; site_type?: string | null; site_sub_type?: string | null; time_slab?: string | null
  scheduled_at: string | null; accepted_at: string | null; preparing_at: string | null
  in_transit_at: string | null; delivered_at: string | null; created_at: string
  vendor_company: string | null; vendor_area: string | null; vendor_city: string | null
  vendor_phone: string | null; vendor_contact: string | null
  delivery_partner_id?: string | null; delivery_partner_name?: string | null
  delivery_partner_phone?: string | null; delivery_partner_email?: string | null
  delivery_partner_latitude?: number | null; delivery_partner_longitude?: number | null
  tanker_type_name?: string | null; tanker_image_url?: string | null; capacity_litres?: number | null
  quantity?: number; unit_price?: string | null; total_price?: string | null
  delivery_fee?: string | number | null; delivery_distance_km?: number | null
}

function mapOrder(r: RawOrder): Order {
  return {
    id: r.id, orderNumber: r.order_number, status: r.status as Order['status'],
    deliveredBy: r.delivered_by,
    deliveryDoorNo: r.delivery_door_no, deliveryPlotNo: r.delivery_plot_no,
    deliveryBuildingName: r.delivery_building_name,
    deliveryStreetName: r.delivery_street_name, deliveryAreaName: r.delivery_area_name,
    deliveryCity: r.delivery_city, deliveryState: r.delivery_state, deliveryCountry: r.delivery_country,
    deliveryPincode: r.delivery_pincode ?? null, siteType: r.site_type ?? null,
    siteSubType: r.site_sub_type ?? null, timeSlab: r.time_slab ?? null,
    scheduledAt: r.scheduled_at, acceptedAt: r.accepted_at, preparingAt: r.preparing_at,
    inTransitAt: r.in_transit_at, deliveredAt: r.delivered_at, createdAt: r.created_at,
    vendorCompany: r.vendor_company, vendorArea: r.vendor_area, vendorCity: r.vendor_city,
    vendorPhone: r.vendor_phone, vendorContact: r.vendor_contact,
    deliveryPartnerId: r.delivery_partner_id ?? null,
    deliveryPartnerName: r.delivery_partner_name ?? null,
    deliveryPartnerPhone: r.delivery_partner_phone ?? null,
    deliveryPartnerEmail: r.delivery_partner_email ?? null,
    deliveryPartnerLatitude:  r.delivery_partner_latitude ?? null,
    deliveryPartnerLongitude: r.delivery_partner_longitude ?? null,
    tankerTypeName: r.tanker_type_name ?? null,
    tankerImageUrl: r.tanker_image_url ?? null,
    capacityLitres: r.capacity_litres ?? null,
    quantity: r.quantity ?? 1,
    unitPrice:  r.unit_price  ? Number(r.unit_price)  : null,
    totalPrice: r.total_price ? Number(r.total_price) : null,
    deliveryFee:       r.delivery_fee != null ? Number(r.delivery_fee) : null,
    deliveryDistanceKm: r.delivery_distance_km != null ? Number(r.delivery_distance_km) : null,
  }
}

export async function getOrders(page = 1, limit = 20): Promise<ApiResult<Order[]>> {
  try {
    const { ok, data } = await get<{ data: RawOrder[]; total: number } | { error?: string }>(`/user/orders?page=${page}&limit=${limit}`)
    if (ok) return { success: true, data: (data as { data: RawOrder[] }).data.map(mapOrder) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function cancelOrder(id: string): Promise<ApiResult<Order>> {
  try {
    const { ok, data } = await httpPatch<RawOrder & { error?: string }>(`/user/orders/${id}/cancel`)
    if (ok) return { success: true, data: mapOrder(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getOrderSummary(): Promise<ApiResult<OrderSummary>> {
  try {
    const { ok, data } = await get<OrderSummary & { error?: string }>('/user/orders/summary')
    if (ok) return { success: true, data: data as OrderSummary }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getOrder(id: string): Promise<ApiResult<Order>> {
  try {
    const { ok, data } = await get<RawOrder & { error?: string }>(`/user/orders/${id}`)
    if (ok) return { success: true, data: mapOrder(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Vendor Dashboard ──────────────────────────────────────────────────────────

interface RawVendorOrder {
  id: string; order_number: string; status: string; user_id: string
  customer_name: string; customer_phone: string; customer_email?: string
  delivery_door_no: string | null; delivery_plot_no: string | null
  delivery_building_name: string | null; delivery_street_name: string
  delivery_area_name: string; delivery_city: string; delivery_state: string
  scheduled_at: string | null; accepted_at: string | null; preparing_at: string | null
  in_transit_at: string | null; delivered_at: string | null; created_at: string
  delivery_partner_id?: string | null; delivery_partner_name?: string | null
  delivery_partner_latitude?: number | null; delivery_partner_longitude?: number | null
}

function mapVendorOrder(r: RawVendorOrder): VendorOrder {
  return {
    id: r.id, orderNumber: r.order_number, status: r.status as VendorOrder['status'],
    userId: r.user_id, customerName: r.customer_name, customerPhone: r.customer_phone,
    customerEmail: r.customer_email,
    deliveryDoorNo: r.delivery_door_no, deliveryPlotNo: r.delivery_plot_no,
    deliveryBuildingName: r.delivery_building_name,
    deliveryStreetName: r.delivery_street_name, deliveryAreaName: r.delivery_area_name,
    deliveryCity: r.delivery_city, deliveryState: r.delivery_state,
    scheduledAt: r.scheduled_at, acceptedAt: r.accepted_at, preparingAt: r.preparing_at,
    inTransitAt: r.in_transit_at, deliveredAt: r.delivered_at, createdAt: r.created_at,
    deliveryPartnerId: r.delivery_partner_id ?? null,
    deliveryPartnerName: r.delivery_partner_name ?? null,
    deliveryPartnerLatitude: r.delivery_partner_latitude ?? null,
    deliveryPartnerLongitude: r.delivery_partner_longitude ?? null,
  }
}

export async function getVendorOrders(): Promise<ApiResult<{ available: VendorOrder[]; mine: VendorOrder[] }>> {
  try {
    const { ok, data } = await get<{ available: RawVendorOrder[]; mine: RawVendorOrder[] } & { error?: string }>('/vendor/orders')
    if (ok) {
      const d = data as { available: RawVendorOrder[]; mine: RawVendorOrder[] }
      return { success: true, data: { available: d.available.map(mapVendorOrder), mine: d.mine.map(mapVendorOrder) } }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function acceptOrder(id: string): Promise<ApiResult<VendorOrder>> {
  try {
    const { ok, data } = await httpPatch<RawVendorOrder & { error?: string }>(`/vendor/orders/${id}/accept`)
    if (ok) return { success: true, data: mapVendorOrder(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function rejectOrder(id: string): Promise<ApiResult<VendorOrder>> {
  try {
    const { ok, data } = await httpPatch<RawVendorOrder & { error?: string }>(`/vendor/orders/${id}/reject`)
    if (ok) return { success: true, data: mapVendorOrder(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateOrderStatus(id: string, status: string): Promise<ApiResult<VendorOrder>> {
  try {
    const { ok, data } = await httpPatch<RawVendorOrder & { error?: string }>(`/vendor/orders/${id}/status`, { status })
    if (ok) return { success: true, data: mapVendorOrder(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Vendor Profile ────────────────────────────────────────────────────────────

interface RawVendorProfile {
  id: string; company_name: string; street_name: string; area_name: string
  pincode: string; is_active: boolean
  city_id: string; city_name: string; state_id: string; state_name: string; state_code: string
}

function mapVendorProfile(r: RawVendorProfile): VendorProfile {
  return {
    id: r.id, companyName: r.company_name, streetName: r.street_name, areaName: r.area_name,
    pincode: r.pincode, isActive: r.is_active,
    cityId: r.city_id, cityName: r.city_name, stateId: r.state_id, stateName: r.state_name, stateCode: r.state_code,
  }
}

export async function getVendorProfile(): Promise<ApiResult<VendorProfile | null>> {
  try {
    const { ok, status, data } = await get<RawVendorProfile & { error?: string }>('/user/vendor-profile')
    if (ok) return { success: true, data: mapVendorProfile(data) }
    if (status === 404) return { success: true, data: null }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateVendorProfile(input: VendorProfileInput): Promise<ApiResult<VendorProfile>> {
  try {
    const { ok, data } = await put<RawVendorProfile & { error?: string }>('/user/vendor-profile', input)
    if (ok) return { success: true, data: mapVendorProfile(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Change Password ───────────────────────────────────────────────────────────

export async function requestPasswordChange(currentPassword: string): Promise<OtpRequestResult> {
  try {
    const { ok, data } = await post<{ message?: string; phone?: string; devOtp?: string; otpRequired?: boolean; error?: string }>(
      '/user/change-password/request', { currentPassword }
    )
    if (ok) return { success: true, phone: data.phone!, devOtp: data.devOtp, otpRequired: data.otpRequired ?? true }
    return { success: false, error: data.error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Notifications ─────────────────────────────────────────────────────────────

interface RawNotification {
  id: string; user_id: string; type: string; title: string
  message: string | null; order_id: string | null; is_read: boolean; created_at: string
}

function mapNotification(r: RawNotification): Notification {
  return { id: r.id, userId: r.user_id, type: r.type as Notification['type'], title: r.title, message: r.message, orderId: r.order_id, isRead: r.is_read, createdAt: r.created_at }
}

export async function getNotificationUnreadCount(): Promise<number> {
  try {
    const { ok, data } = await get<{ count: number }>('/user/notifications/unread-count')
    if (ok) return (data as { count: number }).count ?? 0
    return 0
  } catch { return 0 }
}

export async function getNotifications(page = 1, limit = 20): Promise<ApiResult<Notification[]>> {
  try {
    const { ok, data } = await get<{ data: RawNotification[]; total: number } | { error?: string }>(`/user/notifications?page=${page}&limit=${limit}`)
    if (ok) return { success: true, data: (data as { data: RawNotification[] }).data.map(mapNotification) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function markNotificationRead(id: string): Promise<ApiResult<Notification>> {
  try {
    const { ok, data } = await httpPatch<RawNotification & { error?: string }>(`/user/notifications/${id}/read`)
    if (ok) return { success: true, data: mapNotification(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function markAllNotificationsRead(): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ message?: string; error?: string }>('/user/notifications/read-all', {})
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Notification Preferences (server-side) ──────────────────────────────────

interface RawServerPrefs {
  id: string; user_id: string
  order_updates_in_app: boolean; order_updates_sms: boolean; order_updates_email: boolean
  payment_updates_in_app: boolean; payment_updates_sms: boolean; payment_updates_email: boolean
  delivery_updates_in_app: boolean; delivery_updates_sms: boolean; delivery_updates_email: boolean
  promotional_in_app: boolean; promotional_sms: boolean; promotional_email: boolean
  system_in_app: boolean; system_sms: boolean; system_email: boolean
  created_at: string; updated_at: string
}

function mapServerPrefs(r: RawServerPrefs): ServerNotificationPrefs {
  return {
    id: r.id, userId: r.user_id,
    orderUpdatesInApp: r.order_updates_in_app, orderUpdatesSms: r.order_updates_sms, orderUpdatesEmail: r.order_updates_email,
    paymentUpdatesInApp: r.payment_updates_in_app, paymentUpdatesSms: r.payment_updates_sms, paymentUpdatesEmail: r.payment_updates_email,
    deliveryUpdatesInApp: r.delivery_updates_in_app, deliveryUpdatesSms: r.delivery_updates_sms, deliveryUpdatesEmail: r.delivery_updates_email,
    promotionalInApp: r.promotional_in_app, promotionalSms: r.promotional_sms, promotionalEmail: r.promotional_email,
    systemInApp: r.system_in_app, systemSms: r.system_sms, systemEmail: r.system_email,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function getNotificationPreferences(basePath = '/user'): Promise<ApiResult<ServerNotificationPrefs>> {
  try {
    const { ok, data } = await get<RawServerPrefs & { error?: string }>(`${basePath}/notification-preferences`)
    if (ok) return { success: true, data: mapServerPrefs(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateNotificationPreferences(prefs: Partial<ServerNotificationPrefs>, basePath = '/user'): Promise<ApiResult<ServerNotificationPrefs>> {
  try {
    const body: Record<string, unknown> = {}
    if (prefs.orderUpdatesInApp !== undefined)     body.orderUpdatesInApp = prefs.orderUpdatesInApp
    if (prefs.orderUpdatesSms !== undefined)        body.orderUpdatesSms = prefs.orderUpdatesSms
    if (prefs.orderUpdatesEmail !== undefined)      body.orderUpdatesEmail = prefs.orderUpdatesEmail
    if (prefs.paymentUpdatesInApp !== undefined)    body.paymentUpdatesInApp = prefs.paymentUpdatesInApp
    if (prefs.paymentUpdatesSms !== undefined)      body.paymentUpdatesSms = prefs.paymentUpdatesSms
    if (prefs.paymentUpdatesEmail !== undefined)    body.paymentUpdatesEmail = prefs.paymentUpdatesEmail
    if (prefs.deliveryUpdatesInApp !== undefined)   body.deliveryUpdatesInApp = prefs.deliveryUpdatesInApp
    if (prefs.deliveryUpdatesSms !== undefined)     body.deliveryUpdatesSms = prefs.deliveryUpdatesSms
    if (prefs.deliveryUpdatesEmail !== undefined)   body.deliveryUpdatesEmail = prefs.deliveryUpdatesEmail
    if (prefs.promotionalInApp !== undefined)       body.promotionalInApp = prefs.promotionalInApp
    if (prefs.promotionalSms !== undefined)         body.promotionalSms = prefs.promotionalSms
    if (prefs.promotionalEmail !== undefined)       body.promotionalEmail = prefs.promotionalEmail
    if (prefs.systemInApp !== undefined)            body.systemInApp = prefs.systemInApp
    if (prefs.systemSms !== undefined)              body.systemSms = prefs.systemSms
    if (prefs.systemEmail !== undefined)            body.systemEmail = prefs.systemEmail
    const { ok, data } = await put<RawServerPrefs & { error?: string }>(`${basePath}/notification-preferences`, body)
    if (ok) return { success: true, data: mapServerPrefs(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Support ───────────────────────────────────────────────────────────────────

interface RawTicket { id: string; subject: string; status: string; created_at: string }

export async function submitSupportTicket(subject: string, message: string): Promise<ApiResult<SupportTicket>> {
  try {
    const { ok, data } = await post<RawTicket & { error?: string }>('/user/support/ticket', { subject, message })
    if (ok) return { success: true, data: { id: data.id, subject: data.subject, status: data.status as SupportTicket['status'], createdAt: data.created_at } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getSupportTickets(): Promise<ApiResult<SupportTicket[]>> {
  try {
    const { ok, data } = await get<RawTicket[] | { error?: string }>('/user/support/tickets')
    if (ok) return { success: true, data: (data as RawTicket[]).map(r => ({ id: r.id, subject: r.subject, status: r.status as SupportTicket['status'], createdAt: r.created_at })) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Admin: States ─────────────────────────────────────────────────────────────

interface RawState { id: string; name: string; state_code: string; country_code: string }

function mapState(r: RawState): State {
  return { id: r.id, name: r.name, stateCode: r.state_code, countryCode: r.country_code }
}

export async function getStates(): Promise<ApiResult<State[]>> {
  try {
    const { ok, data } = await get<RawState[] | { error?: string }>('/admin/states')
    if (ok) return { success: true, data: (data as RawState[]).map(mapState) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Admin: Cities ─────────────────────────────────────────────────────────────

interface RawCity {
  id: string; name: string; is_active: boolean; created_at: string; updated_at: string
  state_id: string; state_name: string; state_code: string
}

function mapCity(r: RawCity): City {
  return {
    id: r.id, name: r.name, isActive: r.is_active,
    stateId: r.state_id, stateName: r.state_name, stateCode: r.state_code,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function getCities(): Promise<ApiResult<City[]>> {
  try {
    const { ok, data } = await get<RawCity[] | { error?: string }>('/admin/cities')
    if (ok) return { success: true, data: (data as RawCity[]).map(mapCity) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function createCity(name: string, stateId: string): Promise<ApiResult<City>> {
  try {
    const { ok, data } = await post<RawCity & { error?: string }>('/admin/cities', { name, stateId })
    if (ok) return { success: true, data: mapCity(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateCity(id: string, name: string, stateId: string): Promise<ApiResult<City>> {
  try {
    const { ok, data } = await put<RawCity & { error?: string }>(`/admin/cities/${id}`, { name, stateId })
    if (ok) return { success: true, data: mapCity(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function toggleCityStatus(id: string, isActive: boolean): Promise<ApiResult<City>> {
  try {
    const { ok, data } = await httpPatch<RawCity & { error?: string }>(`/admin/cities/${id}/status`, { isActive })
    if (ok) return { success: true, data: mapCity(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Admin: Role management ────────────────────────────────────────────────────

interface RawManagedUser {
  id: string; first_name: string; last_name: string
  email: string | null; phone: string; created_at: string; role_name: string
}

function mapManagedUser(r: RawManagedUser): ManagedUser {
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name,
    email: r.email, phone: r.phone, createdAt: r.created_at,
    role: r.role_name as ManagedUser['role'],
  }
}

export async function getManagedUsers(): Promise<ApiResult<ManagedUser[]>> {
  try {
    const { ok, data } = await get<RawManagedUser[] | { error?: string }>('/admin/users')
    if (ok) return { success: true, data: (data as RawManagedUser[]).map(mapManagedUser) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateUserRole(userId: string, role: AssignableRole): Promise<ApiResult<ManagedUser>> {
  try {
    const { ok, data } = await httpPatch<RawManagedUser & { error?: string }>(`/admin/users/${userId}/role`, { role })
    if (ok) return { success: true, data: mapManagedUser(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

interface RawRoleHistory {
  id: string; created_at: string
  user_name: string; user_phone: string; changed_by_name: string
  old_role: string | null; new_role: string | null
}

function mapRoleHistory(r: RawRoleHistory): RoleHistoryEntry {
  return {
    id: r.id, createdAt: r.created_at,
    userName: r.user_name, userPhone: r.user_phone, changedByName: r.changed_by_name,
    oldRole: r.old_role, newRole: r.new_role,
  }
}

export async function getRoleHistory(): Promise<ApiResult<RoleHistoryEntry[]>> {
  try {
    const { ok, data } = await get<RawRoleHistory[] | { error?: string }>('/admin/role-history')
    if (ok) return { success: true, data: (data as RawRoleHistory[]).map(mapRoleHistory) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Tanker Types ──────────────────────────────────────────────────────────────

interface RawTankerType {
  id: string; name: string; capacity_litres: number; base_price: number
  is_active: boolean; display_order: number; image_url?: string | null
  created_at: string; updated_at: string
}

function mapTankerType(r: RawTankerType): TankerType {
  return {
    id: r.id, name: r.name, capacityLitres: r.capacity_litres,
    basePrice: Number(r.base_price), isActive: r.is_active,
    displayOrder: r.display_order, imageUrl: r.image_url ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function uploadTankerImage(file: File): Promise<ApiResult<{ imageUrl: string }>> {
  try {
    const token = localStorage.getItem('wm_token')
    const form  = new FormData()
    form.append('image', file)
    const res  = await fetch(`${BASE}/admin/tanker-types/upload-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const data = await res.json() as { imageUrl?: string; error?: string }
    if (res.ok && data.imageUrl) return { success: true, data: { imageUrl: data.imageUrl } }
    return { success: false, error: data.error ?? 'upload_failed' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getPublicTankerTypes(): Promise<ApiResult<TankerType[]>> {
  try {
    const { ok, data } = await publicGet<RawTankerType[] | { error?: string }>('/public/tanker-types')
    if (ok) return { success: true, data: (data as RawTankerType[]).map(mapTankerType) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getAdminTankerTypes(): Promise<ApiResult<TankerType[]>> {
  try {
    const { ok, data } = await get<RawTankerType[] | { error?: string }>('/admin/tanker-types')
    if (ok) return { success: true, data: (data as RawTankerType[]).map(mapTankerType) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function createTankerType(input: { name: string; capacityLitres: number; basePrice: number; displayOrder?: number; imageUrl?: string | null }): Promise<ApiResult<TankerType>> {
  try {
    const { ok, data } = await post<RawTankerType & { error?: string }>('/admin/tanker-types', input)
    if (ok) return { success: true, data: mapTankerType(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateTankerType(id: string, input: { name: string; capacityLitres: number; basePrice: number; displayOrder?: number; imageUrl?: string | null }): Promise<ApiResult<TankerType>> {
  try {
    const { ok, data } = await put<RawTankerType & { error?: string }>(`/admin/tanker-types/${id}`, input)
    if (ok) return { success: true, data: mapTankerType(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function toggleTankerTypeStatus(id: string, isActive: boolean): Promise<ApiResult<TankerType>> {
  try {
    const { ok, data } = await httpPatch<RawTankerType & { error?: string }>(`/admin/tanker-types/${id}/status`, { isActive })
    if (ok) return { success: true, data: mapTankerType(data) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Orders (user) ─────────────────────────────────────────────────────────────

export async function placeOrder(input: PlaceOrderInput): Promise<ApiResult<PlacedOrder>> {
  try {
    const { ok, data } = await post<{
      id?: string; order_number?: string; status?: string; scheduled_at?: string | null; created_at?: string
      total_price?: string | null; unit_price?: string | null; quantity?: number; tanker_type_id?: string | null
      devOtp?: string
      error?: string
    }>('/user/orders', input)
    if (ok && data.id) return {
      success: true, data: {
        id: data.id, orderNumber: data.order_number!, status: data.status!,
        scheduledAt: data.scheduled_at ?? null, createdAt: data.created_at!,
        totalPrice: data.total_price ? Number(data.total_price) : null,
        unitPrice:  data.unit_price  ? Number(data.unit_price)  : null,
        quantity:   data.quantity    ?? 1,
        tankerTypeId: data.tanker_type_id ?? null,
        devOtp:       data.devOtp,
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function initiatePayment(orderId: string): Promise<ApiResult<PaymentInitResult>> {
  try {
    const { ok, data } = await post<PaymentInitResult & { error?: string }>(`/user/orders/${orderId}/payment/initiate`, {})
    if (ok) return { success: true, data: data as PaymentInitResult }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function verifyPayment(orderId: string, params: {
  razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string
}): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ error?: string }>(`/user/orders/${orderId}/payment/verify`, params)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Vendor Earnings ───────────────────────────────────────────────────────────

export interface VendorEarnings {
  totalEarned:     number
  thisMonth:       number
  thisWeek:        number
  totalDeliveries: number
  activeOrders:    number
  isOnline:        boolean
}

export async function getVendorEarnings(): Promise<ApiResult<VendorEarnings>> {
  try {
    const { ok, data } = await get<{
      total_earned?: string; this_month?: string; this_week?: string
      total_deliveries?: number; active_orders?: number; isOnline?: boolean; error?: string
    }>('/vendor/earnings')
    if (ok) return {
      success: true,
      data: {
        totalEarned:     Number((data as { total_earned?: string }).total_earned ?? 0),
        thisMonth:       Number((data as { this_month?: string }).this_month     ?? 0),
        thisWeek:        Number((data as { this_week?: string }).this_week       ?? 0),
        totalDeliveries: Number((data as { total_deliveries?: number }).total_deliveries ?? 0),
        activeOrders:    Number((data as { active_orders?: number }).active_orders ?? 0),
        isOnline:        !!(data as { isOnline?: boolean }).isOnline,
      },
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function setVendorWorkMode(isOnline: boolean): Promise<ApiResult<{ isOnline: boolean }>> {
  try {
    const { ok, data } = await httpPatch<{ isOnline?: boolean; error?: string }>('/vendor/work-mode', { isOnline })
    if (ok) return { success: true, data: { isOnline: !!(data as { isOnline?: boolean }).isOnline } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function rateOrder(orderId: string, rating: number, review?: string): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ id?: string; error?: string }>(`/user/orders/${orderId}/rate`, { rating, review })
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function markOrderCod(orderId: string): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ error?: string }>(`/user/orders/${orderId}/payment/cod`, {})
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Vendor tanker fleet ───────────────────────────────────────────────────────

export async function getMyTankers(): Promise<ApiResult<VendorTanker[]>> {
  try {
    const { ok, data } = await get<VendorTanker[] | { error?: string }>('/vendor/tankers')
    if (ok) return { success: true, data: data as VendorTanker[] }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function addTanker(payload: {
  registrationNo: string; capacityLiters: number; tankerTypeId?: string; notes?: string
}): Promise<ApiResult<VendorTanker>> {
  try {
    const { ok, data } = await post<VendorTanker | { error?: string }>('/vendor/tankers', payload)
    if (ok) return { success: true, data: data as VendorTanker }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateTanker(id: string, payload: {
  registrationNo?: string; capacityLiters?: number; tankerTypeId?: string; notes?: string
}): Promise<ApiResult<VendorTanker>> {
  try {
    const { ok, data } = await httpPatch<VendorTanker | { error?: string }>(`/vendor/tankers/${id}`, payload)
    if (ok) return { success: true, data: data as VendorTanker }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function toggleTankerActive(id: string): Promise<ApiResult<{ id: string; isActive: boolean }>> {
  try {
    const { ok, data } = await httpPatch<{ id?: string; isActive?: boolean; error?: string }>(`/vendor/tankers/${id}/toggle`, {})
    if (ok) return { success: true, data: data as { id: string; isActive: boolean } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function deleteTanker(id: string): Promise<ApiResult> {
  try {
    const { ok, data } = await del<{ deleted?: boolean; error?: string }>(`/vendor/tankers/${id}`)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function confirmPasswordChange(newPassword: string, otp?: string): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ message?: string; error?: string }>(
      '/user/change-password/confirm', { newPassword, otp }
    )
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Delivery Partner APIs ────────────────────────────────────────────────────

import type {
  DeliveryPartnerProfile,
  DeliveryDashboard,
  DeliveryStatusResponse,
  DeliveryAssignment,
  DeliveryOrderDetail,
  DeliveryEarnings,
  DeliveryListItem,
  VendorDeliveryPartner,
  AddDeliveryPartnerInput,
  DeliveryAssignmentHistory,
  DeliverySettings,
} from '../types'

export async function getDeliveryProfile(): Promise<ApiResult<DeliveryPartnerProfile>> {
  try {
    const { ok, data } = await get<DeliveryPartnerProfile | { error?: string }>('/delivery/me')
    if (ok) return { success: true, data: data as DeliveryPartnerProfile }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getDeliveryStatus(): Promise<ApiResult<DeliveryStatusResponse>> {
  try {
    const { ok, data } = await get<DeliveryStatusResponse | { error?: string }>('/delivery/status')
    if (ok) return { success: true, data: data as DeliveryStatusResponse }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateDeliveryProfile(payload: {
  vehicleType?: string; vehicleNumber?: string; hasLicense?: boolean;
  licenseNumber?: string; serviceArea?: string;
}): Promise<ApiResult> {
  try {
    const { ok, data } = await httpPatch<{ message?: string; error?: string }>('/delivery/profile', payload)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function toggleDeliveryAvailability(payload: {
  isOnline?: boolean; isAvailable?: boolean;
}): Promise<ApiResult<{ isOnline: boolean; isAvailable: boolean }>> {
  try {
    const { ok, data } = await httpPatch<{ isOnline?: boolean; isAvailable?: boolean; error?: string }>(
      '/delivery/availability', payload
    )
    if (ok) return { success: true, data: data as { isOnline: boolean; isAvailable: boolean } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateDeliveryLocation(payload: {
  latitude: number; longitude: number; orderId?: string;
}): Promise<ApiResult> {
  try {
    const { ok, data } = await httpPatch<{ message?: string; error?: string }>('/delivery/location', payload)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

function mapDeliveryAssignment(r: Record<string, unknown>): DeliveryAssignment {
  return {
    assignmentId:       r.assignment_id as string || r.assignmentId as string || '',
    assignmentStatus:   r.assignment_status as string || r.assignmentStatus as string || '',
    expiresAt:          (r.expires_at as string) ?? (r.expiresAt as string) ?? null,
    orderId:            r.order_id as string || r.orderId as string || '',
    orderNumber:        r.order_number as string || r.orderNumber as string || '',
    deliveryAreaName:   r.delivery_area_name as string || r.deliveryAreaName as string || '',
    deliveryCity:       r.delivery_city as string || r.deliveryCity as string || '',
    quantity:           r.quantity as number,
    tankerTypeName:     r.tanker_type_name as string ?? (r.tankerTypeName as string) ?? null,
    capacityLitres:     r.capacity_litres as number ?? (r.capacityLitres as number) ?? null,
    vendorCompany:      r.vendor_company as string || r.vendorCompany as string || '',
  }
}

function mapDeliveryOrderDetail(r: Record<string, unknown>): DeliveryOrderDetail {
  return {
    id:            r.id as string,
    orderNumber:   r.order_number as string || r.orderNumber as string || '',
    status:        r.status as string,
    customerName:  r.customer_name as string || r.customerName as string || '',
    customerPhone: r.customer_phone as string || r.customerPhone as string || '',
    pickup: {
      company: (r.pickup as Record<string, unknown>)?.company as string || '',
      street:  (r.pickup as Record<string, unknown>)?.street as string ?? null,
      area:    (r.pickup as Record<string, unknown>)?.area as string ?? null,
      city:    (r.pickup as Record<string, unknown>)?.city as string ?? null,
    },
    delivery: {
      doorNo:     (r.delivery as Record<string, unknown>)?.doorNo as string ?? null,
      streetName: (r.delivery as Record<string, unknown>)?.streetName as string ?? null,
      areaName:   (r.delivery as Record<string, unknown>)?.areaName as string ?? null,
      city:       (r.delivery as Record<string, unknown>)?.city as string ?? null,
      state:      (r.delivery as Record<string, unknown>)?.state as string ?? null,
      latitude:   (r.delivery as Record<string, unknown>)?.latitude as number ?? null,
      longitude:  (r.delivery as Record<string, unknown>)?.longitude as number ?? null,
    },
    items: {
      tankerTypeName: (r.items as Record<string, unknown>)?.tankerTypeName as string ?? null,
      capacityLitres: (r.items as Record<string, unknown>)?.capacityLitres as number ?? null,
      quantity:       (r.items as Record<string, unknown>)?.quantity as number || 0,
    },
    timestamps: {
      acceptedAt:       (r.timestamps as Record<string, unknown>)?.acceptedAt as string ?? null,
      readyAt:          (r.timestamps as Record<string, unknown>)?.readyAt as string ?? null,
      assignedAt:       (r.timestamps as Record<string, unknown>)?.assignedAt as string ?? null,
      pickedUpAt:       (r.timestamps as Record<string, unknown>)?.pickedUpAt as string ?? null,
      outForDeliveryAt: (r.timestamps as Record<string, unknown>)?.outForDeliveryAt as string ?? null,
      deliveredAt:      (r.timestamps as Record<string, unknown>)?.deliveredAt as string ?? null,
    },
    createdAt: r.created_at as string || r.createdAt as string || '',
  }
}

export async function getDeliveryDashboard(): Promise<ApiResult<DeliveryDashboard>> {
  try {
    const { ok, data } = await get<Record<string, unknown> | { error?: string }>('/delivery/dashboard')
    if (ok) {
      const d = data as Record<string, unknown>
      return {
        success: true,
        data: {
          status:       (d.status as string) || 'pending',
          isOnline:     !!d.isOnline,
          isAvailable:  !!d.isAvailable,
          pendingRequests: ((d.pendingRequests as Record<string, unknown>[]) || []).map(mapDeliveryAssignment),
          activeDelivery: d.activeDelivery
            ? {
                id: (d.activeDelivery as Record<string, unknown>).id as string,
                orderNumber: (d.activeDelivery as Record<string, unknown>).order_number as string ||
                             (d.activeDelivery as Record<string, unknown>).orderNumber as string || '',
                status: (d.activeDelivery as Record<string, unknown>).status as string,
                deliveryPartnerId: (d.activeDelivery as Record<string, unknown>).delivery_partner_id as string ||
                                   (d.activeDelivery as Record<string, unknown>).deliveryPartnerId as string || null,
              }
            : null,
          todayDeliveries: Number(d.todayDeliveries ?? d.todayDeliveriesCount ?? 0),
          todayEarnings: Number(d.todayEarnings ?? 0),
          earningsPerDelivery: Number(d.earningsPerDelivery ?? 0),
          deliveryFees: {
            fee5km: Number((d.deliveryFees as { fee5km?: number } | undefined)?.fee5km ?? d.earningsPerDelivery ?? 0),
            fee7km: Number((d.deliveryFees as { fee7km?: number } | undefined)?.fee7km ?? d.earningsPerDelivery ?? 0),
          },
          totalEarned: Number(d.totalEarned ?? 0),
          thisMonth: Number(d.thisMonth ?? 0),
          thisWeek: Number(d.thisWeek ?? 0),
          totalDeliveries: Number(d.totalDeliveries ?? 0),
          todayDeliveriesCount: Number(d.todayDeliveriesCount ?? d.todayDeliveries ?? 0),
        },
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getDeliveryOrderDetail(orderId: string): Promise<ApiResult<DeliveryOrderDetail>> {
  try {
    const { ok, data } = await get<Record<string, unknown> | { error?: string }>(`/delivery/orders/${orderId}`)
    if (ok) return { success: true, data: mapDeliveryOrderDetail(data as Record<string, unknown>) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getDeliveryRequests(): Promise<ApiResult<DeliveryAssignment[]>> {
  try {
    const { ok, data } = await get<Record<string, unknown>[] | { error?: string }>('/delivery/requests')
    if (ok) return { success: true, data: (data as Record<string, unknown>[]).map(mapDeliveryAssignment) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function acceptDeliveryRequest(assignmentId: string): Promise<ApiResult<{ orderId: string; status: string }>> {
  try {
    const { ok, data } = await post<{ message?: string; orderId?: string; status?: string; error?: string }>(
      `/delivery/requests/${assignmentId}/accept`, {}
    )
    if (ok) return { success: true, data: data as { orderId: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function rejectDeliveryRequest(assignmentId: string): Promise<ApiResult> {
  try {
    const { ok, data } = await post<{ message?: string; error?: string }>(
      `/delivery/requests/${assignmentId}/reject`, {}
    )
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function advanceDeliveryStatus(orderId: string, status: string, payload?: {
  latitude?: number; longitude?: number;
}): Promise<ApiResult<{ id: string; orderNumber: string; status: string }>> {
  try {
    const { ok, data } = await httpPatch<{ id?: string; orderNumber?: string; status?: string; error?: string }>(
      `/delivery/orders/${orderId}/status`, { status, ...payload }
    )
    if (ok) return { success: true, data: data as { id: string; orderNumber: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function confirmDeliveryOtp(orderId: string, otp: string, payload?: {
  latitude?: number; longitude?: number;
}): Promise<ApiResult<{ orderNumber: string; status: string }>> {
  try {
    const { ok, data } = await post<{ message?: string; orderNumber?: string; status?: string; error?: string }>(
      `/delivery/orders/${orderId}/confirm-otp`, { otp, ...payload }
    )
    if (ok) return { success: true, data: data as { orderNumber: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

function mapDeliveryListItem(r: Record<string, unknown>): DeliveryListItem {
  return {
    id:               r.id as string,
    orderNumber:      r.order_number as string || r.orderNumber as string || '',
    status:           r.status as string,
    deliveryAreaName: r.delivery_area_name as string ?? (r.deliveryAreaName as string) ?? null,
    deliveryCity:     r.delivery_city as string ?? (r.deliveryCity as string) ?? null,
    deliveredAt:      r.delivered_at as string ?? (r.deliveredAt as string) ?? null,
    createdAt:        r.created_at as string || r.createdAt as string || '',
    customerName:     r.customer_name as string || r.customerName as string || '',
    tankerTypeName:   r.tanker_type_name as string ?? (r.tankerTypeName as string) ?? null,
    quantity:         r.quantity as number || 0,
  }
}

export async function getDeliveryEarnings(): Promise<ApiResult<DeliveryEarnings>> {
  try {
    const { ok, data } = await get<Record<string, unknown> | { error?: string }>('/delivery/earnings')
    if (ok) {
      const d = data as Record<string, unknown>
      const fees = (d.deliveryFees as { fee5km?: number; fee7km?: number } | undefined)
      return {
        success: true,
        data: {
          earningsPerDelivery: Number(d.earningsPerDelivery ?? 0),
          deliveryFees: {
            fee5km: Number(fees?.fee5km ?? d.earningsPerDelivery ?? 0),
            fee7km: Number(fees?.fee7km ?? d.earningsPerDelivery ?? 0),
          },
          totalEarned: Number(d.totalEarned ?? 0),
          thisMonth: Number(d.thisMonth ?? 0),
          thisWeek: Number(d.thisWeek ?? 0),
          todayEarnings: Number(d.todayEarnings ?? 0),
          history: ((d.history as Record<string, unknown>[]) || []).map((h) => ({
            id: h.id as string,
            orderNumber: h.orderNumber as string || '',
            deliveredAt: h.deliveredAt as string ?? null,
            createdAt: h.createdAt as string || '',
            area: h.area as string ?? null,
            city: h.city as string ?? null,
            earnings: Number(h.earnings ?? 0),
            distanceKm: h.distanceKm != null ? Number(h.distanceKm) : null,
          })),
        },
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getDeliveryDeliveries(): Promise<ApiResult<DeliveryListItem[]>> {
  try {
    const { ok, data } = await get<Record<string, unknown>[] | { error?: string }>('/delivery/deliveries')
    if (ok) return { success: true, data: (data as Record<string, unknown>[]).map(mapDeliveryListItem) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Vendor → Delivery Partner management ──────────────────────────────────────

export async function getVendorDeliveryPartners(): Promise<ApiResult<VendorDeliveryPartner[]>> {
  try {
    const { ok, data } = await get<VendorDeliveryPartner[] | { error?: string }>('/vendor/delivery-partners')
    if (ok) return { success: true, data: data as VendorDeliveryPartner[] }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function addVendorDeliveryPartner(payload: AddDeliveryPartnerInput): Promise<ApiResult<VendorDeliveryPartner>> {
  try {
    const { ok, data } = await post<VendorDeliveryPartner | { error?: string }>('/vendor/delivery-partners', payload)
    if (ok) return { success: true, data: data as VendorDeliveryPartner }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getVendorDeliveryPartnerDetail(partnerId: string): Promise<ApiResult<VendorDeliveryPartner>> {
  try {
    const { ok, data } = await get<VendorDeliveryPartner | { error?: string }>(`/vendor/delivery-partners/${partnerId}`)
    if (ok) return { success: true, data: data as VendorDeliveryPartner }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateVendorDeliveryPartnerStatus(partnerId: string, status: string): Promise<ApiResult<{ id: string; status: string }>> {
  try {
    const { ok, data } = await httpPatch<{ id?: string; status?: string; error?: string }>(
      `/vendor/delivery-partners/${partnerId}/status`, { status }
    )
    if (ok) return { success: true, data: data as { id: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function removeVendorDeliveryPartner(partnerId: string): Promise<ApiResult> {
  try {
    const { ok, data } = await del<{ deleted?: boolean; error?: string }>(`/vendor/delivery-partners/${partnerId}`)
    if (ok) return { success: true, data: undefined }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getUnassignedDeliveryPartners(): Promise<ApiResult<VendorDeliveryPartner[]>> {
  try {
    const { ok, data } = await get<VendorDeliveryPartner[] | { error?: string }>('/vendor/delivery-partners/unassigned')
    if (ok) return { success: true, data: data as VendorDeliveryPartner[] }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function claimDeliveryPartner(partnerId: string): Promise<ApiResult<{ id: string; status: string }>> {
  try {
    const { ok, data } = await post<{ id?: string; status?: string; error?: string }>(
      `/vendor/delivery-partners/${partnerId}/claim`, {}
    )
    if (ok) return { success: true, data: data as { id: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getVendorDeliverySettings(): Promise<ApiResult<DeliverySettings>> {
  try {
    const { ok, data } = await get<Record<string, unknown> | { error?: string }>('/vendor/delivery-settings')
    if (ok) {
      const s = data as Record<string, unknown>
      return {
        success: true,
        data: {
          earningsPerDelivery: Number(s.earningsPerDelivery ?? 0),
          fee5km: Number(s.fee5km ?? 600),
          fee7km: Number(s.fee7km ?? 700),
          autoAssign: !!s.autoAssign,
          assignTimeoutSec: Number(s.assignTimeoutSec ?? 90),
        },
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateVendorDeliverySettings(payload: {
  earningsPerDelivery?: number; fee5km?: number; fee7km?: number; autoAssign?: boolean; assignTimeoutSec?: number;
}): Promise<ApiResult<DeliverySettings>> {
  try {
    const { ok, data } = await put<Record<string, unknown> | { error?: string }>('/vendor/delivery-settings', payload)
    if (ok) {
      const s = data as Record<string, unknown>
      return {
        success: true,
        data: {
          earningsPerDelivery: Number(s.earningsPerDelivery ?? 0),
          fee5km: Number(s.fee5km ?? 600),
          fee7km: Number(s.fee7km ?? 700),
          autoAssign: !!s.autoAssign,
          assignTimeoutSec: Number(s.assignTimeoutSec ?? 90),
        },
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getVendorOrderAssignments(orderId: string): Promise<ApiResult<DeliveryAssignmentHistory[]>> {
  try {
    const { ok, data } = await get<DeliveryAssignmentHistory[] | { error?: string }>(`/vendor/orders/${orderId}/assignments`)
    if (ok) return { success: true, data: data as DeliveryAssignmentHistory[] }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getAvailableDeliveryPartners(orderId: string): Promise<ApiResult<VendorDeliveryPartner[]>> {
  try {
    const { ok, data } = await get<VendorDeliveryPartner[] | { error?: string }>(`/vendor/orders/${orderId}/available-partners`)
    if (ok) return { success: true, data: data as VendorDeliveryPartner[] }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function assignDeliveryPartner(orderId: string, deliveryPartnerId: string): Promise<ApiResult<{ assignmentId: string; orderId: string; status: string }>> {
  try {
    const { ok, data } = await post<{ assignmentId?: string; orderId?: string; status?: string; error?: string }>(
      `/vendor/orders/${orderId}/assign`, { deliveryPartnerId }
    )
    if (ok) return { success: true, data: data as { assignmentId: string; orderId: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function autoAssignDeliveryPartner(orderId: string): Promise<ApiResult<{ assignmentId: string; orderId: string; status: string; partnerId: string }>> {
  try {
    const { ok, data } = await post<{ assignmentId?: string; orderId?: string; status?: string; partnerId?: string; error?: string }>(
      `/vendor/orders/${orderId}/auto-assign`, {}
    )
    if (ok) return { success: true, data: data as { assignmentId: string; orderId: string; status: string; partnerId: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function generateDeliveryOtp(orderId: string): Promise<ApiResult<{ devOtp?: string }>> {
  try {
    const { ok, data } = await post<{ message?: string; devOtp?: string; error?: string }>(
    `/vendor/orders/${orderId}/generate-delivery-otp`, {}
    )
    if (ok) return { success: true, data: data as { devOtp?: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

// ── Admin: Delivery Partners ─────────────────────────────────────────────────

import type { AdminDeliveryPartner } from '../types'

function mapAdminDeliveryPartner(r: Record<string, unknown>): AdminDeliveryPartner {
  return {
    id:              r.id as string,
    userId:          r.user_id as string,
    firstName:       r.first_name as string,
    lastName:        r.last_name as string,
    email:           r.email as string | null,
    phone:           r.phone as string,
    vehicleType:     r.vehicle_type as string | null,
    vehicleNumber:   r.vehicle_number as string | null,
    hasLicense:      r.has_license as boolean,
    serviceArea:     r.service_area as string | null,
    isOnline:        r.is_online as boolean,
    isAvailable:     r.is_available as boolean,
    status:          r.status as AdminDeliveryPartner['status'],
    vendorId:        r.vendor_id as string,
    vendorName:      r.vendor_name as string,
    totalDeliveries: r.total_deliveries as number,
    activeOrders:    r.active_orders as number,
    createdAt:       r.created_at as string,
  }
}

export async function getAdminDeliveryPartners(page?: number, status?: string): Promise<ApiResult<{ data: AdminDeliveryPartner[]; total: number; page: number; pageSize: number }>> {
  try {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (status) params.set('status', status)
    const qs = params.toString()
    const { ok, data } = await get<{ data?: Record<string, unknown>[]; total?: number; page?: number; pageSize?: number; error?: string }>(
      `/admin/delivery-partners${qs ? `?${qs}` : ''}`
    )
    if (ok) {
      return {
        success: true,
        data: {
          data: (data.data ?? []).map(mapAdminDeliveryPartner),
          total: data.total ?? 0,
          page: data.page ?? 1,
          pageSize: data.pageSize ?? 50,
        },
      }
    }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function getAdminDeliveryPartnerDetail(partnerId: string): Promise<ApiResult<AdminDeliveryPartner>> {
  try {
    const { ok, data } = await get<Record<string, unknown> | { error?: string }>(`/admin/delivery-partners/${partnerId}`)
    if (ok) return { success: true, data: mapAdminDeliveryPartner(data as Record<string, unknown>) }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}

export async function updateAdminDeliveryPartnerStatus(partnerId: string, status: string): Promise<ApiResult<{ id: string; status: string }>> {
  try {
    const { ok, data } = await httpPatch<{ id?: string; status?: string; error?: string }>(
      `/admin/delivery-partners/${partnerId}/status`, { status }
    )
    if (ok) return { success: true, data: data as { id: string; status: string } }
    return { success: false, error: (data as { error?: string }).error ?? 'server_error' }
  } catch { return { success: false, error: 'network_error' } }
}
