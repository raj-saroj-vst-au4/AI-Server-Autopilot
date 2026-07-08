from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    username: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    ip: str = Field(min_length=1, max_length=64)
    ssh_port: int = 22
    ssh_user: str = "root"
    ssh_password: str | None = None
    ssh_key: str | None = None
    bmc_ip: str | None = None
    bmc_user: str | None = None
    bmc_password: str | None = None
    description: str | None = None
    high_priority: bool = False


class ServerUpdate(BaseModel):
    name: str | None = None
    ip: str | None = None
    ssh_port: int | None = None
    ssh_user: str | None = None
    ssh_password: str | None = None  # None = keep, "" = clear
    ssh_key: str | None = None
    bmc_ip: str | None = None
    bmc_user: str | None = None
    bmc_password: str | None = None
    description: str | None = None
    high_priority: bool | None = None


class MetricOut(BaseModel):
    ts: datetime
    cpu_pct: float | None
    mem_pct: float | None
    disk_pct: float | None
    load1: float | None
    load5: float | None
    load15: float | None
    uptime_s: float | None
    cores: int | None

    class Config:
        from_attributes = True


class ServerOut(BaseModel):
    id: int
    name: str
    ip: str
    ssh_port: int
    ssh_user: str
    bmc_ip: str | None
    bmc_user: str | None
    description: str | None
    high_priority: bool = False
    status: str
    hostname: str | None
    last_seen: datetime | None
    last_error: str | None
    has_ssh_password: bool = False
    has_ssh_key: bool = False
    has_bmc_password: bool = False
    open_events: int = 0
    latest: MetricOut | None = None

    class Config:
        from_attributes = True


class EventOut(BaseModel):
    id: int
    server_id: int
    server_name: str | None = None
    ts: datetime
    severity: str
    category: str
    message: str
    details: dict | None
    resolved: bool
    resolved_at: datetime | None

    class Config:
        from_attributes = True


class AnalysisOut(BaseModel):
    id: int
    server_id: int
    ts: datetime
    model: str | None
    summary: str | None
    health_score: int | None
    issues: list | None
    actions: list | None
    solutions: list | None

    class Config:
        from_attributes = True


class PowerAction(BaseModel):
    action: str  # status | on | off | cycle | reset


class AutoActionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    trigger_category: str  # cpu_high | mem_high | disk_high | load_high | unreachable | any
    server_id: int | None = None
    command: str = Field(min_length=1)
    enabled: bool = True
    require_ai: bool = False
    cooldown_minutes: int = 30


class AutoActionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_category: str | None = None
    server_id: int | None = None
    clear_server: bool = False
    command: str | None = None
    enabled: bool | None = None
    require_ai: bool | None = None
    cooldown_minutes: int | None = None


class AutoActionOut(BaseModel):
    id: int
    name: str
    description: str | None
    trigger_category: str
    server_id: int | None
    server_name: str | None = None
    command: str
    enabled: bool
    require_ai: bool
    cooldown_minutes: int
    last_run_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class ActionRunOut(BaseModel):
    id: int
    auto_action_id: int
    action_name: str | None = None
    server_id: int | None
    server_name: str | None
    event_id: int | None
    ts: datetime
    decided_by: str
    ai_reason: str | None
    status: str
    exit_code: int | None
    output: str | None

    class Config:
        from_attributes = True


class ChatSessionOut(BaseModel):
    id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    tool_calls: list | None
    tool_name: str | None
    ts: datetime

    class Config:
        from_attributes = True


class ChatSendRequest(BaseModel):
    content: str = Field(min_length=1)


class QuickChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class QuickChatRequest(BaseModel):
    messages: list[QuickChatMessage] = Field(min_length=1)


class QuickChatResponse(BaseModel):
    reply: str
    actions: list[str] = []  # human-readable summary of tools invoked
