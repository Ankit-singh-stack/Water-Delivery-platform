-- WaterMan PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Login Roles (master data)
CREATE TABLE IF NOT EXISTS roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(50) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default roles
INSERT INTO roles (name, display_name, description) VALUES
  ('super_admin',       'Super Admin',       'Full system access — manages admins, vendors, and platform settings'),
  ('admin',             'Admin',             'Manages users, orders, and day-to-day operations'),
  ('vendor',            'Vendor',            'Water supplier with limited dashboard access'),
  ('delivery_partner',  'Delivery Partner',  'Picks up and delivers orders assigned by a vendor'),
  ('user',              'User',              'End customer who places and tracks water delivery orders')
ON CONFLICT (name) DO NOTHING;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    VARCHAR(50)  NOT NULL,
  last_name     VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) UNIQUE,
  phone         VARCHAR(15)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  role_id       UUID         REFERENCES roles(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- OTP Codes
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(6)  NOT NULL,
  purpose    VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_phone','login','update_profile','change_password')),
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_user_id ON otp_codes(user_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);

-- Addresses
CREATE TABLE IF NOT EXISTS addresses (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(50),
  door_no       VARCHAR(50),
  plot_no       VARCHAR(50),
  building_name VARCHAR(100),
  street_name   VARCHAR(255) NOT NULL,
  area_name     VARCHAR(255) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(100) NOT NULL,
  country       VARCHAR(100) NOT NULL DEFAULT 'India',
  is_default    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- Orders (address denormalized — snapshot at time of order)
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES users(id),
  order_number          VARCHAR(20) NOT NULL UNIQUE,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','confirmed','in_transit','delivered','failed','rejected','cancelled')),

  -- Delivery address snapshot
  delivery_door_no       VARCHAR(50),
  delivery_plot_no       VARCHAR(50),
  delivery_building_name VARCHAR(100),
  delivery_street_name   VARCHAR(255) NOT NULL,
  delivery_area_name     VARCHAR(255) NOT NULL,
  delivery_city          VARCHAR(100) NOT NULL,
  delivery_state         VARCHAR(100) NOT NULL,
  delivery_country       VARCHAR(100) NOT NULL DEFAULT 'India',

  -- Driver / fulfillment
  delivered_by           VARCHAR(255),

  -- Timing
  scheduled_at           TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON roles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON addresses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL DEFAULT 'system'
             CHECK (type IN ('order','delivery','system','promo')),
  title      VARCHAR(255) NOT NULL,
  message    TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id ON notifications(user_id);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    VARCHAR(255) NOT NULL,
  message    TEXT        NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'open'
             CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets(user_id);

DROP TRIGGER IF EXISTS set_updated_at ON support_tickets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- States (master data)
CREATE TABLE IF NOT EXISTS states (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,
  country_code VARCHAR(5)   NOT NULL DEFAULT 'IN',
  state_code   VARCHAR(5)   NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, state_code)
);

INSERT INTO states (name, country_code, state_code) VALUES
  ('Andaman and Nicobar Islands',                  'IN', 'AN'),
  ('Andhra Pradesh',                               'IN', 'AP'),
  ('Arunachal Pradesh',                            'IN', 'AR'),
  ('Assam',                                        'IN', 'AS'),
  ('Bihar',                                        'IN', 'BR'),
  ('Chandigarh',                                   'IN', 'CH'),
  ('Chhattisgarh',                                 'IN', 'CT'),
  ('Dadra and Nagar Haveli and Daman and Diu',     'IN', 'DH'),
  ('Delhi',                                        'IN', 'DL'),
  ('Goa',                                          'IN', 'GA'),
  ('Gujarat',                                      'IN', 'GJ'),
  ('Haryana',                                      'IN', 'HR'),
  ('Himachal Pradesh',                             'IN', 'HP'),
  ('Jammu and Kashmir',                            'IN', 'JK'),
  ('Jharkhand',                                    'IN', 'JH'),
  ('Karnataka',                                    'IN', 'KA'),
  ('Kerala',                                       'IN', 'KL'),
  ('Ladakh',                                       'IN', 'LA'),
  ('Lakshadweep',                                  'IN', 'LD'),
  ('Madhya Pradesh',                               'IN', 'MP'),
  ('Maharashtra',                                  'IN', 'MH'),
  ('Manipur',                                      'IN', 'MN'),
  ('Meghalaya',                                    'IN', 'ML'),
  ('Mizoram',                                      'IN', 'MZ'),
  ('Nagaland',                                     'IN', 'NL'),
  ('Odisha',                                       'IN', 'OR'),
  ('Puducherry',                                   'IN', 'PY'),
  ('Punjab',                                       'IN', 'PB'),
  ('Rajasthan',                                    'IN', 'RJ'),
  ('Sikkim',                                       'IN', 'SK'),
  ('Tamil Nadu',                                   'IN', 'TN'),
  ('Telangana',                                    'IN', 'TG'),
  ('Tripura',                                      'IN', 'TR'),
  ('Uttarakhand',                                  'IN', 'UK'),
  ('Uttar Pradesh',                                'IN', 'UP'),
  ('West Bengal',                                  'IN', 'WB')
ON CONFLICT (country_code, state_code) DO NOTHING;

-- Cities (master data)
CREATE TABLE IF NOT EXISTS cities (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  state_id   UUID         NOT NULL REFERENCES states(id),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (name, state_id)
);

CREATE INDEX IF NOT EXISTS idx_cities_state_id ON cities(state_id);

DROP TRIGGER IF EXISTS set_updated_at ON cities;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cities
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Vendor Profiles
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  street_name  VARCHAR(255) NOT NULL,
  area_name    VARCHAR(255) NOT NULL,
  city_id      UUID         REFERENCES cities(id),
  state_id     UUID         NOT NULL REFERENCES states(id),
  pincode      VARCHAR(10)  NOT NULL,
  country      VARCHAR(100) NOT NULL DEFAULT 'India',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user_id
  ON vendor_profiles(user_id);

DROP TRIGGER IF EXISTS set_updated_at ON vendor_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Migration: extend otp purpose for existing databases
ALTER TABLE otp_codes
DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;

ALTER TABLE otp_codes
ADD CONSTRAINT otp_codes_purpose_check
CHECK (
  purpose IN (
    'verify_phone',
    'login',
    'update_profile',
    'change_password'
  )
);

-- Migration: add vendor_id to orders for existing databases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN vendor_id UUID REFERENCES vendor_profiles(id);
  END IF;
END$$;

-- Migration: add role_id to users for existing databases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'role_id'
  ) THEN

    ALTER TABLE users
    ADD COLUMN role_id UUID REFERENCES roles(id);

    UPDATE users
    SET role_id = (
      SELECT id
      FROM roles
      WHERE name = 'user'
    );

  END IF;
