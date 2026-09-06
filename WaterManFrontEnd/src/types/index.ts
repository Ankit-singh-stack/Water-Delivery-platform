// ── App navigation ────────────────────────────────────────────────────────────
export type Page     = 'home' | 'auth' | 'profile' | 'admin' | 'order' | 'tracking' | 'vendor' | 'delivery'
export type AuthMode = 'login' | 'signup' | 'otp' | 'forgot' | 'forgot-confirm' | 'vendor-signup' | 'delivery-signup'

// ── Font size ─────────────────────────────────────────────────────────────────
export type FontSizeKey = 'small' | 'medium' | 'large'

// ── Auth domain ───────────────────────────────────────────────────────────────
export interface OtpPending {
  userId:  string
  phone:   string
  devOtp?: string
}

export interface Session {
  userId: string
  name:   string
  email:  string
  phone:  string
  role:   string
}

export interface MockUser {
  id:            string
  firstName:     string
  lastName:      string
  email:         string
  phone:         string
  password:      string
  isOtpVerified: boolean
  otp:           string | null
  otpSentAt:     number | null
  createdAt:     string
}

// ── User profile ──────────────────────────────────────────────────────────────
export interface UserProfile {
  id:            string
  firstName:     string
  lastName:      string
  email:         string | null
  phone:         string
  phoneVerified: boolean
  createdAt:     string
}

// ── Address ───────────────────────────────────────────────────────────────────
export interface Address {
  id:           string
  userId:       string
  label:        string | null
  doorNo:       string | null
  plotNo:       string | null
  buildingName: string | null
  streetName:   string
  areaName:     string
  city:         string
  state:        string
  pincode:      string | null
  country:      string
  isDefault:    boolean
  createdAt:    string
  updatedAt:    string
}

export interface AddressInput {
  label?:        string
  doorNo?:       string
  plotNo?:       string
  buildingName?: string
  streetName:    string
  areaName:      string
  city:          string
  state:         string
  country?:      string
  isDefault?:    boolean
}

// ── Orders ────────────────────────────────────────────────────────────────────
export type OrderStatus =
  | 'draft' | 'confirmed' | 'accepted' | 'preparing' | 'ready_for_pickup'
  | 'assigned' | 'delivery_accepted' | 'arrived_at_pickup' | 'picked_up'
  | 'in_transit' | 'out_for_delivery' | 'arrived_at_customer'
  | 'delivered' | 'failed' | 'rejected' | 'cancelled'

export interface Order {
  id:                   string
  orderNumber:          string
  status:               OrderStatus
  deliveredBy:          string | null
  deliveryDoorNo:       string | null
  deliveryPlotNo:       string | null
  deliveryBuildingName: string | null
  deliveryStreetName:   string
  deliveryAreaName:     string
  deliveryCity:         string
  deliveryState:        string
  deliveryPincode:      string | null
  deliveryCountry:      string
  siteType:             string | null
  siteSubType:          string | null
  timeSlab:             string | null
  scheduledAt:          string | null
  acceptedAt:           string | null
  preparingAt:          string | null
  inTransitAt:          string | null
  deliveredAt:          string | null
  createdAt:            string
  // vendor info (populated when accepted)
  vendorCompany:   string | null
  vendorArea:      string | null
  vendorCity:      string | null
  vendorPhone:     string | null
  vendorContact:   string | null
  // delivery partner info (populated when a partner is assigned)
  deliveryPartnerId:    string | null
  deliveryPartnerName:  string | null
  deliveryPartnerPhone: string | null
  deliveryPartnerEmail: string | null
  deliveryPartnerLatitude:   number | null
  deliveryPartnerLongitude:  number | null
  // tanker & pricing
  tankerTypeName:  string | null
  tankerImageUrl:  string | null
  capacityLitres:  number | null
  quantity:        number
  unitPrice:       number | null
  totalPrice:      number | null
  // distance-based delivery fee, recorded once the delivery is completed
  deliveryFee:       number | null
  deliveryDistanceKm: number | null
}

