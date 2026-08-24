/* ------------------------------------------------------------------ */
/* Complete System Flow — all 7 roles, all entities, full data/notif   */
/* ------------------------------------------------------------------ */

export const FLOW_ROLES = [
  "Operator",
  "Manager",
  "Technician",
  "Company Admin",
  "Warehouse",
  "Vendor",
  "Super Admin",
];

export const FLOW_ENTITIES = [
  { id: "request", label: "Request", icon: "ClipboardList" },
  { id: "workorder", label: "Work Order", icon: "Wrench" },
  { id: "asset", label: "Asset", icon: "Boxes" },
  { id: "parts", label: "Spare Parts / Inventory", icon: "Package" },
  { id: "po", label: "Purchase Order", icon: "ShoppingCart" },
  { id: "vendor", label: "Vendor", icon: "Truck" },
  { id: "technician", label: "Technician Performance", icon: "Users" },
];

export const ACTION_TYPES = [
  { id: "create", label: "Create", tone: "primary" },
  { id: "update", label: "Update", tone: "accent" },
  { id: "approve", label: "Approve / Decision", tone: "success" },
  { id: "notify", label: "Notify", tone: "warning" },
  { id: "execute", label: "Execute / Field Action", tone: "muted" },
];

export const NOTIFICATION_CHANNELS = ["in-app", "email", "SMS", "push"];

