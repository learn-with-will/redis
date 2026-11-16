---
slug: rdb-and-aof-disaster-recovery
title: Disaster Recovery and Restoring from Snapshot Backups
topic: persistence-and-durability
kind: technique
summary: Execute disaster recovery procedures, repair corrupted AOF logs, and restore point-in-time snapshot backups safely.
tags:
  - disaster-recovery
  - backups
  - restore
  - redis-check-aof
related:
  - combining-rdb-and-aof
  - rdb-snapshots-save-bgsave
  - aof-append-only-file-fsync
---
> **In one line:** Restore databases from `dump.rdb` snapshots and repair corrupted write logs with `redis-check-aof`.

## The idea

Even in high-availability clusters with automated failover, catastrophic disasters occur: data center fires, ransomware incidents, or accidental administrative deletions (`FLUSHALL`). A robust disaster recovery plan ensures you can restore database state from cold backups.

Redis stores database state in the working directory defined by `dir` in `redis.conf`. Restoring an instance requires placing the backup snapshot in that directory and booting the server.

| Recovery Scenario | Recommended Action | Tool / Command |
|---|---|---|
| **Catastrophic Host Failure** | Restore latest `dump.rdb` from S3 into `/data` | Direct file transfer & server start |
| **Corrupted AOF File** | Truncate damaged trailing bytes | `redis-check-aof --fix appendonly.aof` |
| **Accidental `FLUSHALL`** | Stop server, edit AOF to delete `FLUSHALL` line, restart | Text editor / `sed` on AOF file |

> **Tip:** Always verify your disaster recovery backups by periodically restoring them into an isolated test environment.

## See it

Repairing a corrupted AOF file and verifying snapshot integrity:

```bash
# Verify integrity of an RDB snapshot file
redis-check-rdb /data/dump.rdb
# Output:
# [offset 0] Checking RDB file /data/dump.rdb
# [info] 12450 keys checked
# \--- RDB looks OK! ---

# If a server crashed mid-write, the AOF file might have trailing incomplete bytes:
redis-check-aof /data/appendonly.aof
# Output:
# AOF analyzed: size=1048580, ok_up_to=1048560, diff=20 bytes
# Corrupt bytes detected at end of file!

# Automatically fix and truncate the corrupted trailing bytes:
redis-check-aof --fix /data/appendonly.aof
# Successfully truncated 20 invalid bytes!

# Verify clean startup after repairing
redis-server --dir /data --appendonly yes
```

Once truncated, the AOF file is structurally valid and Redis boots cleanly without crashing.

## Go deeper

Disaster Recovery Automation Scripting:
1. Trigger a background save: `redis-cli BGSAVE`.
2. Wait for completion: monitor `LASTSAVE` until the timestamp updates to reflect the new snapshot.
3. Securely copy `/data/dump.rdb` to remote off-site storage with a timestamp tag: `aws s3 cp /data/dump.rdb s3://backups/redis-$(date +%Y%m%d).rdb`.

Because `dump.rdb` is a single self-contained binary file, it can be copied while Redis is running without locking database tables or interrupting active application clients. Always configure automated alerts if the backup script fails or the destination storage bucket is unreachable, ensuring you never run without recent disaster recovery archives.

## Watch out

- Never copy an active `dump.rdb` while `BGSAVE` is actively writing it to disk; check `INFO persistence` first.
- Running `redis-check-aof --fix` discards corrupted trailing bytes; verify what was truncated before deployment.

## Remember

- `redis-check-rdb` verifies the integrity of binary snapshot backups.
- `redis-check-aof --fix` automatically repairs and truncates damaged AOF logs.
- Regularly ship timestamped `dump.rdb` snapshots to off-site cloud storage.
