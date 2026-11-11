-- Dedicated V3 database only. Fail if names already exist; do not silently
-- change an existing role. Group roles cannot log in and have no passwords.
BEGIN;
CREATE ROLE einfak_v3_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE einfak_v3_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA einfak TO einfak_v3_identity,einfak_v3_reader;
GRANT SELECT ON einfak.staff,einfak.memberships,einfak.organizations TO einfak_v3_identity;
GRANT SELECT,INSERT ON einfak.staff_sessions TO einfak_v3_identity;
GRANT UPDATE(revoked_at) ON einfak.staff_sessions TO einfak_v3_identity;
GRANT SELECT,INSERT,UPDATE ON einfak.login_limits TO einfak_v3_identity;
GRANT SELECT ON einfak.donations,einfak.order_items,einfak.orders TO einfak_v3_reader;
-- Tenant policy only applies to the data role. Identity reads only its own
-- staff memberships and never receives a tenant-wide membership policy.
ALTER POLICY tenant_boundary ON einfak.memberships TO einfak_v3_reader;
ALTER POLICY own_staff_memberships ON einfak.memberships TO einfak_v3_identity;
COMMIT;