/* Main 10-step end-to-end flow */
export const MAIN_FLOW_STEPS = [
  {
    id: 1,
    title: "Operator Submits Maintenance Request",
    roles: ["Operator", "Manager"],
    actor: "Operator",
    entities: ["request"],
    actorAction:
      "Login → Request Maintenance menu → Pilih equipment → Pilih kategori kerusakan → Input deskripsi → Set prioritas → Upload foto → Input lokasi → Submit.",
    systemAction:
      "Validasi input → Generate nomor request (REQ-YYYY-MM-001) → Simpan data request → Update status = Submitted.",
    dataCreated: ["Request object baru (equipment, kategori, deskripsi, prioritas, foto, lokasi)"],
    dataUpdated: ["Request status → Submitted"],
    notifications: [
      { to: "Manager", channel: ["in-app", "email", "SMS"], text: "Request baru dari [Operator] untuk [Equipment]" },
    ],
    interactions: ["Operator → System", "System → Manager"],
    duration: "~5–10 menit",
    action: "create",
  },
  {
    id: 2,
    title: "Manager Reviews Request",
    roles: ["Manager"],
    actor: "Manager",
    entities: ["request"],
    actorAction:
      "Terima notifikasi → Login → Maintenance Requests menu → Review detail (equipment, foto, lokasi, kontak operator) → Analisis isu → Putuskan approve/reject.",
    systemAction: "Update status request = Under Review, tandai manager yang menangani.",
    dataCreated: [],
    dataUpdated: ["Request status → Under Review", "Reviewer (manager) assigned"],
    notifications: [],
    interactions: ["Manager → System", "Manager → Request"],
    duration: "~5–15 menit",
    action: "update",
  },
  {
    id: 3,
    title: "Manager Approves & Creates Work Order",
    roles: ["Manager", "Technician"],
    actor: "Manager",
    entities: ["request", "workorder", "technician"],
    actorAction:
      "Klik Approve → Input detail WO (deskripsi, prioritas, estimasi waktu & biaya) → Pilih spare part yang dibutuhkan → Assign ke teknisi (skill, availability, workload).",
    systemAction:
      "Auto-create Work Order (WO-YYYY-MM-001) → Link ke request → Update request status = Approved → Validasi ketersediaan teknisi → Assign WO.",
    dataCreated: ["Work Order object baru (linked ke request)"],
    dataUpdated: ["Request status → Approved", "Technician assignment"],
    notifications: [
      { to: "Technician", channel: ["push", "in-app", "email"], text: "WO-YYYY-MM-001 ditugaskan ke Anda untuk [Equipment]" },
    ],
    interactions: ["Manager → System", "System → Work Order", "System → Technician"],
    duration: "~10–20 menit",
    action: "approve",
  },
  {
    id: 4,
    title: "Technician Receives Assignment",
    roles: ["Technician"],
    actor: "Technician",
    entities: ["workorder"],
    actorAction:
      "Terima notifikasi → Login → Dashboard menampilkan WO baru → Klik WO → Review detail (asset, deskripsi, prioritas, SLA, due date, estimasi waktu/biaya, spare part, checklist).",
    systemAction: "Update status Work Order = Assigned.",
    dataCreated: [],
    dataUpdated: ["Work Order status → Assigned"],
    notifications: [],
    interactions: ["Technician → System", "Technician → Work Order"],
    duration: "~5 menit",
    action: "update",
  },
  {
    id: 5,
    title: "Technician Accepts & Starts Work",
    roles: ["Technician", "Manager"],
    actor: "Technician",
    entities: ["workorder", "asset"],
    actorAction:
      "Terima assignment → Navigasi GPS ke lokasi → Tiba di lokasi → Ambil foto 'before' → Mulai WO (timer start).",
    systemAction: "Update status = In Progress → Mulai time tracking → Rekam lokasi → Simpan foto.",
    dataCreated: ["Foto 'before'"],
    dataUpdated: ["Work Order status → In Progress", "Time tracking started", "Lokasi tercatat"],
    notifications: [{ to: "Manager", channel: ["in-app"], text: "Teknisi [Nama] memulai pekerjaan WO-YYYY-MM-001" }],
    interactions: ["Technician → System", "System → Manager"],
    duration: "Variatif (travel + setup)",
    action: "execute",
  },
  {
    id: 6,
    title: "Technician Executes Work",
    roles: ["Technician", "Warehouse"],
    actor: "Technician",
    entities: ["workorder", "parts"],
    actorAction:
      "Selesaikan item checklist satu per satu → Tambah catatan per item → Gunakan spare part (scan barcode, input qty) → Ambil foto 'during' → Lanjutkan pekerjaan.",
    systemAction:
      "Update completion checklist → Deduksi stok inventory otomatis → Rekam waktu terpakai → Simpan foto.",
    dataCreated: ["Foto 'during'"],
    dataUpdated: ["Checklist items", "Stok inventory (berkurang)", "Time tracking", "Photos"],
    notifications: [
      { to: "Warehouse", channel: ["in-app"], text: "Low stock alert untuk [Nama Part] (jika di bawah minimum)" },
    ],
    interactions: ["Technician → System", "System → Inventory", "System → Warehouse"],
    duration: "Variatif (tergantung kompleksitas)",
    action: "execute",
  },
  {
    id: 7,
    title: "Technician Completes Work",
    roles: ["Technician", "Manager"],
    actor: "Technician",
    entities: ["workorder"],
    actorAction:
      "Selesaikan semua checklist → Ambil foto 'after' → Tambah catatan final → Stop timer → Review detail WO → Tangkap tanda tangan → Submit untuk approval.",
    systemAction:
      "Update status = Pending Approval → Hitung total waktu & biaya → Simpan tanda tangan.",
    dataCreated: ["Foto 'after'", "Signature"],
    dataUpdated: ["Work Order status → Pending Approval", "Total time & cost dihitung"],
    notifications: [
      { to: "Manager", channel: ["in-app", "email"], text: "WO-YYYY-MM-001 selesai & menunggu approval Anda" },
    ],
    interactions: ["Technician → System", "System → Manager"],
    duration: "~5–10 menit",
    action: "execute",
  },
  {
    id: 8,
    title: "Manager Reviews & Approves Completion",
    roles: ["Manager", "Technician", "Operator"],
    actor: "Manager",
    entities: ["workorder", "asset", "technician"],
    actorAction:
      "Terima notifikasi → Login → Work Orders menu → Review WO selesai (foto, catatan, part terpakai, waktu, biaya) → Verifikasi kualitas → Approve.",
    systemAction:
      "Update status = Completed → Update riwayat maintenance asset → Recalculate health score asset → Update performance metrics teknisi → Update biaya maintenance.",
    dataCreated: [],
    dataUpdated: [
      "Work Order status → Completed",
      "Asset maintenance history",
      "Asset health score",
      "Technician performance metrics",
      "Maintenance cost",
    ],
    notifications: [
      { to: "Technician", channel: ["in-app"], text: "WO-YYYY-MM-001 Anda telah diapprove" },
      { to: "Operator", channel: ["in-app", "email"], text: "Request Anda telah diselesaikan oleh [Teknisi]" },
    ],
    interactions: ["Manager → System", "System → Asset", "System → Technician", "System → Operator"],
    duration: "~5–15 menit",
    action: "approve",
  },
  {
    id: 9,
    title: "Parallel Flows Triggered",
    roles: ["Warehouse", "Vendor", "Manager", "Company Admin"],
    actor: "System",
    entities: ["parts", "po", "vendor", "asset"],
    actorAction:
      "Berjalan simultan: Warehouse flow (stok rendah → PO → vendor), Vendor flow (konfirmasi → kirim → invoice), Asset flow (health score → preventive plan), PM flow (auto-generate WO terjadwal).",
    systemAction: "Lihat 4 parallel flow detail di bawah untuk breakdown lengkap tiap alur.",
    dataCreated: ["Purchase Order (kondisional)", "Preventive maintenance plan (kondisional)"],
    dataUpdated: ["Stok inventory", "Asset health score", "PM compliance"],
    notifications: [{ to: "Warehouse / Vendor / Manager", channel: ["in-app", "email"], text: "Bervariasi per alur — lihat detail parallel flow" }],
    interactions: ["System ↔ Warehouse", "System ↔ Vendor", "System ↔ Asset"],
    duration: "Berjalan paralel, tidak menghambat main flow",
    action: "notify",
  },
  {
    id: 10,
    title: "Operator Rates & Provides Feedback",
    roles: ["Operator", "Technician"],
    actor: "Operator",
    entities: ["technician", "workorder"],
    actorAction: "Terima notifikasi → Beri rating teknisi & kualitas kerja → Berikan feedback/komentar.",
    systemAction: "Simpan rating & feedback → Update skor performa teknisi.",
    dataCreated: ["Rating & feedback record"],
    dataUpdated: ["Technician performance score"],
    notifications: [{ to: "Technician", channel: ["in-app"], text: "Anda menerima rating dari [Operator]" }],
    interactions: ["Operator → System", "System → Technician"],
    duration: "~2–5 menit",
    action: "notify",
  },
];

