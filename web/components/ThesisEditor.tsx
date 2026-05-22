"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

import { saveThesis } from "@/app/stocks/[symbol]/actions";

type Props = {
  symbol: string;
  initialText: string | null;
  updatedAt: string | null;
};

export function ThesisEditor({ symbol, initialText, updatedAt }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveThesis(symbol, text);
        setSavedAt(res.updated_at);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            My thesis
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-slate-500 underline hover:text-slate-900"
          >
            edit
          </button>
        </div>
        {text ? (
          <p className="whitespace-pre-line text-sm text-slate-700">{text}</p>
        ) : (
          <p className="text-sm italic text-slate-400">
            No thesis saved. Write one to help the routine evaluate the
            position.
          </p>
        )}
        {savedAt && (
          <p className="text-[10px] text-slate-400">
            Updated {formatDate(savedAt)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        My thesis
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="block w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
        placeholder="Why I own (or want to own) this name…"
      />
      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setText(initialText ?? "");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
