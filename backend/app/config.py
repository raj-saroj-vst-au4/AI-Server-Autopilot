import base64
import hashlib
import os


def env(key: str, default=None):
    v = os.getenv(key)
    return v if v not in (None, "") else default


def env_int(key: str, default: int) -> int:
    try:
        return int(env(key, default))
    except (TypeError, ValueError):
        return default


def env_float(key: str, default: float) -> float:
    try:
        return float(env(key, default))
    except (TypeError, ValueError):
        return default


def env_bool(key: str, default: bool) -> bool:
    v = env(key)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


# --- Database (persistent MySQL on the host) ---
DB_HOST = env("DB_HOST", "host.docker.internal")
DB_PORT = env_int("DB_PORT", 3306)
DB_USER = env("DB_USER", "autopilot")
DB_PASSWORD = env("DB_PASSWORD", "")
DB_NAME = env("DB_NAME", "autopilot")
DATABASE_URL = env(
    "DATABASE_URL",
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4",
)

# --- Auth ---
SECRET_KEY = env("SECRET_KEY", "change-me-in-production")
TOKEN_TTL_HOURS = env_int("TOKEN_TTL_HOURS", 24)
ADMIN_USERNAME = env("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = env("ADMIN_PASSWORD", "admin123")

# --- Secrets encryption (SSH/BMC passwords at rest) ---
# If ENCRYPTION_KEY is not a valid Fernet key it is derived from SECRET_KEY.
_raw_key = env("ENCRYPTION_KEY", SECRET_KEY)
FERNET_KEY = base64.urlsafe_b64encode(hashlib.sha256(_raw_key.encode()).digest())

# --- Monitoring ---
MONITOR_INTERVAL = env_int("MONITOR_INTERVAL", 60)  # seconds between poll cycles
MONITOR_WORKERS = env_int("MONITOR_WORKERS", 10)
SSH_TIMEOUT = env_int("SSH_TIMEOUT", 12)
METRICS_RETENTION_DAYS = env_int("METRICS_RETENTION_DAYS", 7)
CPU_THRESHOLD = env_float("CPU_THRESHOLD", 90.0)
MEM_THRESHOLD = env_float("MEM_THRESHOLD", 90.0)
DISK_THRESHOLD = env_float("DISK_THRESHOLD", 85.0)
LOAD_PER_CORE_THRESHOLD = env_float("LOAD_PER_CORE_THRESHOLD", 2.0)

# --- Local AI (issues / actions / solutions per server) ---
AI_BASE_URL = env("AI_BASE_URL", "http://10.195.102.52:8000/v1").rstrip("/")
AI_API_KEY = env("AI_API_KEY", "")
AI_MODEL = env("AI_MODEL", "")  # empty = first model reported by the endpoint
AI_TIMEOUT = env_int("AI_TIMEOUT", 120)

# --- Clawdbot (chat that gets things done) ---
CLAWDBOT_BASE_URL = env("CLAWDBOT_BASE_URL", "http://10.127.1.23:18789/v1").rstrip("/")
CLAWDBOT_API_KEY = env("CLAWDBOT_API_KEY", "")
CLAWDBOT_MODEL = env("CLAWDBOT_MODEL", "")
CLAWDBOT_TIMEOUT = env_int("CLAWDBOT_TIMEOUT", 180)
CHAT_MAX_TOOL_ROUNDS = env_int("CHAT_MAX_TOOL_ROUNDS", 8)
# Allow the chat assistant to run arbitrary shell commands on managed servers.
CHAT_ALLOW_COMMANDS = env_bool("CHAT_ALLOW_COMMANDS", True)
