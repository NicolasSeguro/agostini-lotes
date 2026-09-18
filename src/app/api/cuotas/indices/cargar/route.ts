import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireRole, sessionLabel, ROLES } from "@/lib/auth";


/**
 * POST /api/cuotas/indices/cargar
 *
 * Carga (o actualiza) un valor de indice mensual en shared.indices_valores.
 *
 * Body JSON:
 *   {
 *     indice: "CAC" | "CVS" | "UVA" | "IPC" | "USD_OFICIAL",
 *     periodo: "2026-06-01",          // dia 1 del mes
 *     porcentaje: 2.0,                 // % mensual (ej 2.0 = 2%)
 *     fuente?: "INDEC" | "CAMARCO" | "BCRA" | "manual",
 *     fecha_publicacion?: "2026-07-15"
 *   }
 *
 * Convencion:
 *   - El usuario carga el PORCENTAJE (mas natural). El endpoint lo convierte
 *     a factor multiplicador (ej: 2.0% -> coeficiente = 1.020).
 *   - El valor_acumulado se recalcula automaticamente segun el historico
 *     existente (multiplica por el ultimo acumulado).
 *
 * Respuesta:
 *   { ok: true, item: {...} }
 */

type Body = {
  indice: string;
  periodo: string;
  porcentaje: number;
  fuente?: string;
  fecha_publicacion?: string;
};

export async function POST(req: NextRequest) {
  const authz = await requireRole(ROLES.CONTABILIDAD);
  if (!authz.ok) return authz.response;
  const session = authz.session;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Validaciones
  const indicesValidos = ["CAC", "CVS", "UVA", "IPC", "USD_OFICIAL", "NINGUNO"];
  if (!body.indice || !indicesValidos.includes(body.indice)) {
    return NextResponse.json(
      { error: `Indice invalido. Debe ser: ${indicesValidos.join(", ")}` },
      { status: 400 }
    );
  }

  if (!body.periodo || !/^\d{4}-\d{2}-\d{2}$/.test(body.periodo)) {
    return NextResponse.json(
      { error: "Periodo invalido. Formato esperado: YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Validar que el dia sea 1
  const dia = parseInt(body.periodo.split("-")[2]);
  if (dia !== 1) {
    return NextResponse.json(
      { error: "El periodo debe ser dia 1 del mes (ej: 2026-06-01)" },
      { status: 400 }
    );
  }

  if (typeof body.porcentaje !== "number" || body.porcentaje < -50 || body.porcentaje > 100) {
    return NextResponse.json(
      { error: "Porcentaje invalido. Debe estar entre -50 y 100" },
      { status: 400 }
    );
  }

  // Convertir % a factor multiplicador
  const coeficiente = 1 + body.porcentaje / 100;
  const fuente = body.fuente || "manual";
  const fechaPublicacion = body.fecha_publicacion || null;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar si ya existe (para sobreescribir)
    const existente = await client.query(
      `SELECT id, coeficiente FROM shared.indices_valores WHERE indice = $1::shared.indice_tipo AND periodo = $2::date`,
      [body.indice, body.periodo]
    );

    // Buscar el valor_acumulado anterior para esa serie
    const previo = await client.query(
      `
      SELECT valor_acumulado
      FROM shared.indices_valores
      WHERE indice = $1::shared.indice_tipo AND periodo < $2::date
      ORDER BY periodo DESC
      LIMIT 1
      `,
      [body.indice, body.periodo]
    );

    const acumuladoPrevio =
      previo.rows.length > 0 ? parseFloat(previo.rows[0].valor_acumulado) : 1.0;
    const nuevoAcumulado = acumuladoPrevio * coeficiente;

    let resultId: string;
    let mensaje: string;

    if (existente.rows.length > 0) {
      // Actualizar existente
      const upd = await client.query(
        `
        UPDATE shared.indices_valores
        SET coeficiente       = $1,
            valor_acumulado   = $2,
            fuente            = $3,
            fecha_publicacion = $4::date
        WHERE indice = $5::shared.indice_tipo AND periodo = $6::date
        RETURNING id, indice, periodo, coeficiente, valor_acumulado, fuente, fecha_publicacion
        `,
        [coeficiente, nuevoAcumulado, fuente, fechaPublicacion, body.indice, body.periodo]
      );
      resultId = upd.rows[0].id;
      mensaje = "Indice actualizado";

      // Recalcular acumulados posteriores (si hay valores cargados despues de este)
      await recalcularAcumuladosPosteriores(client, body.indice, body.periodo);

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, mensaje, item: upd.rows[0] });
    } else {
      // Insertar nuevo
      const ins = await client.query(
        `
        INSERT INTO shared.indices_valores
          (indice, periodo, coeficiente, valor_acumulado, fuente, fecha_publicacion)
        VALUES
          ($1::shared.indice_tipo, $2::date, $3, $4, $5, $6::date)
        RETURNING id, indice, periodo, coeficiente, valor_acumulado, fuente, fecha_publicacion
        `,
        [body.indice, body.periodo, coeficiente, nuevoAcumulado, fuente, fechaPublicacion]
      );
      resultId = ins.rows[0].id;
      mensaje = "Indice cargado";

      // Recalcular acumulados posteriores
      await recalcularAcumuladosPosteriores(client, body.indice, body.periodo);

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, mensaje, item: ins.rows[0] });
    }
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[indices/cargar] ERROR:", err.message, err.detail);
    return NextResponse.json(
      { error: `Error al cargar indice: ${err.message}`, sql_detail: err.detail || null },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * Recalcula valor_acumulado de todos los registros posteriores al periodo dado.
 * Necesario si insertamos un valor "intermedio" o si modificamos uno.
 */
async function recalcularAcumuladosPosteriores(
  client: any,
  indice: string,
  desdePeriodo: string
): Promise<void> {
  const posteriores = await client.query(
    `
    SELECT id, periodo, coeficiente
    FROM shared.indices_valores
    WHERE indice = $1::shared.indice_tipo AND periodo > $2::date
    ORDER BY periodo ASC
    `,
    [indice, desdePeriodo]
  );

  if (posteriores.rows.length === 0) return;

  // Obtener el acumulado del periodo justo anterior (o 1.0 si no hay)
  const ancla = await client.query(
    `
    SELECT valor_acumulado
    FROM shared.indices_valores
    WHERE indice = $1::shared.indice_tipo AND periodo <= $2::date
    ORDER BY periodo DESC
    LIMIT 1
    `,
    [indice, desdePeriodo]
  );

  let acumulado = ancla.rows.length > 0 ? parseFloat(ancla.rows[0].valor_acumulado) : 1.0;

  // Aplicar coeficientes en cascada
  for (const row of posteriores.rows) {
    acumulado = acumulado * parseFloat(row.coeficiente);
    await client.query(
      `UPDATE shared.indices_valores SET valor_acumulado = $1 WHERE id = $2`,
      [acumulado, row.id]
    );
  }
}
