// Seeded demo data for the Aitoma CMMS showcase.

export const kpis = [
  { key: "uptime", label: "Equipment Uptime", value: "97.4%", delta: "+1.2%", trend: "up", hint: "vs last month" },
  { key: "completion", label: "WO Completion Rate", value: "91.8%", delta: "+3.4%", trend: "up", hint: "this month" },
  { key: "mttr", label: "MTTR", value: "3.2h", delta: "-0.6h", trend: "down", hint: "mean time to repair" },
  { key: "mtbf", label: "MTBF", value: "412h", delta: "+18h", trend: "up", hint: "mean time between failures" },
];

export const uptimeTrend = [
  { month: "Jan", uptime: 94.1, target: 96 },
  { month: "Feb", uptime: 95.0, target: 96 },
  { month: "Mar", uptime: 93.8, target: 96 },
  { month: "Apr", uptime: 96.2, target: 96 },
  { month: "May", uptime: 95.9, target: 96 },
  { month: "Jun", uptime: 97.0, target: 96 },
  { month: "Jul", uptime: 97.4, target: 96 },
];

export const woByStatus = [
  { name: "Open", value: 24, color: "hsl(214 95% 52%)" },
  { name: "In Progress", value: 18, color: "hsl(199 89% 48%)" },
  { name: "On Hold", value: 6, color: "hsl(38 92% 50%)" },
  { name: "Completed", value: 132, color: "hsl(152 62% 40%)" },
];

export const costTrend = [
  { month: "Jan", labor: 12400, parts: 8200 },
  { month: "Feb", labor: 11800, parts: 9100 },
  { month: "Mar", labor: 13200, parts: 7600 },
  { month: "Apr", labor: 10900, parts: 8800 },
  { month: "May", labor: 12100, parts: 10200 },
  { month: "Jun", labor: 11500, parts: 7400 },
  { month: "Jul", labor: 10200, parts: 6900 },
];

export const assets = [
  { id: "AST-1042", name: "CNC Milling Machine #3", category: "Machining", location: "Plant A · Line 2", status: "Operational", health: 92, criticality: "High", lastService: "2026-06-18", nextService: "2026-08-02" },
  { id: "AST-1088", name: "Hydraulic Press 500T", category: "Forming", location: "Plant A · Line 1", status: "Needs Attention", health: 61, criticality: "Critical", lastService: "2026-05-30", nextService: "2026-07-14" },
  { id: "AST-2210", name: "Conveyor Belt System B", category: "Material Handling", location: "Plant B · Packaging", status: "Operational", health: 88, criticality: "Medium", lastService: "2026-06-25", nextService: "2026-08-20" },
  { id: "AST-3301", name: "Industrial Chiller Unit", category: "HVAC", location: "Plant A · Utilities", status: "Down", health: 34, criticality: "Critical", lastService: "2026-04-12", nextService: "2026-07-10" },
  { id: "AST-3345", name: "Air Compressor GA-90", category: "Utilities", location: "Plant B · Utilities", status: "Operational", health: 79, criticality: "High", lastService: "2026-06-02", nextService: "2026-07-28" },
  { id: "AST-4412", name: "Robotic Welding Cell", category: "Welding", location: "Plant A · Line 3", status: "Operational", health: 95, criticality: "High", lastService: "2026-06-28", nextService: "2026-09-01" },
  { id: "AST-5501", name: "Packaging Line Palletizer", category: "Material Handling", location: "Plant B · Packaging", status: "Needs Attention", health: 68, criticality: "Medium", lastService: "2026-05-20", nextService: "2026-07-18" },
  { id: "AST-6620", name: "Boiler System Unit 2", category: "Utilities", location: "Plant A · Utilities", status: "Operational", health: 84, criticality: "Critical", lastService: "2026-06-10", nextService: "2026-08-05" },
];

