-- P6: WhatsApp webhook secret + verify token + reminder pay-to line (§13).
ALTER TABLE "TenantSettings" ADD COLUMN "waAppSecretEnc" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "waVerifyToken" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "waPayToText" TEXT;
