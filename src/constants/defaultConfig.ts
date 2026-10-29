import {
  UIConfiguration,
  HeaderMapping,
  WhatsAppTemplate,
  ColumnConfig,
  SectionDetailConfig,
  WorkflowRule,
  Ticket,
  Contractor,
  CoverageArea,
  RootCauseCategory
} from '../types';

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'woNumber', label: 'WO Number', visible: true, order: 1, width: 140, sticky: 'left', format: 'code', sortable: true, filterable: true },
  { key: 'date', label: 'Date', visible: true, order: 2, width: 110, format: 'date', sortable: true },
  { key: 'idCustomer', label: 'Customer ID', visible: true, order: 3, width: 130, format: 'code', sortable: true, filterable: true },
  { key: 'customerName', label: 'Customer Name', visible: true, order: 4, width: 180, sortable: true, filterable: true },
  { key: 'customerPhone', label: 'Phone', visible: true, order: 5, width: 140, format: 'phone' },
  { key: 'area', label: 'Area', visible: true, order: 6, width: 120, sortable: true, filterable: true },
  { key: 'clusterName', label: 'Cluster', visible: true, order: 7, width: 140, sortable: true, filterable: true },
  { key: 'slotTime', label: 'Slot Time', visible: true, order: 8, width: 130, sortable: true },
  { key: 'ticketCategory', label: 'Category', visible: true, order: 9, width: 130, format: 'badge', sortable: true, filterable: true },
  { key: 'contactorName', label: 'Contractor', visible: true, order: 10, width: 140, sortable: true, filterable: true },
  { key: 'installerName', label: 'Installer', visible: true, order: 11, width: 140, sortable: true, filterable: true },
  { key: 'statusWOAgent', label: 'Status Agent', visible: true, order: 12, width: 130, format: 'status_agent', sortable: true, filterable: true },
  { key: 'statusWOInstaller', label: 'Status Installer', visible: true, order: 13, width: 140, format: 'status_installer', sortable: true, filterable: true },
  { key: 'statusWhatsApp', label: 'WhatsApp Status', visible: true, order: 14, width: 160, format: 'status_wa', sortable: true, filterable: true },
  { key: 'fdtCode', label: 'FDT Code', visible: false, order: 15, width: 110, format: 'code' },
  { key: 'fatCode', label: 'FAT Code', visible: false, order: 16, width: 110, format: 'code' },
  { key: 'streetName', label: 'Street Address', visible: false, order: 17, width: 220, wrapText: true },
  { key: 'remarksWOInstaller', label: 'Installer Remarks', visible: false, order: 18, width: 200, wrapText: true },
  { key: 'agentId', label: 'Agent ID', visible: false, order: 19, width: 100 },
  { key: 'dateUpload', label: 'Date Uploaded', visible: false, order: 20, width: 120, format: 'date' },
  { key: 'fileName', label: 'Source File', visible: false, order: 21, width: 150 },
  { key: 'updatedAt', label: 'Last Updated', visible: true, order: 22, width: 130, format: 'date', sortable: true },
  { key: 'actions', label: 'Actions', visible: true, order: 23, width: 140, sticky: 'right', align: 'center' }
];

