#!/usr/bin/env bash
#
# Accounting reconcile — READ-ONLY. Takes a fingerprint of every acc_* figure that must
# survive a schema change or data migration unchanged, so "no data was lost" is a diff,
# not a promise. Written for Accounting v3 (partial payments, ACCOUNTING_V3_PLAN.md).
#
#   scripts/acc-reconcile.sh > before.txt      # before the deploy / migration
#   scripts/acc-reconcile.sh > after.txt       # after it
#   diff before.txt after.txt                  # must print nothing
#
# stdout = the snapshot (deterministic, diffable). stderr = invariant checks for tables
# that only exist after a phase has shipped (payments, paid_total). Exit 1 if any
# invariant fails, so it can gate a deploy.
#
# Every statement is a SELECT, run inside a READ ONLY transaction: this script cannot
# write even if someone edits a query by mistake.
#
# Server:   PROJECT_DIR=/opt/dom scripts/acc-reconcile.sh   (reads DB_USER/DB_NAME from .env)
# Local:    PG_CONTAINER=dom_acc_rehearsal DB_USER=dom_user DB_NAME=dom_db scripts/acc-reconcile.sh

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/dom}"
PG_CONTAINER="${PG_CONTAINER:-dom_postgres}"

die() { echo "ERROR: $*" >&2; exit 2; }

# Same parsing as backup.sh: never source .env (unquoted cron values glob-expand).
env_val() {
  sed -n -E "s/^[[:space:]]*$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$PROJECT_DIR/.env" | tail -1
}
if [ -z "${DB_USER:-}" ] || [ -z "${DB_NAME:-}" ]; then
  [ -f "$PROJECT_DIR/.env" ] || die "set DB_USER and DB_NAME, or PROJECT_DIR with a .env"
  DB_USER="${DB_USER:-$(env_val DB_USER)}"
  DB_NAME="${DB_NAME:-$(env_val DB_NAME)}"
fi
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || die "DB_USER / DB_NAME are empty"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || die "container $PG_CONTAINER is not running"