/* Parallel flows — run alongside the main flow */
export const PARALLEL_FLOWS = [
  {
    id: "warehouse",
    title: "Warehouse / Inventory Flow",
    icon: "Boxes",
    roles: ["Technician", "Warehouse", "Manager", "Vendor"],
    entities: ["parts", "po", "vendor"],
    trigger: "Teknisi memakai spare part pada Work Order dan stok turun di bawah batas minimum.",
    steps: [
      { actor: "Technician", action: "Gunakan spare part pada WO → stok otomatis terdeduksi." },
      { actor: "System", action: "Deteksi stok di bawah minimum → auto-create purchase request → notifikasi Warehouse." },
      { actor: "Warehouse", action: "Terima low-stock alert → review inventory → buat Purchase Order → kirim ke Vendor." },
      { actor: "Vendor", action: "Terima PO → konfirmasi penerimaan → beri quotation (harga, lead time, terms)." },
      { actor: "Manager", action: "Approve quotation terbaik." },
      { actor: "Vendor", action: "Kirim barang sesuai jadwal." },
      { actor: "Warehouse", action: "Terima barang → verifikasi qty & kondisi → update stok (stock in) → konfirmasi ke Vendor." },
      { actor: "Manager", action: "Terima invoice → verifikasi → approve pembayaran." },
      { actor: "Vendor", action: "Terima pembayaran → PO ditutup." },
    ],
  },
  {
    id: "vendor",
    title: "Vendor / Procurement Flow",
    icon: "Truck",
    roles: ["Manager", "Warehouse", "Vendor"],
    entities: ["po", "vendor"],
    trigger: "Purchase Order dibuat oleh Manager atau Warehouse Manager untuk kebutuhan spare part.",
    steps: [
      { actor: "Manager / Warehouse", action: "Buat Purchase Order (PO-YYYY-001) → kirim ke Vendor terpilih." },
      { actor: "Vendor", action: "Terima PO → review detail → konfirmasi penerimaan." },
      { actor: "Vendor", action: "Berikan quotation (harga, waktu pengiriman, terms pembayaran)." },
      { actor: "Manager", action: "Bandingkan quotation antar vendor → approve yang terbaik." },
      { actor: "Vendor", action: "Kirim/ship item sesuai kesepakatan." },
      { actor: "Warehouse", action: "Terima item → verifikasi kuantitas & kondisi → update inventory." },
      { actor: "Vendor", action: "Kirim invoice." },
      { actor: "Manager", action: "Verifikasi & approve pembayaran → proses pembayaran." },
      { actor: "Vendor", action: "Terima pembayaran → PO ditutup, performance vendor tercatat." },
    ],
  },
  {
    id: "asset",
    title: "Asset Health & Lifecycle Flow",
    icon: "Boxes",
    roles: ["Manager", "Technician", "Company Admin"],
    entities: ["asset", "workorder"],
    trigger: "Work Order ditutup → riwayat maintenance asset ter-update secara otomatis.",
    steps: [
      { actor: "System", action: "Update riwayat maintenance asset (biaya, downtime, part terpakai)." },
      { actor: "System", action: "Recalculate health score asset berdasarkan histori & kondisi terbaru." },
      { actor: "System", action: "Jika health score rendah → kirim alert ke Manager." },
      { actor: "Manager", action: "Review kondisi asset → tetapkan/jadwalkan preventive maintenance." },
      { actor: "System", action: "Auto-generate Work Order preventive sesuai schedule." },
      { actor: "Technician", action: "Eksekusi WO preventive seperti flow utama." },
      { actor: "Company Admin", action: "Pantau asset lifecycle & rencana replacement bila risiko tinggi." },
    ],
  },
  {
    id: "preventive",
    title: "Preventive Maintenance Flow",
    icon: "CalendarClock",
    roles: ["Manager", "Technician"],
    entities: ["asset", "workorder"],
    trigger: "Manager menetapkan maintenance plan (frekuensi harian/mingguan/bulanan/kuartalan/tahunan) untuk sebuah asset.",
    steps: [
      { actor: "Manager", action: "Buat/atur maintenance plan untuk asset (frekuensi, checklist, trigger kondisi/usage)." },
      { actor: "System", action: "Auto-generate Work Order sesuai jadwal/trigger." },
      { actor: "System", action: "Assign WO ke teknisi yang sesuai skill & availability." },
      { actor: "Technician", action: "Terima notifikasi & eksekusi WO preventive (checklist, foto, waktu)." },
      { actor: "System", action: "Track compliance (planned vs unplanned ratio) & efektivitas." },
      { actor: "Manager", action: "Pantau dashboard compliance & effectiveness metrics; sesuaikan jadwal bila perlu." },
    ],
  },
];

