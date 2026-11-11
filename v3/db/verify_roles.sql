\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF has_table_privilege('einfak_v3_reader','einfak.staff','SELECT') THEN RAISE EXCEPTION 'Reader can read credentials'; END IF;
 IF has_table_privilege('einfak_v3_reader','einfak.donations','INSERT') THEN RAISE EXCEPTION 'Reader can write donations'; END IF;
 IF has_table_privilege('einfak_v3_identity','einfak.donations','SELECT') THEN RAISE EXCEPTION 'Identity can read donations'; END IF;
 IF has_table_privilege('einfak_v3_identity','einfak.staff','UPDATE') THEN RAISE EXCEPTION 'Identity can modify staff'; END IF;
 IF NOT has_column_privilege('einfak_v3_identity','einfak.staff_sessions','revoked_at','UPDATE') THEN RAISE EXCEPTION 'Logout grant missing'; END IF;
 IF has_column_privilege('einfak_v3_identity','einfak.staff_sessions','staff_id','UPDATE') THEN RAISE EXCEPTION 'Session rebinding allowed'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('einfak_v3_reader','einfak_v3_identity') AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole)) THEN RAISE EXCEPTION 'Unsafe group role'; END IF;
END $$;
ROLLBACK;
\echo Application group role permissions passed.
