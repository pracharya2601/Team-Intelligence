---
name: rocketride-api
description: Use when calling the RocketRide HTTP API directly — the send, use, validate, terminate, and get-task-status methods for running pipelines and polling task status.
---

# RocketRide HTTP API

Run pipelines and manage tasks over HTTP. The documented methods:

| Method | Doc | Purpose (from naming) |
|---|---|---|
| `send` | `/api/send-method/` | Submit data / trigger a pipeline run |
| `use` | `/api/use-method/` | Invoke a pipeline (likely returns a task handle) |
| `validate` | `/api/validate-method/` | Validate a pipeline or payload |
| `terminate` | `/api/terminate-method/` | Stop / cancel a running task |
| `get-task-status` | `/api/get-task-status-method/` | Poll the status/result of a task |

---

## STATUS: stub — needs docs paste

The docs site is JS-rendered; exact base URL, auth header, HTTP method/path, and request/response schemas could not be scraped. **Paste the five `/api/*-method/` pages** and I'll fill verified sections.

### TODO to fill (per method)
- [ ] Base URL + auth (header name, API key format)
- [ ] HTTP verb + path
- [ ] Request params/body schema
- [ ] Response schema (esp. task id + status enum values for `get-task-status`)
- [ ] A `curl` example
- [ ] The send → poll `get-task-status` → terminate lifecycle, end to end
