"""Actions the Clawdbot chat assistant can perform on managed servers.

Each tool returns a plain-text result string. Tools resolve servers by name or IP.
"""
import shlex

from sqlalchemy import or_, select

from . import config, models, pentest, ssh


class ToolError(Exception):
    pass


def _find_server(db, identifier: str) -> models.Server:
    ident = (identifier or "").strip()
    srv = db.scalars(
        select(models.Server).where(
            or_(models.Server.name == ident, models.Server.ip == ident)
        )
    ).first()
    if srv is None:
        srv = db.scalars(
            select(models.Server).where(models.Server.name.ilike(f"%{ident}%"))
        ).first()
    if srv is None:
        raise ToolError(f"No server found matching '{identifier}'")
    return srv


def _all_servers(db) -> list[models.Server]:
    return db.scalars(select(models.Server)).all()


# ---- tool implementations -------------------------------------------------

def list_servers(db, **_) -> str:
    servers = _all_servers(db)
    if not servers:
        return "No servers are registered."
    lines = [
        f"- {s.name} ({s.ip}) — status={s.status}"
        + (f", host={s.hostname}" if s.hostname else "")
        for s in servers
    ]
    return "Registered servers:\n" + "\n".join(lines)


def server_uptime(db, server: str = "", **_) -> str:
    srv = _find_server(db, server)
    rc, out, err = ssh.run(srv, "uptime; echo '---'; cat /proc/uptime", timeout=30)
    if rc != 0:
        raise ToolError(f"uptime failed on {srv.name}: {err or out}")
    return f"Uptime for {srv.name} ({srv.ip}):\n{out.strip()}"


def create_user(db, server: str = "", username: str = "", password: str = "",
                sudo: bool = False, **_) -> str:
    if not username:
        raise ToolError("username is required")
    srv = _find_server(db, server)
    u = shlex.quote(username)
    cmds = [f"useradd -m -s /bin/bash {u}"]
    if password:
        cmds.append(f"echo {shlex.quote(username + ':' + password)} | chpasswd")
    if sudo:
        cmds.append(f"usermod -aG sudo {u}")
    rc, out, err = ssh.run(srv, " && ".join(cmds), timeout=45)
    if rc != 0:
        raise ToolError(f"Failed to create user on {srv.name}: {err or out}")
    return f"Created user '{username}' on {srv.name}" + (" with sudo" if sudo else "") + "."


def delete_user(db, server: str = "", username: str = "", remove_home: bool = False, **_) -> str:
    if not username:
        raise ToolError("username is required")
    srv = _find_server(db, server)
    flag = "-r " if remove_home else ""
    rc, out, err = ssh.run(srv, f"userdel {flag}{shlex.quote(username)}", timeout=45)
    if rc != 0:
        raise ToolError(f"Failed to delete user on {srv.name}: {err or out}")
    return f"Deleted user '{username}' on {srv.name}."


def set_disk_quota(db, server: str = "", username: str = "", soft_mb: int = 0,
                   hard_mb: int = 0, mount: str = "/", **_) -> str:
    """Set a user's disk quota using setquota (blocks are 1KB units)."""
    if not username:
        raise ToolError("username is required")
    srv = _find_server(db, server)
    soft_blocks = int(soft_mb) * 1024
    hard_blocks = int(hard_mb or soft_mb) * 1024
    cmd = (
        f"setquota -u {shlex.quote(username)} {soft_blocks} {hard_blocks} 0 0 "
        f"{shlex.quote(mount)} && quota -u {shlex.quote(username)}"
    )
    rc, out, err = ssh.run(srv, cmd, timeout=45)
    if rc != 0:
        raise ToolError(
            f"Failed to set quota on {srv.name} (is quota enabled on {mount}?): {err or out}"
        )
    return f"Set quota for '{username}' on {srv.name}: soft={soft_mb}MB hard={hard_mb or soft_mb}MB.\n{out.strip()}"


def check_disk_usage(db, server: str = "", **_) -> str:
    srv = _find_server(db, server)
    rc, out, _ = ssh.run(srv, "df -h", timeout=30)
    return f"Disk usage on {srv.name}:\n{out.strip()}"


def restart_service(db, server: str = "", service: str = "", **_) -> str:
    if not service:
        raise ToolError("service is required")
    srv = _find_server(db, server)
    rc, out, err = ssh.run(srv, f"systemctl restart {shlex.quote(service)} && systemctl is-active {shlex.quote(service)}", timeout=60)
    if rc != 0:
        raise ToolError(f"Failed to restart {service} on {srv.name}: {err or out}")
    return f"Restarted '{service}' on {srv.name}. Status: {out.strip()}"


