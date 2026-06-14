# Hetzner Agent Worker Runbook

This is the operational checklist for replicating the current Pach general MCP worker on a new Hetzner VPS.

## What The Worker Does

- Runs `server/src/scripts/pach-agent.ts` as a long-lived polling process.
- Heartbeats to `https://api.pach.world/agent-worker/heartbeat`.
- Polls every few seconds for claimable general MCP agent runs.
- Starts `codex exec` locally on the VPS using the signed-in Codex subscription.
- Gives Codex Pach MCP access through the remote MCP token.
- Reports run progress back to Pach.

Current v0 behavior: one worker process handles one Codex run at a time. More queued runs wait until the process finishes unless multiple services/processes are configured.

## Required Server State

- Linux user: `pach`
- SSH access as `pach@<server-ip>`
- Node.js available
- `corepack`/`pnpm` available
- Codex CLI installed and logged in under the `pach` user
- Pach repo cloned or synced under:

```bash
/home/pach/workspaces/repos/axelpach/pach
```

The worker uses the repo checkout for the `pach-agent.ts` script and project dependencies.

## Required Pach State

Create or reuse an `agent_workers` record in production.

Important fields:

- `id`: stable UUID used as `PACH_AGENT_WORKER_ID`
- `name`: human-readable worker name, e.g. `pach-worker-02`
- `provider`: `hetzner`
- `provider_server_id`: Hetzner server id if known
- `hostname`: same as worker name is fine
- `ssh_host`: public IP or Tailscale IP
- `ssh_port`: usually `22`
- `ssh_user`: `pach`
- `status`: can start as `offline` or `running`
- `metadata`: useful place for `publicIp`, `tailscaleIp`, `tailscaleName`, `hetznerName`

The MCP token must have access to the organizations this worker should operate on. For Axel-only/internal usage today, the existing all-organizations token is enough.

## Remote Environment File

Create:

```bash
mkdir -p ~/.config/pach-agent
nano ~/.config/pach-agent/env
```

Template:

```bash
PACH_API_URL=https://api.pach.world
PACH_AGENT_WORKER_ID=<agent_workers.id>
PACH_AGENT_WORKER_NAME=<worker-name>
PACH_AGENT_PROVIDER=hetzner
PACH_AGENT_POLL_MS=5000
PACH_AGENT_CAPABILITIES=codex.local,pach-mcp
PACH_AGENT_LIMIT_CODING=1
PACH_AGENT_LIMIT_GENERAL=3
PACH_AGENT_CODEX_FULL_TRUST=true
PACH_MCP_TOKEN=<secret-token>
```

Do not commit real tokens. Put the real `PACH_MCP_TOKEN` only in the remote env file.

## Codex MCP Config

Codex on the VPS must know about Pach MCP. Configure this under the `pach` user, usually in `~/.codex/config.toml`.

The Pach MCP server should point at production:

```toml
[mcp_servers.pach]
command = "npx"
args = ["mcp-remote", "https://api.pach.world/mcp", "--header", "Authorization: Bearer ${PACH_MCP_TOKEN}"]
env = { PACH_MCP_TOKEN = "${PACH_MCP_TOKEN}" }
```

If Codex reports the MCP token env var is not set, the config is probably using the token value as the env var name. It must reference `PACH_MCP_TOKEN`, not the token itself.

## Systemd User Service

Create:

```bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/pach-agent.service
```

Template:

```ini
[Unit]
Description=Pach general MCP agent worker
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/pach/workspaces/repos/axelpach/pach
EnvironmentFile=/home/pach/.config/pach-agent/env
ExecStart=/home/pach/.local/bin/pach-agent
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Create the wrapper script:

```bash
mkdir -p ~/.local/bin
nano ~/.local/bin/pach-agent
chmod +x ~/.local/bin/pach-agent
```

Wrapper template:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/pach/workspaces/repos/axelpach/pach
exec pnpm --filter server exec tsx src/scripts/pach-agent.ts
```

Enable lingering so the user service can run after SSH disconnects:

```bash
loginctl enable-linger pach
```

Then start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now pach-agent
```

## Verification

Check service state:

```bash
systemctl --user status pach-agent --no-pager
```

Follow logs:

```bash
journalctl --user -u pach-agent -f
```

Healthy logs look like:

```text
pach-agent starting: pach-worker-01
api: https://api.pach.world
capabilities: codex.local, pach-mcp
mode: general handler
codex trust: full
heartbeat ok: pach-worker-01 (...)
no claimable runs
```

When a Pach issue queues a general MCP run, logs should show:

```text
claimed general MCP run <run-id> for issue <issue-id>
starting: codex exec <prompt>
completed general MCP run <run-id>
```

## Common Problems

- `/agent-worker/heartbeat: Not found`: production server has not deployed the agent-worker routes.
- MCP tool calls are cancelled: Codex is likely asking for MCP permissions. Set the worker/Codex trust path to full trust for this dedicated worker.
- `PACH_MCP_TOKEN` is not set: check both `~/.config/pach-agent/env` and Codex MCP config.
- Worker polls but never claims: check there is a queued run, the worker capabilities include `pach-mcp`, and the server-side claim filters match the worker.
- Service exits immediately: run the wrapper manually as `pach` to see missing dependencies or repo path issues.

## Useful Local Commands

Restart after env/config change:

```bash
systemctl --user restart pach-agent
```

Last logs:

```bash
journalctl --user -u pach-agent -n 100 --no-pager
```

One-off smoke run from the repo:

```bash
PACH_API_URL=https://api.pach.world \
PACH_MCP_TOKEN=<secret-token> \
PACH_AGENT_WORKER_ID=<agent_workers.id> \
PACH_AGENT_WORKER_NAME=<worker-name> \
PACH_AGENT_PROVIDER=hetzner \
pnpm --filter server exec tsx src/scripts/pach-agent.ts --once
```

