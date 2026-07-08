"""SSH helpers for reaching managed servers."""
import io
import socket

import paramiko

from . import config, models
from .security import decrypt


class SSHError(Exception):
    pass


def _load_pkey(key_text: str):
    for cls in (paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.RSAKey):
        try:
            return cls.from_private_key(io.StringIO(key_text))
        except (paramiko.SSHException, ValueError):
            continue
    raise SSHError("Unsupported or invalid SSH private key")


def connect(server: models.Server, timeout: int | None = None) -> paramiko.SSHClient:
    timeout = timeout or config.SSH_TIMEOUT
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    password = decrypt(server.ssh_password_enc)
    key_text = decrypt(server.ssh_key_enc)
    kwargs = dict(
        hostname=server.ip,
        port=server.ssh_port or 22,
        username=server.ssh_user or "root",
        timeout=timeout,
        banner_timeout=timeout,
        auth_timeout=timeout,
        allow_agent=False,
        look_for_keys=False,
    )
    if key_text:
        kwargs["pkey"] = _load_pkey(key_text)
    if password:
        kwargs["password"] = password
    try:
        client.connect(**kwargs)
    except paramiko.AuthenticationException as e:
        client.close()
        raise SSHError(f"SSH authentication failed: {e}")
    except (paramiko.SSHException, socket.error, OSError) as e:
        client.close()
        raise SSHError(f"SSH connection failed: {e}")
    return client


def run(server: models.Server, command: str, timeout: int = 60) -> tuple[int, str, str]:
    """Run a command, return (exit_code, stdout, stderr)."""
    client = connect(server)
    try:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        rc = stdout.channel.recv_exit_status()
        return rc, out, err
    except (paramiko.SSHException, socket.timeout) as e:
        raise SSHError(f"SSH command failed: {e}")
    finally:
        client.close()


def tcp_reachable(host: str, port: int, timeout: int = 5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False
