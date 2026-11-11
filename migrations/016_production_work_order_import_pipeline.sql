-- ==============================================================================
-- MoraJaws Migration 016: Production Work Order Import Pipeline & History
-- Establishes dedicated table for tracking import sessions, statuses, audit metrics,
-- unique constraints on work order numbers, and strict service_role lockdown.
-- ==============================================================================

BEGIN;

-- 1. Create work_order_imports table for tracking import batch execution
CREATE TABLE IF NOT EXISTS public.work_order_imports (
  import_id text PRIMARY KEY,
  filename text NOT NULL,
  sheet_name text,
  uploaded_by text NOT NULL,
  uploaded_by_role text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATING', 'PROCESSING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')),
  duplicate_policy text NOT NULL DEFAULT 'skip' CHECK (duplicate_policy IN ('skip', 'update_allowed', 'review')),
  error_summary text,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for efficient lookup, ordering, and idempotency checks
CREATE INDEX IF NOT EXISTS idx_wo_imports_uploaded_at
  ON public.work_order_imports (uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wo_imports_status
  ON public.work_order_imports (status);

CREATE INDEX IF NOT EXISTS idx_wo_imports_uploaded_by
  ON public.work_order_imports (uploaded_by);

-- 3. Ensure work_orders table has import_batch_id, imported_at, and import_date columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'import_batch_id'
  ) THEN
    ALTER TABLE public.work_orders ADD COLUMN import_batch_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'imported_at'
  ) THEN
    ALTER TABLE public.work_orders ADD COLUMN imported_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'import_date'
  ) THEN
    ALTER TABLE public.work_orders ADD COLUMN import_date date;
  END IF;
END $$;

-- 4. Ensure normalized unique index on wo_number is enforced
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_wo_number_normalized
ON public.work_orders (lower(regexp_replace(btrim(wo_number), '\s+', '', 'g')))
WHERE wo_number IS NOT NULL AND btrim(wo_number) <> '';

-- 5. RLS Security: Revoke access from anon/authenticated, grant exclusively to service_role
ALTER TABLE public.work_order_imports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.work_order_imports FROM anon, authenticated;
GRANT ALL ON TABLE public.work_order_imports TO service_role;

-- 6. Trigger to automatically maintain updated_at on work_order_imports
DROP TRIGGER IF EXISTS trg_work_order_imports_updated_at ON public.work_order_imports;
CREATE TRIGGER trg_work_order_imports_updated_at
BEFORE UPDATE ON public.work_order_imports
FOR EACH ROW EXECUTE FUNCTION public.morajaws_set_updated_at();

COMMIT;
