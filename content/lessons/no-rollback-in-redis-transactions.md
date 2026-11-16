---
slug: no-rollback-in-redis-transactions
title: Why Redis Transactions Do Not Roll Back on Errors
topic: transactions-and-scripting
kind: pitfall
summary: Redis transactions do NOT support relational rollback; runtime command failures do not undo other queued operations.
tags:
  - transactions
  - rollback
  - acid
  - pitfall
related:
  - transactions-multi-and-exec
  - optimistic-locking-with-watch
  - lua-scripting-basics-eval
---
> **In one line:** Redis transactions do not roll back on runtime errors: if command 2 fails, command 3 still executes.

## The idea

Developers accustomed to relational databases (PostgreSQL, MySQL, Oracle) often assume that `MULTI`/`EXEC` provides full ACID rollback capabilities. In SQL, if a constraint fails during a transaction, the engine performs a complete `ROLLBACK`, restoring all tables to their pre-transaction state.

**Redis transactions do NOT roll back on runtime errors.** If a command in a queued transaction fails at execution time (for example, attempting to `INCR` a key holding a Set), Redis records the error for that specific command and **continues executing every subsequent command in the queue**.

| Failure Category | When Detected | Redis Behavior | Rollback Occurs? |
|---|---|---|---|
| **Command Syntax Error** | At queuing time (`SET` with 0 args) | Rejects command, flags transaction as corrupted; `EXEC` aborts | **Yes** (nothing runs) |
| **Data Type Runtime Error** | At execution time (`INCR` on a Set) | Errors on that command, executes remaining commands | **NO ROLLBACK** |
| **System Crash / Outage** | During execution (AOF enabled) | Incomplete log detected on restart; repair with `redis-check-aof` | Truncated to valid state |

> **Watch out:** Never assume that an error inside `EXEC` prevented subsequent commands from mutating data; your application must inspect each array element in the `EXEC` reply.

## See it

Demonstrating the absence of runtime rollback in `redis-cli`:

```bash
# Setup: Key A is an integer, Key B is a Set
SET account:savings 1000
SADD account:tags "personal"

# Begin transaction
MULTI

# Command 1: Valid debit
DECRBY account:savings 200
# Returns: QUEUED

# Command 2: Runtime TYPE ERROR! (INCR against a Set)
INCR account:tags
# Returns: QUEUED

# Command 3: Valid second debit
DECRBY account:savings 100
# Returns: QUEUED

# Commit the transaction
EXEC
# 1) (integer) 800
# 2) (error) WRONGTYPE Operation against key holding wrong kind of value
# 3) (integer) 700
```

Notice that despite Command 2 failing with a `WRONGTYPE` error, Command 3 executed successfully! The savings balance was reduced to 700.

## Go deeper

Why does Redis intentionally omit rollback?
Creator Salvatore Sanfilippo chose not to implement rollback for two deliberate engineering reasons:
1. **Simplicity and Speed:** Rollback requires maintaining complex undo logs and snapshotting old memory pages, significantly degrading in-memory execution throughput.
2. **Developer Bugs vs Hardware Errors:** Redis errors are almost exclusively programmatic type mismatches (e.g., treating a Hash as a String), which should be caught during testing rather than papered over by runtime rollbacks.

## Watch out

- Application code must iterate through the `EXEC` response array to check for individual command error strings.
- If you require strict atomic conditional rollback, use Lua scripts with explicit `redis.error_reply` calls.

## Remember

- Redis transactions do not support relational rollback on runtime errors.
- A runtime error on one command does not prevent remaining queued commands from running.
- Omission of rollback keeps the Redis core simple, predictable, and exceptionally fast.