def shutdown_server(db, server: str = "", delay_minutes: int = 0, **_) -> str:
    srv = _find_server(db, server)
    when = "now" if not delay_minutes else f"+{int(delay_minutes)}"
    rc, out, err = ssh.run(srv, f"shutdown -h {when}", timeout=20)
    # shutdown closes the connection; treat SSH teardown as success
    return f"Sent shutdown ({when}) to {srv.name} ({srv.ip})."


def reboot_server(db, server: str = "", **_) -> str:
    srv = _find_server(db, server)
    ssh.run(srv, "reboot", timeout=20)
    return f"Sent reboot to {srv.name} ({srv.ip})."


def shutdown_all_servers(db, delay_minutes: int = 0, confirm: bool = False, **_) -> str:
    if not confirm:
        servers = _all_servers(db)
        names = ", ".join(s.name for s in servers) or "(none)"
        return (
            f"This will shut down ALL {len(servers)} servers: {names}. "
            "Re-issue the request confirming you want to shut them all down."
        )
    when = "now" if not delay_minutes else f"+{int(delay_minutes)}"
    results = []
    for srv in _all_servers(db):
        try:
            ssh.run(srv, f"shutdown -h {when}", timeout=20)
            results.append(f"{srv.name}: shutdown sent")
        except ssh.SSHError as e:
            results.append(f"{srv.name}: FAILED ({e})")
    return "Fleet shutdown:\n" + "\n".join(results)


def run_command(db, server: str = "", command: str = "", **_) -> str:
    if not config.CHAT_ALLOW_COMMANDS:
        raise ToolError("Arbitrary command execution is disabled by policy.")
    if not command:
        raise ToolError("command is required")
    srv = _find_server(db, server)
    rc, out, err = ssh.run(srv, command, timeout=120)
    body = out.strip()
    if err.strip():
        body += f"\n[stderr]\n{err.strip()}"
    return f"$ {command}  (exit {rc}) on {srv.name}:\n{body[:6000]}"


def list_pentest_profiles(db, **_) -> str:
    if not config.PENTEST_ENABLED:
        return "Pentesting is disabled (set PENTEST_ENABLED=true to enable it)."
    profs = pentest.available_profiles()
    lines = [f"- {p['key']}: {p['label']} — {p['description']}" for p in profs]
    return "Available pentest profiles:\n" + "\n".join(lines)


def run_pentest(db, server: str = "", profile: str = "recon", confirm: bool = False, **_) -> str:
    srv = _find_server(db, server)
    try:
        scan = pentest.start_scan(
            db, server=srv, profile=profile, triggered_by="chat", confirm=confirm
        )
    except pentest.PentestError as e:
        raise ToolError(str(e))
    return (
        f"Started {profile} scan #{scan.id} on {srv.name} ({srv.ip}). It runs in the "
        f"background — ask for 'pentest results for {srv.name}' in a moment to see findings."
    )


def get_pentest_result(db, server: str = "", scan_id: int = 0, **_) -> str:
    if scan_id:
        scan = db.get(models.PentestScan, int(scan_id))
        if not scan:
            raise ToolError(f"No scan found with id {scan_id}")
    else:
        srv = _find_server(db, server)
        scan = pentest.latest_for_server(db, srv.id)
        if not scan:
            raise ToolError(f"No scans have been run on {srv.name} yet.")
    header = (
        f"Scan #{scan.id} ({scan.profile}) on {scan.server_name or scan.target} — "
        f"status: {scan.status}"
    )
    if scan.status in ("queued", "running"):
        return header + ". Still running; check back shortly."
    if scan.status == "failed":
        return header + f".\nError: {scan.error}"
    lines = [header, scan.summary or ""]
    for f in (scan.findings or [])[:25]:
        lines.append(f"  [{f['severity']}] {f['title']} — {f['detail']}")
    if len(scan.findings or []) > 25:
        lines.append(f"  ... and {len(scan.findings) - 25} more.")
    return "\n".join(l for l in lines if l)


def server_metrics(db, server: str = "", **_) -> str:
    srv = _find_server(db, server)
    latest = db.scalars(
        select(models.MetricSample)
        .where(models.MetricSample.server_id == srv.id)
        .order_by(models.MetricSample.ts.desc())
        .limit(1)
    ).first()
    if not latest:
        return f"No metrics collected yet for {srv.name}."
    return (
        f"{srv.name} latest metrics: CPU={latest.cpu_pct}% MEM={latest.mem_pct}% "
        f"DISK={latest.disk_pct}% load1={latest.load1} cores={latest.cores} "
        f"status={srv.status}"
    )


