---
id: lesson-14
slug: persistence-rdb-and-aof
title: "Persistence: RDB and AOF"
level: intermediate
order: 14
duration: 24
tags:
  - persistence
  - rdb
  - aof
  - durability
  - backups
summary: "How Redis survives restarts: RDB point-in-time snapshots versus the AOF append-only command log, the appendfsync durability trade-offs, using both together, and what 'in-memory' really means for your data."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain **RDB** snapshots (`SAVE` vs `BGSAVE`) and their trade-offs.
- Explain the **AOF** (append-only file) and the three `appendfsync` policies.
- Compare RDB and AOF and describe using **both** together.
- Reason honestly about **durability**: what you can lose, and when.

# Why It Matters

Redis keeps data in memory, but "in memory" doesn't have to mean "gone on restart." Redis can write
data to disk so it reloads after a crash or reboot. *How* it does that — and how much recent data
you might lose — is a deliberate configuration choice with real performance consequences. Picking
the wrong one means either surprise data loss or surprise slowdowns, so this is essential
production knowledge.

# Concept Explanation

### RDB: point-in-time snapshots

**RDB** persistence writes a **snapshot** of the entire dataset to a single compact file (`dump.rdb`)
at points in time.

- `SAVE` — snapshot **synchronously**, blocking the server until it's done (rarely used; it freezes
  everything).
- `BGSAVE` — snapshot **in the background**: Redis **forks** a child process that writes the file
  while the main process keeps serving clients.
- The `save` config triggers automatic `BGSAVE`s by activity, e.g. `save 3600 1` = "snapshot if at
  least 1 key changed in 3600 seconds," and you can list several such rules.

RDB's strengths: the file is **compact**, **restarts are fast** (load one file), and it's ideal for
**backups** (copy the `.rdb` file). Its weakness is the flip side of "point-in-time": if Redis
crashes between snapshots, **everything since the last snapshot is lost** — which could be minutes
of writes.

### AOF: the append-only command log

**AOF** persistence logs **every write command** the server executes to an append-only file. On
restart, Redis **replays** the log to rebuild the exact dataset. The durability knob is
`appendfsync`, which controls how often the log is flushed to disk with `fsync`:

| `appendfsync` | Behavior | Data at risk on crash | Speed |
| ------------- | -------- | --------------------- | ----- |
| `always` | fsync on every write | ~nothing | Slowest |
| `everysec` (default) | fsync about once per second | Up to ~1 second | Fast |
| `no` | let the OS flush when it likes | Seconds to more | Fastest |

Because the log only grows, Redis periodically **rewrites** it into the smallest set of commands
that recreate the current data (`BGREWRITEAOF`, also done automatically). This keeps the AOF from
ballooning. AOF generally gives **better durability** than RDB, at the cost of **larger files** and
**slower restarts** (it replays commands rather than loading a snapshot).

> Modern Redis (7.0+) stores the AOF as **multiple files** — a base file plus incremental files
> and a manifest, kept in an `appendonlydir`. You mostly don't manage these by hand; just know the
> AOF isn't a single file anymore.

### Using both — and the honest durability picture

