-- Mora + reservas web (API Rosario). Idempotente.

CREATE TABLE IF NOT EXISTS shared.mora_macro (
  id int PRIMARY KEY DEFAULT 1,
  ipc numeric NOT NULL DEFAULT 3.7,
  cac numeric NOT NULL DEFAULT 2.3,
  desempleo numeric NOT NULL DEFAULT 6.3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO shared.mora_macro (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Aplicar en cada schema tenant_* existente.
DO $$
DECLARE
  sch text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.mora_gestiones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid,
        persona_id uuid,
        tipo text NOT NULL,
        notas text,
        promesa_pago_fecha date,
        usuario_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )', sch);
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.reservas_web (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lote_id uuid NOT NULL,
        persona_id uuid,
        origen text NOT NULL DEFAULT ''WEB_360'',
        estado text NOT NULL DEFAULT ''BLOQUEADA'',
        vence_at timestamptz NOT NULL,
        payload jsonb NOT NULL DEFAULT ''{}''::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )', sch);
  END LOOP;
END $$;
