---
slug: renaming-and-disabling-dangerous-commands
title: Renaming and Disabling Dangerous Commands
topic: security-and-operations
kind: technique
summary: Neutralize catastrophic administrative commands like FLUSHALL, CONFIG, and KEYS using rename-command.
tags:
  - rename-command
  - security
  - hardening
  - flushall
related:
  - access-control-lists-acl
  - network-binding-and-protected-mode
---
> **In one line:** The rename-command directive disables or scrambles high-risk commands to prevent accidental database wiping and compromise.

## The idea
Certain Redis commands present catastrophic risks if issued in a production environment:
* `FLUSHALL` / `FLUSHDB`: Instantly deletes all keys across all logical databases without confirmation.
* `CONFIG`: Allows rewriting server configuration at runtime, potentially modifying file paths or loading untrusted modules.
* `KEYS`: Sequentially scans millions of keys, blocking the single-threaded event loop for seconds or minutes.
* `SHUTDOWN`: Immediately halts the Redis server process.

To harden Redis servers (especially those on older versions without full ACL support), the `rename-command` directive allows renaming or completely disabling dangerous commands.

## See it
Harden `redis.conf` by disabling catastrophic commands or renaming them to unpredictable secrets:

```text
# Completely disable catastrophic commands by renaming to empty string ""
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command KEYS ""
rename-command DEBUG ""

# Obfuscate administrative commands with long secret tokens
rename-command CONFIG "CONFIG_x98b2c41f7e04a"
rename-command SHUTDOWN "SHUTDOWN_k1829f0a2e"
```

Verify the restriction using `redis-cli`:

```bash
# Attempting to call disabled command returns an unknown command error
127.0.0.1:6379> FLUSHALL
(error) ERR unknown command 'FLUSHALL'

# Calling renamed administrative command succeeds
127.0.0.1:6379> CONFIG_x98b2c41f7e04a GET maxmemory
1) "maxmemory"
2) "2147483648"

# Check active configuration dynamically
127.0.0.1:6379> CONFIG_x98b2c41f7e04a GET port
1) "port"
2) "6379"
```

## Go deeper
When a command is renamed to `""`, Redis removes it from the internal command dispatch table. It ceases to exist in the parser, making it impossible for any client or script to trigger it.

While `rename-command` is effective, modern Redis deployments strongly favor Access Control Lists (ACL). ACLs provide a cleaner, more maintainable security boundary by restricting commands per user or service without breaking external administrative monitoring tools. Renaming commands globally alters behavior for all clients, which can cause third-party diagnostic agents or health checks to fail unexpectedly.

> **Tip:** If your monitoring system (e.g. Datadog or Prometheus) requires `CONFIG GET`, renaming `CONFIG` globally will break metric collectors unless you update the agent's query strings.

## Watch out
* Renaming commands will break AOF files or replication if replicas and primaries do not share the exact same renamed definitions.
* Do not rename commands on a live primary without synchronizing `redis.conf` across all replica nodes first.

## Remember
* `rename-command <CMD> ""` completely disables dangerous commands like `FLUSHALL` and `KEYS`.
* Renaming commands to obscure secrets limits administrative power to authorized personnel.
* In Redis 6+, prefer granular ACL permissions over global `rename-command` modifications.
