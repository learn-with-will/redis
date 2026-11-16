---
slug: keys-vs-argv-in-scripts
title: "Passing Parameters: KEYS versus ARGV in Lua Scripts"
topic: transactions-and-scripting
kind: pitfall
summary: Always pass key names through the KEYS table and scalar data through ARGV to ensure Redis Cluster compatibility.
tags:
  - lua
  - keys
  - argv
  - redis-cluster
  - pitfall
related:
  - lua-scripting-basics-eval
  - atomicity-and-script-caching
  - redis-cluster-sharding-hash-slots
---
> **In one line:** Always pass key names into Lua via the `KEYS` array and literal values via `ARGV` to support clustering and proxy routing.

## The idea

When invoking `EVAL` or `EVALSHA`, the command syntax explicitly requires specifying the count of keys, followed by key names, followed by arbitrary argument parameters:
```text
EVAL script numkeys key1 key2 ... arg1 arg2 ...
```

Inside the Lua script, these parameters are populated into two 1-indexed tables:
1. **`KEYS` Table:** Must contain **every single Redis key name** that the script will read or write.
2. **`ARGV` Table:** Contains scalar parameter values, thresholds, strings, and numbers that are not key names.

| Parameter Array | Purpose | Lua Access (1-indexed) | Example Values |
|---|---|---|---|
| **`KEYS`** | Database key names accessed by script | `KEYS[1]`, `KEYS[2]` | `user:1001`, `rate_limit:ip` |
| **`ARGV`** | Scalar arguments, numbers, strings | `ARGV[1]`, `ARGV[2]` | `60` (seconds), `"active"` |

> **Watch out:** Hardcoding key names as string literals inside Lua scripts (`redis.call('GET', 'my_key')`) breaks Redis Cluster, transparent proxies, and automated analysis tools.

## See it

Correct parameter separation versus dangerous hardcoded anti-patterns:

```bash
# WRONG (Anti-Pattern): Hardcodes key name inside script body
# EVAL "return redis.call('SET', 'app:counter', ARGV[1])" 0 42

# CORRECT: Passes key name via KEYS array and value via ARGV array
EVAL "
  local key = KEYS[1]
  local val = ARGV[1]
  local ttl = ARGV[2]
  redis.call('SET', key, val, 'EX', ttl)
  return 'SUCCESS'
" 1 app:counter 42 3600
# Returns: "SUCCESS"

# Query the key to verify correct execution
GET app:counter
# Returns: "42"

TTL app:counter
# Returns: ~3600
```

Notice the `1` following the script body: it informs Redis that exactly 1 key argument (`app:counter`) follows, with all subsequent parameters mapped to `ARGV`.

## Go deeper

Why does Redis enforce this separation?
In **Redis Cluster**, data is partitioned across multiple primary nodes by hash slots. Before executing a script, cluster proxies and client drivers inspect the keys listed in the command signature. 

If all keys in the `KEYS` array hash to the same cluster node, the request succeeds. If keys are hardcoded inside the script, Redis Cluster cannot determine which node owns the data before executing, leading to cross-slot corruption errors. Furthermore, enterprise proxy layers rely on declared keys to route requests directly to the correct shard.

## Watch out

- Remember that Lua arrays are **1-indexed**; `KEYS[1]` is the first key, not `KEYS[0]`.
- Forgetting to update `numkeys` when adding parameters causes arguments to be misread as keys.

## Remember

- Pass all Redis key names explicitly via the `KEYS` array.
- Pass parameters, numbers, and values via the `ARGV` array.
- Proper key separation is mandatory for Redis Cluster routing and proxy compatibility.
