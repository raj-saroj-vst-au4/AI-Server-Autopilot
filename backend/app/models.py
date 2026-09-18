from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    ip: Mapped[str] = mapped_column(String(64), index=True)
    ssh_port: Mapped[int] = mapped_column(Integer, default=22)
    ssh_user: Mapped[str] = mapped_column(String(64), default="root")
    ssh_password_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssh_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # private key PEM
    bmc_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bmc_user: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bmc_password_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # DB column avoids MySQL's reserved word HIGH_PRIORITY; attribute stays friendly.
    high_priority: Mapped[bool] = mapped_column(
        "is_high_priority", Boolean, default=False, index=True
    )
    # online | warning | critical | offline | unknown
    status: Mapped[str] = mapped_column(String(16), default="unknown", index=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    metrics: Mapped[list["MetricSample"]] = relationship(
        back_populates="server", cascade="all, delete-orphan", passive_deletes=True
    )
    events: Mapped[list["Event"]] = relationship(
        back_populates="server", cascade="all, delete-orphan", passive_deletes=True
    )
    analyses: Mapped[list["AIAnalysis"]] = relationship(
        back_populates="server", cascade="all, delete-orphan", passive_deletes=True
    )


class MetricSample(Base):
    __tablename__ = "metric_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    server_id: Mapped[int] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    cpu_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    mem_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    load1: Mapped[float | None] = mapped_column(Float, nullable=True)
    load5: Mapped[float | None] = mapped_column(Float, nullable=True)
    load15: Mapped[float | None] = mapped_column(Float, nullable=True)
    uptime_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    cores: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mem_total: Mapped[float | None] = mapped_column(Float, nullable=True)  # bytes
    disk_total: Mapped[float | None] = mapped_column(Float, nullable=True)  # bytes

    server: Mapped["Server"] = relationship(back_populates="metrics")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    server_id: Mapped[int] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)  # info | warning | critical
    category: Mapped[str] = mapped_column(String(32), index=True)
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    server: Mapped["Server"] = relationship(back_populates="events")


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    server_id: Mapped[int] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issues: Mapped[list | None] = mapped_column(JSON, nullable=True)
    actions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    solutions: Mapped[list | None] = mapped_column(JSON, nullable=True)

    server: Mapped["Server"] = relationship(back_populates="analyses")


class AutoAction(Base):
    """Admin-defined action the system may execute automatically on anomalies."""

    __tablename__ = "auto_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # cpu_high | mem_high | disk_high | load_high | unreachable | any
    trigger_category: Mapped[str] = mapped_column(String(32), index=True)
    server_id: Mapped[int | None] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), nullable=True, index=True
    )  # NULL = applies to all servers
    command: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    # if True, the local AI reviews the event and decides whether to run this action
    require_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=30)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    runs: Mapped[list["ActionRun"]] = relationship(
        back_populates="action", cascade="all, delete-orphan", passive_deletes=True
    )


class ActionRun(Base):
    __tablename__ = "action_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    auto_action_id: Mapped[int] = mapped_column(
        ForeignKey("auto_actions.id", ondelete="CASCADE"), index=True
    )
    server_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    server_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    event_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    decided_by: Mapped[str] = mapped_column(String(16), default="rule")  # rule | ai
    ai_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | failed | skipped
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)

    action: Mapped["AutoAction"] = relationship(back_populates="runs")


class PentestScan(Base):
    """An on-demand security scan of a registered server, run via HexStrike AI."""

    __tablename__ = "pentest_scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    server_id: Mapped[int | None] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    server_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    target: Mapped[str] = mapped_column(String(255))  # always a registered server's IP
    profile: Mapped[str] = mapped_column(String(32), index=True)  # recon | vuln | web | smart | ...
    # queued | running | done | failed
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)  # username or 'chat'
    authorized_by: Mapped[str | None] = mapped_column(String(64), nullable=True)  # audit trail
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    findings: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{severity,title,detail,tool}]
    finding_counts: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {critical, high, ...}
    tools_run: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{tool,command,return_code,...}]
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)  # capped combined output
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True,
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | tool | system
    content: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tool_call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