export const DEFAULT_DETAIL_SECTIONS: SectionDetailConfig[] = [
  {
    id: 'customer_info',
    title: 'Customer Information',
    visible: true,
    order: 1,
    fields: [
      { key: 'customerName', label: 'Customer Name', visible: true, order: 1, width: 'half' },
      { key: 'idCustomer', label: 'Customer ID', visible: true, order: 2, width: 'half', isReadOnly: true },
      { key: 'customerPhone', label: 'Phone Number', visible: true, order: 3, width: 'half' },
      { key: 'area', label: 'Service Area', visible: true, order: 4, width: 'half' },
      { key: 'clusterName', label: 'Cluster / Complex', visible: true, order: 5, width: 'half' },
      { key: 'streetName', label: 'Primary Address', visible: true, order: 6, width: 'full' },
      { key: 'streetAlternatif', label: 'Alternative Address / Landmark', visible: true, order: 7, width: 'full' }
    ]
  },
  {
    id: 'work_order_info',
    title: 'Work Order Information',
    visible: true,
    order: 2,
    fields: [
      { key: 'woNumber', label: 'WO Number', visible: true, order: 1, width: 'half', isReadOnly: true },
      { key: 'ticketCategory', label: 'Category / Service', visible: true, order: 2, width: 'half' },
      { key: 'slotTime', label: 'Scheduled Slot Time', visible: true, order: 3, width: 'half' },
      { key: 'date', label: 'Appointment Date', visible: true, order: 4, width: 'half' },
      { key: 'ticketNumber', label: 'Ticket Reference', visible: true, order: 5, width: 'half' },
      { key: 'fileName', label: 'Import Source File', visible: true, order: 6, width: 'half' }
    ]
  },
  {
    id: 'location_technical',
    title: 'Location & Technical Information',
    visible: true,
    order: 3,
    fields: [
      { key: 'fdtCode', label: 'FDT Code', visible: true, order: 1, width: 'half' },
      { key: 'fatCode', label: 'FAT Code', visible: true, order: 2, width: 'half' },
      { key: 'agentId', label: 'Originating Agent ID', visible: true, order: 3, width: 'half' },
      { key: 'dateUpload', label: 'Upload Date', visible: true, order: 4, width: 'half' }
    ]
  },
  {
    id: 'dispatch_assignment',
    title: 'Dispatch & Personnel Assignment',
    visible: true,
    order: 4,
    fields: [
      { key: 'contactorName', label: 'Contractor Vendor', visible: true, order: 1, width: 'third' },
      { key: 'leaderName', label: 'Assigned Leader / Korlap', visible: true, order: 2, width: 'third' },
      { key: 'installerName', label: 'Assigned Installer / Teknisi', visible: true, order: 3, width: 'third' }
    ]
  },
  {
    id: 'status_reports',
    title: 'Status & Execution Reports',
    visible: true,
    order: 5,
    fields: [
      { key: 'statusWOAgent', label: 'Agent Status', visible: true, order: 1, width: 'half' },
      { key: 'statusWOInstaller', label: 'Installer Field Status', visible: true, order: 2, width: 'half' },
      { key: 'remarksAgent', label: 'Agent Dispatch Notes', visible: true, order: 3, width: 'full' },
      { key: 'remarksWOInstaller', label: 'Installer Field Remarks', visible: true, order: 4, width: 'full' }
    ]
  },
  {
    id: 'whatsapp_confirmation',
    title: 'WhatsApp Customer Confirmation',
    visible: true,
    order: 6,
    fields: [
      { key: 'statusWhatsApp', label: 'Confirmation Status', visible: true, order: 1, width: 'half', isReadOnly: true },
      { key: 'waLastOpenedAt', label: 'Last Opened in WhatsApp', visible: true, order: 2, width: 'half', isReadOnly: true },
      { key: 'waConfirmedAt', label: 'Confirmed At', visible: true, order: 3, width: 'half', isReadOnly: true },
      { key: 'waConfirmedBy', label: 'Confirmed By Officer', visible: true, order: 4, width: 'half', isReadOnly: true },
      { key: 'waConfirmationNotes', label: 'Customer Confirmation Notes', visible: true, order: 5, width: 'full' }
    ]
  }
];

