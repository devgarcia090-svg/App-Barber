-- Table privileges for the API roles. RLS still gates WHICH rows each role
-- sees; these GRANTs are the base privilege the policies build on.
--   * authenticated (the owner): direct CRUD, scoped by the owner_* policies.
--   * service_role: full access for admin scripts / setup.
--   * anon: NO direct table access — it only calls the SECURITY DEFINER RPCs
--     (public_* / client_*), which already have EXECUTE grants.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Keep future tables working too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