export interface VendorOrder {
  id:                   string
  orderNumber:          string
  status:               OrderStatus
  userId:               string
  customerName:         string
  customerPhone?:       string
  customerEmail?:       string
  deliveryDoorNo:       string | null
  deliveryPlotNo:       string | null
  deliveryBuildingName: string | null
  deliveryStreetName:   string
  deliveryAreaName:     string
  deliveryCity:         string
  deliveryState:        string
  scheduledAt:          string | null
  acceptedAt:           string | null
  preparingAt:          string | null
  inTransitAt:          string | null
  deliveredAt:          string | null
  createdAt:            string
  // delivery partner info (populated when a partner is assigned)
  deliveryPartnerId:          string | null
  deliveryPartnerName:        string | null
  deliveryPartnerLatitude:    number | null
  deliveryPartnerLongitude:   number | null
}

export interface OrderSummary {
  active:    number
  delivered: number
  failed:    number
  rejected:  number
  cancelled: number
  total:     number
}

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotificationType = 'order' | 'delivery' | 'system' | 'promo'

export interface Notification {
  id:        string
  userId:    string
  type:      NotificationType
  title:     string
  message:   string | null
  orderId:   string | null
  isRead:    boolean
  createdAt: string
}

export interface NotificationPrefs {
  orderUpdates:         boolean
  deliveryAlerts:       boolean
  promotions:           boolean
  systemNotifications:  boolean
}

export interface ServerNotificationPrefs {
  id:                    string
  userId:                string
  orderUpdatesInApp:     boolean
  orderUpdatesSms:       boolean
  orderUpdatesEmail:     boolean
  paymentUpdatesInApp:   boolean
  paymentUpdatesSms:     boolean
  paymentUpdatesEmail:   boolean
  deliveryUpdatesInApp:  boolean
  deliveryUpdatesSms:    boolean
  deliveryUpdatesEmail:  boolean
  promotionalInApp:      boolean
  promotionalSms:        boolean
  promotionalEmail:      boolean
  systemInApp:           boolean
  systemSms:             boolean
  systemEmail:           boolean
  createdAt:             string
  updatedAt:             string
}

// ── Support ───────────────────────────────────────────────────────────────────
export interface SupportTicket {
  id:        string
  subject:   string
  status:    'open' | 'in_progress' | 'resolved' | 'closed'
  createdAt: string
}

// ── Vendor registration ───────────────────────────────────────────────────────
export interface VendorRegisterInput {
  firstName:   string
  lastName:    string
  email:       string
  phone:       string
  password:    string
  companyName: string
  streetName:  string
  areaName:    string
  cityId:      string
  stateId:     string
  pincode:     string
}

// ── Delivery partner registration ─────────────────────────────────────────────
export interface DeliveryPartnerRegisterInput {
  firstName:     string
  lastName:      string
  email?:        string
  phone:         string
  password:      string
  vehicleType?:  string
  vehicleNumber?: string
  hasLicense?:   boolean
  licenseNumber?: string
  serviceArea?:  string
  cityId?:       string
}

export interface PublicCity {
  id:        string
  name:      string
  stateId:   string
  stateName: string
  stateCode: string
}

// ── Vendor profile (for vendor's own profile page) ───────────────────────────
export interface VendorProfile {
  id:          string
  companyName: string
  streetName:  string
  areaName:    string
  pincode:     string
  isActive:    boolean
  cityId:      string
  cityName:    string
  stateId:     string
  stateName:   string
  stateCode:   string
}

export interface VendorProfileInput {
  companyName: string
  streetName:  string
  areaName:    string
  cityId:      string
  pincode:     string
}

// ── Vendor (for order flow) ───────────────────────────────────────────────────
export interface Vendor {
  id:          string
  companyName: string
  areaName:    string
  cityName:    string
  stateName:   string
  pincode:     string
}

export interface PlaceOrderInput {
  tankerTypeId:          string
  quantity:              number
  deliveryDoorNo?:       string
  deliveryPlotNo?:       string
  deliveryBuildingName?: string
  deliveryStreetName:    string
  deliveryAreaName:      string
  deliveryCity:          string
  deliveryState:         string
  deliveryPincode?:      string
  siteType?:             string
  siteSubType?:          string
  timeSlab?:             string
  scheduledAt?:          string
}

export interface PlacedOrder {
  id:             string
  orderNumber:    string
  status:         string
  scheduledAt:    string | null
  createdAt:      string
  totalPrice:     number | null
  unitPrice:      number | null
  quantity:       number
  tankerTypeId:   string | null
  devOtp?:        string
}

