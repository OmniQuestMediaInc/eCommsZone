#!/usr/bin/env node
/**
 * eCommsZone — Tenant API Key Generator
 *
 * Usage:
 *   node scripts/generate-tenant-key.js --tenant chatnowzone
 *
 * Outputs:
 *   - The raw API key (share this with the tenant)
 *   - The HMAC-SHA256 hash to store in the tenants table
 *
 * Requires JWT_SECRET to be set in .env or the environment.
 */

const crypto = require('crypto');
const path = require('path');

// Load .env
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv not available — proceed with environment vars
}

const args = process.argv.slice(2);
const tenantIdx = args.indexOf('--tenant');
if (tenantIdx === -1 || !args[tenantIdx + 1]) {
  console.error('Usage: node generate-tenant-key.js --tenant <slug>');
  process.exit(1);
}

const tenant = args[tenantIdx + 1];
const secret = process.env.JWT_SECRET;
if (!secret || secret === 'change-this-to-a-long-random-secret') {
  console.error('ERROR: JWT_SECRET is not set or is still the default placeholder.');
  console.error('       Set a real JWT_SECRET in your .env before generating keys.');
  process.exit(1);
}

const rawKey = `${tenant}_${crypto.randomBytes(32).toString('hex')}`;
const keyHash = crypto
  .createHmac('sha256', secret)
  .update(rawKey)
  .digest('hex');

console.log('\n========================================');
console.log(`Tenant API Key — ${tenant}`);
console.log('========================================');
console.log(`\nRaw key (share with tenant):\n  ${rawKey}`);
console.log(`\nHMAC-SHA256 hash (store in DB):\n  ${keyHash}`);
console.log('\nSQL to update the tenants table:');
console.log(`  UPDATE tenants SET api_key_hash = '${keyHash}' WHERE slug = '${tenant}';`);
console.log('\n⚠️  Store the raw key in your secrets manager. It cannot be recovered.\n');
