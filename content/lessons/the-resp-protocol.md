---
slug: the-resp-protocol
title: The RESP Request and Response Protocol
topic: fundamentals
kind: concept
summary: RESP is the human-readable, binary-safe wire protocol that enables ultra-fast parsing between clients and Redis.
tags:
  - protocol
  - resp
  - networking
  - internals
related:
  - connecting-with-redis-cli
  - what-is-redis
  - single-threaded-execution
---
> **In one line:** RESP is the human-readable, binary-safe serialization protocol governing all network communication between Redis and clients.

## The idea

Redis clients communicate with the server over TCP using **RESP** (REdis Serialization Protocol). RESP was engineered specifically for high parsing performance, minimal CPU serialization overhead, and human readability when debugging via raw TCP connections.

RESP is a **binary-safe** protocol: payloads carry explicit length prefixes, meaning values can include arbitrary binary content—such as raw byte buffers, compressed gzip archives, or image data—without requiring escape sequences.

| Protocol Type | First Byte Prefix | Example Wire Format | Meaning / Usage |
|---|---|---|---|
| **Simple String** | `+` | `+OK
` | Success status messages (not binary safe) |
| **Simple Error** | `-` | `-ERR unknown command
` | Error reply with error code and description |
| **Integer** | `:` | `:42
` | Signed 64-bit integer response |
| **Bulk String** | `$` | `$5
hello
` | Binary-safe string with length prefix |
| **Array** | `*` | `*2
$3
GET
$4
user
` | List of other RESP elements |

> **Note:** Redis 6 introduced **RESP3**, adding rich first-class data types (Maps, Sets, Doubles, Booleans) to avoid client-side deserialization guesswork.

## See it

Inspect how a simple `PING` command and its response look at the raw TCP socket level:

```text
# Client sends: PING (Array of 1 Bulk String)
*1
$4
PING

# Server replies with Simple String:
+PONG

# Client sends: SET key val (Array of 3 Bulk Strings)
*3
$3
SET
$3
key
$3
val

# Server replies:
+OK
```

Because the length of each string precedes its bytes (`$4
PING`), client parsers allocate memory upfront and read exact byte counts, making parsing fast and zero-copy capable.

## Go deeper

RESP utilizes CRLF (`
`) as the standard line delimiter. Bulk strings use `$-1
` to represent `nil` (null) values when querying non-existent keys. Because every Redis command is sent as a RESP array of bulk strings, client libraries can be implemented in a few hundred lines of code in any language.

In RESP3, the protocol was expanded to include data structures like maps (`%`), sets (`~`), and attributes (`|`), enabling clients to receive structured native types without relying on string serialization.

## Watch out

- Manually writing socket parsers without handling `
` boundary checks can introduce buffer overflow vulnerabilities.
- Forgetting that `-ERR` responses return success at the network layer can lead to unhandled application errors.

## Remember

- RESP is the binary-safe, length-prefixed wire protocol utilized by all Redis clients.
- First bytes designate types: `+` simple string, `-` error, `:` integer, `$` bulk string, and `*` array.
- RESP's explicit byte counting enables zero-copy parsing and eliminates escape sequence overhead.
