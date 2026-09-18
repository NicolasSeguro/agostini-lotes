-- Catalogo shared.personas + mapping por fideicomiso.
-- NO reescribe FKs de tenant.personas / venta_titulares.
-- Idempotente. Staging only.

CREATE TABLE IF NOT EXISTS shared.personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo shared.persona_tipo DEFAULT 'FISICA',
  doc_tipo shared.doc_tipo DEFAULT 'DNI',
  doc_numero text,
  cuit text,
  apellido text,
  nombre text,
  razon_social text,
  email text,
  telefono text,
  activo boolean DEFAULT true,
  cond_iva shared.cond_iva DEFAULT 'CF',
  fecha_nac date,
  estado_civil text,
  profesion text,
  direccion_localidad text,
  direccion_provincia text,
  doc_norm text GENERATED ALWAYS AS (
    regexp_replace(
      COALESCE(NULLIF(btrim(cuit), ''), NULLIF(btrim(doc_numero), ''), ''),
      '[^0-9]', '', 'g'
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_personas_doc_norm_uidx
  ON shared.personas (doc_norm)
  WHERE doc_norm IS NOT NULL AND length(doc_norm) >= 7;

CREATE TABLE IF NOT EXISTS shared.persona_tenants (
  persona_id uuid NOT NULL REFERENCES shared.personas(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL,
  tenant_persona_id uuid NOT NULL,
  PRIMARY KEY (tenant_slug, tenant_persona_id)
);

CREATE INDEX IF NOT EXISTS shared_persona_tenants_persona_idx
  ON shared.persona_tenants (persona_id);

DO $$
DECLARE
  sch text;
  slug text;
  rec RECORD;
  pid uuid;
  dnorm text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE nspname LIKE 'tenant_%'
      AND nspname <> 'tenant_template'
    ORDER BY nspname
  LOOP
    slug := regexp_replace(sch, '^tenant_', '');
    FOR rec IN EXECUTE format(
      $q$
      SELECT
        id,
        COALESCE(tipo::text, 'FISICA') AS tipo,
        COALESCE(doc_tipo::text, 'DNI') AS doc_tipo,
        doc_numero, cuit, apellido, nombre, razon_social,
        email, telefono, COALESCE(activo, true) AS activo
      FROM %I.personas
      $q$, sch
    )
    LOOP
      dnorm := regexp_replace(
        COALESCE(NULLIF(btrim(rec.cuit), ''), NULLIF(btrim(rec.doc_numero), ''), ''),
        '[^0-9]', '', 'g'
      );
      pid := NULL;
      IF dnorm IS NOT NULL AND length(dnorm) >= 7 THEN
        SELECT id INTO pid FROM shared.personas WHERE doc_norm = dnorm LIMIT 1;
      END IF;
      IF pid IS NULL THEN
        INSERT INTO shared.personas (
          tipo, doc_tipo, doc_numero, cuit, apellido, nombre, razon_social,
          email, telefono, activo
        ) VALUES (
          rec.tipo::shared.persona_tipo,
          rec.doc_tipo::shared.doc_tipo,
          rec.doc_numero, rec.cuit, rec.apellido, rec.nombre, rec.razon_social,
          rec.email, rec.telefono, rec.activo
        )
        RETURNING id INTO pid;
      END IF;
      INSERT INTO shared.persona_tenants (persona_id, tenant_slug, tenant_persona_id)
      VALUES (pid, slug, rec.id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
