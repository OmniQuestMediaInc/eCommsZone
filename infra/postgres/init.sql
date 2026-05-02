-- eCommsZone — PostgreSQL initialization
-- This script runs once when the Postgres container is first created.
-- listmonk creates its own schema on first start.

-- Ensure the ecommszone user has the necessary permissions
GRANT ALL PRIVILEGES ON DATABASE ecommszone TO ecommszone;

-- Custom tables for the API gateway

-- Tenants registry
CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,          -- HMAC-SHA256 of the raw API key
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log for all outbound messages
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL REFERENCES tenants(slug),
    channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'campaign')),
    direction   TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound_webhook')),
    status      TEXT NOT NULL,           -- sent, failed, bounced, delivered, etc.
    provider_message_id TEXT,            -- Brevo/listmonk message ID
    recipient   TEXT,                    -- email address or phone number (masked in prod)
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_channel ON audit_log(channel);

-- Trigger: auto-update updated_at on tenants
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: initial tenant stubs
-- ⚠️  SECURITY: api_key_hash MUST be replaced with real HMAC-SHA256 hashes before
-- the system handles any traffic. Run `node scripts/generate-tenant-key.js --tenant <slug>`
-- to generate a real key for each tenant, then update the hash here.
-- Rows with PLACEHOLDER_HASH will be rejected by the auth middleware.
INSERT INTO tenants (slug, display_name, api_key_hash, config)
VALUES
    ('chatnowzone',       'ChatNowZone',          'PLACEHOLDER_HASH', '{}'),
    ('redroompleasures',  'RedRoomPleasures',      'PLACEHOLDER_HASH', '{}'),
    ('redroomrewards',    'RedRoomRewards',         'PLACEHOLDER_HASH', '{}'),
    ('sensync',           'SenSync',               'PLACEHOLDER_HASH', '{}'),
    ('cyrano',            'Cyrano',                'PLACEHOLDER_HASH', '{}'),
    ('omniquest-internal','OmniQuest Internal',    'PLACEHOLDER_HASH', '{}')
ON CONFLICT (slug) DO NOTHING;
