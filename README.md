# Redis Learn

The content of the Redis course at <https://learn-with-will.github.io/redis/>: 110 short lessons ("bites") in 12 topics, each teaching one idea in 3–5 minutes, plus a bank of 163 quiz questions. It covers fundamentals (in-memory execution, RESP protocol, redis-cli), keys & strings (binary safety, atomic counters, multi-key queries), lists & hashes (listpacks, queues, field CRUD), sets & sorted sets (uniqueness, leaderboards, lexicographical ranges), expiration & memory (TTLs, LRU/LFU eviction, memory diagnostics), advanced data structures (Bitmaps, HyperLogLog, Bloom filters, JSON, vector similarity search), messaging & streams (Pub/Sub, append-only streams, consumer groups), transactions & scripting (MULTI/EXEC, WATCH, atomic Lua scripts, Redis functions), persistence & durability (RDB snapshots, AOF, fsync policies, copy-on-write fork), caching patterns (cache-aside, stampede protection, client-side caching), scaling & clustering (asynchronous replication, Sentinel failover, 16384 hash slots, cluster bus), and security & operations (ACLs, TLS encryption, slowlog latency profiling, data modeling).

This repository holds **content only**. The site itself (lesson reader, quizzes, progress, optional sign-in) is the shared [course shell](https://github.com/learn-with-will/course-shell), which every course uses.

```text
course.json              name, brand colours, home page copy, code languages
content/topics.json      the 12 topics
content/lessons/*.md     one bite per file
content/legacy.json      old long-lesson URLs → the bites that replaced them
quiz/questions.json      the question bank
```

## Working on the course

Clone the shell next to this folder, then run its commands with this folder as the argument:

```bash
git clone https://github.com/learn-with-will/course-shell.git ../course-shell
cd ../course-shell
npm ci
npm run dev -- ../redis                 # live preview at http://localhost:4200
npm run validate -- ../redis --strict   # the check the deploy runs
```

Node 22.18 or later is required.

## Adding a lesson

1. Create `content/lessons/<slug>.md` with front-matter (`slug`, `title`, `topic`, `kind`, `summary`, `tags`, `related`) and the standard sections.
2. Add questions for it to `quiz/questions.json` with `"topic"` and `"lesson"`.
3. Run `npm run validate -- ../redis --strict` from the shell folder.

The rules (length limits, which visual fits which kind of information, the diagram syntax) are in the shell's [CONTENT_GUIDE.md](https://github.com/learn-with-will/course-shell/blob/main/CONTENT_GUIDE.md).

## Accuracy

Facts and commands are synthesized from official Redis documentation, the Redis Open Source Specification, Redis 8 release notes, and real-world high-throughput production operations.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which calls the shell's reusable workflow: it validates this course in strict mode, builds it with the latest shell and publishes it to GitHub Pages. To pick up a shell change without a content change, run the workflow by hand from the Actions tab.
