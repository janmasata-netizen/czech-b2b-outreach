-- Migration: Drop outreach_accounts table
-- Run AFTER deploying UI + workflow changes (table is no longer referenced)
-- Execute via Supabase SQL Editor

-- Drop RLS policies first
DROP POLICY IF EXISTS "Team members can view own accounts" ON outreach_accounts;
DROP POLICY IF EXISTS "Admins can manage outreach accounts" ON outreach_accounts;
DROP POLICY IF EXISTS "Service role full access" ON outreach_accounts;

-- Drop the table
DROP TABLE IF EXISTS outreach_accounts;
