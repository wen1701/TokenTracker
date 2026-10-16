import React from "react";
import { Link } from "react-router-dom";
import { useCPA } from "../hooks/use-cpa.js";
import { copy, getCopyLocale } from "../lib/copy";
import { SectionCard, ToggleSwitch } from "./settings/Controls.jsx";

export function CPAQuotaPanel() {
  const cpa = useCPA({ pollLimits: true });
  const [toggleError, setToggleError] = React.useState(null);
  if (!cpa.available) return null;
  const toggle = async () => {
    setToggleError(null);
    try { await cpa.save({ enabled: !cpa.config.enabled }); }
    catch (e) { setToggleError(e.message); }
  };
  return (
    <div className="mt-4">
      <SectionCard title={copy("cpa.title")} action={<ToggleSwitch checked={cpa.config.enabled} disabled={cpa.busy} onChange={toggle} ariaLabel={copy("cpa.enabled")} />}>
        <div className="space-y-3 py-3">
          <Link className="text-sm text-oai-brand-500 underline" to="/settings?section=cpa">{copy("cpa.configure")}</Link>
          {toggleError || cpa.error || cpa.data?.error ? <p role="alert" className="text-sm text-red-500">{copy(`cpa.error.${toggleError || cpa.error || cpa.data.error}`)}</p> : null}
          {!cpa.config.enabled ? <p className="text-sm text-oai-gray-500">{copy("cpa.off")}</p> : null}
          {cpa.config.enabled && !cpa.data && !cpa.error ? <p role="status">{copy("cpa.loading")}</p> : null}
          {cpa.data?.accounts?.length === 0 && !cpa.data?.error ? <p>{copy("cpa.empty")}</p> : null}
          {cpa.data?.accounts?.filter((account) => account.enabled !== false && cpa.config.accountEnabled?.[account.id] !== false).map((account) => (
            <div key={account.id} className="space-y-2 rounded-lg border border-oai-gray-200 p-3 dark:border-oai-gray-800">
              <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{account.label}</span><span className="text-oai-gray-500">{[account.provider, account.plan].filter(Boolean).join(" · ")}</span></div>
              {account.error ? <p role="status" className="text-xs text-amber-600">{copy(`cpa.error.${account.error}`)}</p> : null}
              {account.windows.map((window) => (
                <div key={window.id} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs"><span>{window.label}</span><span>{copy("cpa.remaining", { percent: Math.round(100 - window.used_percent) })}</span></div>
                  <progress className="h-2 w-full accent-oai-brand-500" value={100 - window.used_percent} max={100} aria-label={`${account.label} ${window.label}`} />
                  {window.reset_at ? <p className="text-xs text-oai-gray-500">{copy("cpa.resets", { time: new Date(window.reset_at).toLocaleString(getCopyLocale()) })}</p> : null}
                </div>
              ))}
              {account.metrics.map((metric) => <p key={metric.key} className="text-xs">{metric.key === "credits" ? copy("cpa.credits") : metric.label}: {new Intl.NumberFormat(getCopyLocale(), metric.format === "currency" && metric.currency ? { style: "currency", currency: metric.currency } : {}).format(metric.value)}{metric.unit && metric.unit !== "credits" ? ` ${metric.unit}` : ""}</p>)}
            </div>
          ))}
          {cpa.data?.fetched_at ? <p className="text-xs text-oai-gray-500">{copy("cpa.updated", { time: new Date(cpa.data.fetched_at).toLocaleTimeString(getCopyLocale()) })}</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