END$$;

-- Migration: extend order status
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (
  status IN (
    'draft',
    'confirmed',
    'accepted',
    'preparing',
    'in_transit',
    'delivered',
    'failed',
    'rejected',
    'cancelled',
    'ready_for_pickup',
    'assigned',
    'delivery_accepted',
    'arrived_at_pickup',
    'picked_up',
    'arrived_at_customer',
    'out_for_delivery'
  )
);

-- Migration: add per-step tracking timestamps to orders
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='accepted_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN accepted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='preparing_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN preparing_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='in_transit_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN in_transit_at TIMESTAMPTZ;
  END IF;

END$$;

-- Tanker Types (master data managed by admin)
CREATE TABLE IF NOT EXISTS tanker_types (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(50)   NOT NULL UNIQUE,
  capacity_litres INT           NOT NULL,
  base_price      DECIMAL(10,2) NOT NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  display_order   INT           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO tanker_types (
  name,
  capacity_litres,
  base_price,
  display_order
) VALUES
  ('Mini Tanker',     4000,  800.00, 1),
  ('Standard Tanker', 6000, 1200.00, 2),
  ('Jumbo Tanker',    7000, 1400.00, 3),
  ('Mega Tanker',    12000, 2400.00, 4)
ON CONFLICT (name) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON tanker_types;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON tanker_types
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Migration: add tanker type + pricing columns to orders
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='tanker_type_id'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN tanker_type_id UUID REFERENCES tanker_types(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='quantity'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN quantity INT NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='unit_price'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN unit_price DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='total_price'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN total_price DECIMAL(10,2);
  END IF;

END$$;

-- Migration: add payment columns to orders
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='payment_status'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN payment_status VARCHAR(20)
    NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='payment_method'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN payment_method VARCHAR(30);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='payment_reference'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN payment_reference VARCHAR(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='razorpay_order_id'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN razorpay_order_id VARCHAR(100);
  END IF;

END$$;

-- Migration: add is_online to vendor_profiles
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='vendor_profiles'
      AND column_name='is_online'
  ) THEN
    ALTER TABLE vendor_profiles
    ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

END$$;

-- Order ratings
CREATE TABLE IF NOT EXISTS order_ratings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id   UUID        REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  rating      INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_ratings_vendor
  ON order_ratings(vendor_id);

-- Role change history
CREATE TABLE IF NOT EXISTS role_change_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by  UUID        NOT NULL REFERENCES users(id),
  old_role_id UUID        REFERENCES roles(id),
  new_role_id UUID        REFERENCES roles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_history_user_id
  ON role_change_history(user_id);

-- Vendor tankers fleet
CREATE TABLE IF NOT EXISTS vendor_tankers (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID         NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  tanker_type_id   UUID         REFERENCES tanker_types(id) ON DELETE SET NULL,
  registration_no  VARCHAR(30)  NOT NULL,
  capacity_liters  INTEGER      NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_tankers_vendor
  ON vendor_tankers(vendor_id);

-- Migration: add image_url to tanker_types
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='tanker_types'
      AND column_name='image_url'
  ) THEN
    ALTER TABLE tanker_types
    ADD COLUMN image_url TEXT;
  END IF;

END$$;

-- Migration: new vendors default to online
ALTER TABLE vendor_profiles
ALTER COLUMN is_online SET DEFAULT TRUE;

-- Vendor online/offline work-mode change history
CREATE TABLE IF NOT EXISTS vendor_online_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  is_online   BOOLEAN     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_online_history_vendor
  ON vendor_online_status_history(vendor_id);

-- ════════════════════════════════════════════════════════════════════════════
-- DELIVERY PARTNERS — fourth role
-- ════════════════════════════════════════════════════════════════════════════

-- Migration: extend OTP purpose to include 'delivery'
ALTER TABLE otp_codes
DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;

ALTER TABLE otp_codes
ADD CONSTRAINT otp_codes_purpose_check
CHECK (
  purpose IN (
    'verify_phone',
    'login',
    'update_profile',
    'change_password',
    'delivery'
  )
);

-- Migration: widen orders.status CHECK
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (
  status IN (
    'draft',
    'confirmed',
    'accepted',
    'rejected',
    'preparing',
    'ready_for_pickup',
    'assigned',
    'delivery_accepted',
    'arrived_at_pickup',
    'picked_up',
    'in_transit',
    'arrived_at_customer',
    'out_for_delivery',
    'delivered',
    'failed',
    'cancelled'
  )
);

-- Migration: add delivery columns to orders
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='delivery_partner_id'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN delivery_partner_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='delivery_latitude'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN delivery_latitude DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='delivery_longitude'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN delivery_longitude DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='ready_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN ready_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='assigned_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN assigned_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='picked_up_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN picked_up_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='out_for_delivery_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN out_for_delivery_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='arrived_at_customer_at'
  ) THEN
    ALTER TABLE orders
    ADD COLUMN arrived_at_customer_at TIMESTAMPTZ;
  END IF;

END$$;

-- Delivery Partner profiles
CREATE TABLE IF NOT EXISTS delivery_partner_profiles (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Can be NULL for independently registered partners
  vendor_id        UUID         REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  -- Vehicle / delivery info
  vehicle_type     VARCHAR(50),
  vehicle_number   VARCHAR(30),
  has_license      BOOLEAN      NOT NULL DEFAULT FALSE,
  license_number   VARCHAR(50),
  service_area     VARCHAR(255),

  -- Availability
  is_online        BOOLEAN      NOT NULL DEFAULT FALSE,
  is_available     BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Account status
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','suspended','rejected')),

  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpp_vendor
  ON delivery_partner_profiles(vendor_id);

CREATE INDEX IF NOT EXISTS idx_dpp_status
  ON delivery_partner_profiles(status);

CREATE INDEX IF NOT EXISTS idx_dpp_availability
  ON delivery_partner_profiles(
    is_online,
    is_available,
    status
  );

DROP TRIGGER IF EXISTS set_updated_at
ON delivery_partner_profiles;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON delivery_partner_profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Assignment history
CREATE TABLE IF NOT EXISTS order_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_partner_id  UUID        NOT NULL REFERENCES delivery_partner_profiles(id) ON DELETE CASCADE,

  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (
                         status IN (
                           'pending',
                           'accepted',
                           'rejected',
                           'expired',
                           'cancelled',
                           'completed'
                         )
                       ),

  expires_at           TIMESTAMPTZ,
  assigned_at          TIMESTAMPTZ,
  accepted_at          TIMESTAMPTZ,
  rejected_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oa_order
  ON order_assignments(order_id);

CREATE INDEX IF NOT EXISTS idx_oa_partner
  ON order_assignments(delivery_partner_id);

DROP TRIGGER IF EXISTS set_updated_at
ON order_assignments;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON order_assignments
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Delivery-confirmation OTPs
CREATE TABLE IF NOT EXISTS delivery_otps (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id),
  code_hash         VARCHAR(255) NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  attempts          INT         NOT NULL DEFAULT 0,
  max_attempts      INT         NOT NULL DEFAULT 5,
  used              BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dot_order
  ON delivery_otps(order_id);

-- Driver location history
CREATE TABLE IF NOT EXISTS driver_locations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id  UUID        NOT NULL REFERENCES delivery_partner_profiles(id) ON DELETE CASCADE,
  order_id             UUID        REFERENCES orders(id) ON DELETE SET NULL,
  latitude             DOUBLE PRECISION NOT NULL,
  longitude            DOUBLE PRECISION NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dl_partner
  ON driver_locations(delivery_partner_id);

CREATE INDEX IF NOT EXISTS idx_dl_order
  ON driver_locations(order_id);

-- Delivery settings
CREATE TABLE IF NOT EXISTS delivery_settings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id            UUID        NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  earnings_per_delivery DECIMAL(10,2) NOT NULL DEFAULT 30.00,
  auto_assign          BOOLEAN     NOT NULL DEFAULT FALSE,
  assign_timeout_sec   INT         NOT NULL DEFAULT 90,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id)
);