# ---- OpenAI tool schema ----------------------------------------------------

TOOLS = [
    {"type": "function", "function": {
        "name": "list_servers", "description": "List all registered servers and their status.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "server_uptime", "description": "Check the uptime of a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string", "description": "server name or IP"}},
            "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "server_metrics", "description": "Get the latest CPU/memory/disk metrics for a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}}, "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "create_user", "description": "Create a Linux user on a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}, "username": {"type": "string"},
            "password": {"type": "string", "description": "optional initial password"},
            "sudo": {"type": "boolean", "description": "grant sudo access"}},
            "required": ["server", "username"]},
    }},
    {"type": "function", "function": {
        "name": "delete_user", "description": "Delete a Linux user from a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}, "username": {"type": "string"},
            "remove_home": {"type": "boolean"}}, "required": ["server", "username"]},
    }},
    {"type": "function", "function": {
        "name": "set_disk_quota", "description": "Set a user's disk quota (in MB) on a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}, "username": {"type": "string"},
            "soft_mb": {"type": "integer"}, "hard_mb": {"type": "integer"},
            "mount": {"type": "string", "description": "filesystem mount, default /"}},
            "required": ["server", "username", "soft_mb"]},
    }},
    {"type": "function", "function": {
        "name": "check_disk_usage", "description": "Show df -h disk usage for a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}}, "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "restart_service", "description": "Restart a systemd service on a server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}, "service": {"type": "string"}},
            "required": ["server", "service"]},
    }},
    {"type": "function", "function": {
        "name": "shutdown_server", "description": "Shut down a single server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"},
            "delay_minutes": {"type": "integer", "description": "0 = now"}},
            "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "reboot_server", "description": "Reboot a single server.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}}, "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "shutdown_all_servers",
        "description": "Shut down ALL servers at once. Requires confirm=true to actually execute.",
        "parameters": {"type": "object", "properties": {
            "delay_minutes": {"type": "integer"},
            "confirm": {"type": "boolean", "description": "must be true to proceed"}}},
    }},
    {"type": "function", "function": {
        "name": "run_command", "description": "Run an arbitrary shell command on a server over SSH.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string"}, "command": {"type": "string"}},
            "required": ["server", "command"]},
    }},
    {"type": "function", "function": {
        "name": "list_pentest_profiles",
        "description": "List the available on-demand security scan (pentest) profiles.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "run_pentest",
        "description": "Start an on-demand security scan (pentest) of a registered server using "
                       "HexStrike AI. Runs in the background. Profiles: recon, vuln, web, smart "
                       "(and exploit if aggressive scans are enabled).",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string", "description": "server name or IP (must be registered)"},
            "profile": {"type": "string", "description": "recon | vuln | web | smart | exploit"},
            "confirm": {"type": "boolean", "description": "required for intrusive profiles"}},
            "required": ["server"]},
    }},
    {"type": "function", "function": {
        "name": "get_pentest_result",
        "description": "Get the latest pentest scan result for a server, or a specific scan by id.",
        "parameters": {"type": "object", "properties": {
            "server": {"type": "string", "description": "server name or IP"},
            "scan_id": {"type": "integer", "description": "specific scan id (optional)"}}},
    }},
]

DISPATCH = {
    "list_servers": list_servers,
    "server_uptime": server_uptime,
    "server_metrics": server_metrics,
    "create_user": create_user,
    "delete_user": delete_user,
    "set_disk_quota": set_disk_quota,
    "check_disk_usage": check_disk_usage,
    "restart_service": restart_service,
    "shutdown_server": shutdown_server,
    "reboot_server": reboot_server,
    "shutdown_all_servers": shutdown_all_servers,
    "run_command": run_command,
    "list_pentest_profiles": list_pentest_profiles,
    "run_pentest": run_pentest,
    "get_pentest_result": get_pentest_result,
}


def call(db, name: str, arguments: dict) -> str:
    fn = DISPATCH.get(name)
    if fn is None:
        return f"Unknown tool: {name}"
    try:
        return fn(db, **(arguments or {}))
    except ssh.SSHError as e:
        return f"SSH error: {e}"
    except ToolError as e:
        return f"Error: {e}"
    except TypeError as e:
        return f"Invalid arguments for {name}: {e}"
