import React, { useCallback, useEffect, useState } from "react";
import { Card, Reveal, SearchInput, Table } from "../components/kit";
import { listAssetCategories } from "../lib/assets";
import { listSites } from "../lib/organization";

// Teams now has its own dedicated page (see pages/Teams.jsx) since its design
// diverged enough (cards, specialty, supervisor, member counts, create/edit
// modals) to no longer fit this generic table view. This component now only
// covers the simple reference lists that still share one layout.
const config = {
  categories: { title: "Asset categories", subtitle: "Organize your assets by category", load: listAssetCategories, columns: [{ key: "code", header: "Code" }, { key: "name", header: "Name", render: (r) => <b>{r.name}</b> }, { key: "description", header: "Description", render: (r) => r.description || "-" }, { key: "is_active", header: "Status", render: (r) => r.is_active ? "Active" : "Inactive" }] },
  sites: { title: "Sites", subtitle: "Manage your organization sites", load: listSites, columns: [{ key: "code", header: "Code" }, { key: "name", header: "Site", render: (r) => <b>{r.name}</b> }, { key: "address", header: "Address", render: (r) => r.address || "-" }, { key: "is_active", header: "Status", render: (r) => r.is_active ? "Active" : "Inactive" }] },
};

export default function ReferenceLists({ type }) {
  const c = config[type];
  const [rows, setRows] = useState([]), [q, setQ] = useState(""), [loading, setLoading] = useState(true);

  const load = useCallback(async () => { setLoading(true); try { setRows((await c.load()).data || []); } finally { setLoading(false); } }, [c]);
  useEffect(() => { load(); }, [load]);
  const filtered = rows.filter((r) => `${r.code || ""} ${r.name || ""}`.toLowerCase().includes(q.toLowerCase()));

  return <Reveal className="mx-auto max-w-300"><Card><div className="mb-5"><h2 className="font-display text-lg font-bold">{c.title}</h2><p className="mt-1 text-sm text-muted-foreground">{c.subtitle}</p></div><div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Search..." /></div><Table columns={c.columns} rows={filtered} empty={loading ? "Loading..." : `No ${c.title.toLowerCase()} found.`} /></Card></Reveal>;
}