DROP TRIGGER IF EXISTS set_updated_at
ON delivery_settings;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON delivery_settings
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Migration: ensure order_assignments has required columns
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'order_assignments'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE order_assignments
    ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'order_assignments'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE order_assignments
    ADD COLUMN updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW();
  END IF;

END$$;

-- Migration: allow delivery partner to be self-registered
DO $$
BEGIN

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'delivery_partner_profiles'
      AND column_name = 'vendor_id'
      AND is_nullable = 'NO'
  ) THEN

    ALTER TABLE delivery_partner_profiles
    ALTER COLUMN vendor_id DROP NOT NULL;

  END IF;

END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- NOTIFICATION SYSTEM — centralized notification preferences + delivery log
-- ════════════════════════════════════════════════════════════════════════════

-- Migration: add order_id and updated_at to notifications
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='notifications'
      AND column_name='order_id'
  ) THEN

    ALTER TABLE notifications
    ADD COLUMN order_id UUID
    REFERENCES orders(id)
    ON DELETE SET NULL;

  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='notifications'
      AND column_name='updated_at'
  ) THEN

    ALTER TABLE notifications
    ADD COLUMN updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW();

  END IF;

END$$;

CREATE INDEX IF NOT EXISTS idx_notif_order
  ON notifications(order_id);

