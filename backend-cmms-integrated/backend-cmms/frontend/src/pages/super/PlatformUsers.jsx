import React, { useCallback, useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { listPlatformUsers } from "../../lib/dashboard";
import {
  PageHeader, Card, Table, Pill, Reveal, statusTone,
} from "../../components/kit";

export default function PlatformUsers() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listPlatformUsers();
      setAdmins((response?.data || []).map((user) => ({
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.platform_role,
        status: user.status,
        lastActive: user.last_login_at,
      })));
    } catch (error) {
      toast.error(error.message || "Gagal memuat pengguna platform.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      key: "name", header: "Nama", render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Peran", render: () => <Pill tone="primary">Super Admin</Pill> },
    { key: "status", header: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
    { key: "lastActive", header: "Terakhir Aktif", render: (r) => <span className="text-xs text-muted-foreground">{r.lastActive ? new Date(r.lastActive).toLocaleString("id-ID") : "Belum pernah"}</span> },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Platform Users"
        subtitle="Akun internal Super Admin Aitoma — dikelola melalui sistem central."
      />
      <Card>
        <Table columns={columns} rows={admins} empty={loading ? "Memuat..." : "Tidak ada admin platform."} />
      </Card>
      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Daftar ini berasal dari central database dan hanya mencakup akun Super Admin.
      </div>
    </Reveal>
  );
}
