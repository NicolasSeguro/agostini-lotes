-- Datos de demostracion para staging. Idempotente sobre tablas tenant.

INSERT INTO shared.medios_cobro (codigo, nombre, tipo, habilitado, orden)
VALUES
  ('EFE', 'Efectivo', 'EFECTIVO', true, 1),
  ('TRA', 'Transferencia', 'BANCO', true, 2),
  ('CHE', 'Cheque', 'CHEQUE', true, 3)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO shared.convenios (razon_social, cuit, fecha_inicio, fecha_fin, tipo_beneficio, valor_beneficio, tenants_aplicables, observaciones, activo)
SELECT 'Convenio Banco Macro', '30-50000000-1', CURRENT_DATE - 90, CURRENT_DATE + 275, 'PORCENTAJE', 5,
       '["jacaranda","tipuana"]'::jsonb, 'Empleados Macro — demo', true
WHERE NOT EXISTS (SELECT 1 FROM shared.convenios WHERE razon_social = 'Convenio Banco Macro');

INSERT INTO shared.indices_valores (indice, periodo, coeficiente, fuente)
VALUES ('CAC', date_trunc('month', CURRENT_DATE)::date, 1.012, 'demo')
ON CONFLICT (indice, periodo) DO NOTHING;

UPDATE shared.tenants SET
  cuit = CASE slug
    WHEN 'jacaranda' THEN '30-71234001-8'
    WHEN 'tipuana' THEN '30-71234002-5'
    WHEN 'alisos' THEN '30-71234003-2'
    WHEN 'boulevard' THEN '30-71234004-9'
  END,
  cond_iva = 'RI',
  inicio_actividad = DATE '2019-03-01',
  domicilio_fiscal = jsonb_build_object('localidad','San Salvador de Jujuy','provincia','Jujuy'),
  datos_fiscales = jsonb_build_object('banco', jsonb_build_object('cbu','0000003100000000000001'))
WHERE slug IN ('jacaranda','tipuana','alisos','boulevard');

DO $$
DECLARE
  sch text;
  proj uuid;
  p_mora uuid;
  p_ok uuid;
  p_carga uuid;
  p_auth uuid;
  p_rech uuid;
  p_reint uuid;
  p_vend uuid;
  l_mora uuid;
  l_ok uuid;
  l_carga uuid;
  l_auth uuid;
  l_rech uuid;
  l_reint uuid;
  l_res uuid;
  v_mora uuid;
  v_ok uuid;
  v_carga uuid;
  v_auth uuid;
  v_rech uuid;
  v_reint uuid;
  c_paga uuid;
  cob uuid;
  medio uuid;
  i int;
  nro int;
