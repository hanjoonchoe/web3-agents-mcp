# Demo transcript

This is a real, captured transcript from running the built server (`node dist/server/index.js`)
against live Base mainnet RPC via an MCP stdio client — nothing here is fabricated. Each call
below targets the well-known "Genesis Agent" (Base, agent id `0`), except the last two calls,
which exercise the `search_agents` stub and an error path.

First, resolve the agent by id to get its identity, tokenUri, and best-effort
endpoints/capabilities.

```json
{
  "ok": true,
  "data": {
    "chainId": 8453,
    "agentId": "0",
    "owner": "0xa1DaEe3EB47f05f857aCA817523F9ff11d95bD71",
    "tokenUri": "data:application/json;base64,eyJ0eXBlIjoiaHR0cHM6Ly9laXBzLmV0aGVyZXVtLm9yZy9FSVBTL2VpcC04MDA0I3JlZ2lzdHJhdGlvbi12MSIsIm5hbWUiOiJHZW5lc2lzIEFnZW50IiwiZGVzY3JpcHRpb24iOiJUaGUgR2VuZXNpcyBBZ2VudCBvbiB0aGUgQmFzZSBNYWlubmV0IiwiaW1hZ2UiOiJodHRwczovL3JlZC1wYXN0LWJvbm9iby0yMzMubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZ5YmVpZ2p5YXR0MjN6Nm1xbXM2Y295ZTNzM3p2aWN3Nmh1enR6emc2a3h5YTVqZmN6cTJ6ZmRwNCIsInNlcnZpY2VzIjpbXSwieDQwMlN1cHBvcnQiOmZhbHNlLCJhY3RpdmUiOnRydWUsInN1cHBvcnRlZFRydXN0IjpbInJlcHV0YXRpb24iXSwicmVnaXN0cmF0aW9ucyI6W3siYWdlbnRJZCI6MCwiYWdlbnRSZWdpc3RyeSI6ImVpcDE1NTo4NDUzOjB4ODAwNEExNjlGQjRhMzMyNTEzNkVCMjlmQTBjZUI2RDJlNTM5YTQzMiJ9XX0=",
    "registrationFileUrl": "data:application/json;base64,eyJ0eXBlIjoiaHR0cHM6Ly9laXBzLmV0aGVyZXVtLm9yZy9FSVBTL2VpcC04MDA0I3JlZ2lzdHJhdGlvbi12MSIsIm5hbWUiOiJHZW5lc2lzIEFnZW50IiwiZGVzY3JpcHRpb24iOiJUaGUgR2VuZXNpcyBBZ2VudCBvbiB0aGUgQmFzZSBNYWlubmV0IiwiaW1hZ2UiOiJodHRwczovL3JlZC1wYXN0LWJvbm9iby0yMzMubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZ5YmVpZ2p5YXR0MjN6Nm1xbXM2Y295ZTNzM3p2aWN3Nmh1enR6emc2a3h5YTVqZmN6cTJ6ZmRwNCIsInNlcnZpY2VzIjpbXSwieDQwMlN1cHBvcnQiOmZhbHNlLCJhY3RpdmUiOnRydWUsInN1cHBvcnRlZFRydXN0IjpbInJlcHV0YXRpb24iXSwicmVnaXN0cmF0aW9ucyI6W3siYWdlbnRJZCI6MCwiYWdlbnRSZWdpc3RyeSI6ImVpcDE1NTo4NDUzOjB4ODAwNEExNjlGQjRhMzMyNTEzNkVCMjlmQTBjZUI2RDJlNTM5YTQzMiJ9XX0=",
    "endpoints": [],
    "capabilities": ["reputation"],
    "registeredAt": null
  }
}
```

Next, fetch and verify the agent's registration file directly. Its `tokenUri` is a `data:` URI,
so the content is embedded on-chain and `verified` is unconditionally `true`.

```json
{
  "ok": true,
  "data": {
    "verified": true,
    "hashComputed": "0x16d9b1e3454fb0346d41034c18206f7b2f94940da35eaed07bffc9c1e501e622",
    "source": "data",
    "fetchedAt": "2026-07-13T07:35:12.559Z",
    "content": {
      "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      "name": "Genesis Agent",
      "description": "The Genesis Agent on the Base Mainnet",
      "image": "https://red-past-bonobo-233.mypinata.cloud/ipfs/bafybeigjyatt23z6mqms6coye3s3zvicw6huztzzg6kxya5jfczq2zfdp4",
      "services": [],
      "x402Support": false,
      "active": true,
      "supportedTrust": ["reputation"],
      "registrations": [
        { "agentId": 0, "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }
      ]
    },
    "contentError": null
  }
}
```

Now pull its Reputation Registry summary (57 on-chain feedback entries) along with the first
five raw entries and the mandatory honesty caveat.

