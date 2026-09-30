import React, { useEffect } from "react";
import { setToken, setActiveTenantDomain } from "../lib/api";

export default function SsoHandoff() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    if (token) {
      setToken(token);
      setActiveTenantDomain(window.location.hostname);
      window.location.replace("/dashboard");
    } else {
      window.location.replace("/");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
