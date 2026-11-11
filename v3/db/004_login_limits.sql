BEGIN;
CREATE TABLE einfak.login_limits (
 key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
 attempts integer NOT NULL CHECK (attempts > 0),
 expires_at timestamptz NOT NULL
);
CREATE INDEX login_limits_expiry ON einfak.login_limits(expires_at);
REVOKE ALL ON einfak.login_limits FROM PUBLIC;
COMMIT;
