-- Tablas minimas por tenant para que dashboard y login funcionen en staging.
-- Complementa schema.sql.

DO $$ BEGIN
  CREATE TYPE tenant_template.cuota_estado AS ENUM (
    'EMITIDA','MORA','PAGA_PARCIAL','PAGA','ANULADA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shared.convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  cuit text,
  fecha_inicio date,
  fecha_fin date,
  tipo_beneficio text,
  valor_beneficio numeric,
  tenants_aplicables jsonb,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['tenant_jacaranda','tenant_tipuana','tenant_alisos','tenant_boulevard']
  LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.personas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre text,
        apellido text,
        razon_social text,
        doc_numero text,
        cuit text,
        telefono text,
        email text,
        deleted_at timestamptz
      )', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proyectos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre text NOT NULL,
        codigo text,
        tipo_proyecto text,
        activo boolean DEFAULT true,
        centro_lat numeric,
        centro_lng numeric,
        config jsonb DEFAULT ''{}''::jsonb
      )', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.lotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        proyecto_id uuid REFERENCES %I.proyectos(id),
        numero text,
        manzana text,
        numero_padron text,
        superficie_m2 numeric,
        frente_ml numeric,
        fondo_ml numeric,
        precio_lista numeric,
        precio_x_m2 numeric,
        moneda text DEFAULT ''ARS'',
        estado tenant_template.lote_estado NOT NULL DEFAULT ''DISPONIBLE''
      )', sch, sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ventas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nro int,
        lote_id uuid,
        convenio_id uuid,
        estado tenant_template.venta_estado NOT NULL DEFAULT ''EN_CARGA'',
        fecha date DEFAULT CURRENT_DATE,
        precio_lista numeric,
        precio_total numeric,
        anticipo numeric,
        descuento_comercial numeric,
        descuento_financiero numeric,
        cant_cuotas int,
        sistema_amort text,
        tasa_interes_mensual numeric,
        fecha_primer_vto date,
        cuota_base numeric,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.cuotas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid REFERENCES %I.ventas(id),
        numero int,
        fecha_vto date,
        estado tenant_template.cuota_estado NOT NULL DEFAULT ''EMITIDA'',
        cuota_base numeric
      )', sch, sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.cobranzas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid,
        persona_id uuid,
        monto_total numeric,
        estado tenant_template.cobranza_estado NOT NULL DEFAULT ''CONFIRMADA'',
        es_anticipo_venta boolean DEFAULT false,
        created_at timestamptz DEFAULT now()
      )', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.venta_titulares (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid,
        persona_id uuid,
        porcentaje numeric,
        solidario boolean DEFAULT false,
        orden int,
        fecha_alta date
      )', sch);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.venta_historial (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        venta_id uuid,
        estado_anterior text,
        estado_nuevo text,
        usuario_label text,
        motivo text,
        metadata jsonb,
        fecha timestamptz DEFAULT now()
      )', sch);
  END LOOP;
END $$;
