-- ==============================================================================
-- MORAJAWS POSTGRESQL CORE DATABASE SCHEMA MIGRATION
-- Migration Version: 001_core_morajaws_schema.sql
-- Description: Core schema defining Roles, Users (hashed passwords & RBAC),
--              Contractors, Work Orders (complete FTTH telecom & tracking fields),
--              Assignments & Reassignment History, and Enterprise Audit Logs.
-- ==============================================================================

-- Enable required PostgreSQL extensions for UUID generation and cryptographic utilities
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ENUM TYPES & DOMAIN CONSTRAINTS
-- ==============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE user_role_type AS ENUM (
            'super_admin',
            'dispatch',
            'leader',
            'installer',
            'management_data',
            'it_support'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wo_agent_status_type') THEN
        CREATE TYPE wo_agent_status_type AS ENUM (
            'Pending',
            'Assigned',
            'In Progress',
            'Resolved',
            'Cancelled',
            'Closed'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wo_installer_status_type') THEN
        CREATE TYPE wo_installer_status_type AS ENUM (
            'Unassigned',
            'Assigned',
            'En Route',
            'On Site',
            'Installed',
            'Pending Technical',
            'Failed / Cancelled',
            'Completed'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_status_type') THEN
        CREATE TYPE whatsapp_status_type AS ENUM (
            'not_prepared',
            'ready',
            'opened_in_whatsapp',
            'awaiting_confirmation',
            'confirmed',
            'reschedule_requested',
            'unreachable',
            'invalid_number',
            'cancelled'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wo_distribution_status_type') THEN
        CREATE TYPE wo_distribution_status_type AS ENUM (
            'pending',
            'distributed',
            'auto_distributed',
            'unmapped_contractor',
            'coverage_mismatch',
            'schedule_not_available',
            'unmatched_installer'
        );
    END IF;
END $$;

-- ==============================================================================
-- 2. REUSABLE TRIGGER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. ROLES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_roles_timestamp
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- ==============================================================================
-- 4. CONTRACTORS & COVERAGE AREAS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS contractors (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    coverage_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    leader_id VARCHAR(64),
    leader_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_contractors_timestamp
BEFORE UPDATE ON contractors
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS coverage_areas (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    clusters JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 5. USERS TABLE (Hashed Passwords, Salt, RBAC & Status)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('u-' || replace(gen_random_uuid()::text, '-', '')),
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    alt_email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
    role_id VARCHAR(64) REFERENCES roles(id) ON UPDATE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(100) DEFAULT 'morajaws_secure_salt_2026',
    contractor_id VARCHAR(64) REFERENCES contractors(id) ON DELETE SET NULL,
    contractor VARCHAR(255),
    area VARCHAR(150),
    cluster_name VARCHAR(150),
    active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_login_at TIMESTAMPTZ,
    login_count INTEGER NOT NULL DEFAULT 0,
    
    -- Super Admin Exclusive Soft Delete & Archival
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    archived_by VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),
    deletion_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Fast lookup indexes for authentication and dispatch assignment
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_contractor_id ON users(contractor_id);
CREATE INDEX IF NOT EXISTS idx_users_active_not_deleted ON users(active, is_deleted);

-- ==============================================================================
-- 6. WORK_ORDERS (TICKETS) TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS work_orders (
    -- Identification & Primary Keys
    id VARCHAR(64) PRIMARY KEY DEFAULT ('t-' || replace(gen_random_uuid()::text, '-', '')),
    wo_number VARCHAR(64) NOT NULL UNIQUE,
    work_order_number VARCHAR(64),
    id_customer VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64),
    ticket_number VARCHAR(64),
    ticket_date DATE,
    date DATE NOT NULL,
    date_upload VARCHAR(64),
    file_name VARCHAR(255),
    agent_id VARCHAR(100),

    -- Customer Details & Contact Information
    customer_name VARCHAR(255) NOT NULL,
    end_user_name VARCHAR(255),
    customer_phone VARCHAR(50) NOT NULL,
    customer_contact1 VARCHAR(50),
    customer_contact2 VARCHAR(50),
    customer_contact3 VARCHAR(50),
    customer_phone_normalized VARCHAR(50),
    street_name TEXT,
    street_alternatif TEXT,
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(20),
    cluster_name VARCHAR(150),
    area VARCHAR(150) NOT NULL,

    -- Appointment & Slot Scheduling
    appointment_date DATE,
    appointment_type VARCHAR(100),
    slot_time VARCHAR(100) NOT NULL,
    ticket_category VARCHAR(150) NOT NULL,
    initial_ticket_category VARCHAR(150),

    -- Telecom Network & Technical Infrastructure (FTTH / BASE_DATA_WO)
    installation_type VARCHAR(100),
    service_type VARCHAR(100),
    homepass_type VARCHAR(100),
    homepass_detail_id VARCHAR(100),
    olt_code VARCHAR(100),
    fdt_code VARCHAR(100),
    fat_code VARCHAR(100),
    fat_port VARCHAR(50),
    dropcore_length VARCHAR(50),
    plan VARCHAR(150),
    service_aging_maintenance VARCHAR(100),
    vendor_name VARCHAR(150),
    router VARCHAR(150),
    ont_brand VARCHAR(100),
    ont_model VARCHAR(100),
    router_brand VARCHAR(100),
    router_model VARCHAR(100),
    router_serial_number VARCHAR(100),
    stb1_sn VARCHAR(100),
    stb1_mac VARCHAR(100),
    stb2_sn VARCHAR(100),
    stb2_mac VARCHAR(100),
    stb3_sn VARCHAR(100),
    stb3_mac VARCHAR(100),
    ont_serial_number VARCHAR(100),
    ont_mac_address VARCHAR(100),
    rg_serial_number VARCHAR(100),
    rg_mac_address VARCHAR(100),

    -- Contractor, Field Leader & Assigned Technician
    contactor_name VARCHAR(255),
    contractor_name VARCHAR(255),
    contractor_id VARCHAR(64) REFERENCES contractors(id) ON DELETE SET NULL,
    leader_name VARCHAR(255),
    corlap_name VARCHAR(255),
    corlap_contact VARCHAR(50),
    installer_name VARCHAR(255),
    installer_contact VARCHAR(50),
    installer_contact2 VARCHAR(50),
    installer_email VARCHAR(255),
    date_assign_agent TIMESTAMPTZ,
    date_assign_technician TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    assigned_by VARCHAR(255),
    reassigned_at TIMESTAMPTZ,
    reassigned_by VARCHAR(255),
    reassignment_reason TEXT,

    -- Automated Distribution Engine Tracking
    distribution_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    distribution_notes TEXT,

    -- Operational Statuses & Workflow Progress
    status_wo_agent VARCHAR(50) NOT NULL DEFAULT 'Pending',
    status_wo_installer VARCHAR(50) NOT NULL DEFAULT 'Unassigned',
    status_whatsapp VARCHAR(50) NOT NULL DEFAULT 'not_prepared',
    remarks_wo_installer TEXT,
    remarks_agent TEXT,
    remarks TEXT,

    -- WhatsApp Tracking & Interaction Metrics
    wa_message_preview TEXT,
    wa_generated_url TEXT,
    wa_last_opened_at TIMESTAMPTZ,
    wa_confirmed_at TIMESTAMPTZ,
    wa_confirmed_by VARCHAR(255),
    wa_confirmation_notes TEXT,

    -- Live Communication & Chat Indicators
    chat_messages_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_message_snippet TEXT,

    -- Closure & Reopen Tracking
    closed_at TIMESTAMPTZ,
    closed_by VARCHAR(255),
    close_notes TEXT,
    reopen_reason TEXT,

    -- Technical Report Reference & Embedded Payload
    technical_report JSONB,

    -- Super Admin Soft Deletion & 7-Day / Retention Archival
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    archived_by VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),
    deletion_reason TEXT,

    -- Dynamic Unmapped Headers & Additional Fields
    unmapped_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
    additional_fields JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Import Tracking & Audit Trail
    imported_at TIMESTAMPTZ,
    import_date DATE,
    import_batch_id VARCHAR(100),

    -- System Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

CREATE TRIGGER set_work_orders_timestamp
BEFORE UPDATE ON work_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- High-performance indices for work order dispatching and filtering
CREATE INDEX IF NOT EXISTS idx_wo_number ON work_orders(wo_number);
CREATE INDEX IF NOT EXISTS idx_wo_id_customer ON work_orders(id_customer);
CREATE INDEX IF NOT EXISTS idx_wo_customer_phone ON work_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_wo_phone_normalized ON work_orders(customer_phone_normalized);
CREATE INDEX IF NOT EXISTS idx_wo_date ON work_orders(date);
CREATE INDEX IF NOT EXISTS idx_wo_appointment_date ON work_orders(appointment_date);
CREATE INDEX IF NOT EXISTS idx_wo_status_agent ON work_orders(status_wo_agent);
CREATE INDEX IF NOT EXISTS idx_wo_status_installer ON work_orders(status_wo_installer);
CREATE INDEX IF NOT EXISTS idx_wo_status_wa ON work_orders(status_whatsapp);
CREATE INDEX IF NOT EXISTS idx_wo_contractor_id ON work_orders(contractor_id);
CREATE INDEX IF NOT EXISTS idx_wo_area ON work_orders(area);
CREATE INDEX IF NOT EXISTS idx_wo_cluster_name ON work_orders(cluster_name);
CREATE INDEX IF NOT EXISTS idx_wo_installer_name ON work_orders(installer_name);
CREATE INDEX IF NOT EXISTS idx_wo_distribution_status ON work_orders(distribution_status);
CREATE INDEX IF NOT EXISTS idx_wo_flags ON work_orders(is_deleted, is_archived);
CREATE INDEX IF NOT EXISTS idx_wo_import_batch ON work_orders(import_batch_id);

-- ==============================================================================
-- 7. ASSIGNMENTS TABLE (Work Order Technician Assignment Ledger)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS assignments (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('asgn-' || replace(gen_random_uuid()::text, '-', '')),
    work_order_id VARCHAR(64) NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    wo_number VARCHAR(64) NOT NULL,
    contractor_id VARCHAR(64) REFERENCES contractors(id) ON DELETE SET NULL,
    contractor_name VARCHAR(255),
    leader_id VARCHAR(64),
    leader_name VARCHAR(255),
    previous_installer_name VARCHAR(255),
    previous_installer VARCHAR(255),
    installer_name VARCHAR(255) NOT NULL,
    assigned_installer VARCHAR(255),
    installer_contact VARCHAR(50),
    slot_time VARCHAR(100),
    appointment_date DATE,
    source_action VARCHAR(50) NOT NULL DEFAULT 'initial_assignment',
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    reason TEXT,
    notes TEXT,
    performed_by_id VARCHAR(64),
    performed_by VARCHAR(255) NOT NULL,
    performed_by_role VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assignments_work_order_id ON assignments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_assignments_wo_number ON assignments(wo_number);
CREATE INDEX IF NOT EXISTS idx_assignments_installer ON assignments(installer_name);
CREATE INDEX IF NOT EXISTS idx_assignments_leader ON assignments(leader_name);
CREATE INDEX IF NOT EXISTS idx_assignments_created_at ON assignments(created_at DESC);

-- ==============================================================================
-- 8. AUDIT_LOGS TABLE (Immutable Activity & Change Ledger)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('log_' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '_' || substr(md5(random()::text), 1, 6)),
    action VARCHAR(150) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    performed_by_id VARCHAR(64),
    performed_by VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_role ON audit_logs(user_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ==============================================================================
-- 9. TECHNICAL_REPORTS (Field Engineering & FTTH Root Cause Diagnostics)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS technical_reports (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('tr-' || replace(gen_random_uuid()::text, '-', '')),
    work_order_id VARCHAR(64) NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    ticket_id VARCHAR(64),
    wo_number VARCHAR(64) NOT NULL,
    main_category VARCHAR(150) NOT NULL,
    root_cause VARCHAR(255) NOT NULL,
    sub_category VARCHAR(150),
    root_cause_category VARCHAR(150),
    root_cause_sub_category VARCHAR(150),
    work_result VARCHAR(100) NOT NULL,
    technical_description TEXT NOT NULL,
    corrective_action TEXT NOT NULL,
    used_materials TEXT,
    device_serial_number VARCHAR(100),
    optical_power_dbm VARCHAR(50),
    optical_power_rx VARCHAR(50),
    photo_before_url TEXT,
    photo_after_url TEXT,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    additional_notes TEXT,
    verified_by_dispatch BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    verified_by VARCHAR(255),
    submitted_by VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_technical_reports_timestamp
BEFORE UPDATE ON technical_reports
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX IF NOT EXISTS idx_technical_reports_wo ON technical_reports(work_order_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_wo_number ON technical_reports(wo_number);

-- ==============================================================================
-- 10. USER SESSIONS & TOKENS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('sess-' || replace(gen_random_uuid()::text, '-', '')),
    session_id VARCHAR(100) NOT NULL UNIQUE,
    token VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    contractor VARCHAR(255),
    login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    ip_address VARCHAR(50),
    user_agent TEXT,
    device_type VARCHAR(50) DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON user_sessions(status);

-- ==============================================================================
-- 11. INITIAL SEED DATA
-- ==============================================================================

-- Core MoraJaws Roles
INSERT INTO roles (id, code, name, description, permissions, is_system) VALUES
('role-super-admin', 'super_admin', 'Super Admin', 'Full unrestricted platform access, user provisioning, global auditing, and hard deletion authorization', '["*"]'::jsonb, true),
('role-management-data', 'management_data', 'Management Data Specialist', 'Specialist for batch WO import, deduplication, Excel sync, data validation, and monitoring', '["data.view", "data.validate", "data.import", "data.edit", "data.export", "data.sync.view", "data.audit.view"]'::jsonb, true),
('role-dispatch', 'dispatch', 'Dispatcher Operations', 'Central dispatch console, automated contractor routing, schedule coordination, and WhatsApp template generation', '["wo.view", "wo.dispatch", "wo.assign", "wo.status_update", "whatsapp.generate", "report.view"]'::jsonb, true),
('role-leader', 'leader', 'Korlap / Team Leader', 'Contractor team leader allocating daily work order quotas to field installers and monitoring execution', '["wo.view_assigned", "wo.reassign_installer", "installer.manage", "schedule.view"]'::jsonb, true),
('role-installer', 'installer', 'Field Technician / Installer', 'Mobile-optimized portal for on-site FTTH installation, optical power measurements, and technical reports', '["wo.view_self", "wo.update_progress", "technical_report.submit", "chat.send"]'::jsonb, true),
('role-it-support', 'it_support', 'IT Support & Systems', 'System diagnostics, database sync debugging, and session auditing', '["system.view", "audit.view", "sync.view"]'::jsonb, true)
ON CONFLICT (code) DO NOTHING;

-- Initial Seed Contractors
INSERT INTO contractors (id, name, code, coverage_areas, phone, email, active) VALUES
('c-mjs', 'PT Mitra Jaringan Solusi', 'MJS', '["Jakarta Selatan", "Depok"]'::jsonb, '081288990011', 'ops@mjs.morajaws.net', true),
('c-kcs', 'PT Kencana Solusindo', 'KCS', '["Jakarta Barat", "Tangerang"]'::jsonb, '085711223344', 'ops@kcs.morajaws.net', true),
('c-cfn', 'PT Cipta Fiber Nusantara', 'CFN', '["Tangerang Selatan", "Bogor"]'::jsonb, '081822334455', 'ops@cfn.morajaws.net', true)
ON CONFLICT (code) DO NOTHING;

-- Initial Seed Users (Password hash matching MoraJaws quickHash '28232849' for '12345678')
INSERT INTO users (id, name, username, email, role, role_id, password_hash, active, contractor_id, contractor, area) VALUES
('u-1', 'Alamsyah (Super Admin)', 'superadmin', 'nurhestafauladhea@gmail.com', 'super_admin', 'role-super-admin', '28232849', true, NULL, NULL, NULL),
('u-mgmt', 'Staff Management Data', 'datamgmt', 'data.ops@morajaws.net', 'management_data', 'role-management-data', '28232849', true, NULL, NULL, NULL),
('u-dispatch-1', 'Siti Rahma (Dispatcher)', 'dispatch', 'dispatch@morajaws.net', 'dispatch', 'role-dispatch', '28232849', true, NULL, NULL, NULL),
('u-leader-1', 'Hendra Gunawan (Leader MJS)', 'leadermjs', 'hendra@mjs.morajaws.net', 'leader', 'role-leader', '28232849', true, 'c-mjs', 'PT Mitra Jaringan Solusi', 'Jakarta Selatan'),
('u-installer-1', 'Andi Saputra', 'installer1', 'andi@installer.morajaws.net', 'installer', 'role-installer', '28232849', true, 'c-mjs', 'PT Mitra Jaringan Solusi', 'Jakarta Selatan'),
('u-leader-2', 'Dedi Kurniawan (Leader KCS)', 'leaderkcs', 'dedi@kcs.morajaws.net', 'leader', 'role-leader', '28232849', true, 'c-kcs', 'PT Kencana Solusindo', 'Jakarta Barat'),
('u-installer-2', 'Budi Santoso', 'installer2', 'budi@installer.morajaws.net', 'installer', 'role-installer', '28232849', true, 'c-kcs', 'PT Kencana Solusindo', 'Jakarta Barat')
ON CONFLICT (username) DO NOTHING;

-- Initial Audit Log entry
INSERT INTO audit_logs (id, action, entity, entity_id, details, performed_by, user_role)
VALUES (
    'log_init_migration_001',
    'Database Migration Executed',
    'database',
    'schema_001',
    'PostgreSQL Core Migration 001 executed successfully. Tables roles, users, contractors, work_orders, assignments, audit_logs, technical_reports, and user_sessions initialized.',
    'System Migration Engine',
    'super_admin'
) ON CONFLICT (id) DO NOTHING;
