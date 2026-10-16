import React, { useEffect, useState } from "react";
import { copy } from "../../lib/copy";
import { Button } from "../../ui/components/Button.jsx";
import { SectionCard, SettingsRow, ToggleSwitch, SETTINGS_INPUT_CLASS } from "./Controls.jsx";

export function CPASection({ cpa }) {
  const [baseUrl, setBaseUrl] = useState(cpa.config?.baseUrl || "");
  const [managementKey, setManagementKey] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setBaseUrl(cpa.config?.baseUrl || ""); }, [cpa.config?.baseUrl]);
  const save = async (patch) => {
    setError(null);
    setSaved(false);
    try {
      await cpa.save(patch);
      setManagementKey("");
      setSaved(true);
    } catch (e) { setError(e.message); }
  };
  return (
    <SectionCard title={copy("cpa.title")}>
      <SettingsRow
        label={copy("cpa.enabled")}
        hint={copy("cpa.hint")}
        control={<ToggleSwitch checked={cpa.config?.enabled === true} disabled={cpa.busy} onChange={() => save({ enabled: !cpa.config?.enabled })} ariaLabel={copy("cpa.enabled")} />}
      />
      <form className="space-y-4 py-4" onSubmit={(event) => { event.preventDefault(); void save({ baseUrl, ...(managementKey ? { managementKey } : {}) }); }}>
        <label className="block space-y-1 text-sm">
          <span>{copy("cpa.url")}</span>
          <input className={SETTINGS_INPUT_CLASS} type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={copy("cpa.url_placeholder")} autoComplete="off" spellCheck={false} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{copy("cpa.key")}</span>
          <input className={SETTINGS_INPUT_CLASS} type="password" value={managementKey} onChange={(event) => setManagementKey(event.target.value)} placeholder={copy(cpa.config?.hasManagementKey ? "cpa.key_saved" : "cpa.key_placeholder")} autoComplete="new-password" spellCheck={false} />
        </label>
        <p className="text-xs text-oai-gray-500">{copy("cpa.key_hint")}</p>
        <Button type="submit" variant="secondary" disabled={cpa.busy}>{copy("cpa.save")}</Button>
        {saved ? <p role="status" className="text-sm text-oai-gray-500">{copy("cpa.saved")}</p> : null}
        {error ? <p role="alert" className="text-sm text-red-500">{copy("cpa.save_error", { error: copy(`cpa.error.${error}`) })}</p> : null}
      </form>
    </SectionCard>
  );
}
