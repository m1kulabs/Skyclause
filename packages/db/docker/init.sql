-- Runs once, as the superuser, when the container's data directory is created. It stands in for what Neon and
-- Terraform make in production (infra/environments/production/database.tf): `migrator`, a non-superuser login with
-- CREATEROLE and CREATEDB that owns the database, and the app logins it creates. Local passwords equal the login names;
-- the port is published on 127.0.0.1 only.
CREATE ROLE migrator LOGIN CREATEROLE CREATEDB PASSWORD 'migrator';
CREATE DATABASE skyclause OWNER migrator;
SET ROLE migrator;
CREATE ROLE app LOGIN PASSWORD 'app';
CREATE ROLE auth_app LOGIN PASSWORD 'auth_app';
CREATE ROLE "system" LOGIN PASSWORD 'system';
CREATE ROLE retention LOGIN PASSWORD 'retention';
