"use client";

import React, { useState, useEffect } from "react";
import { fetchAdminJson } from "@/lib/admin-utils";

export interface PlatformSettings {
  id: number;
  default_compression_mode: "lossless" | "balanced" | "aggressive" | "lossy";
  default_price_per_1m: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminJson<{ settings: PlatformSettings }>("/api/admin/settings");
      setSettings(data.settings);
    } catch {
      setSettings({
        id: 1,
        default_compression_mode: "balanced",
        default_price_per_1m: 2.5,
        maintenance_mode: false,
        maintenance_message: null,
        updated_at: null,
        updated_by: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchAdminJson<{ settings: PlatformSettings }>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          default_compression_mode: settings?.default_compression_mode,
          default_price_per_1m: settings?.default_price_per_1m,
          maintenance_mode: settings?.maintenance_mode,
          maintenance_message: settings?.maintenance_message,
        }),
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            Platform-wide settings. Changes are recorded in the audit log.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-800/80 bg-surface/60 p-5 backdrop-blur-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Default Compression Mode
            </label>
            <select
              value={settings?.default_compression_mode || "balanced"}
              onChange={(e) =>
                setSettings({ ...settings!, default_compression_mode: e.target.value as any })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/80 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            >
              <option value="lossless">Lossless</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
              <option value="lossy">Lossy</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Default Price per 1M Tokens ($)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={settings?.default_price_per_1m?.toFixed(2) || "2.50"}
              onChange={(e) =>
                setSettings({
                  ...settings!,
                  default_price_per_1m: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/80 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            />
          </div>

          <div className="flex items-end">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings?.maintenance_mode || false}
                onChange={(e) =>
                  setSettings({ ...settings!, maintenance_mode: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/40"
              />
              <label className="text-sm font-medium text-slate-300">
                Maintenance mode
              </label>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Maintenance Message
            </label>
            <textarea
              value={settings?.maintenance_message || ""}
              onChange={(e) =>
                setSettings({ ...settings!, maintenance_message: e.target.value || null })
              }
              rows={3}
              placeholder="Message shown to users during maintenance (optional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/80 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}