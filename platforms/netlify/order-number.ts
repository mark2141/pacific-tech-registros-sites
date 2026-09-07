import { sql } from "drizzle-orm";
import { equipment } from "../../db/schema.ts";
import { ORDER_SEQUENCE_WIDTH } from "../../lib/order-number.ts";

export function monthlyOrderNumber(prefix: string) {
  const suffixStart = prefix.length + 1;
  // lpad truncates when its target width is smaller than the input. Keep three
  // digits as a minimum, and allow the sequence to grow beyond 999.
  return sql<string>`(
    SELECT ${prefix}::text || lpad(next_sequence,
      GREATEST(${ORDER_SEQUENCE_WIDTH}::int, length(next_sequence)), '0')
    FROM (
      SELECT (COALESCE(MAX(CAST(substr(${equipment.orderNumber}, ${suffixStart}::int) AS INTEGER)), 0) + 1)::text AS next_sequence
      FROM ${equipment}
      WHERE ${equipment.orderNumber} LIKE ${`${prefix}%`}
        AND substr(${equipment.orderNumber}, ${suffixStart}::int) ~ '^[0-9]+$'
    ) AS monthly_sequence
  )`;
}
