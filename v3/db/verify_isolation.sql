\set ON_ERROR_STOP on
-- Dedicated test database only. All fixtures and test role are rolled back.
BEGIN;
INSERT INTO einfak.organizations(id,slug,name,canonical_host) VALUES
 ('00000000-0000-0000-0000-000000000001','hicret','Hicret','hicretdernegi.org'),
 ('00000000-0000-0000-0000-000000000002','kardeslik','Kardeslik','kardeslikpayi.org');
INSERT INTO einfak.donors(organization_id,id,display_name) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Test A'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000022','Test B');
CREATE ROLE einfak_isolation_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA einfak TO einfak_isolation_test;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA einfak TO einfak_isolation_test;
SET LOCAL ROLE einfak_isolation_test;
DO $$ BEGIN
 IF (SELECT count(*) FROM einfak.donors) <> 0 THEN RAISE EXCEPTION 'Missing context exposed donors'; END IF;
END $$;
SET LOCAL einfak.organization_id = '00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM einfak.donors) <> 1 THEN RAISE EXCEPTION 'Tenant filter failed'; END IF;
 IF EXISTS(SELECT 1 FROM einfak.donors WHERE display_name='Test B') THEN RAISE EXCEPTION 'Cross-tenant read'; END IF;
 BEGIN
  INSERT INTO einfak.donors(organization_id,display_name) VALUES ('00000000-0000-0000-0000-000000000002','Forbidden');
  RAISE EXCEPTION 'Cross-tenant write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO einfak.orders(organization_id,donor_id,amount_cents,idempotency_key) VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000022',100,gen_random_uuid());
  RAISE EXCEPTION 'Foreign tenant donor allowed';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 INSERT INTO einfak.orders(organization_id,donor_id,amount_cents,idempotency_key) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',100,'00000000-0000-0000-0000-000000000099');
 BEGIN
  INSERT INTO einfak.orders(organization_id,donor_id,amount_cents,idempotency_key) VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',100,'00000000-0000-0000-0000-000000000099');
  RAISE EXCEPTION 'Duplicate order allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo Isolation and order uniqueness checks passed.
