---
slug: distributed-locking-tradeoffs
title: "Distributed Locking: Redlock Algorithm and Safety Caveats"
topic: caching-patterns
kind: pitfall
summary: Understand single-instance distributed locking, the multi-node Redlock algorithm, and expert safety caveats.
tags:
  - distributed-locking
  - redlock
  - mutex
  - concurrency
  - pitfall
related:
  - set-options-nx-xx-get
  - cache-stampede-and-mutex-locks
  - lua-scripting-basics-eval
---
> **In one line:** A correct single-instance lock uses `SET NX EX` with a unique token released via Lua, while multi-node Redlock has significant safety trade-offs.

## The idea

Distributed systems often require ensuring that only one worker at a time executes a critical task (e.g., generating monthly invoices or processing a payout).

The canonical single-instance Redis distributed lock requires two strict rules:
1. **Acquire Atomically with Unique Token:** `SET lock:resource <random_uuid> EX 30 NX`.
2. **Release Atomically via Lua:** Check that the token still matches before deleting, ensuring a slow worker whose lock timed out does not accidentally delete another worker's new lock.

| Locking Mechanism | Architecture | Failover Safety | Consensus Guarantees |
|---|---|---|---|
| **Single-Instance Lock** | Single Redis node | **Unsafe during failover** (replica may not have received lock) | Best for efficiency / deduplication |
| **Redlock Algorithm** | 5 independent Redis primaries | Tolerates minor node failures | High controversy among distributed systems researchers |
| **Zookeeper / etcd** | Raft / Paxos consensus | **Strongly Consistent** | Best for critical financial correctness |

> **Watch out:** Standard primary-replica replication is asynchronous; if a primary grants a lock and crashes before replicating to its replica, the new primary may grant the same lock to a second worker!

## See it

Acquiring and safely releasing a distributed lock in `redis-cli`:

```bash
# 1. Acquire lock: Resource "invoice_generator", Unique Token "uuid_987", TTL 30s
SET lock:invoice_generator "uuid_987" EX 30 NX
# Returns: OK (Lock acquired!)

# Worker performs work...

# 2. Release lock SAFELY using a Lua script:
# Only delete the lock if the value stored matches our unique UUID!
EVAL "
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  else
    return 0
  end
" 1 lock:invoice_generator "uuid_987"
# Returns: (integer) 1 (Lock released safely!)
```

If the task took 35 seconds and the lock expired, another worker may have acquired it with a different UUID. The Lua check prevents Worker 1 from deleting Worker 2's lock.

## Go deeper

**The Redlock Debate:**
To solve single-instance failover risks, creator antirez proposed **Redlock**: acquiring locks across 5 independent Redis nodes by majority vote ($N/2 + 1$).

However, distributed systems researcher Martin Kleppmann published a famous critique demonstrating that in asynchronous networks with unpredictable operating system GC pauses, process pauses, and NTP clock jumps, Redlock cannot guarantee mutual exclusion without fencing tokens. 
- Use Redis locking for **efficiency** (avoiding duplicate expensive work).
- Use `etcd`, `Consul`, or PostgreSQL advisory locks for **correctness** (financial transactions).

## Watch out

- Never release a lock with a simple `DEL lock:key`; you will delete other workers' locks after timeouts.
- Do not use Redis locks for tasks where duplicate execution causes irrecoverable financial corruption.

## Remember

- Acquire locks using `SET key uuid EX ttl NX` to bind timeouts atomically.
- Always release locks using an atomic Lua script verifying token ownership.
- Redis locks are designed for performance and efficiency, not strict distributed consensus.