export const workOrders = [
  { id: "WO-8801", title: "Chiller compressor overheating", asset: "Industrial Chiller Unit", priority: "Critical", status: "In Progress", assignee: "Budi Santoso", type: "Corrective", due: "2026-07-09", aiScore: 98 },
  { id: "WO-8802", title: "Hydraulic press seal leak", asset: "Hydraulic Press 500T", priority: "High", status: "Open", assignee: "Dewi Lestari", type: "Corrective", due: "2026-07-12", aiScore: 91 },
  { id: "WO-8803", title: "Quarterly CNC calibration", asset: "CNC Milling Machine #3", priority: "Medium", status: "Open", assignee: "Rizky Pratama", type: "Preventive", due: "2026-08-02", aiScore: 63 },
  { id: "WO-8804", title: "Conveyor belt tension check", asset: "Conveyor Belt System B", priority: "Low", status: "On Hold", assignee: "Siti Rahayu", type: "Preventive", due: "2026-07-20", aiScore: 41 },
  { id: "WO-8805", title: "Compressor filter replacement", asset: "Air Compressor GA-90", priority: "Medium", status: "In Progress", assignee: "Budi Santoso", type: "Preventive", due: "2026-07-11", aiScore: 58 },
  { id: "WO-8806", title: "Welding cell torch inspection", asset: "Robotic Welding Cell", priority: "Low", status: "Completed", assignee: "Rizky Pratama", type: "Preventive", due: "2026-07-01", aiScore: 32 },
  { id: "WO-8807", title: "Palletizer motor vibration", asset: "Packaging Line Palletizer", priority: "High", status: "Open", assignee: "Dewi Lestari", type: "Predictive", due: "2026-07-15", aiScore: 87 },
];

export const pmSchedules = [
  { id: "PM-301", asset: "CNC Milling Machine #3", task: "Lubrication & spindle check", freq: "Monthly", next: "2026-08-02", assignee: "Rizky Pratama", est: "2h" },
  { id: "PM-302", asset: "Air Compressor GA-90", task: "Filter & oil replacement", freq: "Quarterly", next: "2026-07-28", assignee: "Budi Santoso", est: "1.5h" },
  { id: "PM-303", asset: "Boiler System Unit 2", task: "Pressure valve inspection", freq: "Monthly", next: "2026-08-05", assignee: "Dewi Lestari", est: "3h" },
  { id: "PM-304", asset: "Conveyor Belt System B", task: "Belt alignment & tension", freq: "Bi-weekly", next: "2026-07-20", assignee: "Siti Rahayu", est: "1h" },
  { id: "PM-305", asset: "Robotic Welding Cell", task: "Torch & sensor calibration", freq: "Quarterly", next: "2026-09-01", assignee: "Rizky Pratama", est: "2.5h" },
];

export const inventory = [
  { id: "SP-101", name: "Hydraulic Seal Kit 500T", category: "Seals", qty: 3, min: 5, unit: "kit", location: "Store A-12", cost: 145, status: "Low" },
  { id: "SP-102", name: "Air Filter GA-90", category: "Filters", qty: 24, min: 10, unit: "pcs", location: "Store B-04", cost: 32, status: "OK" },
  { id: "SP-103", name: "Chiller Compressor Belt", category: "Belts", qty: 1, min: 4, unit: "pcs", location: "Store A-07", cost: 89, status: "Critical" },
  { id: "SP-104", name: "CNC Spindle Bearing", category: "Bearings", qty: 8, min: 4, unit: "pcs", location: "Store A-01", cost: 210, status: "OK" },
  { id: "SP-105", name: "Conveyor Roller Assembly", category: "Rollers", qty: 6, min: 6, unit: "pcs", location: "Store B-11", cost: 76, status: "OK" },
  { id: "SP-106", name: "Welding Tip Contact", category: "Consumables", qty: 42, min: 20, unit: "pcs", location: "Store A-15", cost: 12, status: "OK" },
  { id: "SP-107", name: "Boiler Pressure Valve", category: "Valves", qty: 2, min: 3, unit: "pcs", location: "Store A-09", cost: 320, status: "Low" },
];