/* Role Interactions Matrix — who talks to whom, how, how often, what data */
export const ROLE_INTERACTIONS = [
  {
    pair: ["Operator", "Manager"],
    types: ["Request submission", "Approve/Reject decision", "Status update notification"],
    frequency: "Selalu",
    data: "Request details, approval/rejection reason, work order status",
  },
  {
    pair: ["Operator", "Technician"],
    types: ["Execution result", "Completion notification", "Rating & feedback"],
    frequency: "Selalu (tidak langsung, via sistem)",
    data: "Work order completion detail, foto before/after, rating teknisi",
  },
  {
    pair: ["Manager", "Technician"],
    types: ["Assignment", "Progress tracking", "Approval/revision", "Feedback"],
    frequency: "Selalu",
    data: "Work order assignment, checklist progress, time & cost, approval status",
  },
  {
    pair: ["Manager", "Warehouse"],
    types: ["Spare part request", "Purchase order approval", "Inventory update notification"],
    frequency: "Sering",
    data: "Part usage, stock level, purchase order status",
  },
  {
    pair: ["Manager", "Vendor"],
    types: ["Purchase order creation", "Quotation review", "Invoice & payment approval"],
    frequency: "Kadang-kadang",
    data: "PO details, quotation (harga/lead time/terms), invoice, payment status",
  },
  {
    pair: ["Manager", "Company Admin"],
    types: ["Preventive schedule assignment", "Analytics reporting", "Escalation"],
    frequency: "Sering",
    data: "Asset & schedule config, performance analytics, escalated issues",
  },
  {
    pair: ["Technician", "Warehouse"],
    types: ["Spare part usage (auto-deduct)", "Stock fulfillment notification"],
    frequency: "Selalu (per work order)",
    data: "Part quantity used, stock level after deduction",
  },
  {
    pair: ["Warehouse", "Vendor"],
    types: ["Purchase order dispatch", "Delivery confirmation", "Invoice matching"],
    frequency: "Kadang-kadang",
    data: "PO number, delivery quantity/condition, invoice reference",
  },
  {
    pair: ["Company Admin", "Manager"],
    types: ["User/permission management", "Preventive maintenance setup", "Asset configuration"],
    frequency: "Sering",
    data: "User roles, asset master data, maintenance plan configuration",
  },
  {
    pair: ["Company Admin", "All Roles"],
    types: ["System configuration", "Analytics visibility", "Vendor & procurement oversight"],
    frequency: "Selalu (governance)",
    data: "Company settings, all-module analytics, vendor master data",
  },
];