CREATE INDEX IF NOT EXISTS idx_notif_read
  ON notifications(user_id, is_read);

DROP TRIGGER IF EXISTS set_updated_at
ON notifications;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Notification preferences (row-per-category+channel)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id    UUID NOT NULL
             REFERENCES users(id)
             ON DELETE CASCADE,

  category   VARCHAR(30) NOT NULL
             CHECK (
               category IN (
                 'order',
                 'payment',
                 'promo',
                 'system',
                 'delivery'
               )
             ),

  channel    VARCHAR(10) NOT NULL
             CHECK (
               channel IN ('in_app', 'sms', 'email')
             ),

  enabled    BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, category, channel)
);

DROP TRIGGER IF EXISTS set_updated_at
ON notification_preferences;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Notification delivery log
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id   UUID NOT NULL
                    REFERENCES notifications(id)
                    ON DELETE CASCADE,

  channel           VARCHAR(10) NOT NULL
                    CHECK (channel IN ('sms','email')),

  status            VARCHAR(15) NOT NULL DEFAULT 'pending'
                    CHECK (
                      status IN (
                        'pending',
                        'sent',
                        'delivered',
                        'failed'
                      )
                    ),

  provider_response TEXT,
  attempts          INT NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_del_notif
  ON notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_notif_del_status
  ON notification_deliveries(status);

