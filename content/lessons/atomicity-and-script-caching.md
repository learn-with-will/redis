---
slug: atomicity-and-script-caching
title: Atomic Script Execution and Pre-loading with SCRIPT LOAD
topic: transactions-and-scripting
kind: concept
summary: Pre-load and cache Lua script bytecode with SCRIPT LOAD to optimize throughput and understand server script timeout behavior.
tags:
  - script-load
  - evalsha
  - caching
  - performance
related:
  - lua-scripting-basics-eval
  - keys-vs-argv-in-scripts
  - redis-functions-architecture
---
> **In one line:** Pre-compile Lua scripts into memory with `SCRIPT LOAD` to eliminate network overhead and execute with `EVALSHA`.

## The idea

Sending large Lua scripts over the network with `EVAL` repeatedly introduces significant network payload overhead. A 2 KB Lua script executed 5,000 times per second consumes 10 megabytes per second of network bandwidth just transferring the script source code.

Redis resolves this with internal **script caching**:
1. When Redis processes a Lua script, it computes its cryptographic SHA1 hash and caches the compiled bytecode in memory.
2. Clients can pre-load scripts using `SCRIPT LOAD`, receiving the 40-character SHA1 digest.
3. Subsequent invocations use `EVALSHA <sha1>`, transmitting only the 40-character hash.

| Command | Arguments | Behavior |
|---|---|---|
| `SCRIPT LOAD script` | Full Lua script string | Compiles script, caches bytecode, returns 40-char SHA1 hash |
| `EVALSHA sha1 numkeys keys... args...` | SHA1 hash and arguments | Executes cached script; returns `NOSCRIPT` if missing |
| `SCRIPT EXISTS sha1 [sha1 ...]` | One or more SHA1 hashes | Returns array of `1`s or `0`s indicating cache presence |
| `SCRIPT FLUSH [ASYNC\|SYNC]` | Optional sync flag | Clears all cached Lua scripts from server memory |

> **Tip:** If `EVALSHA` returns a `NOSCRIPT No matching script` error, application clients should automatically fall back to calling `EVAL` once to re-seed the cache.

## See it

Pre-loading a script and executing it via `EVALSHA` in `redis-cli`:

```bash
# 1. Pre-load a Lua script into the Redis script cache
SCRIPT LOAD "return redis.call('INCRBY', KEYS[1], ARGV[1])"
# Returns: "3235b2a0c64a50d2bbd72d24294b4cf4d6bb0bb8" (SHA1 Digest)

# 2. Check if the script exists in the cache
SCRIPT EXISTS 3235b2a0c64a50d2bbd72d24294b4cf4d6bb0bb8
# Returns:
# 1) (integer) 1

# 3. Execute the cached script using its SHA1 hash
EVALSHA 3235b2a0c64a50d2bbd72d24294b4cf4d6bb0bb8 1 counter:hits 5
# Returns: (integer) 5

# Execute again instantly
EVALSHA 3235b2a0c64a50d2bbd72d24294b4cf4d6bb0bb8 1 counter:hits 10
# Returns: (integer) 15
```

Only the 40-byte digest was transmitted, reducing network transfer by over 95%.

## Go deeper

What happens if a Lua script enters an infinite loop?
Redis includes a safety mechanism governed by `lua-time-limit` in `redis.conf` (default: 5000ms / 5 seconds):
- While a script runs, the server blocks all other commands.
- If execution exceeds `lua-time-limit`, Redis begins responding to incoming requests with a `-BUSY Redis is busy running a script` error.
- Administrators can issue `SCRIPT KILL` to terminate read-only scripts, or `SHUTDOWN NOSAVE` if the script has already issued writes.

## Watch out

- Script caches are not persistent across server restarts; client SDKs must handle `NOSCRIPT` errors gracefully by re-uploading the script.
- Do not generate dynamic Lua scripts containing variable values concatenated into the script body; this pollutes the script cache with infinite SHA1 entries.

## Remember

- `SCRIPT LOAD` compiles and caches Lua bytecode, returning a 40-character SHA1 hash.
- `EVALSHA` executes pre-loaded scripts without sending the source code over the wire.
- Production client libraries automatically handle `NOSCRIPT` cache misses transparently.
