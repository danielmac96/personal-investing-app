"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ALLOWED_EMAIL, SITE_URL } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ initialSent }: { initialSent: boolean }) {
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    initialSent ? "sent" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
      setStatus("error");
      setErrorMessage("That email isn't authorised for this dashboard.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${SITE_URL}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </label>
      <Button
        type="submit"
        className="w-full"
        disabled={status === "sending" || status === "sent"}
      >
        {status === "sending" ? "Sending…" : "Send magic link"}
      </Button>
      {status === "sent" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Check your inbox for the magic link.
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
