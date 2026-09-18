-- Plantillas y emisiones de boleto por fideicomiso.
-- Idempotente. Staging / nuevos tenants.

DO $$
DECLARE
  sch text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE nspname LIKE 'tenant_%'
    ORDER BY nspname
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.plantillas_boleto (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        proyecto_id uuid,
        modalidad text NOT NULL,
        con_anticipo boolean NOT NULL DEFAULT false,
        indice text NOT NULL DEFAULT ''NINGUNO'',
        nombre text NOT NULL,
        descripcion text,
        archivo_nombre text NOT NULL,
        archivo_bytes bytea NOT NULL,
        archivo_size int,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )', sch);

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.plantillas_boleto (proyecto_id, modalidad, con_anticipo, indice)',
      sch || '_plantillas_boleto_combo_uidx',
      sch
    );

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.boletos_emitidos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid,
        plantilla_id uuid,
        generado_por text,
        archivo_nombre text,
        formato text,
        generado_at timestamptz NOT NULL DEFAULT now()
      )', sch);
  END LOOP;
END $$;