-- ============================================
-- Delivery partner service city
-- ============================================
-- Partners indicate which city they serve so vendors only see & approve
-- signups from their own city. Added additively so existing rows (which
-- were not city-scoped) keep a NULL service city.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_partner_profiles' AND column_name = 'city_id'
  ) THEN
    ALTER TABLE delivery_partner_profiles
      ADD COLUMN city_id UUID REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dpp_city
  ON delivery_partner_profiles(city_id);

-- ============================================
-- Order delivery extras: pincode, site type, time slab
-- ============================================
-- Added additively so existing installations keep working; new orders can
-- snapshot the pincode, the site type (residential/commercial/construction with
-- a sub-type), and the preferred time slab (how long the tanker should stay).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_pincode'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_pincode VARCHAR(10);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'site_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN site_type VARCHAR(30);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'site_sub_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN site_sub_type VARCHAR(50);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'time_slab'
  ) THEN
    ALTER TABLE orders ADD COLUMN time_slab VARCHAR(30);
  END IF;
END $$;

-- ============================================
-- Distance-based delivery fee (₹600 within 5km / ₹700 within 7km)
-- ============================================
-- The 5 km / 7 km tier amounts per vendor. On delivery completion the fee is
-- recorded against each delivered order (orders.delivery_fee) based on the
-- distance the delivery partner actually travelled (orders.delivery_distance_km).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_settings' AND column_name = 'fee_5km'
  ) THEN
    ALTER TABLE delivery_settings ADD COLUMN fee_5km DECIMAL(10,2) NOT NULL DEFAULT 600.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_settings' AND column_name = 'fee_7km'
  ) THEN
    ALTER TABLE delivery_settings ADD COLUMN fee_7km DECIMAL(10,2) NOT NULL DEFAULT 700.00;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_distance_km'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_distance_km DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_fee'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2);
  END IF;
END $$;

-- ============================================
-- Seed cities for the seeded states
-- ============================================
-- Reference states by their state_code so this is safe to re-apply and works
-- against both fresh and existing databases.
CREATE TEMP TABLE IF NOT EXISTS _city_seed (state_code VARCHAR(5), city VARCHAR(100));

TRUNCATE _city_seed;