export const DEFAULT_UI_CONFIG: UIConfiguration = {
  id: 'default_config_v1',
  version: 1,
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Administrator',
  global: {
    appName: 'MoraJaws',
    logoIcon: 'Truck',
    primaryColor: 'indigo', // 'blue' | 'indigo' | 'emerald' | 'slate' | 'violet'
    themeMode: 'light',
    fontScale: 'medium',
    density: 'comfortable',
    contentWidth: 'contained',
    borderRadius: 'medium',
    buttonStyle: 'solid',
    tableStyle: 'bordered',
    sidebarState: 'expanded',
    sidebarCollapsed: false,
    toolbarPosition: 'top',
    modalSize: 'large'
  },
  ticketsTable: {
    columns: DEFAULT_COLUMNS,
    density: 'comfortable',
    rowsPerPage: 10,
    showEmptyFields: false,
    activePresetId: 'preset_default',
    presets: [
      {
        id: 'preset_default',
        name: 'Standard Dispatch View',
        description: 'Balanced column layout for general ticket monitoring and routing',
        columns: DEFAULT_COLUMNS,
        density: 'comfortable',
        rowsPerPage: 10
      },
      {
        id: 'preset_compact_dispatch',
        name: 'Compact Operations',
        description: 'High-density grid focused on installer assignments and work status',
        columns: DEFAULT_COLUMNS.map(col => ({
          ...col,
          visible: ['woNumber', 'customerName', 'area', 'installerName', 'slotTime', 'statusWOInstaller', 'statusWhatsApp', 'actions'].includes(col.key),
          width: col.key === 'woNumber' ? 120 : col.width
        })),
        density: 'compact',
        rowsPerPage: 20
      },
      {
        id: 'preset_customer_contact',
        name: 'Customer & WhatsApp Confirmation',
        description: 'Prioritizes customer contact, address, slot time and WhatsApp status',
        columns: DEFAULT_COLUMNS.map(col => ({
          ...col,
          visible: ['woNumber', 'customerName', 'customerPhone', 'slotTime', 'clusterName', 'installerName', 'statusWhatsApp', 'actions'].includes(col.key)
        })),
        density: 'comfortable',
        rowsPerPage: 15
      },
      {
        id: 'preset_technical',
        name: 'Technical & Infrastructure',
        description: 'Focuses on FDT, FAT, category, and technical completion',
        columns: DEFAULT_COLUMNS.map(col => ({
          ...col,
          visible: ['woNumber', 'area', 'clusterName', 'fdtCode', 'fatCode', 'ticketCategory', 'installerName', 'statusWOInstaller', 'actions'].includes(col.key)
        })),
        density: 'compact',
        rowsPerPage: 15
      }
    ]
  },
  toolbar: {
    buttons: [
      { id: 'btn_refresh', label: 'Refresh', icon: 'RotateCw', visible: true, order: 1, group: 'secondary' },
      { id: 'btn_import_wo', label: 'Import WO', icon: 'FileSpreadsheet', visible: true, order: 2, group: 'primary', roleRequired: ['super_admin', 'dispatch'] },
      { id: 'btn_export', label: 'Export Data', icon: 'Download', visible: true, order: 3, group: 'secondary' },
      { id: 'btn_view_presets', label: 'View Presets', icon: 'LayoutGrid', visible: true, order: 4, group: 'secondary' },
      { id: 'btn_table_settings', label: 'Customize Table', icon: 'SlidersHorizontal', visible: true, order: 5, group: 'secondary' },
      { id: 'btn_archive_toggle', label: 'Archived Tickets', icon: 'Archive', visible: true, order: 6, group: 'more_menu' },
      { id: 'btn_bulk_assign', label: 'Bulk Assign', icon: 'UserCheck', visible: true, order: 7, group: 'more_menu', roleRequired: ['super_admin', 'dispatch', 'leader'] }
    ],
    showSearch: true,
    showFilters: true,
    showExport: true,
    showImport: true,
    showArchiveToggle: true,
    showDensityToggle: true
  },
  ticketDetail: {
    showEmptyFields: false,
    sections: DEFAULT_DETAIL_SECTIONS
  },
  pageLayouts: {
    dashboard: { sectionOrder: ['kpi_cards', 'quick_actions', 'contractor_distribution', 'recent_wos'], columns: 4 },
    tickets: { layout: 'table', filterPosition: 'top' },
    importWO: { showInstructions: true },
    detail: { layout: 'two_column' }
  },
  device: {
    mode: 'auto',
    android: {
      layoutType: 'cards',
      touchTargetSize: 'comfortable',
      showBottomNavigation: true,
      cardDensity: 'comfortable',
      showQuickCall: true,
      showQuickWhatsApp: true,
      showQuickDetail: true,
      highContrastBadges: true,
      autoCloseSidebarOnNavigate: true
    },
    pc: {
      tableDensity: 'compact',
      stickyColumns: true,
      wideScreenFullWidth: true,
      showInlineFilters: true,
      showBulkToolbar: true,
      actionButtonsLayout: 'inline_icons',
      multiColumnDetail: true
    }
  }
};

