"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const authCall =
      mode === "sign-in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await authCall;
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "sign-up") {
      setMessage("Account created. Confirm your email if Supabase requires it.");
    }

    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5">
      <div className="space-y-8">
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-700">AI Rewriter</p>
          <h1 className="text-2xl font-semibold text-zinc-950">
            CA report rewriting workspace
          </h1>
          <p className="text-sm leading-6 text-zinc-600">
            Sign in to rewrite professional report text in formal Indian English.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium text-zinc-800">
            <span>Email</span>
            <input
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-zinc-800">
            <span>Password</span>
            <input
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>

          {message ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {message}
            </p>
          ) : null}

          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            type="submit"
            disabled={isSubmitting}
          >
            {mode === "sign-in" ? (
              <LogIn aria-hidden="true" size={16} />
            ) : (
              <UserPlus aria-hidden="true" size={16} />
            )}
            {isSubmitting
              ? "Please wait"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          className="text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
          type="button"
          onClick={() => {
            setMessage("");
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
        >
          {mode === "sign-in"
            ? "Create a new account"
            : "Use an existing account"}
        </button>
      </div>
    </main>
  );
}
