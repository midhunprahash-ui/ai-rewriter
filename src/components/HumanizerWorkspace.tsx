"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clipboard,
  Copy,
  Eraser,
  Loader2,
  LogOut,
  WandSparkles,
} from "lucide-react";
import {
  HUMANIZE_MODES,
  HUMANIZE_STRENGTHS,
  LENGTH_LABELS,
  LENGTH_MODES,
  MODE_LABELS,
  STRENGTH_LABELS,
  type HumanizeApiResponse,
  type HumanizeHistoryItem,
  type HumanizeMode,
  type HumanizeStrength,
  type LengthMode,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type HumanizerWorkspaceProps = {
  userEmail: string;
  initialHistory: HumanizeHistoryItem[];
};

export function HumanizerWorkspace({
  userEmail,
  initialHistory,
}: HumanizerWorkspaceProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<HumanizeMode>("professional_report");
  const [strength, setStrength] = useState<HumanizeStrength>("medium");
  const [lengthMode, setLengthMode] = useState<LengthMode>("preserve");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [changeSummary, setChangeSummary] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const characterCount = input.length;

  const latestHistory = useMemo(() => history.slice(0, 8), [history]);

  async function handleHumanize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setWarnings([]);
    setChangeSummary("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          context,
          mode,
          strength,
          lengthMode,
        }),
      });

      const payload = (await response.json()) as
        | HumanizeApiResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Humanization failed.",
        );
      }

      const result = payload as HumanizeApiResponse;
      setOutput(result.output);
      setWarnings(result.warnings);
      setChangeSummary(result.changeSummary);

      if (result.humanizationId) {
        setHistory((current) => [
          {
            id: result.humanizationId ?? crypto.randomUUID(),
            originalText: input,
            humanizedText: result.output,
            mode,
            strength,
            lengthMode,
            warnings: result.warnings,
            createdAt: result.createdAt,
          },
          ...current,
        ]);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Humanization failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  async function copyOutput() {
    if (!output) {
      return;
    }

    await navigator.clipboard.writeText(output);
  }

  function clearWorkspace() {
    setInput("");
    setContext("");
    setOutput("");
    setWarnings([]);
    setChangeSummary("");
    setError("");
  }

  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div>
            <h1 className="text-base font-semibold">AI Humanizer</h1>
            <p className="text-xs text-zinc-500">
              Natural Indian English for CA reports
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-600 sm:inline">
              {userEmail}
            </span>
            <button
              className="inline-flex size-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100"
              type="button"
              title="Sign out"
              onClick={handleSignOut}
            >
              <LogOut aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </header>

      <form
        className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_320px]"
        onSubmit={handleHumanize}
      >
        <section className="grid min-h-[calc(100dvh-7rem)] gap-4 lg:grid-cols-2">
          <div className="flex min-h-[320px] flex-col rounded-md border border-zinc-200 bg-white">
            <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3">
              <label className="text-sm font-medium" htmlFor="source-text">
                Source
              </label>
              <span className="text-xs text-zinc-500">
                {characterCount}/12000
              </span>
            </div>
            <textarea
              id="source-text"
              className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm leading-6 outline-none"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste audit observation, management comment, working-paper summary, or compliance paragraph."
            />
          </div>

          <div className="flex min-h-[320px] flex-col rounded-md border border-zinc-200 bg-white">
            <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3">
              <span className="text-sm font-medium">Humanized</span>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 disabled:text-zinc-300"
                  type="button"
                  title="Copy output"
                  onClick={copyOutput}
                  disabled={!output}
                >
                  <Copy aria-hidden="true" size={15} />
                </button>
                <button
                  className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100"
                  type="button"
                  title="Clear"
                  onClick={clearWorkspace}
                >
                  <Eraser aria-hidden="true" size={15} />
                </button>
              </div>
            </div>
            <textarea
              className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm leading-6 outline-none"
              value={output}
              onChange={(event) => setOutput(event.target.value)}
              placeholder="The humanized text will appear here."
            />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="grid gap-3">
              <label className="space-y-1 text-sm font-medium">
                <span>Mode</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as HumanizeMode)
                  }
                >
                  {HUMANIZE_MODES.map((item) => (
                    <option key={item} value={item}>
                      {MODE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm font-medium">
                <span>Humanization</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={strength}
                  onChange={(event) =>
                    setStrength(event.target.value as HumanizeStrength)
                  }
                >
                  {HUMANIZE_STRENGTHS.map((item) => (
                    <option key={item} value={item}>
                      {STRENGTH_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm font-medium">
                <span>Length</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={lengthMode}
                  onChange={(event) =>
                    setLengthMode(event.target.value as LengthMode)
                  }
                >
                  {LENGTH_MODES.map((item) => (
                    <option key={item} value={item}>
                      {LENGTH_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm font-medium">
                <span>Context notes</span>
                <textarea
                  className="h-28 w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal leading-5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={context}
                  maxLength={2000}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="Service type, period, documents reviewed, scope limits, client representation."
                />
              </label>

              <button
                className="mt-1 flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                type="submit"
                disabled={isLoading || input.trim().length < 20}
              >
                {isLoading ? (
                  <Loader2
                    className="animate-spin"
                    aria-hidden="true"
                    size={16}
                  />
                ) : (
                  <WandSparkles aria-hidden="true" size={16} />
                )}
                {isLoading ? "Humanizing" : "Humanize"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
              {error}
            </div>
          ) : null}

          {changeSummary || warnings.length ? (
            <div className="rounded-md border border-zinc-200 bg-white p-3">
              {changeSummary ? (
                <p className="text-sm leading-6 text-zinc-700">
                  {changeSummary}
                </p>
              ) : null}
              {warnings.length ? (
                <ul className="mt-3 space-y-2 text-sm leading-5 text-amber-900">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-zinc-200 bg-white">
            <div className="flex h-10 items-center gap-2 border-b border-zinc-200 px-3">
              <Clipboard aria-hidden="true" size={15} />
              <span className="text-sm font-medium">Recent</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {latestHistory.length ? (
                latestHistory.map((item) => (
                  <button
                    className="block w-full border-b border-zinc-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-zinc-50"
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInput(item.originalText);
                      setOutput(item.humanizedText);
                      setMode(item.mode);
                      setStrength(item.strength);
                      setLengthMode(item.lengthMode);
                      setWarnings(item.warnings);
                      setChangeSummary("");
                      setError("");
                    }}
                  >
                    <p className="line-clamp-2 text-sm leading-5 text-zinc-800">
                      {item.originalText}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {MODE_LABELS[item.mode]} -{" "}
                      {new Date(item.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-sm text-zinc-500">
                  No humanized outputs yet.
                </p>
              )}
            </div>
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            Review before use. The tool humanizes tone and flow while preserving
            source facts; it does not create audit evidence or legal positions.
          </p>
        </aside>
      </form>
    </main>
  );
}
