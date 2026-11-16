---
slug: lua-scripting-basics-eval
title: Executing Server-Side Logic with EVAL and EVALSHA
topic: transactions-and-scripting
kind: technique
summary: Run custom procedural business logic atomically directly on the Redis server using Lua scripts with EVAL and EVALSHA.
tags:
  - lua
  - eval
  - evalsha
  - scripting
related:
  - keys-vs-argv-in-scripts
  - atomicity-and-script-caching
  - redis-functions-architecture
---
> **In one line:** Execute complex multi-step logic atomically directly inside Redis using embedded Lua scripts with `EVAL` and `EVALSHA`.

## The idea

While `MULTI`/`EXEC` groups commands, it cannot branch conditionally based on intermediate data (e.g., "if key A > 10, decrement key A, else set key B"). In standard application code, this requires multiple round-trips prone to race conditions.

Redis embeds a complete **Lua 5.1 runtime engine**. With the `EVAL` command, you send procedural Lua code directly to Redis. Redis executes the script **atomically on the server**: no other command or script can run while the script executes.

| Scripting Command | Arguments | Mechanism | Best For |
|---|---|---|---|
| `EVAL script numkeys [key ...] [arg ...]` | Full Lua code string | Transmits and parses full script code on every invocation | One-off scripts and testing |
| `EVALSHA sha1 numkeys [key ...] [arg ...]` | 40-character SHA1 hash | Executes pre-cached script bytecode by hash | **Production applications** (minimizes bandwidth) |
| `SCRIPT LOAD script` | Full Lua code string | Compiles and caches script, returning its SHA1 hash | Pre-warming production script caches |

> **Tip:** Inside Lua scripts, invoke Redis commands using `redis.call()` to execute operations and inspect return values in real time.

## See it

Executing an atomic conditional bank balance deduction script in Lua:

```bash
# Setup user balance
SET user:1001:balance 100

# Run Lua script: Check balance; deduct if sufficient, otherwise return error string
# Arguments: 1 key (user:1001:balance) and 1 argument (amount to deduct: 40)
EVAL "
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  local amount = tonumber(ARGV[1])
  if current >= amount then
    redis.call('DECRBY', KEYS[1], amount)
    return current - amount
  else
    return -1
  end
" 1 user:1001:balance 40
# Returns: (integer) 60 (Deduction succeeded!)

# Verify updated balance
GET user:1001:balance
# Returns: "60"
```

Notice that the read, the comparison, and the decrement executed in a single atomic microsecond step without client-side race conditions.

## Go deeper

`redis.call()` versus `redis.pcall()`:
- `redis.call()`: Throws a Lua error if the Redis command fails (e.g., `WRONGTYPE`), aborting the script and returning the error to the client.
- `redis.pcall()`: Traps the error and returns a Lua table with an `err` field, allowing your script to handle failures and continue running.

Scripts execute with strict deterministic constraints: random number generators (`math.random`) and system clock queries are managed to ensure replication logs remain identical across secondary replicas.

## Watch out

- Long-running Lua scripts block the entire Redis server until they complete; keep scripts focused and fast (< 5ms).
- Always pass key names via `KEYS` array rather than hardcoding string names in Lua code to ensure cluster compatibility.

## Remember

- Lua scripts execute atomically directly on the Redis server without interleaving.
- Use `redis.call()` inside Lua to read and write Redis keys conditionally.
- Use `EVALSHA` with pre-loaded script hashes in production to eliminate code transfer bandwidth.
