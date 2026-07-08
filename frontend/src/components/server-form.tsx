"use client";
import { useState } from "react";
import { api, Server } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner, Switch } from "@/components/ui/misc";

export function ServerForm({
  server,
  onDone,
  onCancel,
}: {
  server?: Server;
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = !!server;
  const [form, setForm] = useState({
    name: server?.name || "",
    ip: server?.ip || "",
    ssh_port: server?.ssh_port || 22,
    ssh_user: server?.ssh_user || "root",
    ssh_password: "",
    ssh_key: "",
    bmc_ip: server?.bmc_ip || "",
    bmc_user: server?.bmc_user || "",
    bmc_password: "",
    description: server?.description || "",
    high_priority: server?.high_priority ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      // build payload: for edit, omit secret fields left blank (= keep existing)
      const payload: any = {
        name: form.name,
        ip: form.ip,
        ssh_port: Number(form.ssh_port),
        ssh_user: form.ssh_user,
        bmc_ip: form.bmc_ip || null,
        bmc_user: form.bmc_user || null,
        description: form.description || null,
        high_priority: form.high_priority,
      };
      if (form.ssh_password) payload.ssh_password = form.ssh_password;
      if (form.ssh_key) payload.ssh_key = form.ssh_key;
      if (form.bmc_password) payload.bmc_password = form.bmc_password;

      if (editing) {
        await api(`/servers/${server!.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/servers", { method: "POST", body: JSON.stringify(payload) });
      }
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="web-prod-01" />
        </div>
        <div>
          <Label>IP address</Label>
          <Input value={form.ip} onChange={(e) => set("ip", e.target.value)} placeholder="10.0.0.5" />
        </div>
        <div>
          <Label>SSH port</Label>
          <Input type="number" value={form.ssh_port} onChange={(e) => set("ssh_port", e.target.value)} />
        </div>
        <div>
          <Label>SSH user</Label>
          <Input value={form.ssh_user} onChange={(e) => set("ssh_user", e.target.value)} />
        </div>
        <div>
          <Label>SSH password{editing && " (blank = keep)"}</Label>
          <Input
            type="password"
            value={form.ssh_password}
            onChange={(e) => set("ssh_password", e.target.value)}
            placeholder={server?.has_ssh_password ? "•••••• stored" : ""}
          />
        </div>
        <div className="col-span-2">
          <Label>SSH private key {editing && "(blank = keep)"}</Label>
          <Textarea
            value={form.ssh_key}
            onChange={(e) => set("ssh_key", e.target.value)}
            placeholder={server?.has_ssh_key ? "•••••• key stored" : "-----BEGIN OPENSSH PRIVATE KEY-----"}
            className="min-h-[70px] text-xs"
          />
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-2 text-muted-foreground">BMC / IPMI (optional)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>BMC IP</Label>
            <Input value={form.bmc_ip} onChange={(e) => set("bmc_ip", e.target.value)} placeholder="10.0.1.5" />
          </div>
          <div>
            <Label>BMC user</Label>
            <Input value={form.bmc_user} onChange={(e) => set("bmc_user", e.target.value)} placeholder="ADMIN" />
          </div>
          <div className="col-span-2">
            <Label>BMC password {editing && "(blank = keep)"}</Label>
            <Input
              type="password"
              value={form.bmc_password}
              onChange={(e) => set("bmc_password", e.target.value)}
              placeholder={server?.has_bmc_password ? "•••••• stored" : ""}
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      <label className="flex items-start gap-3 rounded-lg border p-3">
        <Switch checked={form.high_priority} onCheckedChange={(v) => set("high_priority", v)} />
        <span>
          <span className="text-sm font-medium">High priority</span>
          <span className="block text-xs text-muted-foreground">
            Pin this server to a dedicated section at the top of the Servers page.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || !form.name || !form.ip}>
          {saving ? <Spinner /> : editing ? "Save changes" : "Add server"}
        </Button>
      </div>
    </div>
  );
}
