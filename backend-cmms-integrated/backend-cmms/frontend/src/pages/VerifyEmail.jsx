import React, { useEffect, useState } from "react";
import { verifyEmail } from "../lib/onboarding";
import Logo from "../components/Logo";

export default function VerifyEmail() {
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Token verifikasi tidak ditemukan.");
      return;
    }
    verifyEmail(token)
      .then((res) => {
        try { localStorage.setItem('aitoma_pending_onboarding_id', res?.data?.onboarding_id || ''); } catch (e) {}
        setStatus("success");
        setMessage("Email berhasil diverifikasi! Perusahaan Anda sedang disiapkan.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Verifikasi gagal. Token mungkin sudah kedaluwarsa.");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <Logo className="mx-auto mb-6 h-10" />
        {status === "loading" && <p className="text-muted-foreground">Memverifikasi email...</p>}
        {status === "success" && (
          <>
            <h2 className="mb-2 text-xl font-bold text-foreground">Berhasil!</h2>
            <p className="mb-6 text-muted-foreground">{message}</p>
            <a href="/" className="inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
              Lanjut ke Halaman Masuk
            </a>
          </>
        )}
        {status === "error" && (
          <>
            <h2 className="mb-2 text-xl font-bold text-destructive">Verifikasi Gagal</h2>
            <p className="mb-6 text-muted-foreground">{message}</p>
            <a href="/" className="inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
              Kembali ke Login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
