-- Columnas que usa la generacion de boletos.
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
    EXECUTE format('ALTER TABLE %I.lotes ADD COLUMN IF NOT EXISTS matricula text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS direccion_calle text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS direccion_numero text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS direccion_barrio text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS sexo text', sch);
    EXECUTE format('ALTER TABLE %I.venta_titulares ADD COLUMN IF NOT EXISTS fecha_baja date', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS medio_pago text', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS banco_origen text', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS numero_operacion text', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS observaciones text', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS anulled_reason text', sch);
    EXECUTE format('ALTER TABLE %I.descuentos_comerciales ADD COLUMN IF NOT EXISTS fecha date DEFAULT CURRENT_DATE', sch);
    EXECUTE format('ALTER TABLE %I.descuentos_comerciales ADD COLUMN IF NOT EXISTS observaciones text', sch);
  END LOOP;
END $$;
