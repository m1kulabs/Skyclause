-- Runs once, as the superuser, when the container's data directory is created. It stands in for what Neon and
-- Terraform make in production (infra/environments/production/database.tf): `migrator`, a non-superuser login with
-- CREATEROLE and CREATEDB that owns the database, and the app logins it creates. Local passwords equal the login names;
-- the port is published on 127.0.0.1 only.
-- Neon's migrator is a member of neon_superuser, which holds the predefined data roles and may grant them.
CREATE ROLE neon_superuser NOLOGIN;
GRANT pg_read_all_data, pg_write_all_data TO neon_superuser WITH ADMIN OPTION;
CREATE ROLE migrator LOGIN CREATEROLE CREATEDB IN ROLE neon_superuser PASSWORD 'migrator';
CREATE DATABASE skyclause OWNER migrator;
SET ROLE migrator;
CREATE ROLE app LOGIN PASSWORD 'app';
CREATE ROLE auth_app LOGIN PASSWORD 'auth_app';
CREATE ROLE "system" LOGIN PASSWORD 'system';
CREATE ROLE retention LOGIN PASSWORD 'retention';
