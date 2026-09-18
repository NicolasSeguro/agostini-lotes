-- Alinea el schema minimo de staging con lo que las pantallas esperan.
-- Idempotente. No toca produccion.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE shared.sistema_amort AS ENUM ('FRANCES','ALEMAN','FIJO_SIN_INTERES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared.indice_tipo AS ENUM ('NINGUNO','CAC','UVA','IPC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared.persona_tipo AS ENUM ('FISICA','JURIDICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared.doc_tipo AS ENUM ('DNI','CUIT','PASAPORTE','LC','LE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared.cond_iva AS ENUM ('RI','MONO','EXENTO','CF','NO_RESPONSABLE','RNI','EXTERIOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared.tipo_beneficio AS ENUM ('PORCENTAJE','MONTO_FIJO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'FIDEICOMISO';
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS nombre_fantasia text;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS cuit text;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS cond_iva shared.cond_iva DEFAULT 'RI';
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS inicio_actividad date;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS domicilio_fiscal jsonb DEFAULT '{}'::jsonb;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS datos_fiscales jsonb DEFAULT '{}'::jsonb;
ALTER TABLE shared.tenants ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
UPDATE shared.tenants SET razon_social = COALESCE(razon_social, nombre);
UPDATE shared.tenants SET nombre_fantasia = COALESCE(nombre_fantasia, nombre);
UPDATE shared.tenants SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'porc_gravado', COALESCE(porc_gravado, 0),
  'tasa_punitoria_diaria', 0.004
);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_id_uidx ON shared.tenants (id);

ALTER TABLE shared.convenios ADD COLUMN IF NOT EXISTS tipo_beneficio shared.tipo_beneficio;
ALTER TABLE shared.convenios ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE shared.convenios ADD COLUMN IF NOT EXISTS fecha_fin date;

CREATE TABLE IF NOT EXISTS shared.medios_cobro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'EFECTIVO',
  habilitado boolean NOT NULL DEFAULT true,
  orden int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shared.indices_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indice shared.indice_tipo NOT NULL,
  periodo date NOT NULL,
  coeficiente numeric NOT NULL,
  valor_acumulado numeric,
  fuente text,
  fecha_publicacion date,
  UNIQUE (indice, periodo)
);

DO $$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['tenant_jacaranda','tenant_tipuana','tenant_alisos','tenant_boulevard']
  LOOP
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS tipo shared.persona_tipo DEFAULT ''FISICA''', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS doc_tipo shared.doc_tipo DEFAULT ''DNI''', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS cond_iva shared.cond_iva DEFAULT ''CF''', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS fecha_nac date', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS estado_civil text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS profesion text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS direccion_localidad text', sch);
    EXECUTE format('ALTER TABLE %I.personas ADD COLUMN IF NOT EXISTS direccion_provincia text', sch);

    EXECUTE format('ALTER TABLE %I.proyectos ADD COLUMN IF NOT EXISTS tipo_proyecto text', sch);
    EXECUTE format('ALTER TABLE %I.proyectos ADD COLUMN IF NOT EXISTS config jsonb DEFAULT ''{}''::jsonb', sch);
    EXECUTE format('ALTER TABLE %I.proyectos ADD COLUMN IF NOT EXISTS estado text DEFAULT ''EN_OBRA''', sch);
    EXECUTE format('ALTER TABLE %I.proyectos ADD COLUMN IF NOT EXISTS localidad text', sch);
    EXECUTE format('ALTER TABLE %I.proyectos ADD COLUMN IF NOT EXISTS provincia text', sch);

    EXECUTE format('ALTER TABLE %I.lotes ADD COLUMN IF NOT EXISTS zona text', sch);
    EXECUTE format('ALTER TABLE %I.lotes ADD COLUMN IF NOT EXISTS tiene_agua boolean DEFAULT true', sch);
    EXECUTE format('ALTER TABLE %I.lotes ADD COLUMN IF NOT EXISTS tiene_luz boolean DEFAULT true', sch);

    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS vendedor_id uuid', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS moneda text DEFAULT ''ARS''', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS sistema_amort shared.sistema_amort DEFAULT ''FIJO_SIN_INTERES''', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS indice_ajuste shared.indice_tipo DEFAULT ''CAC''', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS tasa_punitorio_mensual numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS dia_vto int', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS alicuota_iva numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS porc_iva_intereses numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS capital_total_gr numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS capital_total_ex numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS iva_capital_total numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS fecha_boleto date', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS requiere_aut_desc_fin boolean DEFAULT false', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS observaciones text', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT ''{}''::jsonb', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS convenio_razon_social text', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS convenio_tipo_beneficio text', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS convenio_valor_beneficio numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS descuento_convenio numeric', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS solicitud_reintegro_motivo text', sch);
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS solicitud_reintegro_at timestamptz', sch);

    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS fecha date DEFAULT CURRENT_DATE', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS nro_recibo int', sch);
    EXECUTE format('ALTER TABLE %I.cobranzas ADD COLUMN IF NOT EXISTS legacy_id text', sch);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.persona_roles (
      persona_id uuid REFERENCES %I.personas(id),
      rol text NOT NULL,
      PRIMARY KEY (persona_id, rol)
    )', sch, sch);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.descuentos_comerciales (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venta_id uuid,
      concepto text,
      monto numeric
    )', sch);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.cobranza_medios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cobranza_id uuid,
      medio_cobro_id uuid,
      monto numeric,
      orden int DEFAULT 1
    )', sch);
    EXECUTE format('ALTER TABLE %I.cobranza_medios ADD COLUMN IF NOT EXISTS orden int DEFAULT 1', sch);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.cobranza_imputaciones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cobranza_id uuid,
      cuota_id uuid,
      monto numeric
    )', sch);

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.ajustes_ejecuciones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      indice shared.indice_tipo,
      periodo_aplicacion date,
      coeficiente_aplicado numeric,
      estado text DEFAULT ''SIMULADO'',
      cuotas_afectadas int DEFAULT 0,
      contratos_afectados int DEFAULT 0,
      monto_saldo_antes numeric,
      monto_saldo_despues numeric,
      ajuste_total_aplicado numeric,
      ejecutado_at timestamptz
    )', sch);
  END LOOP;
END $$;