export const STANDARD_HEADER_MAPPINGS: HeaderMapping[] = [
  {
    standardField: 'woNumber',
    label: 'WO Number',
    aliases: ['wo number', 'no wo', 'nomor wo', 'wo_number', 'wo id', 'work order number', 'wonumber', 'no. wo'],
    required: true,
    category: 'core'
  },
  {
    standardField: 'idCustomer',
    label: 'Customer ID',
    aliases: ['id customer', 'customer id', 'no pelanggan', 'id pelanggan', 'cust id', 'id_customer', 'customerid'],
    required: true,
    category: 'customer'
  },
  {
    standardField: 'customerName',
    label: 'Customer Name',
    aliases: ['customer name', 'nama customer', 'nama pelanggan', 'customer_name', 'name', 'nama'],
    required: true,
    category: 'customer'
  },
  {
    standardField: 'customerPhone',
    label: 'Customer Phone',
    aliases: ['customer phone', 'no hp', 'no telp', 'nomor telepon', 'customer_phone', 'phone', 'contact', 'telepon', 'mobile'],
    required: true,
    category: 'customer'
  },
  {
    standardField: 'date',
    label: 'Date',
    aliases: ['date', 'tanggal', 'tgl', 'date wo', 'appointment date', 'tanggal wo'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'slotTime',
    label: 'Slot Time',
    aliases: ['slot time', 'slot_time', 'waktu kunjungan', 'jadwal', 'slot', 'appointment time', 'jam kunjungan'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'contactorName',
    label: 'Contractor Name',
    aliases: ['contactor name', 'contractor name', 'nama kontraktor', 'kategori kontraktor', 'kategori vendor', 'kategori mitra', 'kat kontraktor', 'vendor', 'mitra', 'kontraktor', 'contractor'],
    required: false,
    category: 'assignment'
  },
  {
    standardField: 'area',
    label: 'Area',
    aliases: ['area', 'wilayah', 'regional', 'kota', 'city', 'zone', 'region'],
    required: false,
    category: 'location'
  },
  {
    standardField: 'installerName',
    label: 'Installer Name',
    aliases: ['installer name', 'teknisi', 'nama teknisi', 'installer', 'petugas', 'installer_name', 'technician'],
    required: false,
    category: 'assignment'
  },
  {
    standardField: 'clusterName',
    label: 'Cluster Name',
    aliases: ['cluster name', 'cluster', 'nama cluster', 'perumahan', 'komplek', 'cluster_name'],
    required: false,
    category: 'location'
  },
  {
    standardField: 'fdtCode',
    label: 'FDT Code',
    aliases: ['fdt code', 'fdt', 'kode fdt', 'fdt_code'],
    required: false,
    category: 'technical'
  },
  {
    standardField: 'fatCode',
    label: 'FAT Code',
    aliases: ['fat code', 'fat', 'kode fat', 'fat_code'],
    required: false,
    category: 'technical'
  },
  {
    standardField: 'ticketCategory',
    label: 'Ticket Category',
    aliases: ['ticket category', 'kategori tiket', 'category', 'jenis tiket', 'jenis wo', 'tipe wo', 'tipe tiket'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'statusWOInstaller',
    label: 'Status WO Installer',
    aliases: ['status wo installer', 'status installer', 'status teknisi', 'installer status', 'progres installer'],
    required: false,
    category: 'status'
  },
  {
    standardField: 'remarksWOInstaller',
    label: 'Remarks WO Installer',
    aliases: ['remarks wo installer', 'remarks installer', 'catatan teknisi', 'remarks', 'keterangan teknisi'],
    required: false,
    category: 'status'
  },
  {
    standardField: 'fileName',
    label: 'File Name',
    aliases: ['file name', 'nama file', 'source file', 'file_name'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'dateUpload',
    label: 'Date Upload',
    aliases: ['date upload', 'tgl upload', 'tanggal upload', 'uploaded date', 'date_upload'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'agentId',
    label: 'Agent ID',
    aliases: ['agent id', 'id agent', 'agent', 'petugas agent', 'agent_id'],
    required: false,
    category: 'core'
  },
  {
    standardField: 'streetName',
    label: 'Street Name',
    aliases: ['street name', 'alamat', 'street', 'alamat pelanggan', 'address', 'street_name'],
    required: false,
    category: 'location'
  },
  {
    standardField: 'streetAlternatif',
    label: 'Street Alternatif',
    aliases: ['street alternatif', 'alamat alternatif', 'patokan', 'landmark', 'alamat cadangan'],
    required: false,
    category: 'location'
  }
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl_schedule_confirmation',
    name: 'Konfirmasi Jadwal Kunjungan Teknisi',
    description: 'Pesan standar konfirmasi jadwal kedatangan teknisi dan alamat pemasangan kepada pelanggan',
    category: 'Konfirmasi Jadwal Kunjungan',
    messageBody: `Halo Bapak/Ibu {{customer_name}},

Kami menginformasikan bahwa Work Order Anda telah dijadwalkan dengan detail berikut:

Nomor WO: {{wo_number}}
Nomor Pelanggan: {{customer_id}}
Jadwal Kunjungan: {{slot_time}}
Alamat: {{street_name}}
Cluster: {{cluster_name}}
Teknisi: {{installer_name}}
Kontraktor: {{contractor_name}}

Mohon konfirmasi apakah Bapak/Ibu bersedia menerima kunjungan teknisi pada jadwal tersebut.

Balas "YA" untuk konfirmasi, atau hubungi kami jika ingin mengajukan perubahan jadwal (reschedule).

Terima kasih.
Tim Dispatch & Customer Support`,
    availableVariables: [
      'customer_name',
      'customer_id',
      'customer_phone',
      'wo_number',
      'slot_time',
      'street_name',
      'cluster_name',
      'area',
      'installer_name',
      'contractor_name',
      'ticket_category',
      'date'
    ],
    isDefault: true,
    active: true,
    editableByRole: ['super_admin', 'dispatch', 'leader'],
    createdBy: 'System',
    updatedBy: 'System',
    version: 1,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl_en_route',
    name: 'Teknisi Menuju Lokasi (En Route)',
    description: 'Pemberitahuan bahwa teknisi sedang dalam perjalanan menuju alamat pelanggan',
    category: 'Teknisi Menuju Lokasi',
    messageBody: `Halo Bapak/Ibu {{customer_name}},

Teknisi kami, {{installer_name}} (Mitra: {{contractor_name}}), sedang dalam perjalanan menuju lokasi Anda di {{cluster_name}}, {{area}} untuk pengerjaan WO {{wo_number}}.

Estimasi kedatangan sesuai slot: {{slot_time}}.
Mohon pastikan ada perwakilan di rumah saat teknisi tiba.

Jika ada kendala arah lokasi, teknisi dapat menghubungi nomor ini.

Terima kasih.`,
    availableVariables: [
      'customer_name',
      'customer_id',
      'wo_number',
      'slot_time',
      'cluster_name',
      'area',
      'installer_name',
      'contractor_name'
    ],
    isDefault: false,
    active: true,
    editableByRole: ['super_admin', 'dispatch', 'leader'],
    createdBy: 'System',
    updatedBy: 'System',
    version: 1,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl_reschedule_offer',
    name: 'Penjadwalan Ulang (Reschedule Request)',
    description: 'Template untuk menawarkan opsi jadwal baru bila pelanggan berhalangan',
    category: 'Perubahan Jadwal',
    messageBody: `Halo Bapak/Ibu {{customer_name}},

Menindaklanjuti permohonan reschedule untuk WO {{wo_number}}, saat ini kami menyediakan pilihan slot waktu kunjungan berikutnya.

Mohon informasikan ketersediaan waktu Bapak/Ibu di antara opsi berikut atau ajukan tanggal alternatif yang diinginkan.

Nomor Pelanggan: {{customer_id}}
Cluster: {{cluster_name}}

Kami siap membantu agar pengerjaan dapat berjalan lancar. Terima kasih.`,
    availableVariables: [
      'customer_name',
      'customer_id',
      'wo_number',
      'cluster_name',
      'slot_time'
    ],
    isDefault: false,
    active: true,
    editableByRole: ['super_admin', 'dispatch'],
    createdBy: 'System',
    updatedBy: 'System',
    version: 1,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl_completion_check',
    name: 'Konfirmasi Penyelesaian Pemasangan',
    description: 'Verifikasi kepuasan dan status penyelesaian instalasi dari pelanggan',
    category: 'Konfirmasi Penyelesaian',
    messageBody: `Halo Bapak/Ibu {{customer_name}},

Pengerjaan WO {{wo_number}} oleh teknisi {{installer_name}} telah dilaporkan selesai.

Mohon pastikan layanan sudah dapat digunakan dengan baik. Apabila ada pertanyaan atau catatan perbaikan, silakan sampaikan kepada kami.

Terima kasih atas kerja sama Bapak/Ibu.
Salam hangat, Dispatch Management`,
    availableVariables: [
      'customer_name',
      'wo_number',
      'installer_name',
      'slot_time'
    ],
    isDefault: false,
    active: true,
    editableByRole: ['super_admin', 'dispatch'],
    createdBy: 'System',
    updatedBy: 'System',
    version: 1,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl_installer_assignment',
    name: 'Penugasan WO Teknisi Lapangan (Assignment Notification)',
    description: 'Pesan notifikasi resmi penugasan Work Order dari Leader/Korlap langsung ke nomor WhatsApp teknisi installer',
    category: 'Penugasan Teknisi Lapangan',
    messageBody: `Halo Rekan Teknisi {{installer_name}},

Ada penugasan Work Order baru untuk Anda dari Korlap ({{leader_name}} - {{contractor_name}}):

📌 Detail Work Order:
- No. WO: {{wo_number}}
- Kategori: {{ticket_category}}
- Tanggal Kunjungan: {{appointment_date}}
- Slot Waktu: {{slot_time}}

📍 Lokasi Pelanggan:
- Nama: {{customer_name}}
- No. Kontak Pelanggan: {{customer_phone}}
- Alamat: {{street_name}}
- Patokan: {{street_alternatif}}
- Cluster: {{cluster_name}}
- Area: {{area}}

🔧 Data Jaringan:
- OLT/FDT: {{fdt_code}}
- FAT Code: {{fat_code}}

Harap segera konfirmasi penerimaan tugas melalui Portal Teknisi Lapangan atau balas pesan ini jika siap meluncur.
Terima kasih, selamat bertugas!`,
    availableVariables: [
      'installer_name',
      'installer_phone',
      'leader_name',
      'contractor_name',
      'wo_number',
      'ticket_category',
      'appointment_date',
      'slot_time',
      'customer_name',
      'customer_phone',
      'street_name',
      'street_alternatif',
      'cluster_name',
      'area',
      'fdt_code',
      'fat_code'
    ],
    isDefault: false,
    active: true,
    editableByRole: ['super_admin', 'dispatch', 'leader'],
    createdBy: 'System',
    updatedBy: 'System',
    version: 1,
    lastUpdated: new Date().toISOString()
  }
];

export const DEFAULT_WORKFLOW_RULES: WorkflowRule[] = [
  {
    id: 'wf_assign_prepare_wa',
    name: 'Otomatis Siapkan URL WhatsApp Saat Installer Ditugaskan',
    description: 'Ketika teknisi berhasil di-assign ke tiket, sistem langsung menyiapkan URL konfirmasi WhatsApp dengan template aktif.',
    trigger: 'installer_assigned',
    conditions: [
      { field: 'customerPhone', operator: 'is_not_empty' }
    ],
    actions: [
      { type: 'prepare_whatsapp', templateId: 'tpl_schedule_confirmation', targetStatus: 'ready' },
      { type: 'log_event' }
    ],
    enabled: true,
    executionCount: 14,
    lastExecutedAt: new Date().toISOString()
  },
  {
    id: 'wf_slot_time_changed',
    name: 'Reset Konfirmasi Jika Slot Waktu Berubah',
    description: 'Bila slot waktu kunjungan diubah, set status WhatsApp kembali menjadi Ready dan siapkan pesan update.',
    trigger: 'slot_time_changed',
    conditions: [],
    actions: [
      { type: 'update_wa_status', targetStatus: 'ready' },
      { type: 'prepare_whatsapp', templateId: 'tpl_schedule_confirmation' },
      { type: 'log_event' }
    ],
    enabled: true,
    executionCount: 3,
    lastExecutedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'wf_new_import_validation',
    name: 'Notifikasi & Validasi Saat Tiket Baru Diimpor',
    description: 'Validasi otomatis kelengkapan nomor telepon pelanggan dan cluster saat tiket diimpor.',
    trigger: 'ticket_imported',
    conditions: [],
    actions: [
      { type: 'log_event' }
    ],
    enabled: true,
    executionCount: 42,
    lastExecutedAt: new Date().toISOString()
  }
];

export const INITIAL_SAMPLE_TICKETS: Ticket[] = [];

export const DEFAULT_CONTRACTORS: Contractor[] = [];

export const DEFAULT_COVERAGE_AREAS: CoverageArea[] = [];


export const DEFAULT_ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  {
    id: 'rc-1',
    name: 'Gangguan Fiber Optic dan Jaringan',
    description: 'Kendala pada media transmisi optik, kabel dropcore, redaman, dan pasif optik (FAT/FDT/ODP)',
    items: [
      'Fiber Optic Putus',
      'Kabel Dropcore Rusak',
      'Kabel Dropcore Tertekuk',
      'Redaman Fiber Tinggi',
      'Konektor Fiber Kotor atau Rusak',
      'Splicing Bermasalah',
      'ODP/FAT Bermasalah',
      'FDT Bermasalah',
      'OLT/Port Bermasalah',
      'Jalur Fiber Tidak Tersedia',
      'Gangguan Jaringan Area',
      'Gangguan Backbone atau Distribusi'
    ]
  },
  {
    id: 'rc-2',
    name: 'ONT, Router, dan Wi-Fi',
    description: 'Kendala pada perangkat aktif pelanggan, konfigurasi, sinyal radio Wi-Fi, dan power',
    items: [
      'ONT Rusak',
      'Router Rusak',
      'ONT Tidak Mendapatkan Daya',
      'ONT LOS',
      'ONT Tidak Terhubung ke Jaringan',
      'Router Tidak Menyala',
      'Wi-Fi Tidak Terdeteksi',
      'Wi-Fi Lemah',
      'Interferensi Wi-Fi',
      'Salah Konfigurasi Router',
      'Masalah DHCP atau IP',
      'Perangkat Pelanggan Bermasalah'
    ]
  },
  {
    id: 'rc-3',
    name: 'Instalasi dan Infrastruktur',
    description: 'Kebutuhan pekerjaan fisik tarikan baru, relokasi, tiang, dan ketersediaan port',
    items: [
      'Instalasi Baru',
      'Relokasi Kabel',
      'Penataan Ulang Kabel',
      'Jalur Kabel Terhalang',
      'Kabel Tidak Cukup',
      'Akses Tiang atau Jalur Terkendala',
      'FAT/ODP Tidak Ditemukan',
      'Port Tidak Tersedia',
      'Perangkat Tidak Sesuai',
      'Instalasi Belum Selesai'
    ]
  },
  {
    id: 'rc-4',
    name: 'Pelanggan dan Lokasi',
    description: 'Kendala non-teknis terkait kehadiran pelanggan, akses hunian, dan jadwal',
    items: [
      'Pelanggan Tidak di Tempat',
      'Pelanggan Tidak Dapat Dihubungi',
      'Pelanggan Menolak Pengerjaan',
      'Alamat Tidak Sesuai',
      'Lokasi Tidak Ditemukan',
      'Akses Rumah atau Gedung Terkendala',
      'Perlu Penjadwalan Ulang',
      'Menunggu Persetujuan Pelanggan'
    ]
  },
  {
    id: 'rc-5',
    name: 'Sistem, Administrasi, dan Operasional',
    description: 'Kesalahan data perintah kerja, penugasan personel, atau ketergantungan material/eskalasi',
    items: [
      'Data WO Tidak Sesuai',
      'Duplikasi WO',
      'Salah Assign Teknisi',
      'Salah Data Perangkat',
      'Menunggu Tim Lain',
      'Menunggu Material',
      'Menunggu Eskalasi',
      'Gangguan Sistem',
      'Kendala Operasional Lainnya'
    ]
  }
];

export const DEFAULT_WORK_RESULTS: string[] = [
  'Berhasil Diperbaiki',
  'Berhasil dengan Penggantian Perangkat',
  'Berhasil dengan Perbaikan Kabel',
  'Berhasil setelah Konfigurasi Ulang',
  'Tidak Berhasil',
  'Pekerjaan Tertunda',
  'Perlu Eskalasi',
  'Perlu Kunjungan Ulang'
];