BEGIN
  SELECT id INTO medio FROM shared.medios_cobro WHERE codigo = 'TRA' LIMIT 1;

  FOREACH sch IN ARRAY ARRAY['tenant_jacaranda','tenant_tipuana','tenant_alisos','tenant_boulevard']
  LOOP
    EXECUTE format('TRUNCATE %I.cobranza_imputaciones, %I.cobranza_medios, %I.cobranzas, %I.cuotas, %I.venta_historial, %I.venta_titulares, %I.descuentos_comerciales, %I.ventas, %I.reservas_web, %I.mora_gestiones, %I.lotes, %I.persona_roles, %I.personas, %I.proyectos RESTART IDENTITY CASCADE',
      sch, sch, sch, sch, sch, sch, sch, sch, sch, sch, sch, sch, sch, sch);

    proj := gen_random_uuid();
    EXECUTE format('INSERT INTO %I.proyectos (id, nombre, codigo, tipo_proyecto, activo, config)
      VALUES ($1, $2, $3, ''LOTEO'', true, jsonb_build_object(''tope_desc_financiero_pct'', 0.10))', sch)
      USING proj,
        CASE sch
          WHEN 'tenant_jacaranda' THEN 'Jacaranda Norte'
          WHEN 'tenant_tipuana' THEN 'Tipuana II'
          WHEN 'tenant_alisos' THEN 'Nuevo Alisos 3'
          ELSE 'Boulevard Este'
        END,
        CASE sch
          WHEN 'tenant_jacaranda' THEN 'JAC-N'
          WHEN 'tenant_tipuana' THEN 'TIP-II'
          WHEN 'tenant_alisos' THEN 'ALI-3'
          ELSE 'BLV-E'
        END;

    p_vend := gen_random_uuid();
    p_mora := gen_random_uuid();
    p_ok := gen_random_uuid();
    p_carga := gen_random_uuid();
    p_auth := gen_random_uuid();
    p_rech := gen_random_uuid();
    p_reint := gen_random_uuid();

    EXECUTE format('INSERT INTO %I.personas (id, tipo, doc_tipo, doc_numero, apellido, nombre, cuit, email, telefono, activo, direccion_localidad) VALUES
      ($1, ''FISICA'', ''DNI'', ''30111222'', ''Gomez'', ''Emanuel'', ''20-30111222-3'', ''emanuel@demo.adi'', ''3884111001'', true, ''Jujuy''),
      ($2, ''FISICA'', ''DNI'', ''28444555'', ''Cruz'', ''Mariana'', ''27-28444555-9'', ''mariana@demo.adi'', ''3884111002'', true, ''Palpala''),
      ($3, ''FISICA'', ''DNI'', ''25999888'', ''Rojas'', ''Hector'', ''20-25999888-1'', ''hector@demo.adi'', ''3884111003'', true, ''Jujuy''),
      ($4, ''FISICA'', ''DNI'', ''33123456'', ''Arias'', ''Lucia'', ''27-33123456-4'', ''lucia@demo.adi'', ''3884111004'', true, ''Jujuy''),
      ($5, ''FISICA'', ''DNI'', ''22111000'', ''Paz'', ''Oscar'', ''20-22111000-8'', ''oscar@demo.adi'', ''3884111005'', true, ''Perico''),
      ($6, ''FISICA'', ''DNI'', ''30555000'', ''Suarez'', ''Carla'', ''27-30555000-2'', ''carla@demo.adi'', ''3884111006'', true, ''Jujuy''),
      ($7, ''FISICA'', ''DNI'', ''20222333'', ''Alcoba'', ''Daniel'', ''20-20222333-7'', ''vendedor@demo.adi'', ''3884111099'', true, ''Jujuy'')
    ', sch)
    USING p_mora, p_ok, p_carga, p_auth, p_rech, p_reint, p_vend;

    EXECUTE format('INSERT INTO %I.persona_roles (persona_id, rol) VALUES ($1, ''VENDEDOR'')', sch) USING p_vend;

    FOR i IN 1..10 LOOP
      EXECUTE format('INSERT INTO %I.lotes (id, proyecto_id, numero, manzana, superficie_m2, precio_lista, estado, zona, tiene_agua, tiene_luz)
        VALUES (gen_random_uuid(), $1, $2, $3, 360 + $4, 18000000 + $4 * 250000,
          CASE WHEN $4 <= 6 THEN ''DISPONIBLE''::tenant_template.lote_estado ELSE ''VENDIDO''::tenant_template.lote_estado END,
          ''Manzana A'', true, true)', sch)
      USING proj, lpad(i::text, 2, '0'), 'A', i;
    END LOOP;

    l_res := gen_random_uuid();
    EXECUTE format('INSERT INTO %I.lotes (id, proyecto_id, numero, manzana, superficie_m2, precio_lista, estado, zona)
      VALUES ($1, $2, ''11'', ''B'', 400, 21000000, ''RESERVADO'', ''Premium'')', sch)
    USING l_res, proj;

    l_mora := gen_random_uuid();
    l_ok := gen_random_uuid();
    l_carga := gen_random_uuid();
    l_auth := gen_random_uuid();
    l_rech := gen_random_uuid();
    l_reint := gen_random_uuid();

    EXECUTE format('INSERT INTO %I.lotes (id, proyecto_id, numero, manzana, superficie_m2, precio_lista, estado, zona) VALUES
      ($1, $7, ''12'', ''C'', 380, 19500000, ''VENDIDO'', ''Central''),
      ($2, $7, ''13'', ''C'', 390, 19800000, ''VENDIDO'', ''Central''),
      ($3, $7, ''14'', ''C'', 410, 22000000, ''VENDIDO'', ''Central''),
      ($4, $7, ''15'', ''C'', 370, 19200000, ''VENDIDO'', ''Central''),
      ($5, $7, ''16'', ''C'', 365, 18800000, ''DISPONIBLE'', ''Central''),
      ($6, $7, ''17'', ''C'', 355, 18500000, ''VENDIDO'', ''Central'')', sch)
    USING l_mora, l_ok, l_carga, l_auth, l_rech, l_reint, proj;

    v_mora := gen_random_uuid();
    v_ok := gen_random_uuid();
    v_carga := gen_random_uuid();
    v_auth := gen_random_uuid();
    v_rech := gen_random_uuid();
    v_reint := gen_random_uuid();

    EXECUTE format('INSERT INTO %I.ventas (
      id, nro, lote_id, fecha, estado, precio_lista, precio_total, anticipo, descuento_financiero,
      cant_cuotas, sistema_amort, indice_ajuste, tasa_interes_mensual, cuota_base, fecha_primer_vto,
      requiere_aut_desc_fin, observaciones, dia_vto, moneda, vendedor_id
    ) VALUES
      ($1, 101, $7, CURRENT_DATE - 400, ''CONTABILIZADA'', 19500000, 19500000, 1950000, 0, 48, ''FIJO_SIN_INTERES'', ''CAC'', 0, 365625, CURRENT_DATE - 370, false, ''Cartera en mora — demo'', 10, ''ARS'', $13),
      ($2, 102, $8, CURRENT_DATE - 200, ''CONTABILIZADA'', 19800000, 19800000, 3960000, 0, 36, ''FIJO_SIN_INTERES'', ''CAC'', 0, 440000, CURRENT_DATE - 170, false, ''Al dia — demo'', 10, ''ARS'', $13),
      ($3, 103, $9, CURRENT_DATE - 2, ''EN_CARGA'', 22000000, 22000000, 2200000, 0, 60, ''FIJO_SIN_INTERES'', ''CAC'', 0, 330000, CURRENT_DATE + 28, false, ''Espera autorizacion Laura'', 10, ''ARS'', $13),
      ($4, 104, $10, CURRENT_DATE - 1, ''AUTORIZADA'', 19200000, 19200000, 1920000, 500000, 48, ''FIJO_SIN_INTERES'', ''CAC'', 0, 359375, CURRENT_DATE + 20, true, ''Autorizada, falta contabilidad'', 10, ''ARS'', $13),
      ($5, 105, $11, CURRENT_DATE - 5, ''RECHAZADA_COMERCIAL'', 18800000, 18800000, 0, 0, 48, ''FIJO_SIN_INTERES'', ''NINGUNO'', 0, NULL, NULL, false, ''Rechazo comercial demo'', 10, ''ARS'', $13),
      ($6, 106, $12, CURRENT_DATE - 20, ''PENDIENTE_REINTEGRO'', 18500000, 18500000, 1850000, 0, 12, ''FIJO_SIN_INTERES'', ''NINGUNO'', 0, NULL, NULL, false, ''Rescision netaeable demo'', 10, ''ARS'', $13)
    ', sch)
    USING v_mora, v_ok, v_carga, v_auth, v_rech, v_reint, l_mora, l_ok, l_carga, l_auth, l_rech, l_reint, p_vend;

    EXECUTE format('UPDATE %I.ventas SET solicitud_reintegro_motivo = ''Rescision a pedido del comprador (demo)'', solicitud_reintegro_at = now() - interval ''2 days'' WHERE id = $1', sch)
    USING v_reint;

    EXECUTE format('INSERT INTO %I.venta_titulares (venta_id, persona_id, porcentaje, orden) VALUES
      ($1, $7, 100, 1), ($2, $8, 100, 1), ($3, $9, 100, 1), ($4, $10, 100, 1), ($5, $11, 100, 1), ($6, $12, 100, 1)', sch)
    USING v_mora, v_ok, v_carga, v_auth, v_rech, v_reint, p_mora, p_ok, p_carga, p_auth, p_rech, p_reint;

    EXECUTE format('INSERT INTO %I.venta_historial (venta_id, estado_anterior, estado_nuevo, usuario_label, motivo) VALUES
      ($1, NULL, ''CONTABILIZADA'', ''Laura'', ''Carga inicial demo''),
      ($2, ''EN_CARGA'', ''AUTORIZADA'', ''Laura'', ''Autorizada''),
      ($3, ''EN_CARGA'', ''RECHAZADA_COMERCIAL'', ''Laura'', ''No califica'')', sch)
    USING v_mora, v_auth, v_rech;

    -- 48 cuotas mora: 6 vencidas impagas, resto emitidas futuras, algunas pagas viejas
    FOR nro IN 1..48 LOOP
      EXECUTE format('INSERT INTO %I.cuotas (venta_id, numero, fecha_vto, estado, cuota_base) VALUES
        ($1, $2, $3,
         CASE WHEN $2 <= 6 THEN ''MORA''::tenant_template.cuota_estado
              WHEN $2 BETWEEN 7 AND 12 THEN ''PAGA''::tenant_template.cuota_estado
              ELSE ''EMITIDA''::tenant_template.cuota_estado END,
         365625)', sch)
      USING v_mora, nro, (CURRENT_DATE - ((18 - nro) * 30));
    END LOOP;

    FOR nro IN 1..36 LOOP
      EXECUTE format('INSERT INTO %I.cuotas (venta_id, numero, fecha_vto, estado, cuota_base) VALUES
        ($1, $2, $3,
         CASE WHEN $2 <= 6 THEN ''PAGA''::tenant_template.cuota_estado ELSE ''EMITIDA''::tenant_template.cuota_estado END,
         440000)', sch)
      USING v_ok, nro, (CURRENT_DATE - ((8 - nro) * 30));
    END LOOP;

    EXECUTE format('SELECT id FROM %I.cuotas WHERE venta_id = $1 AND numero = 1', sch) INTO c_paga USING v_ok;

    cob := gen_random_uuid();
    EXECUTE format('INSERT INTO %I.cobranzas (id, venta_id, persona_id, monto_total, estado, es_anticipo_venta, fecha, nro_recibo)
      VALUES ($1, $2, $3, 440000, ''CONFIRMADA'', false, CURRENT_DATE - 12, 501)', sch)
    USING cob, v_ok, p_ok;
    EXECUTE format('INSERT INTO %I.cobranza_medios (cobranza_id, medio_cobro_id, monto) VALUES ($1, $2, 440000)', sch)
    USING cob, medio;
    IF c_paga IS NOT NULL THEN
      EXECUTE format('INSERT INTO %I.cobranza_imputaciones (cobranza_id, cuota_id, monto) VALUES ($1, $2, 440000)', sch)
      USING cob, c_paga;
    END IF;

    cob := gen_random_uuid();
    EXECUTE format('INSERT INTO %I.cobranzas (id, venta_id, persona_id, monto_total, estado, es_anticipo_venta, fecha, nro_recibo)
      VALUES ($1, $2, $3, 1850000, ''CONFIRMADA'', true, CURRENT_DATE - 18, 490)', sch)
    USING cob, v_reint, p_reint;

    EXECUTE format('INSERT INTO %I.mora_gestiones (venta_id, persona_id, tipo, notas, promesa_pago_fecha, usuario_label)
      VALUES ($1, $2, ''LLAMADO'', ''Promesa de pago para fin de mes — demo'', CURRENT_DATE + 10, ''Niko Seguro'')', sch)
    USING v_mora, p_mora;
  END LOOP;
END $$;
