"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Incorrect password");
        setPassword("");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-[280px]">
        <Logo className="mb-6 h-7 w-7" />

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink-faint focus:border-line-strong"
        />

        <button
          type="submit"
          disabled={pending || !password}
          className="mt-2 w-full rounded-lg bg-ink px-3 py-2.5 text-[13.5px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Unlocking…" : "Unlock"}
        </button>

        <p className="mt-3 h-4 text-[12.5px] text-danger">{error}</p>
      </form>
    </div>
  );
}
