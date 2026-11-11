-- Run once in a dedicated V3 database as the migration owner.
-- Never run the web application as this owner or a PostgreSQL superuser.
BEGIN;
CREATE SCHEMA einfak;
CREATE TABLE einfak.organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE,
 name text NOT NULL,
 canonical_host text NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE einfak.staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE einfak.memberships (
 organization_id uuid NOT NULL REFERENCES einfak.organizations(id),
 staff_id uuid NOT NULL REFERENCES einfak.staff(id),
 role text NOT NULL CHECK (role IN ('admin','finance','communications','viewer')),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY (organization_id, staff_id)
);
CREATE TABLE einfak.donors (
 organization_id uuid NOT NULL REFERENCES einfak.organizations(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 display_name text NOT NULL,
 phone text,
 phone_verified_at timestamptz,
 marketing_sms_opt_in boolean NOT NULL DEFAULT false,
 PRIMARY KEY (organization_id,id)
);
CREATE UNIQUE INDEX donor_verified_phone ON einfak.donors(organization_id,phone)
 WHERE phone_verified_at IS NOT NULL;
CREATE TABLE einfak.campaigns (
 organization_id uuid NOT NULL REFERENCES einfak.organizations(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 title text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
 PRIMARY KEY (organization_id,id)
);
CREATE TABLE einfak.orders (
 organization_id uuid NOT NULL REFERENCES einfak.organizations(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 donor_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','paid','failed','partially_refunded','refunded')),
 provider_reference text UNIQUE,
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,id),
 UNIQUE (organization_id,idempotency_key),
 FOREIGN KEY (organization_id,donor_id) REFERENCES einfak.donors(organization_id,id)
);
CREATE TABLE einfak.order_items (
 organization_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 campaign_title text NOT NULL,
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 PRIMARY KEY (organization_id,id),
 FOREIGN KEY (organization_id,order_id) REFERENCES einfak.orders(organization_id,id),
 FOREIGN KEY (organization_id,campaign_id) REFERENCES einfak.campaigns(organization_id,id)
);
CREATE TABLE einfak.payment_events (
 organization_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL,
 provider_event_id text NOT NULL UNIQUE,
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 verified_at timestamptz NOT NULL,
 PRIMARY KEY (organization_id,id),
 FOREIGN KEY (organization_id,order_id) REFERENCES einfak.orders(organization_id,id)
);
CREATE TABLE einfak.donations (
 organization_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 order_item_id uuid NOT NULL,
 payment_event_id uuid NOT NULL,
 receipt_number text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,id),
 UNIQUE (organization_id,order_item_id),
 UNIQUE (organization_id,receipt_number),
 FOREIGN KEY (organization_id,order_item_id) REFERENCES einfak.order_items(organization_id,id),
 FOREIGN KEY (organization_id,payment_event_id) REFERENCES einfak.payment_events(organization_id,id)
);
CREATE TABLE einfak.sms_outbox (
 organization_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 donor_id uuid NOT NULL,
 deduplication_key text NOT NULL,
 template_key text NOT NULL,
 purpose text NOT NULL CHECK (purpose IN ('transactional','marketing')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,id),
 UNIQUE (organization_id,deduplication_key),
 FOREIGN KEY (organization_id,donor_id) REFERENCES einfak.donors(organization_id,id)
);
-- Tenant context must be SET LOCAL by trusted server code inside each transaction,
-- after authentication and membership authorization; never copied from a header.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['memberships','donors','campaigns','orders','order_items','payment_events','donations','sms_outbox'] LOOP
  EXECUTE format('ALTER TABLE einfak.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE einfak.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_boundary ON einfak.%I USING (organization_id = nullif(current_setting(''einfak.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''einfak.organization_id'', true), '''')::uuid)',table_name);
 END LOOP;
END $$;
COMMIT;
