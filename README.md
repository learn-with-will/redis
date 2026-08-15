# Redis Learning Portal

A **frontend-only** Redis course: read Markdown lessons, take quizzes, and track your
progress — all in the browser. No sign-up, no backend.

## What this is

The portal shell is built with React 19, Vite, TypeScript, React Router, Tailwind CSS v4,
`marked`, and PrismJS. It renders a **24-lesson curriculum** that takes you from "what is
Redis?" through the core data types, on to messaging, persistence and caching patterns, and
finally to running Redis in production — replication, Sentinel, Cluster, security, and data
modeling. Every lesson is written in plain, welcoming English and verified against primary
sources (see **Sources** below).

Progress, bookmarks, and quiz scores live in `localStorage` under `redis-learning-*` keys,
so nothing leaves your machine.

## Run it locally

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## How the content works

The app is **data-driven** — adding a lesson needs no code changes:

1. Write the lesson Markdown in `public/content/<level>/<slug>.md` with YAML front-matter
   (including a `summary`).
2. Add a quiz at `public/quizzes/lesson-NN.json`.
3. Regenerate `public/content/course-manifest.json` from the front-matter (the manifest is
   generated, so it can't drift).

> **Code fences** must declare one of the highlighted languages: `bash`, `json`, `lua`,
> `yaml`, or `text` (redis-cli request/response transcripts, key diagrams, and `redis.conf`
> snippets use `text`; see `src/core/prism.ts`).

## Curriculum

**Beginner — fundamentals & core data types:** what is Redis? · getting started with
redis-cli · keys & strings · lists · hashes · sets · sorted sets · expiration & key lifetime.

**Intermediate — more types, messaging, atomicity & durability:** bitmaps & HyperLogLog ·
Publish/Subscribe · Streams · transactions · Lua scripting & Functions · persistence
(RDB & AOF) · memory & eviction · caching patterns.

**Advanced — production Redis:** pipelining & performance · replication · high availability
with Sentinel · Redis Cluster · security & ACLs · observability & operations · the Redis 8
data & query engine · data modeling & capstone.

## Accuracy: no hallucination

Every command, option, default, and behavior is verified against primary sources. The
per-lesson authoring contract lives in `prompts/redis-authoring-prompt.md`, and the
phase-by-phase overview in `prompts/redis-study-pathway.md`.

**Sources:**

- **Redis documentation** — <https://redis.io/docs/latest/> — the primary anchor for how
  Redis works (data types, persistence, replication, Cluster, eviction, security).
- **Redis command reference** — <https://redis.io/commands/> — the source of truth for every
  command's syntax, options, return value, and time complexity.
- **RESP protocol specification** —
  <https://redis.io/docs/latest/develop/reference/protocol-spec/>.
- **Redis source & release notes** — <https://github.com/redis/redis> — for
  version-specific features (Redis 8 Vector Sets, the bundled Query Engine).
- **Redis licensing** — <https://redis.io/legal/licenses/> and the AGPLv3 announcement —
  and **Valkey** — <https://valkey.io> — for the licensing/fork history.

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with
`BASE_PATH=/<repo>/` and publishes `dist/` to GitHub Pages.

---

React 19 · Vite · TypeScript · React Router · Tailwind CSS v4 · marked · PrismJS ·
localStorage.