export type PaymentMethod = 'razorpay' | 'cod'

export interface PaymentInitResult {
  razorpayOrderId: string
  amount:          number
  currency:        string
  keyId:           string
}

// ── Tanker types ─────────────────────────────────────────────────────────────
export interface TankerType {
  id:             string
  name:           string
  capacityLitres: number
  basePrice:      number
  isActive:       boolean
  displayOrder:   number
  imageUrl:       string | null
  createdAt:      string
  updatedAt:      string
}

export interface VendorTanker {
  id:             string
  vendorId:       string
  tankerTypeId:   string | null
  tankerTypeName: string | null
  registrationNo: string
  capacityLiters: number
  isActive:       boolean
  notes:          string | null
  createdAt:      string
}

// ── Master data ───────────────────────────────────────────────────────────────
export interface State {
  id:          string
  name:        string
  stateCode:   string
  countryCode: string
}

export interface City {
  id:        string
  name:      string
  stateId:   string
  stateName: string
  stateCode: string
  isActive:  boolean
  createdAt: string
  updatedAt: string
}

// ── Role management ───────────────────────────────────────────────────────────
export type AssignableRole = 'user' | 'vendor' | 'admin' | 'super_admin' | 'delivery_partner'

export interface ManagedUser {
  id:        string
  firstName: string
  lastName:  string
  email:     string | null
  phone:     string
  role:      'user' | 'vendor' | 'admin' | 'super_admin' | 'delivery_partner'
  createdAt: string
}

export interface RoleHistoryEntry {
  id:            string
  userName:      string
  userPhone:     string
  changedByName: string
  oldRole:       string | null
  newRole:       string | null
  createdAt:     string
}

// ── Auth result unions ────────────────────────────────────────────────────────
export type RegisterResult =
  | { success: true;  needsOtp: true;  userId: string; phone: string; devOtp?: string; message?: string }
  | { success: true;  needsOtp: false; user: Session }
  | { success: false; error: string }

export type LoginResult =
  | { success: true;  user: Session }
  | { success: false; needsOtp: true; userId: string; phone: string; devOtp?: string; message: string }
  | { success: false; needsOtp?: false; error: string }

export type VerifyOtpResult =
  | { success: true;  user: Session }
  | { success: false; error: string }

export type ResendOtpResult =
  | { success: true;  devOtp?: string }
  | { success: false; error: string }

export type ForgotPasswordResult =
  | { success: true; devToken?: string }
  | { success: false; error: string }

// ── Generic API result ────────────────────────────────────────────────────────
export type ApiResult<T = void> =
  | { success: true;  data: T }
  | { success: false; error: string }

export type OtpRequestResult =
  | { success: true;  phone: string; devOtp?: string; otpRequired: boolean }
  | { success: false; error: string }

// ── Delivery Partner ─────────────────────────────────────────────────────────
export type DeliveryStatus =
  | 'assigned' | 'delivery_accepted' | 'arrived_at_pickup'
  | 'picked_up' | 'out_for_delivery' | 'arrived_at_customer' | 'delivered'

export interface DeliveryPartnerProfile {
  id:              string
  vendorId:        string
  vehicleType:     string | null
  vehicleNumber:   string | null
  hasLicense:      boolean
  licenseNumber:   string | null
  serviceArea:     string | null
  isOnline:        boolean
  isAvailable:     boolean
  status:          'pending' | 'active' | 'suspended' | 'rejected'
  latitude:        number | null
  longitude:       number | null
  createdAt:       string
  firstName:       string
  lastName:        string
  email:           string | null
  phone:           string
  vendorCompany:   string
}

export interface DeliveryDashboard {
  status:                string
  isOnline:              boolean
  isAvailable:           boolean
  pendingRequests:       DeliveryAssignment[]
  activeDelivery:        DeliveryOrderSummary | null
  todayDeliveries:       number
  todayEarnings:         number
  earningsPerDelivery:   number
  deliveryFees:          DeliveryFees
  totalEarned:           number
  thisMonth:             number
  thisWeek:              number
  totalDeliveries:       number
  todayDeliveriesCount:  number
}

export interface DeliveryFees {
  fee5km:                number
  fee7km:                number
}

