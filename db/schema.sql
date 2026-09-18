-- Schema reconstruido desde el codigo del ERP.
-- No reemplaza un pg_dump --schema-only de produccion.
-- Aplicar sobre Postgres 15+ con pgcrypto.

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS tenant_template;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums usados via tenant_template.*
DO $$ BEGIN
  CREATE TYPE tenant_template.venta_estado AS ENUM (
    'EN_CARGA','CERRADA_PENDIENTE','CERRADA_CONFIRMADA','AUTORIZADA',
    'CONTABILIZADA','RECHAZADA_COMERCIAL','RECHAZADA_CONTABILIDAD',
    'PENDIENTE_REINTEGRO','ANULADA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_template.lote_estado AS ENUM (
    'DISPONIBLE','RESERVADO','VENDIDO','RESCINDIDO','ESCRITURADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_template.cobranza_estado AS ENUM (
    'BORRADOR','CONFIRMADA','ANULADA','RECLASIFICADA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shared.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text,
  nombre text NOT NULL,
  rol text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  ultimo_login timestamptz
);

CREATE TABLE IF NOT EXISTS shared.tenants (
  slug text PRIMARY KEY,
  nombre text NOT NULL,
  schema_name text NOT NULL,
  porc_gravado numeric,
  activo boolean NOT NULL DEFAULT true
);

INSERT INTO shared.tenants (slug, nombre, schema_name)
VALUES
  ('jacaranda','Jacaranda','tenant_jacaranda'),
  ('tipuana','Tipuana','tenant_tipuana'),
  ('alisos','Alisos','tenant_alisos'),
  ('boulevard','Boulevard','tenant_boulevard')
ON CONFLICT (slug) DO NOTHING;