INSERT INTO _city_seed (state_code, city) VALUES
  ('UP', 'Lucknow'),
  ('UP', 'Kanpur'),
  ('UP', 'Varanasi'),
  ('UP', 'Agra'),
  ('UP', 'Noida'),
  ('UP', 'Ghaziabad'),
  ('UP', 'Prayagraj'),
  ('UP', 'Bareilly'),
  ('DL', 'New Delhi'),
  ('DL', 'South Delhi'),
  ('DL', 'North Delhi'),
  ('MH', 'Mumbai'),
  ('MH', 'Pune'),
  ('MH', 'Nagpur'),
  ('MH', 'Nashik'),
  ('MH', 'Thane'),
  ('MH', 'Aurangabad'),
  ('KA', 'Bengaluru'),
  ('KA', 'Mysuru'),
  ('KA', 'Hubballi'),
  ('TN', 'Chennai'),
  ('TN', 'Coimbatore'),
  ('TN', 'Madurai'),
  ('TN', 'Tiruchirappalli'),
  ('TG', 'Hyderabad'),
  ('TG', 'Warangal'),
  ('WB', 'Kolkata'),
  ('WB', 'Howrah'),
  ('GJ', 'Ahmedabad'),
  ('GJ', 'Surat'),
  ('GJ', 'Vadodara'),
  ('RJ', 'Jaipur'),
  ('RJ', 'Jodhpur'),
  ('RJ', 'Udaipur'),
  ('PB', 'Ludhiana'),
  ('PB', 'Amritsar'),
  ('HR', 'Gurugram'),
  ('HR', 'Faridabad'),
  ('MP', 'Bhopal'),
  ('MP', 'Indore'),
  ('KL', 'Kochi'),
  ('KL', 'Thiruvananthapuram'),
  ('AP', 'Visakhapatnam'),
  ('AP', 'Vijayawada'),
  ('AP', 'Nellore'),
  ('BR', 'Patna'),
  ('BR', 'Gaya'),
  ('OR', 'Bhubaneswar'),
  ('OR', 'Cuttack'),
  ('AS', 'Guwahati'),
  ('JH', 'Ranchi'),
  ('UK', 'Dehradun'),
  ('CT', 'Raipur'),
  ('GA', 'Panaji'),
  ('CH', 'Chandigarh');

INSERT INTO cities (name, state_id)
SELECT s.city, st.id
FROM _city_seed s
JOIN states st ON st.state_code = s.state_code
ON CONFLICT (name, state_id) DO NOTHING;

-- ============================================
-- Notification schema alignment migrations
-- ============================================
-- The notifications table needs the `category` column used by the notification
-- service. Safe to add idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'category'
  ) THEN
    ALTER TABLE notifications
    ADD COLUMN category VARCHAR(30)
    CHECK (category IN ('order','payment','promo','system','delivery'));
  END IF;
END $$;

-- If a legacy boolean-style notification_preferences table exists (created by an
-- older schema before the row-per-category+channel shape) rebuild it so the
-- notification service can insert (user_id, category, channel, enabled).
DO $$
DECLARE
  has_boolean_style BOOLEAN;
  has_row_style     BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences'
      AND column_name = 'order_updates_in_app'
  ) INTO has_boolean_style;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences'
      AND column_name = 'category'
  ) INTO has_row_style;

  -- Only rebuild when the legacy style exists and the row style does not.
  IF has_boolean_style AND NOT has_row_style THEN
    ALTER TABLE notification_preferences RENAME TO notification_preferences_legacy;

    CREATE TABLE notification_preferences (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category   VARCHAR(30) NOT NULL
                 CHECK (category IN ('order','payment','promo','system','delivery')),
      channel    VARCHAR(10) NOT NULL
                 CHECK (channel IN ('in_app', 'sms', 'email')),
      enabled    BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, category, channel)
    );

    INSERT INTO notification_preferences (user_id, category, channel, enabled)
    SELECT
      user_id, 'order',   'in_app', order_updates_in_app
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'order',   'sms',    order_updates_sms
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'order',   'email',  order_updates_email
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'payment', 'in_app', payment_updates_in_app
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'payment', 'sms',    payment_updates_sms
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'payment', 'email',  payment_updates_email
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'delivery','in_app', delivery_updates_in_app
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'delivery','sms',    delivery_updates_sms
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'delivery','email',  delivery_updates_email
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'promo',   'in_app', promotional_in_app
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'promo',   'sms',    promotional_sms
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'promo',   'email',  promotional_email
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'system',  'in_app', system_in_app
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'system',  'sms',    system_sms
    FROM notification_preferences_legacy
    UNION ALL SELECT user_id, 'system',  'email',  system_email
    FROM notification_preferences_legacy;

    DROP TABLE notification_preferences_legacy;
  END IF;
END $$;

DROP TABLE IF EXISTS _city_seed;