export interface DeliveryStatusResponse {
  status:       'pending' | 'active' | 'suspended' | 'rejected'
  isOnline:     boolean
  isAvailable:  boolean
  vendorName?:  string | null
}

export interface DeliveryAssignment {
  assignmentId:       string
  assignmentStatus:   string
  expiresAt:          string | null
  orderId:            string
  orderNumber:        string
  deliveryAreaName:   string
  deliveryCity:       string
  quantity:           number
  tankerTypeName:     string | null
  capacityLitres:     number | null
  vendorCompany:      string
}

export interface DeliveryOrderSummary {
  id:                   string
  orderNumber:          string
  status:               string
  deliveryPartnerId:    string | null
}

export interface DeliveryOrderDetail {
  id:                   string
  orderNumber:          string
  status:               string
  customerName:         string
  customerPhone:        string
  pickup: {
    company:            string
    street:             string | null
    area:               string | null
    city:               string | null
  }
  delivery: {
    doorNo:             string | null
    streetName:         string | null
    areaName:           string | null
    city:               string | null
    state:              string | null
    latitude:           number | null
    longitude:          number | null
  }
  items: {
    tankerTypeName:     string | null
    capacityLitres:     number | null
    quantity:           number
  }
  timestamps: {
    acceptedAt:         string | null
    readyAt:            string | null
    assignedAt:         string | null
    pickedUpAt:         string | null
    outForDeliveryAt:   string | null
    deliveredAt:        string | null
  }
  createdAt:            string
}

export interface DeliveryEarnings {
  earningsPerDelivery:  number
  deliveryFees:         DeliveryFees
  totalEarned:          number
  thisMonth:            number
  thisWeek:             number
  todayEarnings:        number
  history: DeliveryEarningEntry[]
}

export interface DeliveryEarningEntry {
  id:                   string
  orderNumber:          string
  deliveredAt:          string | null
  createdAt:            string
  area:                 string | null
  city:                 string | null
  earnings:             number
  distanceKm:           number | null
}

export interface DeliveryListItem {
  id:                   string
  orderNumber:          string
  status:               string
  deliveryAreaName:     string | null
  deliveryCity:         string | null
  deliveredAt:          string | null
  createdAt:            string
  customerName:         string
  tankerTypeName:       string | null
  quantity:             number
}

// ── Vendor → Delivery Partner management ──────────────────────────────────────
export interface VendorDeliveryPartner {
  id:                   string
  userId:               string
  vehicleType:          string | null
  vehicleNumber:        string | null
  isOnline:             boolean
  isAvailable:          boolean
  status:               'pending' | 'active' | 'suspended' | 'rejected'
  createdAt:            string
  firstName:            string
  lastName:             string
  email:                string | null
  phone:                string
  activeOrderNumber:    string | null
  totalDeliveries:      number
  latitude:             number | null
  longitude:            number | null
  lastLocationAt:       string | null
  cityId?:              string | null
  cityName?:            string | null
}

export interface AddDeliveryPartnerInput {
  firstName:            string
  lastName:             string
  email?:               string
  phone:                string
  vehicleType?:         string
  vehicleNumber?:       string
  licenseNumber?:       string
  hasLicense?:          boolean
}

export interface DeliveryAssignmentHistory {
  id:                   string
  status:               string
  expiresAt:            string | null
  assignedAt:           string | null
  acceptedAt:           string | null
  rejectedAt:           string | null
  completedAt:          string | null
  partnerId:            string
  partnerName:          string
  partnerPhone:         string
}

export interface DeliverySettings {
  earningsPerDelivery:  number
  fee5km:               number
  fee7km:               number
  autoAssign:           boolean
  assignTimeoutSec:     number
}

// Admin view of a delivery partner (across all vendors)
export interface AdminDeliveryPartner {
  id:              string
  userId:          string
  firstName:       string
  lastName:        string
  email:           string | null
  phone:           string
  vehicleType:     string | null
  vehicleNumber:   string | null
  hasLicense:      boolean
  serviceArea:     string | null
  isOnline:        boolean
  isAvailable:     boolean
  status:          'pending' | 'active' | 'suspended' | 'rejected'
  vendorId:        string
  vendorName:      string
  totalDeliveries: number
  activeOrders:    number
  createdAt:       string
}
