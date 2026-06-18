import { NextRequest, NextResponse } from "next/server";
import { getSchema, getPool } from "@/lib/db";
import { calcularSaldoCuota, esCuotaVigente, toDateString } from "@/lib/cobranza-calc";

type ImputacionInput = {
  cuota_id: string;
  modo: "TOTAL" | "PARCIAL";
  monto_imputar: number;
  bonif_punitorios: number;
  bonif_motivo: string | null;
};

type MedioInput = {
  medio_cobro_id: string;
  monto: number;
  referencia: string | null;
};

type Body = {
  tenant: string;
  tipo: "VIGENTES" | "ADELANTO";
  persona_id: string;
  observaciones: string | null;
  medios: MedioInput[];
  imputaciones: ImputacionInput[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.tenant || !body.persona_id) {
    return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
  }
  if (!body.imputaciones?.length) {
    return NextResponse.json({ error: "Sin cuotas seleccionadas" }, { status: 400 });
  }
  if (!body.medios?.length) {
    return NextResponse.json({ error: "Sin medios de pago" }, { status: 400 });
  }

  // Validar solo 1 parcial cuando hay parciales
  const parciales = body.imputaciones.filter(i => i.modo === "PARCIAL");
  if (parciales.length > 0 && body.imputaciones.length > 1) {
    return NextResponse.json({
      error: "Solo se permite pago parcial con una sola cuota seleccionada"
    }, { status: 400 });
  }

  const schema = getSchema(body.tenant);
  if (!schema) {
    return NextResponse.json({ error: "Fideicomiso inválido" }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validar medios
    const medioIds = body.medios.map(m => m.medio_cobro_id);
    const medRes = await client.query(
      `SELECT id FROM shared.medios_cobro WHERE id = ANY($1::uuid[]) AND habilitado = true`,
      [medioIds]
    );
    if (medRes.rows.length !== new Set(medioIds).size) {
      throw new Error("Algún medio de pago es inválido o está deshabilitado");
    }

    const sumaMedios = body.medios.reduce((s, m) => s + m.monto, 0);

    // Cargar las cuotas seleccionadas
    const cuotaIds = body.imputaciones.map(i => i.cuota_id);
    const cuotasRes = await client.query(
      `
      SELECT 
        c.id, c.numero, c.fecha_vto, c.estado,
        v.cuota_base AS cuota_base_actual,
        c.capital_gr_orig, c.capital_ex_orig, c.iva_capital_orig,
        c.interes_gr_orig, c.interes_ex_orig, c.iva_interes_orig
      FROM ${schema}.cuotas c
      JOIN ${schema}.ventas v ON v.id = c.venta_id
      JOIN ${schema}.venta_titulares vt ON vt.venta_id = v.id
      WHERE c.id = ANY($1::uuid[])
        AND vt.persona_id = $2::uuid
        AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
      `,
      [cuotaIds, body.persona_id]
    );

    if (cuotasRes.rows.length !== cuotaIds.length) {
      throw new Error("Alguna cuota no pertenece al cliente, ya está paga, o no existe");
    }

    // Si es ADELANTO, verificar que ninguna cuota seleccionada sea vigente
    if (body.tipo === "ADELANTO") {
      const hoy = new Date();
      for (const c of cuotasRes.rows) {
        const fechaVto = toDateString(c.fecha_vto);
        if (esCuotaVigente(fechaVto, hoy)) {
          throw new Error(`La cuota ${c.numero} es vigente (vencida o del mes corriente). No se puede adelantar.`);
        }
      }
      
      // Verificar que el cliente NO tenga otras cuotas vigentes
      const vigentesRes = await client.query(
        `
        SELECT COUNT(*)::int AS n
        FROM ${schema}.cuotas c
        JOIN ${schema}.venta_titulares vt ON vt.venta_id = c.venta_id
        WHERE vt.persona_id = $1::uuid
          AND c.estado IN ('EMITIDA','MORA','PAGA_PARCIAL')
          AND (c.fecha_vto < CURRENT_DATE
               OR (EXTRACT(YEAR FROM c.fecha_vto) = EXTRACT(YEAR FROM CURRENT_DATE)
                   AND EXTRACT(MONTH FROM c.fecha_vto) = EXTRACT(MONTH FROM CURRENT_DATE)))
        `,
        [body.persona_id]
      );
      if (vigentesRes.rows[0].n > 0) {
        throw new Error("El cliente tiene cuotas vigentes pendientes. Cobralas antes de adelantar.");
      }
    }

    // Calcular saldos e imputaciones
    type ImpFinal = {
      cuota_id: string;
      monto_capital: number;
      iva_capital: number;
      monto_interes: number;
      iva_interes: number;
      monto_ajuste: number;
      iva_ajuste: number;
      monto_punitorios: number;
      iva_punitorios: number;
      condonacion_punitorios: number;
      monto_total: number;
      bonif_motivo: string | null;
      cuota_queda_paga: boolean;
    };
    const impFinales: ImpFinal[] = [];

    const hoy = new Date();
    
    for (const cuotaRow of cuotasRes.rows) {
      const inputImp = body.imputaciones.find(i => i.cuota_id === cuotaRow.id);
      if (!inputImp) continue;

      // Cargar imputaciones previas
      const previasRes = await client.query(
        `
        SELECT 
          co.fecha,
          ci.monto_capital, ci.monto_iva, ci.monto_interes,
          ci.monto_ajuste, ci.monto_punitorios, ci.condonacion_punitorios,
          COALESCE(ci.iva_capital, 0) AS iva_capital,
          COALESCE(ci.iva_interes, 0) AS iva_interes,
          COALESCE(ci.iva_ajuste, 0) AS iva_ajuste,
          COALESCE(ci.iva_punitorios, 0) AS iva_punitorios
        FROM ${schema}.cobranza_imputaciones ci
        JOIN ${schema}.cobranzas co ON co.id = ci.cobranza_id
        WHERE ci.cuota_id = $1::uuid AND co.estado = 'CONFIRMADA'
        `,
        [cuotaRow.id]
      );

      const saldo = calcularSaldoCuota(
        {
          id: cuotaRow.id,
          numero: cuotaRow.numero,
          fecha_vto: toDateString(cuotaRow.fecha_vto),
          estado: cuotaRow.estado,
          cuota_base_actual: parseFloat(cuotaRow.cuota_base_actual || 0),
          capital_gr_orig: parseFloat(cuotaRow.capital_gr_orig || 0),
          capital_ex_orig: parseFloat(cuotaRow.capital_ex_orig || 0),
          iva_capital_orig: parseFloat(cuotaRow.iva_capital_orig || 0),
          interes_gr_orig: parseFloat(cuotaRow.interes_gr_orig || 0),
          interes_ex_orig: parseFloat(cuotaRow.interes_ex_orig || 0),
          iva_interes_orig: parseFloat(cuotaRow.iva_interes_orig || 0),
        },
        previasRes.rows.map((p: any) => ({
          fecha: toDateString(p.fecha),
          monto_capital: parseFloat(p.monto_capital || 0),
          monto_iva: parseFloat(p.monto_iva || 0),
          monto_interes: parseFloat(p.monto_interes || 0),
          monto_ajuste: parseFloat(p.monto_ajuste || 0),
          monto_punitorios: parseFloat(p.monto_punitorios || 0),
          condonacion_punitorios: parseFloat(p.condonacion_punitorios || 0),
          iva_capital: parseFloat(p.iva_capital || 0),
          iva_interes: parseFloat(p.iva_interes || 0),
          iva_ajuste: parseFloat(p.iva_ajuste || 0),
          iva_punitorios: parseFloat(p.iva_punitorios || 0),
        })),
        hoy
      );

      // Validar bonificación
      const bonif = inputImp.bonif_punitorios || 0;
      const maxBonif = saldo.punitorios_pendientes + saldo.iva_punitorios_pendientes;
      if (bonif > maxBonif + 0.01) {
        throw new Error(`La bonificación supera los punitorios devengados de la cuota ${cuotaRow.numero}`);
      }
      if (bonif > 0 && (!inputImp.bonif_motivo || inputImp.bonif_motivo.trim().length < 3)) {
        throw new Error(`Falta motivo de bonificación para la cuota ${cuotaRow.numero}`);
      }

      // Calcular imputación (usando la lógica central)
      const { calcularImputacion, montoMinimoParcial, cuotaQuedaPaga } = await import("@/lib/cobranza-calc");
      
      const montoImp = inputImp.monto_imputar;
      
      // Si es parcial, validar mínimo
      if (inputImp.modo === "PARCIAL") {
        const minimo = montoMinimoParcial(saldo, bonif);
        if (montoImp < minimo - 0.01) {
          throw new Error(`El pago parcial de la cuota ${cuotaRow.numero} debe ser al menos ${minimo.toFixed(2)} (punitorios devengados)`);
        }
      }

      // Si es TOTAL, validar que cubra todo
      const totalEsperado = saldo.saldo_total_con_punitorios - bonif;
      if (inputImp.modo === "TOTAL" && Math.abs(montoImp - totalEsperado) > 0.01) {
        throw new Error(`Monto total de cuota ${cuotaRow.numero} no coincide. Esperado: ${totalEsperado.toFixed(2)}, recibido: ${montoImp.toFixed(2)}`);
      }

      const imp = calcularImputacion(saldo, montoImp, bonif);
      const queda_paga = cuotaQuedaPaga(saldo, imp);

      impFinales.push({
        ...imp,
        bonif_motivo: inputImp.bonif_motivo,
        cuota_queda_paga: queda_paga,
      });
    }

    // Suma total de imputaciones debe coincidir con suma de medios
    const sumaImputaciones = impFinales.reduce((s, i) => s + i.monto_total, 0);
    if (Math.abs(sumaImputaciones - sumaMedios) > 0.01) {
      throw new Error(`Suma de medios (${sumaMedios.toFixed(2)}) no coincide con suma de imputaciones (${sumaImputaciones.toFixed(2)})`);
    }

    // Generar número de recibo
    const nroRes = await client.query(
      `SELECT COALESCE(MAX(nro_recibo), 0) + 1 AS sig 
       FROM ${schema}.cobranzas WHERE legacy_id IS NULL`
    );
    const nroRecibo = parseInt(nroRes.rows[0].sig);

    // Insertar cobranza
    const fechaHoy = new Date().toISOString().split("T")[0];
    
    // Construir observaciones agregando motivos de bonificación
    let obsFinal = body.observaciones || "";
    const motivosBonif = impFinales
      .filter(i => i.condonacion_punitorios > 0 && i.bonif_motivo)
      .map((i, idx) => `[Bonif. cuota: ${i.bonif_motivo}]`);
    if (motivosBonif.length > 0) {
      obsFinal = (obsFinal + " " + motivosBonif.join(" ")).trim();
    }

    const cobRes = await client.query(
      `
      INSERT INTO ${schema}.cobranzas 
        (nro_recibo, fecha, persona_id, monto_total, estado, observaciones)
      VALUES ($1, $2::date, $3::uuid, $4, 'CONFIRMADA'::tenant_template.cobranza_estado, $5)
      RETURNING id
      `,
      [nroRecibo, fechaHoy, body.persona_id, sumaMedios, obsFinal || null]
    );
    const cobranzaId = cobRes.rows[0].id;

    // Insertar medios (multi-medio)
    let ordenM = 1;
    for (const m of body.medios) {
      await client.query(
        `
        INSERT INTO ${schema}.cobranza_medios
          (cobranza_id, medio_cobro_id, monto, referencia, orden)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
        `,
        [cobranzaId, m.medio_cobro_id, m.monto, m.referencia, ordenM++]
      );
    }

    // Insertar imputaciones y actualizar cuotas
    let ordenI = 1;
    for (const imp of impFinales) {
      await client.query(
        `
        INSERT INTO ${schema}.cobranza_imputaciones
          (cobranza_id, cuota_id, modo,
           monto_capital, iva_capital,
           monto_interes, iva_interes,
           monto_ajuste, iva_ajuste,
           monto_punitorios, iva_punitorios,
           monto_iva, condonacion_punitorios, orden)
        VALUES ($1::uuid, $2::uuid, $3,
                $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14)
        `,
        [
          cobranzaId,
          imp.cuota_id,
          imp.cuota_queda_paga ? "TOTAL" : "PARCIAL",
          imp.monto_capital, imp.iva_capital,
          imp.monto_interes, imp.iva_interes,
          imp.monto_ajuste, imp.iva_ajuste,
          imp.monto_punitorios, imp.iva_punitorios,
          imp.iva_capital + imp.iva_interes + imp.iva_ajuste + imp.iva_punitorios, // monto_iva acumulado
          imp.condonacion_punitorios,
          ordenI++,
        ]
      );

      // Actualizar estado de cuota
      const nuevoEstado = imp.cuota_queda_paga ? "PAGA" : "PAGA_PARCIAL";
      if (imp.cuota_queda_paga) {
        await client.query(
          `UPDATE ${schema}.cuotas
           SET estado = $2::tenant_template.cuota_estado, fecha_pago = $3::date
           WHERE id = $1::uuid`,
          [imp.cuota_id, nuevoEstado, fechaHoy]
        );
      } else {
        await client.query(
          `UPDATE ${schema}.cuotas
           SET estado = $2::tenant_template.cuota_estado
           WHERE id = $1::uuid`,
          [imp.cuota_id, nuevoEstado]
        );
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      cobranza_id: cobranzaId,
      nro_recibo: nroRecibo,
      monto_total: sumaMedios,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error registrando cobranza:", err);
    return NextResponse.json(
      { error: err.message || "Error al registrar cobranza" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
