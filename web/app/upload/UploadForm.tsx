"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatQty, formatUsd } from "@/lib/format";
import { schwabAdapter, type BrokerImportResult } from "@/lib/brokers/schwab";

import { importPortfolio } from "./actions";

type State =
  | { stage: "idle" }
  | { stage: "previewed"; parsed: BrokerImportResult; source: string }
  | { stage: "saving" }
  | {
      stage: "saved";
      result: { holdingsUpserted: number; cashSet: boolean };
    }
  | { stage: "error"; message: string };

export function UploadForm() {
  const [state, setState] = useState<State>({ stage: "idle" });
  const [pasted, setPasted] = useState("");

  function handlePreview(text: string, source: string) {
    if (!text.trim()) {
      setState({ stage: "error", message: "No CSV content found." });
      return;
    }
    const parsed = schwabAdapter.parse(text);
    if (parsed.holdings.length === 0 && parsed.cash == null) {
      setState({
        stage: "error",
        message:
          "Couldn't find any positions or cash. Check that the export starts with the Symbol / Quantity header row.",
      });
      return;
    }
    setState({ stage: "previewed", parsed, source });
  }

  async function handleFile(file: File) {
    const text = await file.text();
    handlePreview(text, file.name);
  }

  async function handleConfirm() {
    if (state.stage !== "previewed") return;
    setState({ stage: "saving" });
    try {
      const result = await importPortfolio({
        holdings: state.parsed.holdings.map((h) => ({
          symbol: h.symbol,
          qty: h.qty,
          cost_basis_per_share: h.cost_basis_per_share,
        })),
        cash: state.parsed.cash,
      });
      setState({ stage: "saved", result });
    } catch (e) {
      setState({
        stage: "error",
        message: e instanceof Error ? e.message : "Import failed.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Upload file
          </span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await handleFile(f);
            }}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </label>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-600">
          …or paste CSV contents
        </label>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={6}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs"
          placeholder="Symbol,Description,Quantity,Price,Market Value,% of Account,..."
        />
        <div className="mt-2">
          <Button
            variant="secondary"
            onClick={() => handlePreview(pasted, "pasted text")}
            disabled={!pasted.trim()}
          >
            Preview
          </Button>
        </div>
      </div>

      {state.stage === "error" && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      )}

      {state.stage === "previewed" && (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{state.parsed.holdings.length}</span>{" "}
              positions detected from{" "}
              <span className="font-mono text-xs">{state.source}</span>
              {state.parsed.cash != null && (
                <>
                  {" "}
                  · cash{" "}
                  <span className="font-medium">
                    {formatUsd(state.parsed.cash)}
                  </span>
                </>
              )}
            </div>
            <Button onClick={handleConfirm}>Save to dashboard</Button>
          </div>

          {state.parsed.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {state.parsed.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-2 py-1 text-left">Symbol</th>
                  <th className="px-2 py-1 text-right">Qty</th>
                  <th className="px-2 py-1 text-right">Cost / sh</th>
                  <th className="px-2 py-1 text-right">Mkt value</th>
                </tr>
              </thead>
              <tbody>
                {state.parsed.holdings.map((h) => (
                  <tr key={h.symbol} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-medium">{h.symbol}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatQty(h.qty)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {h.cost_basis_per_share == null
                        ? "—"
                        : formatUsd(h.cost_basis_per_share)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatUsd(h.marketValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state.stage === "saving" && (
        <p className="text-sm text-slate-600">Saving…</p>
      )}

      {state.stage === "saved" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Imported {state.result.holdingsUpserted} holdings
          {state.result.cashSet && " and updated cash"}. Head back to the{" "}
          <a href="/" className="underline">
            dashboard
          </a>
          .
        </p>
      )}
    </div>
  );
}