RDB and AOF aren't mutually exclusive: you can enable **both**. When AOF is enabled, Redis uses it
to restore on startup (it's the more complete record). A common modern setup combines them — the AOF
can even begin with an RDB-format preamble for fast loading followed by recent commands.

Now the honest summary of "in-memory, optionally durable":

- **No persistence** — pure cache; a restart loses everything (fine if Redis is only a cache).
- **RDB only** — you can lose everything since the last snapshot (minutes).
- **AOF `everysec`** — you can lose about the last second (the common, balanced default).
- **AOF `always`** — near-zero loss, but every write waits on disk (slowest).

There's no free lunch: more durability costs latency. Choose based on whether the data is
reconstructable (a cache) or precious (a source of truth).

### A note on forking and memory

`BGSAVE` and `BGREWRITEAOF` work by **forking** a child process that shares the parent's memory via
copy-on-write. If the dataset is large and lots of writes happen *during* the save, the OS must copy
those changed pages, temporarily increasing memory use. It's usually fine, but on a memory-tight box
a save can cause a spike — worth knowing when you size RAM.

# Key Terminology

- **RDB** — point-in-time snapshot persistence (`dump.rdb`); `SAVE` (blocking) / `BGSAVE`
  (background fork).
- **AOF** — append-only log of write commands, replayed on restart.
- **`appendfsync`** — how often the AOF is flushed to disk: `always`, `everysec` (default), or `no`.
- **AOF rewrite** — compacting the log into the minimal commands that recreate current data
  (`BGREWRITEAOF`).
- **Durability** — how little recent data you'd lose on a crash.

# Options and Trade-offs

| Option | Data loss on crash | Restart speed | File size | Best for |
| ------ | ------------------ | ------------- | --------- | -------- |
| **No persistence** | Everything | Instant (empty) | None | Pure cache; data is rebuildable |
| **RDB** | Since last snapshot (minutes) | Fast | Compact | Backups, fast restart, some loss OK |
| **AOF `everysec`** | ~1 second | Slower (replay) | Larger | Balanced durability (common default) |
| **AOF `always`** | ~None | Slower | Larger | Maximum durability, latency-tolerant |
| **RDB + AOF** | ~AOF's window | AOF-based | Both files | Fast backups *and* good durability |

# Worked Example

Trigger a snapshot, check when it last succeeded, and inspect persistence status via `INFO`:

```text
127.0.0.1:6379> BGSAVE
Background saving started
127.0.0.1:6379> INFO persistence
# Persistence
loading:0
rdb_changes_since_last_save:0
rdb_bgsave_in_progress:0
rdb_last_bgsave_status:ok
aof_enabled:0
127.0.0.1:6379> CONFIG GET save
1) "save"
2) "3600 1 300 100 60 10000"
```

`BGSAVE` forks a background save; `INFO persistence` confirms the last snapshot succeeded
(`rdb_last_bgsave_status:ok`) and that AOF is off here; `CONFIG GET save` shows the automatic
snapshot rules (snapshot after 1 change in 3600s, 100 in 300s, or 10000 in 60s).

# Real World Analogy

RDB is like **saving your document every so often**: quick, small files, but if the app crashes you
lose everything typed since the last save. AOF is like an editor that **records every keystroke** as
you go: you can reconstruct the document down to the last second (or every keystroke, if you flush
constantly), but the recording is bulkier and replaying it takes longer than opening a saved file.
Many people do both — periodic saves *and* a keystroke log.

# Examples

## Example 1 — Basic: Redis as a pure cache

The data in Redis is entirely reconstructable from a database, so persistence is disabled. Restarts
start empty and warm up again. Simplest and fastest — losing the cache costs only a brief slowdown.

**Why this works:** when nothing in Redis is a source of truth, durability buys you nothing worth the
cost.

## Example 2 — Real-world: session store that shouldn't drop on reboot

User sessions live in Redis and shouldn't all vanish on a restart, but losing the last second is
acceptable. AOF with `everysec` gives near-current durability with good performance, so a planned
reboot doesn't log everyone out.

**Why this works:** `everysec` balances durability and speed — exactly the trade-off a session store
wants.

## Example 3 — Trade-off / pitfall: assuming "it's on disk, so it's safe"

A team enables RDB with a `save 900 1` rule and treats Redis as durable. A crash 14 minutes after the
last snapshot loses 14 minutes of writes — a nasty surprise they assumed couldn't happen.

**Why this bites:** RDB is point-in-time; between snapshots, recent writes are only in memory. If that
loss window is unacceptable, use AOF (and know its `appendfsync` setting).

# Common Mistakes

- **Believing persistence means zero loss.** Every option has a loss window except AOF `always` — know
  yours.
- **Running `SAVE` on a live server.** It blocks everything; use `BGSAVE`.
- **Enabling AOF but never checking `appendfsync`.** `everysec` risks ~1s; `no` can risk much more.
- **Sizing RAM with no headroom for saves.** A `BGSAVE`/rewrite under heavy writes can spike memory
  via copy-on-write.

# Best Practices

- Decide the acceptable **loss window** first, then pick RDB, AOF (`everysec`/`always`), or both.
- Use **RDB snapshots for backups** (copy the file) and **AOF for tighter durability** — many setups
  run both.
- Prefer **`BGSAVE`** over `SAVE`; let automatic `save` rules and AOF rewrites run in the background.
- Leave **memory headroom** so background saves don't cause pressure.
- Verify persistence health via `INFO persistence` (last save status, AOF state).

# Summary

- **RDB** = compact **point-in-time snapshots** (`BGSAVE` forks a background save); fast restart and
  great for backups, but you lose everything since the last snapshot on a crash.
- **AOF** = an **append-only log** of writes replayed on restart; durability set by `appendfsync`
  (`always` ≈ no loss/slowest, **`everysec`** ≈ ~1s/default, `no` = OS-decides/fastest), compacted by
  rewrites.
- You can run **both**; AOF is used to restore when enabled.
- "In-memory" means durability is a **spectrum you choose**: cache (none) → RDB → AOF `everysec` →
  AOF `always`, trading data-loss risk against performance.

# Flash Cards

Q: What does RDB persistence produce, and what's its main risk?
A: A compact point-in-time snapshot file; the risk is losing all writes made since the last snapshot if Redis crashes.

Q: What's the difference between SAVE and BGSAVE?
A: SAVE snapshots synchronously and blocks the server; BGSAVE forks a child process to snapshot in the background while Redis keeps serving.

Q: What are the three appendfsync policies and their data-loss windows?
A: always (fsync per write, ~no loss, slowest), everysec (fsync ~1/sec, up to ~1s loss, the default), and no (OS decides, larger risk, fastest).

Q: Why does the AOF get rewritten periodically?
A: Because it only grows as commands are appended; a rewrite compacts it into the minimal set of commands that recreate the current data.

Q: If both RDB and AOF are enabled, which is used to restore on startup?
A: The AOF, because it's the more complete, up-to-date record.

Q: Is any persistence option truly zero-loss?
A: Only AOF with appendfsync always is effectively zero-loss — and it's the slowest, since every write waits on disk.

# Exercises

### Easy
Run `BGSAVE`, then `INFO persistence` and find `rdb_last_bgsave_status`. Run `CONFIG GET save` and
describe in words what the current snapshot rules mean.

### Medium
Enable AOF at runtime with `CONFIG SET appendonly yes`, then `CONFIG GET appendfsync`. Explain how
much data you could lose on a crash with the current setting, and what changing it to `always` would
cost.

### Challenging
For three scenarios — (a) a pure cache, (b) a shopping-cart store where losing a few seconds is bad,
(c) a leaderboard that can be recomputed nightly — choose a persistence strategy (none / RDB / AOF
everysec / AOF always / both) and justify each in one sentence based on the loss window and
performance.

# Further Reading

- Redis — *Persistence* (RDB, AOF, and combining them): <https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/>
- Redis — *BGSAVE* / *SAVE*: <https://redis.io/commands/bgsave/>
- Redis — *BGREWRITEAOF*: <https://redis.io/commands/bgrewriteaof/>
