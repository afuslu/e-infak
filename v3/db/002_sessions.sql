BEGIN;
CREATE TABLE einfak.staff_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 staff_id uuid NOT NULL REFERENCES einfak.staff(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > created_at)
);
CREATE INDEX staff_sessions_expiry ON einfak.staff_sessions(expires_at);
CREATE INDEX staff_sessions_staff ON einfak.staff_sessions(staff_id);
-- No PUBLIC access. An authentication service role must be provisioned with
-- explicit grants separately; the public website must not receive these grants.
REVOKE ALL ON einfak.staff_sessions FROM PUBLIC;
COMMIT;
