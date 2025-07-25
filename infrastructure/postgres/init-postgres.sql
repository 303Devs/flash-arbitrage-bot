-- PostgreSQL Database Initialization for Flash Arbitrage Bot (Fixed)
-- Creates databases, users, and sets up permissions

-- Create main bot database
CREATE DATABASE flash_arbitrage_bot
    WITH
    OWNER = anthony
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Create Grafana database
CREATE DATABASE grafana_db
    WITH
    OWNER = anthony
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Create main bot user
CREATE USER flash_arbitrage_user WITH
    LOGIN
    NOSUPERUSER
    CREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'your-secure-postgres-password';

-- Create Grafana user
CREATE USER grafana_user WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'grafana_secure_password';

-- Create PostgreSQL exporter user (read-only monitoring)
CREATE USER postgres_exporter WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'your-postgres-exporter-password';

-- Grant permissions to main bot user
GRANT ALL PRIVILEGES ON DATABASE flash_arbitrage_bot TO flash_arbitrage_user;
ALTER DATABASE flash_arbitrage_bot OWNER TO flash_arbitrage_user;

-- Grant permissions to Grafana user
GRANT ALL PRIVILEGES ON DATABASE grafana_db TO grafana_user;
ALTER DATABASE grafana_db OWNER TO grafana_user;

-- Grant monitoring permissions to postgres_exporter
GRANT CONNECT ON DATABASE postgres TO postgres_exporter;
GRANT CONNECT ON DATABASE flash_arbitrage_bot TO postgres_exporter;
GRANT CONNECT ON DATABASE grafana_db TO postgres_exporter;
GRANT pg_monitor TO postgres_exporter;

-- Create extension for monitoring if needed
\c flash_arbitrage_bot;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\c grafana_db;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Display summary
\echo 'PostgreSQL setup completed successfully!'
\echo 'Databases created: flash_arbitrage_bot, grafana_db'
\echo 'Users created: flash_arbitrage_user, grafana_user, postgres_exporter'
