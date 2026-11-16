---
slug: redis-functions-architecture
title: "Redis Functions: Managed Server-Side Modules with FUNCTION LOAD"
topic: transactions-and-scripting
kind: api
summary: Manage, version, and persist server-side logic using Redis Functions and the FUNCTION LOAD API introduced in Redis 7.
tags:
  - functions
  - function-load
  - fcall
  - redis-7
  - redis-8
related:
  - lua-scripting-basics-eval
  - atomicity-and-script-caching
  - keys-vs-argv-in-scripts
---
> **In one line:** Redis Functions treat server-side logic as first-class, persisted database software modules executed via `FCALL`.

## The idea

While Lua scripts with `EVALSHA` are powerful, they suffer from operational shortcomings: scripts are not persisted across server restarts, they are not saved in RDB snapshots, and application code must manage SHA1 hash mappings across multiple deployment environments.

Introduced in Redis 7.0 and enhanced in Redis 8, **Redis Functions** elevate server-side logic to first-class database artifacts. Functions are organized into named **libraries**, persisted directly to RDB snapshots, replicated to secondary replicas, and invoked using human-readable names via `FCALL`.

| Feature | Legacy Lua Scripts (`EVALSHA`) | Modern Redis Functions (`FCALL`) |
|---|---|---|
| **Storage & Persistence** | Ephemeral cache (lost on restart) | **Persisted in RDB & AOF logs** |
| **Replication** | Replicated as raw commands | **Libraries replicated automatically to all replicas** |
| **Naming Scheme** | Cryptographic SHA1 hash (`3235b2...`) | **Human-readable library and function names** |
| **Organization** | Standalone uncoordinated scripts | **Modular libraries with exported functions** |

> **Tip:** Redis Functions treat database logic like stored procedures, eliminating client-side SHA1 synchronization bugs.

## See it

Loading a library and invoking a Redis Function in `redis-cli`:

```bash
# 1. Define and load a function library named "math_utils"
# The shebang line specifies the Lua engine version: #!lua name=math_utils
FUNCTION LOAD "#!lua name=math_utils
redis.register_function('add_and_cap', function(keys, args)
    local val = redis.call('INCRBY', keys[1], args[1])
    local max = tonumber(args[2])
    if val > max then
        redis.call('SET', keys[1], max)
        return max
    end
    return val
end)"
# Returns: "math_utils"

# 2. Invoke the function using its human-readable name via FCALL
# Arguments: function_name, numkeys, key, increment, max_cap
FCALL add_and_cap 1 player:score 50 100
# Returns: (integer) 50

# Invoke again with increment exceeding the cap:
FCALL add_and_cap 1 player:score 80 100
# Returns: (integer) 100 (Capped at maximum!)
```

Notice that `FCALL` references the human-readable function name `add_and_cap` rather than an opaque SHA1 hash.

## Go deeper

Administrative management commands for Redis Functions include:
- `FUNCTION LIST`: Displays all registered libraries, descriptions, and exported functions.
- `FUNCTION DELETE <library-name>`: Removes an entire library from the database.
- `FUNCTION DUMP` and `FUNCTION RESTORE`: Serializes libraries for backup and cross-cluster migration.

Because functions are stored in the database payload itself, restoring an RDB snapshot on a fresh server automatically restores all registered function libraries.

## Watch out

- You cannot register two libraries with the same library name; use `FUNCTION LOAD REPLACE` to update code.
- Functions execute under the same single-threaded atomicity rules as `EVAL`; avoid long-running loops.

## Remember

- Redis Functions are first-class, named, persisted server-side stored procedures.
- Functions are saved in RDB snapshots and replicated automatically across replicas.
- Invoked via human-readable function names using `FCALL`.
