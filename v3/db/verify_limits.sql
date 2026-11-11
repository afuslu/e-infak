\set ON_ERROR_STOP on
BEGIN;
PREPARE limit_attempt(text,integer) AS
 INSERT INTO einfak.login_limits(key_hash,attempts,expires_at)
 VALUES ($1,1,clock_timestamp()+make_interval(secs => $2::int))
 ON CONFLICT (key_hash) DO UPDATE SET
 attempts=CASE WHEN einfak.login_limits.expires_at<=clock_timestamp() THEN 1
 ELSE LEAST(einfak.login_limits.attempts+1,1000000) END,
 expires_at=CASE WHEN einfak.login_limits.expires_at<=clock_timestamp()
 THEN clock_timestamp()+make_interval(secs => $2::int) ELSE einfak.login_limits.expires_at END
 RETURNING attempts;
EXECUTE limit_attempt(repeat('b',64),900);
EXECUTE limit_attempt(repeat('b',64),900);
DO $$ BEGIN
 IF (SELECT attempts FROM einfak.login_limits WHERE key_hash=repeat('b',64))<>2 THEN
 RAISE EXCEPTION 'Attempt increment failed'; END IF;
END $$;
UPDATE einfak.login_limits SET expires_at=now()-interval '1 second' WHERE key_hash=repeat('b',64);
EXECUTE limit_attempt(repeat('b',64),900);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM einfak.login_limits WHERE key_hash=repeat('b',64) AND attempts=1 AND expires_at>now()) THEN
 RAISE EXCEPTION 'Expired bucket reset failed'; END IF;
END $$;
DEALLOCATE limit_attempt;
ROLLBACK;
\echo Rate limit increment and expiry checks passed.
