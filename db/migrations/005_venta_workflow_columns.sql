-- Columnas de workflow que el codigo de ventas ya escribe.
-- Idempotente.

DO $$
DECLARE
  sch text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE nspname LIKE 'tenant_%' AND nspname <> 'tenant_template'
    ORDER BY nspname
  LOOP
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS fecha_autorizada timestamptz', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS fecha_contabilizada timestamptz', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS fecha_cerrada_pendiente timestamptz', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS fecha_cerrada_confirmada timestamptz', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS desc_fin_autorizado_at timestamptz', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()', sch);
    EXECUTE format('ALTER TABLE %I.venta_historial ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT ''{}''::jsonb', sch);
  END LOOP;
END $$;