/* Data Updates Timeline — what system/module state changes at each core-flow step */
export const DATA_UPDATES_TIMELINE = [
  { step: 1, module: "Requests", change: "Request record dibuat (status: Submitted)", impact: "Muncul di queue review Manager" },
  { step: 2, module: "Requests", change: "Status → Under Review, reviewer assigned", impact: "Operator melihat status berubah di tracking" },
  { step: 3, module: "Requests / Work Orders", change: "Request → Approved; Work Order dibuat & di-link", impact: "WO baru masuk ke antrian assignment" },
  { step: 4, module: "Work Orders", change: "Status → Assigned, teknisi ditugaskan", impact: "Muncul di dashboard teknisi sebagai 'New'" },
  { step: 5, module: "Work Orders / GPS", change: "Status → In Progress, time tracking mulai, lokasi & foto 'before' tersimpan", impact: "Manager melihat progres real-time" },
  { step: 6, module: "Work Orders / Inventory", change: "Checklist item ter-update, stok part terdeduksi, foto 'during' tersimpan", impact: "Trigger low-stock alert bila di bawah minimum" },
  { step: 7, module: "Work Orders", change: "Status → Pending Approval, total waktu & biaya terhitung, signature tersimpan", impact: "Masuk ke antrian approval Manager" },
  { step: 8, module: "Work Orders / Assets / Technicians", change: "Status → Completed, riwayat maintenance asset & health score ter-update, metrik performa teknisi ter-update", impact: "Mempengaruhi rekomendasi preventive maintenance & penilaian teknisi ke depan" },
  { step: 9, module: "Inventory / Procurement / Assets", change: "Alur paralel: PO dibuat/di-update, health score memicu preventive plan", impact: "Menjaga ketersediaan stok & mencegah downtime berulang" },
  { step: 10, module: "Technicians", change: "Rating & feedback tersimpan, skor performa ter-update", impact: "Mempengaruhi rekomendasi assignment berikutnya" },
];

/* Cross-cutting notification log (chronological, for Notification View) */
export const NOTIFICATION_LOG = [
  { step: 1, from: "System", to: "Manager", channel: ["in-app", "email", "SMS"], trigger: "Request submitted", text: "Request baru dari Operator" },
  { step: 3, from: "System", to: "Technician", channel: ["push", "in-app", "email"], trigger: "WO created & assigned", text: "WO baru ditugaskan" },
  { step: 5, from: "System", to: "Manager", channel: ["in-app"], trigger: "Technician started work", text: "Teknisi memulai pekerjaan" },
  { step: 6, from: "System", to: "Warehouse", channel: ["in-app"], trigger: "Stock below minimum", text: "Low stock alert" },
  { step: 7, from: "System", to: "Manager", channel: ["in-app", "email"], trigger: "WO submitted for approval", text: "WO menunggu approval" },
  { step: 8, from: "System", to: "Technician", channel: ["in-app"], trigger: "WO approved", text: "WO Anda diapprove" },
  { step: 8, from: "System", to: "Operator", channel: ["in-app", "email"], trigger: "WO approved", text: "Request Anda selesai" },
  { step: 9, from: "System", to: "Warehouse", channel: ["in-app", "email"], trigger: "PO lifecycle events", text: "Update PO / vendor quotation" },
  { step: 10, from: "System", to: "Technician", channel: ["in-app"], trigger: "Rating submitted", text: "Anda menerima rating" },
];
