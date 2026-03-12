-- Migration: Drop outreach_accounts table
-- Run AFTER deploying UI + workflow changes (table is no longer referenced)
-- Execute via Supabase SQL Editor
-- STATUS: ALREADY RUN on 2026-03-12

-- Drop FK constraints from dependent tables
ALTER TABLE wave_leads DROP CONSTRAINT IF EXISTS wave_leads_outreach_account_id_fkey;
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_outreach_account_id_fkey;
ALTER TABLE sent_emails DROP CONSTRAINT IF EXISTS sent_emails_outreach_account_id_fkey;
ALTER TABLE waves DROP CONSTRAINT IF EXISTS waves_outreach_account_id_fkey;

-- Drop RLS policies
DROP POLICY IF EXISTS "Team members can view own accounts" ON outreach_accounts;
DROP POLICY IF EXISTS "Admins can manage outreach accounts" ON outreach_accounts;
DROP POLICY IF EXISTS "Service role full access" ON outreach_accounts;

-- Drop the table
DROP TABLE IF EXISTS outreach_accounts;