q() {
  docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -X -q -At -F ' | ' \
    -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY;" -c "$1" -c "COMMIT;"
}
has_table()  { [ "$(q "SELECT to_regclass('public.$1') IS NOT NULL")" = "t" ]; }
has_column() { [ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$1' AND column_name='$2'")" = "1" ]; }
section() { printf '\n## %s\n' "$1"; }

# ─── Snapshot (stdout) ────────────────────────────────────────────────────────
echo "# acc-reconcile snapshot"
echo "# Only pre-v3 columns are fingerprinted, so columns a phase ADDS never change this output."

section "row counts"
q "
SELECT 'acc_sales live',              count(*) FROM acc_sales WHERE deleted_at IS NULL
UNION ALL SELECT 'acc_sales binned',  count(*) FROM acc_sales WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'acc_sale_items',    count(*) FROM acc_sale_items
UNION ALL SELECT 'acc_sale_attachments', count(*) FROM acc_sale_attachments
UNION ALL SELECT 'acc_expenses live', count(*) FROM acc_expenses WHERE deleted_at IS NULL
UNION ALL SELECT 'acc_expenses binned', count(*) FROM acc_expenses WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'acc_expense_items', count(*) FROM acc_expense_items
UNION ALL SELECT 'acc_expense_attachments', count(*) FROM acc_expense_attachments
UNION ALL SELECT 'acc_customers',     count(*) FROM acc_customers
UNION ALL SELECT 'acc_vendors',       count(*) FROM acc_vendors
UNION ALL SELECT 'acc_items',         count(*) FROM acc_items
UNION ALL SELECT 'acc_categories',    count(*) FROM acc_categories
UNION ALL SELECT 'acc_stores',        count(*) FROM acc_stores
UNION ALL SELECT 'acc_company_profiles', count(*) FROM acc_company_profiles
UNION ALL SELECT 'acc_counters',      count(*) FROM acc_counters"

section "sales by status (live / binned): count | sum(total) | count(total=0)"
q "SELECT CASE WHEN deleted_at IS NULL THEN 'live' ELSE 'binned' END, status, count(*), sum(total), count(*) FILTER (WHERE total = 0)
   FROM acc_sales GROUP BY 1, 2 ORDER BY 1, 2"

section "sales PAID by legacy payment method (what the payment migration reads): method | count | sum(total)"
q "SELECT coalesce(payment_method::text, '(none)'), count(*), sum(total)
   FROM acc_sales WHERE status = 'PAID' GROUP BY 1 ORDER BY 1"

section "expenses by status (live / binned): count | sum(total) | count(total=0)"
q "SELECT CASE WHEN deleted_at IS NULL THEN 'live' ELSE 'binned' END, status, count(*), sum(total), count(*) FILTER (WHERE total = 0)
   FROM acc_expenses GROUP BY 1, 2 ORDER BY 1, 2"

section "expenses PAID by legacy payment method: method | count | sum(total)"
q "SELECT coalesce(payment_method::text, '(none)'), count(*), sum(total)
   FROM acc_expenses WHERE status = 'PAID' GROUP BY 1 ORDER BY 1"

section "live sales per month of date_issued: month | count | sum(total)"
q "SELECT to_char(date_issued, 'YYYY-MM'), count(*), sum(total)
   FROM acc_sales WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1"

section "live expenses per month of date_issued: month | count | sum(total)"
q "SELECT to_char(date_issued, 'YYYY-MM'), count(*), sum(total)
   FROM acc_expenses WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1"

section "line items: sum(line_total) sales | expenses"
q "SELECT (SELECT coalesce(sum(line_total), 0) FROM acc_sale_items), (SELECT coalesce(sum(line_total), 0) FROM acc_expense_items)"

section "headers whose total differs from their line items (information, stable over time)"
q "SELECT 'sales', count(*) FROM acc_sales s
     WHERE s.total <> coalesce((SELECT sum(line_total) FROM acc_sale_items i WHERE i.sale_id = s.id), 0)
   UNION ALL
   SELECT 'expenses', count(*) FROM acc_expenses e
     WHERE e.total <> coalesce((SELECT sum(line_total) FROM acc_expense_items i WHERE i.expense_id = e.id), 0)"

# md5 over the ordered rows of the columns that existed before v3. Any changed value,
# added or removed row flips the hash; columns added later are deliberately left out.
section "fingerprints (md5 of pre-v3 columns, ordered by id)"
q "SELECT 'acc_sales', md5(coalesce(string_agg(concat_ws('~', id, tenant_id, invoice_no, customer_type, customer_id, customer_name,
       customer_address, customer_email, customer_number, contact_person, date_issued, due_date, order_reference,
       sales_agent_id, sales_agent_name, sale_channel, store_name, status, payment_method, bank_name, account_name,
       reference_number, gcash_number, subtotal, discount_total, tax_total, total, note, deleted_at, created_at), '|' ORDER BY id), ''))
   FROM acc_sales
   UNION ALL SELECT 'acc_sale_items', md5(coalesce(string_agg(concat_ws('~', id, sale_id, item_id, item_name, category_id, category_name,
       description, quantity, unit_cost, discount_pct, tax_pct, line_total), '|' ORDER BY id), ''))
   FROM acc_sale_items
   UNION ALL SELECT 'acc_sale_attachments', md5(coalesce(string_agg(concat_ws('~', id, sale_id, category, file_name, mime,
       original_name, size_bytes, uploaded_at), '|' ORDER BY id), ''))
   FROM acc_sale_attachments
   UNION ALL SELECT 'acc_expenses', md5(coalesce(string_agg(concat_ws('~', id, tenant_id, purchase_no, invoice_number, country,
       vendor_id, vendor_name, date_issued, due_date, status, payment_method, paid_by, subtotal, discount_total, tax_total,
       total, deleted_at, created_at), '|' ORDER BY id), ''))
   FROM acc_expenses
   UNION ALL SELECT 'acc_expense_items', md5(coalesce(string_agg(concat_ws('~', id, expense_id, item_id, item_name, category_id,
       category_name, subcategory_id, subcategory_name, description, quantity, unit_cost, discount_pct, tax_pct, line_total),
       '|' ORDER BY id), ''))
   FROM acc_expense_items
   UNION ALL SELECT 'acc_expense_attachments', md5(coalesce(string_agg(concat_ws('~', id, expense_id, category, file_name, mime,
       original_name, size_bytes, uploaded_at), '|' ORDER BY id), ''))
   FROM acc_expense_attachments
   UNION ALL SELECT 'acc_customers', md5(coalesce(string_agg(concat_ws('~', id, tenant_id, type, name, address, email,
       contact_person, contact_number, sales_agent_name), '|' ORDER BY id), ''))
   FROM acc_customers
   UNION ALL SELECT 'acc_vendors', md5(coalesce(string_agg(concat_ws('~', id, tenant_id, name, email, contact_number, address),
       '|' ORDER BY id), ''))
   FROM acc_vendors
   UNION ALL SELECT 'acc_counters', md5(coalesce(string_agg(concat_ws('~', id, value), '|' ORDER BY id), ''))
   FROM acc_counters"

# ─── Invariants (stderr) — only for what a phase has already added ─────────────
fail=0
check() { # label, SQL returning a count that must be 0
  local n; n="$(q "$2")"
  if [ "$n" = "0" ]; then echo "PASS  $1" >&2; else echo "FAIL  $1: $n" >&2; fail=1; fi
}
echo "" >&2
echo "invariants:" >&2

ledger_checks() { # parent table, payments table, fk column, label
  local parent="$1" pay="$2" fk="$3" label="$4"
  if has_table "$pay" && has_column "$parent" paid_total; then
    check "$label: paid_total = sum of non-voided payments" \
      "SELECT count(*) FROM $parent p WHERE p.paid_total <> coalesce((SELECT sum(amount) FROM $pay x WHERE x.$fk = p.id AND x.voided_at IS NULL), 0)"
    check "$label: paid_total never above total" \
      "SELECT count(*) FROM $parent WHERE paid_total > total"
    check "$label: no zero or negative payment" \
      "SELECT count(*) FROM $pay WHERE amount <= 0"
    check "$label: status matches paid_total (total 0 = PAID)" \
      "SELECT count(*) FROM $parent WHERE status::text <> CASE WHEN paid_total >= total THEN 'PAID' WHEN paid_total > 0 THEN 'PARTIAL' ELSE 'UNPAID' END"
    check "$label: every PAID row with total > 0 has a payment" \
      "SELECT count(*) FROM $parent p WHERE p.status = 'PAID' AND p.total > 0 AND NOT EXISTS (SELECT 1 FROM $pay x WHERE x.$fk = p.id AND x.voided_at IS NULL)"
  else
    echo "skip  $label: no payments table yet" >&2
  fi
}
ledger_checks acc_sales    acc_sale_payments    sale_id    "sales"
ledger_checks acc_expenses acc_expense_payments expense_id "expenses"

exit "$fail"