```json
{
  "ok": true,
  "data": {
    "summary": { "count": "57", "averageScore": 100, "lastFeedbackAt": null },
    "caveats": [
      "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal."
    ],
    "raw": [
      {
        "client": "0xED75EB4b7DF5878073Bd2C25A96dD80780CCeF55",
        "score": 100,
        "tag": "test",
        "uri": null,
        "timestamp": null
      },
      {
        "client": "0xED75EB4b7DF5878073Bd2C25A96dD80780CCeF55",
        "score": 100,
        "tag": "test",
        "uri": null,
        "timestamp": null
      },
      {
        "client": "0xED75EB4b7DF5878073Bd2C25A96dD80780CCeF55",
        "score": 100,
        "tag": "test",
        "uri": null,
        "timestamp": null
      },
      {
        "client": "0xED75EB4b7DF5878073Bd2C25A96dD80780CCeF55",
        "score": 100,
        "tag": "test",
        "uri": null,
        "timestamp": null
      },
      {
        "client": "0xED75EB4b7DF5878073Bd2C25A96dD80780CCeF55",
        "score": 100,
        "tag": "test",
        "uri": null,
        "timestamp": null
      }
    ],
    "pagination": { "limit": 5, "offset": 0, "total": "57" }
  }
}
```

Then check the Validation Registry — this agent has zero validations, which is a normal,
successful result, not an error.

```json
{
  "ok": true,
  "data": { "entries": [], "count": "0", "pagination": { "limit": 50, "offset": 0 } }
}
```

Finally, run the composite `assess_trust` report with a `taskContext` — it fans the four lookups
above out concurrently and returns the raw sections plus deterministic caveats and a factual
summary, with no numeric score anywhere.

```json
{
  "ok": true,
  "data": {
    "identity": {
      "agentId": "0",
      "owner": "0xa1DaEe3EB47f05f857aCA817523F9ff11d95bD71",
      "tokenUri": "data:application/json;base64,eyJ0eXBlIjoiaHR0cHM6Ly9laXBzLmV0aGVyZXVtLm9yZy9FSVBTL2VpcC04MDA0I3JlZ2lzdHJhdGlvbi12MSIsIm5hbWUiOiJHZW5lc2lzIEFnZW50IiwiZGVzY3JpcHRpb24iOiJUaGUgR2VuZXNpcyBBZ2VudCBvbiB0aGUgQmFzZSBNYWlubmV0IiwiaW1hZ2UiOiJodHRwczovL3JlZC1wYXN0LWJvbm9iby0yMzMubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZ5YmVpZ2p5YXR0MjN6Nm1xbXM2Y295ZTNzM3p2aWN3Nmh1enR6emc2a3h5YTVqZmN6cTJ6ZmRwNCIsInNlcnZpY2VzIjpbXSwieDQwMlN1cHBvcnQiOmZhbHNlLCJhY3RpdmUiOnRydWUsInN1cHBvcnRlZFRydXN0IjpbInJlcHV0YXRpb24iXSwicmVnaXN0cmF0aW9ucyI6W3siYWdlbnRJZCI6MCwiYWdlbnRSZWdpc3RyeSI6ImVpcDE1NTo4NDUzOjB4ODAwNEExNjlGQjRhMzMyNTEzNkVCMjlmQTBjZUI2RDJlNTM5YTQzMiJ9XX0=",
      "registeredAt": null
    },
    "registrationFile": {
      "verified": true,
      "hashComputed": "0x16d9b1e3454fb0346d41034c18206f7b2f94940da35eaed07bffc9c1e501e622",
      "source": "data",
      "fetchedAt": "2026-07-13T07:35:17.730Z",
      "content": {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": "Genesis Agent",
        "description": "The Genesis Agent on the Base Mainnet",
        "image": "https://red-past-bonobo-233.mypinata.cloud/ipfs/bafybeigjyatt23z6mqms6coye3s3zvicw6huztzzg6kxya5jfczq2zfdp4",
        "services": [],
        "x402Support": false,
        "active": true,
        "supportedTrust": ["reputation"],
        "registrations": [
          {
            "agentId": 0,
            "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
          }
        ]
      },
      "contentError": null
    },
    "reputation": { "count": "57", "averageScore": 100, "lastFeedbackAt": null },
    "validations": { "entries": [], "count": "0", "pagination": { "limit": 200, "offset": 0 } },
    "caveats": [
      "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.",
      "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality."
    ],
    "summary": "Agent 0 (\"Genesis Agent\") on chain 8453. Its registration file is cryptographically verified. It has 57 feedback entries averaging 100.0/100. No independent validations have been recorded. Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal. For the requested task (paying an invoice), weigh these signals against task-specific risk.",
    "missing": []
  }
}
```

The MVP's `search_agents` stub always returns `INDEX_UNAVAILABLE` — there is no local index
backend yet (see the Configuration table in the README for `INDEX_BACKEND`).

```json
{
  "ok": false,
  "error": {
    "code": "INDEX_UNAVAILABLE",
    "message": "no local index backend is configured; a local index backend ships in a future release",
    "retryable": false
  }
}
```

And an error case: resolving a nonexistent agent id returns a plain `AGENT_NOT_FOUND` envelope,
not a thrown exception.

```json
{
  "ok": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "agent not found (ERC721NonexistentToken)",
    "retryable": false
  }
}
```
