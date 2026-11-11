# MoraJaws PostgreSQL Migrations

This directory contains the database migration scripts for **MoraJaws - Telecom Work Order & Dispatch Management**.

## Available Migrations

### `001_core_morajaws_schema.sql`
Defines the core database schema required by the MoraJaws enterprise dispatch and field operations platform:

1. **`roles`**:
   - Role codes (`super_admin`, `management_data`, `dispatch`, `leader`, `installer`, `it_support`)
   - Granular RBAC permissions stored in JSONB
   - Automatic `updated_at` trigger
2. **`users`**:
   - Authentication fields (`password_hash`, `salt`)
   - Role foreign key constraints referencing `roles(code)`
   - Contractor affiliation (`contractor_id`, `contractor_name`)
   - Coverage area and cluster name
   - Super Admin soft deletion fields (`is_deleted`, `deleted_at`, `deleted_by`, `deletion_reason`)
   - Login tracking (`last_login_at`, `login_count`)
3. **`contractors` & `coverage_areas`**:
   - Partner telecom contractor companies (e.g., MJS, KCS, CFN)
   - Assigned coverage areas (JSONB) and team leaders
4. **`work_orders`**:
   - Core identification (`wo_number`, `id_customer`, `ticket_number`, `date`, `date_upload`)
   - Customer details (`customer_name`, `customer_phone`, `customer_phone_normalized`, `street_name`, `address`, `area`, `cluster_name`)
   - Appointment & scheduling (`appointment_date`, `slot_time`, `ticket_category`)
   - FTTH Telecom infrastructure (`olt_code`, `fdt_code`, `fat_code`, `fat_port`, `dropcore_length`, ONT & router brands, serial numbers, MAC addresses)
   - Contractor & Field Staff assignment (`contractor_id`, `leader_name`, `installer_name`, `installer_contact`, `date_assign_technician`)
   - Status & tracking (`status_wo_agent`, `status_wo_installer`, `status_whatsapp`, `distribution_status`)
   - Super Admin soft deletion & archival (`is_archived`, `archived_at`, `is_deleted`, `deleted_at`, `deleted_by`, `deletion_reason`)
   - Dynamic columns & unmapped headers support (`additional_fields` JSONB, `unmapped_headers` JSONB)
   - Import batch tracking (`import_batch_id`, `import_date`)
5. **`assignments`**:
   - Complete work order technician allocation and reassignment ledger
   - Records previous and new installer, leader, contractor, reason, timestamps, and performing role
6. **`audit_logs`**:
   - Immutable audit trail tracking user actions, entity transitions, states (`previous_state`, `new_state`), IP addresses, and timestamps
7. **`technical_reports`**:
   - Field technician installation/maintenance results, root cause categories, optical power (dBm), device serial numbers, and photos
8. **`user_sessions`**:
   - Stateful session management, timeout tracking, device classification, and token revocation

## Running Migrations

### Using `psql` (Direct PostgreSQL Connection)
```bash
psql -h <HOST> -p 5432 -U <USERNAME> -d <DATABASE_NAME> -f migrations/001_core_morajaws_schema.sql
```

### Using PostgreSQL Connection URL
```bash
psql "$DATABASE_URL" -f migrations/001_core_morajaws_schema.sql
```

### Using Docker PostgreSQL Container
```bash
docker exec -i <CONTAINER_ID_OR_NAME> psql -U postgres -d morajaws < migrations/001_core_morajaws_schema.sql
```

### Default Credentials Seeded
- **Super Admin**: Username `superadmin` / Initial Password `12345678`
- **Management Data**: Username `datamgmt` / Initial Password `12345678`
- **Dispatcher**: Username `dispatch` / Initial Password `12345678`
- **Leader MJS**: Username `leadermjs` / Initial Password `12345678`
- **Installer 1**: Username `installer1` / Initial Password `12345678`
