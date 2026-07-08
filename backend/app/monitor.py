"""Background monitoring: polls every server over SSH, records metrics,
raises/resolves anomaly events, and executes admin-defined auto-actions."""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from sqlalchemy import select

from . import ai_client, config, models, ssh
from .database import SessionLocal
from .models import utcnow

log = logging.getLogger("autopilot.monitor")

METRICS_CMD = (
    "echo S1; head -1 /proc/stat; sleep 1; echo S2; head -1 /proc/stat; "
    "echo MEM; free -b | awk '/^Mem:/{print $2, $3, $7}'; "
    "echo DISK; df -P -B1 / | tail -1; "
    "echo LOAD; cat /proc/loadavg; "
    "echo UPTIME; cat /proc/uptime; "
    "echo NPROC; nproc; "
    "echo HOST; hostname"
)

_stop = threading.Event()
_thread: threading.Thread | None = None


def _cpu_pct(stat1: str, stat2: str) -> float | None:
    try:
        a = [int(x) for x in stat1.split()[1:]]
        b = [int(x) for x in stat2.split()[1:]]
        total = sum(b) - sum(a)
        idle = (b[3] + (b[4] if len(b) > 4 else 0)) - (a[3] + (a[4] if len(a) > 4 else 0))
        if total <= 0:
            return None
        return round(100.0 * (total - idle) / total, 1)
    except (ValueError, IndexError):
        return None


def parse_metrics(output: str) -> dict:
    sections: dict[str, list[str]] = {}
    current = None
    for line in output.splitlines():
        line = line.strip()
        if line in ("S1", "S2", "MEM", "DISK", "LOAD", "UPTIME", "NPROC", "HOST"):
            current = line
            sections[current] = []
        elif current and line:
            sections[current].append(line)

    m: dict = {}
    if sections.get("S1") and sections.get("S2"):
        m["cpu_pct"] = _cpu_pct(sections["S1"][0], sections["S2"][0])
    if sections.get("MEM"):
        try:
            total, used, avail = (float(x) for x in sections["MEM"][0].split()[:3])
            m["mem_total"] = total
            m["mem_pct"] = round(100.0 * (total - avail) / total, 1) if total else None
        except (ValueError, IndexError):
            pass
    if sections.get("DISK"):
        try:
            parts = sections["DISK"][0].split()
            m["disk_total"] = float(parts[1])
            m["disk_pct"] = round(100.0 * float(parts[2]) / float(parts[1]), 1)
        except (ValueError, IndexError, ZeroDivisionError):
            pass
    if sections.get("LOAD"):
        try:
            l1, l5, l15 = (float(x) for x in sections["LOAD"][0].split()[:3])
            m["load1"], m["load5"], m["load15"] = l1, l5, l15
        except (ValueError, IndexError):
            pass
    if sections.get("UPTIME"):
        try:
            m["uptime_s"] = float(sections["UPTIME"][0].split()[0])
        except (ValueError, IndexError):
            pass
    if sections.get("NPROC"):
        try:
            m["cores"] = int(sections["NPROC"][0])
        except ValueError:
            pass
    if sections.get("HOST"):
        m["hostname"] = sections["HOST"][0]
    return m


def detect_anomalies(m: dict) -> dict[str, dict]:
    """Return {category: {severity, message, details}} for active anomalies."""
    found: dict[str, dict] = {}
    cpu = m.get("cpu_pct")
    if cpu is not None and cpu >= config.CPU_THRESHOLD:
        found["cpu_high"] = {
            "severity": "critical" if cpu >= 98 else "warning",
            "message": f"High CPU usage: {cpu}% (threshold {config.CPU_THRESHOLD}%)",
            "details": {"cpu_pct": cpu, "threshold": config.CPU_THRESHOLD},
        }
    mem = m.get("mem_pct")
    if mem is not None and mem >= config.MEM_THRESHOLD:
        found["mem_high"] = {
            "severity": "critical" if mem >= 97 else "warning",
            "message": f"High memory usage: {mem}% (threshold {config.MEM_THRESHOLD}%)",
            "details": {"mem_pct": mem, "threshold": config.MEM_THRESHOLD},
        }
    disk = m.get("disk_pct")
    if disk is not None and disk >= config.DISK_THRESHOLD:
        found["disk_high"] = {
            "severity": "critical" if disk >= 95 else "warning",
            "message": f"Root filesystem {disk}% full (threshold {config.DISK_THRESHOLD}%)",
            "details": {"disk_pct": disk, "threshold": config.DISK_THRESHOLD},
        }
    load1, cores = m.get("load1"), m.get("cores")
    if load1 is not None and cores:
        per_core = load1 / cores
        if per_core >= config.LOAD_PER_CORE_THRESHOLD:
            found["load_high"] = {
                "severity": "warning",
                "message": f"High load average: {load1} on {cores} cores "
                f"({per_core:.2f}/core, threshold {config.LOAD_PER_CORE_THRESHOLD}/core)",
                "details": {"load1": load1, "cores": cores},
            }
    return found


def _open_events(db, server_id: int) -> dict[str, models.Event]:
    rows = db.scalars(
        select(models.Event).where(
            models.Event.server_id == server_id,
            models.Event.resolved.is_(False),
            models.Event.category.in_(
                ["cpu_high", "mem_high", "disk_high", "load_high", "unreachable"]
            ),
        )
    ).all()
    return {e.category: e for e in rows}


