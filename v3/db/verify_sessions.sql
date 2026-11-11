\set ON_ERROR_STOP on
-- Dedicated test database only; fixtures and role are rolled back.
BEGIN;
INSERT INTO einfak.organizations(id,slug,name,canonical_host,active) VALUES
 ('10000000-0000-0000-0000-000000000001','test-active','Active','active.invalid',true),
 ('10000000-0000-0000-0000-000000000002','test-inactive','Inactive','inactive.invalid',false);
INSERT INTO einfak.staff(id,email,password_hash) VALUES
 ('20000000-0000-0000-0000-000000000001','one@example.invalid','not-a-login-hash'),
 ('20000000-0000-0000-0000-000000000002','two@example.invalid','not-a-login-hash');
INSERT INTO einfak.memberships(organization_id,staff_id,role) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','viewer'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','admin'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','admin');
CREATE ROLE einfak_session_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT einfak_v3_identity TO einfak_session_test;
GRANT USAGE ON SCHEMA einfak TO einfak_session_test;
GRANT SELECT ON einfak.staff,einfak.memberships,einfak.organizations TO einfak_session_test;
GRANT SELECT,INSERT,UPDATE ON einfak.staff_sessions TO einfak_session_test;
SET LOCAL ROLE einfak_session_test;
SELECT set_config('einfak.organization_id','',true),
 set_config('einfak.staff_id','20000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM einfak.memberships;
 IF n <> 2 THEN RAISE EXCEPTION 'Own membership filter failed: %',n; END IF;
 IF EXISTS (SELECT 1 FROM einfak.memberships WHERE staff_id='20000000-0000-0000-0000-000000000002') THEN
  RAISE EXCEPTION 'Other staff memberships exposed';
 END IF;
 SELECT count(*) INTO n FROM einfak.memberships m
 JOIN einfak.organizations o ON o.id=m.organization_id AND o.active=true
 WHERE m.staff_id='20000000-0000-0000-0000-000000000001' AND m.active=true;
 IF n <> 1 THEN RAISE EXCEPTION 'Inactive organization filter failed'; END IF;
 INSERT INTO einfak.staff_sessions(token_hash,staff_id,expires_at)
 VALUES (repeat('a',64),'20000000-0000-0000-0000-000000000001',now()+interval '1 hour');
 BEGIN
  INSERT INTO einfak.staff_sessions(token_hash,staff_id,expires_at)
  VALUES (repeat('a',64),'20000000-0000-0000-0000-000000000001',now()+interval '1 hour');
  RAISE EXCEPTION 'Duplicate session hash allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO einfak.staff_sessions(token_hash,staff_id,expires_at)
  VALUES ('raw-token','20000000-0000-0000-0000-000000000001',now()+interval '1 hour');
  RAISE EXCEPTION 'Malformed session hash allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE einfak.staff_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=repeat('a',64);
 IF NOT EXISTS (SELECT 1 FROM einfak.staff_sessions WHERE token_hash=repeat('a',64) AND revoked_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Session revocation failed';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo Session storage and identity isolation checks passed.