export const technicians = [
  { name: "Budi Santoso", role: "Senior Technician", skills: ["HVAC", "Hydraulics"], active: 2, completed: 38, load: 82, avatar: "BS" },
  { name: "Dewi Lestari", role: "Maintenance Technician", skills: ["Mechanical", "Welding"], active: 3, completed: 41, load: 91, avatar: "DL" },
  { name: "Rizky Pratama", role: "CNC Specialist", skills: ["CNC", "Electrical"], active: 2, completed: 52, load: 64, avatar: "RP" },
  { name: "Siti Rahayu", role: "Field Technician", skills: ["Conveyor", "Mechanical"], active: 1, completed: 29, load: 38, avatar: "SR" },
];

export const aiInsights = [
  {
    id: 1,
    type: "Predictive Maintenance",
    severity: "critical",
    asset: "Industrial Chiller Unit",
    title: "Compressor failure predicted within 72 hours",
    detail: "Vibration signature and temperature drift match historical pre-failure patterns. Confidence 94%. Recommend immediate corrective work order.",
    confidence: 94,
  },
  {
    id: 2,
    type: "Anomaly Detection",
    severity: "high",
    asset: "Packaging Line Palletizer",
    title: "Abnormal motor current draw detected",
    detail: "Motor amperage 18% above baseline for 6 consecutive cycles. Possible bearing wear developing.",
    confidence: 81,
  },
  {
    id: 3,
    type: "Smart Prioritization",
    severity: "medium",
    asset: "Hydraulic Press 500T",
    title: "Escalate WO-8802 above scheduled PM tasks",
    detail: "Seal leak impacts Line 1 throughput (est. 240 units/hr). Recommended priority raised to High.",
    confidence: 88,
  },
  {
    id: 4,
    type: "Maintenance Recommendation",
    severity: "low",
    asset: "Air Compressor GA-90",
    title: "Extend filter interval by 2 weeks",
    detail: "Usage patterns show lower duty cycle than assumed. Optimizing schedule saves ~$180/quarter.",
    confidence: 76,
  },
];

export const notifications = [
  { id: 1, text: "AI flagged critical failure risk on Industrial Chiller Unit", time: "5m ago", type: "critical" },
  { id: 2, text: "WO-8805 marked In Progress by Budi Santoso", time: "22m ago", type: "info" },
  { id: 3, text: "Spare part 'Chiller Compressor Belt' below minimum stock", time: "1h ago", type: "warning" },
  { id: 4, text: "PM-304 due in 3 days — Conveyor Belt System B", time: "2h ago", type: "info" },
];

export const roles = [
  { name: "Super Admin", scope: "Aitoma — full platform, clients & billing", color: "primary" },
  { name: "Company Admin", scope: "Manage company users, assets & reports", color: "accent" },
  { name: "Maintenance Manager", scope: "Work orders, technicians & schedules", color: "success" },
  { name: "Technician", scope: "Assigned work orders, updates & photos", color: "warning" },
  { name: "Operator", scope: "Request maintenance, view equipment", color: "muted" },
  { name: "Viewer", scope: "Read-only dashboards & reports", color: "muted" },
];

export function statusColor(status) {
  switch (status) {
    case "Operational":
    case "Completed":
    case "OK":
      return "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10";
    case "Needs Attention":
    case "On Hold":
    case "Low":
      return "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10";
    case "Down":
    case "Critical":
      return "text-destructive bg-destructive/10";
    case "In Progress":
      return "text-accent bg-accent/10";
    default:
      return "text-primary bg-primary/10";
  }
}

export function priorityColor(p) {
  switch (p) {
    case "Critical": return "text-destructive bg-destructive/10 ring-1 ring-destructive/20";
    case "High": return "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 ring-1 ring-[hsl(var(--warning))]/20";
    case "Medium": return "text-accent bg-accent/10 ring-1 ring-accent/20";
    default: return "text-muted-foreground bg-muted ring-1 ring-border";
  }
}