def _sync_events(db, server: models.Server, active: dict[str, dict]) -> list[models.Event]:
    """Open events for new anomalies, resolve cleared ones. Returns new events."""
    open_by_cat = _open_events(db, server.id)
    new_events: list[models.Event] = []
    for cat, info in active.items():
        existing = open_by_cat.get(cat)
        if existing:
            existing.message = info["message"]
            existing.details = info["details"]
            existing.severity = info["severity"]
        else:
            ev = models.Event(
                server_id=server.id,
                severity=info["severity"],
                category=cat,
                message=info["message"],
                details=info["details"],
            )
            db.add(ev)
            new_events.append(ev)
    for cat, ev in open_by_cat.items():
        if cat not in active:
            ev.resolved = True
            ev.resolved_at = utcnow()
            db.add(
                models.Event(
                    server_id=server.id,
                    severity="info",
                    category="recovered",
                    message=f"Recovered: {ev.message}",
                    details={"recovered_from": cat},
                )
            )
    db.flush()
    return new_events


def _matching_actions(db, server: models.Server, event: models.Event) -> list[models.AutoAction]:
    now = utcnow()
    rows = db.scalars(
        select(models.AutoAction).where(
            models.AutoAction.enabled.is_(True),
            models.AutoAction.trigger_category.in_([event.category, "any"]),
        )
    ).all()
    out = []
    for a in rows:
        if a.server_id is not None and a.server_id != server.id:
            continue
        if a.last_run_at and now - a.last_run_at < timedelta(minutes=a.cooldown_minutes or 0):
            continue
        out.append(a)
    return out


def _run_auto_actions(db, server: models.Server, event: models.Event):
    for action in _matching_actions(db, server, event):
        decided_by, reason = "rule", None
        if action.require_ai:
            decided_by = "ai"
            try:
                ok, reason = ai_client.approve_action(
                    {
                        "server": server.name,
                        "ip": server.ip,
                        "category": event.category,
                        "severity": event.severity,
                        "message": event.message,
                        "details": event.details,
                    },
                    {"name": action.name, "description": action.description,
                     "command": action.command},
                )
            except ai_client.AIError as e:
                ok, reason = False, f"AI gate unavailable: {e}"
            if not ok:
                db.add(models.ActionRun(
                    auto_action_id=action.id, server_id=server.id, server_name=server.name,
                    event_id=event.id, decided_by="ai", ai_reason=reason, status="skipped",
                ))
                continue

        action.last_run_at = utcnow()
        run = models.ActionRun(
            auto_action_id=action.id, server_id=server.id, server_name=server.name,
            event_id=event.id, decided_by=decided_by, ai_reason=reason,
        )
        try:
            if event.category == "unreachable":
                # can't SSH to an unreachable box; only useful for BMC-style commands
                raise ssh.SSHError("Server unreachable — SSH action skipped")
            rc, out, err = ssh.run(server, action.command, timeout=120)
            run.exit_code = rc
            run.output = (out + ("\n" + err if err else ""))[:8000]
            run.status = "ok" if rc == 0 else "failed"
        except ssh.SSHError as e:
            run.status = "failed"
            run.output = str(e)
        db.add(run)
        db.add(models.Event(
            server_id=server.id,
            severity="info" if run.status == "ok" else "warning",
            category="auto_action",
            message=f"Auto-action '{action.name}' {run.status} "
            f"(trigger: {event.category}, decided by {decided_by})",
            details={"action_id": action.id, "exit_code": run.exit_code,
                     "output": (run.output or "")[:1000]},
        ))
    db.flush()


def poll_server(server_id: int):
    db = SessionLocal()
    try:
        server = db.get(models.Server, server_id)
        if server is None:
            return
        try:
            rc, out, err = ssh.run(server, METRICS_CMD, timeout=45)
            m = parse_metrics(out)
        except ssh.SSHError as e:
            server.last_error = str(e)
            active = {
                "unreachable": {
                    "severity": "critical",
                    "message": f"Server unreachable over SSH: {e}",
                    "details": {"ip": server.ip, "port": server.ssh_port},
                }
            }
            new_events = _sync_events(db, server, active)
            server.status = "offline"
            for ev in new_events:
                _run_auto_actions(db, server, ev)
            db.commit()
            return

        server.last_seen = utcnow()
        server.last_error = None
        if m.get("hostname"):
            server.hostname = m["hostname"]

        db.add(models.MetricSample(
            server_id=server.id,
            cpu_pct=m.get("cpu_pct"), mem_pct=m.get("mem_pct"), disk_pct=m.get("disk_pct"),
            load1=m.get("load1"), load5=m.get("load5"), load15=m.get("load15"),
            uptime_s=m.get("uptime_s"), cores=m.get("cores"),
            mem_total=m.get("mem_total"), disk_total=m.get("disk_total"),
        ))

        active = detect_anomalies(m)
        new_events = _sync_events(db, server, active)
        if any(v["severity"] == "critical" for v in active.values()):
            server.status = "critical"
        elif active:
            server.status = "warning"
        else:
            server.status = "online"
        for ev in new_events:
            _run_auto_actions(db, server, ev)
        db.commit()
    except Exception:
        db.rollback()
        log.exception("poll failed for server %s", server_id)
    finally:
        db.close()


def _cleanup(db):
    cutoff = utcnow() - timedelta(days=config.METRICS_RETENTION_DAYS)
    db.query(models.MetricSample).filter(models.MetricSample.ts < cutoff).delete()
    db.commit()


def _loop():
    log.info("monitor started (interval=%ss)", config.MONITOR_INTERVAL)
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                ids = [s.id for s in db.scalars(select(models.Server)).all()]
                _cleanup(db)
            finally:
                db.close()
            if ids:
                with ThreadPoolExecutor(max_workers=config.MONITOR_WORKERS) as pool:
                    list(pool.map(poll_server, ids))
        except Exception:
            log.exception("monitor cycle failed")
        _stop.wait(config.MONITOR_INTERVAL)


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="monitor", daemon=True)
    _thread.start()


def stop():
    _stop.set()
