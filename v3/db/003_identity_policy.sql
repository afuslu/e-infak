BEGIN;
-- The trusted authentication service sets this transaction-local value from
-- its session record. Do not accept it from request parameters or headers.
-- SELECT only: does not authorize updating roles or assigning memberships.
CREATE POLICY own_staff_memberships ON einfak.memberships FOR SELECT
 USING (staff_id = nullif(current_setting('einfak.staff_id', true), '')::uuid);
COMMIT;
