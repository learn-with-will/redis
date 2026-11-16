---
slug: transactions-multi-and-exec
title: Atomic Command Bundling with MULTI and EXEC
topic: transactions-and-scripting
kind: concept
summary: Bundle multiple Redis commands into a sequential, isolated atomic execution block with MULTI and EXEC.
tags:
  - transactions
  - multi
  - exec
  - atomicity
related:
  - no-rollback-in-redis-transactions
  - optimistic-locking-with-watch
  - discard-and-transaction-lifecycle
---
> **In one line:** `MULTI` and `EXEC` queue multiple commands and run them sequentially without any other client interleaving.

## The idea

While every individual Redis command is atomic, application workflows often require executing multiple commands together as an isolated unit—such as debiting account A and crediting account B during a funds transfer.

Redis transactions are initiated with `MULTI` and finalized with `EXEC`. Once `MULTI` is issued, the connection stops executing commands immediately and queues them on the server. When `EXEC` arrives, Redis executes the entire sequence to completion without allowing commands from any other client to interleave.

| Transaction Stage | Command | Behavior | Return Value |
|---|---|---|---|
| **Open Transaction** | `MULTI` | Enters transaction queuing mode | `+OK` |
| **Queue Commands** | Any valid command (e.g. `SET`, `INCR`) | Queued on server; not executed yet | `+QUEUED` |
| **Commit Transaction** | `EXEC` | Executes all queued commands sequentially | Array of individual command replies |
| **Abort Transaction** | `DISCARD` | Flushes queue; exits transaction mode | `+OK` |

> **Note:** Isolation is absolute: while `EXEC` runs, no other client command can execute on the server, guaranteeing that other connections never observe intermediate states.

## See it

Executing an atomic transfer between two bank balances in `redis-cli`:

```bash
# Seed initial balances
SET account:101:balance 500
SET account:102:balance 200

# Begin transaction
MULTI
# OK

# Queue operations
DECRBY account:101:balance 100
# QUEUED
INCRBY account:102:balance 100
# QUEUED

# Execute transaction atomically
EXEC
# 1) (integer) 400
# 2) (integer) 300

# Verify final account balances
MGET account:101:balance account:102:balance
# "400", "300"
```

The response to `EXEC` is an array containing the return value of each individual command in matching execution order.

## Go deeper

Queued commands are stored in a lightweight in-memory array on the server dedicated to that client's connection state.

If a command has a syntax error detected during queuing (e.g., wrong number of arguments for `SET`), Redis marks the transaction as corrupted. Calling `EXEC` on a corrupted transaction automatically aborts all commands, returning an `EXECABORT Transaction discarded` error.

## Watch out

- You cannot read the output of a queued command to make decisions within the same transaction; use Lua scripts for conditional branching.
- Queuing thousands of memory-heavy commands inside a single `MULTI` block increases server memory and blocks the event loop during `EXEC`.

## Remember

- `MULTI` queues commands on the server; `EXEC` runs them all sequentially.
- No other client commands can interleave during the execution of `EXEC`.
- Syntax errors detected during queuing abort the entire transaction automatically.
