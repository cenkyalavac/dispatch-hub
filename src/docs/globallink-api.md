# GlobalLink Project Director (PD) — Vendor API Reference

> **Status:** Verified working 2026-05-14 against `gle-prod-eu.transperfect.com`
> **Tenant tested:** VerbatoTrans (Cenk Yalavac, eltur.co)
> **Capture method:** Live UI XHR interception via Chrome MCP, replayed via broker `/proxy/pd`
> **Validation:** 5/5 AVAILABLE submissions claimed programmatically end-to-end

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Authentication & headers](#2-authentication--headers)
3. [Broker integration](#3-broker-integration)
4. [Folder enums](#4-folder-enums)
5. [Locale conventions (the gotchas)](#5-locale-conventions-the-gotchas)
6. [Endpoint catalog](#6-endpoint-catalog)
7. [Workflow recipes](#7-workflow-recipes)
8. [Error patterns & silent failures](#8-error-patterns--silent-failures)
9. [Reverse-engineering playbook](#9-reverse-engineering-playbook)
10. [Open questions / parked items](#10-open-questions--parked-items)

---

## 1. Architecture overview

TransPerfect GlobalLink Project Director (PD) is an ExtJS 6 single-page app at `/PD/` that fronts a legacy Java backend. There are TWO parallel API surfaces:

| Surface | Path | Purpose | Auth |
|---|---|---|---|
| **REST v0** | `/PD/rest/v0/*` | Modern endpoints — submission listings, file download | Bare JWT bearer |
| **`.pd` legacy RPC** | `/PD/<name>.pd` | Everything UI does — leverage, claim, dialogs, lookups | JWT + page-context cookies (JSESSIONID, etc.) |

**The leverage breakdown, claim flow, and most operational data only exist on `.pd`.** REST v0 alone is not enough.

`.pd` endpoints require both:
- `Authorization: Bearer <OIDC JWT>` (15-min lifetime, OIDC silent-renew)
- Browser session cookies set by the OIDC login flow

This means a bare `fetch` from a sandbox or serverless function CANNOT call `.pd` directly. You need a real Chromium context that completed OIDC login.

---

## 2. Authentication & headers

### OIDC flow

1. Hit `/PD/` → redirects to `sso.transperfect.com` for OIDC code-flow
2. After SSO + email-MFA, returns to `/PD/` with `oidc.user:<...>` in `localStorage`
3. JWT lives 15 min; OIDC silent-renew triggered by reload extends another 15 min
4. Storage state (cookies + localStorage) survives ~30 days

### The 7-header recipe

Every `.pd` POST must carry these headers exactly:

```http
Authorization: Bearer <jwt.access_token>
Content-Type: application/json
X-Requested-With: XMLHttpRequest
ajaxRequest: true
appVersion: 11.5.0
contextUser: VerbatoTrans       ← tenant org slug (NOT username)
X-CSRF-TOKEN: <csrf>             ← from localStorage["PD:https://gle-prod-eu.transperfect.com"].csrf
```

Plus the implicit cookies from the page context: `JSESSIONID`, `oidc.session`, `XSRF-TOKEN`, etc.

### What lives where in the page

```js
// JWT (15-min)
const oidcKey = Object.keys(localStorage).find(k => k.startsWith('oidc.user:'));
const oidc = JSON.parse(localStorage.getItem(oidcKey));
const jwt = oidc.access_token;
const expiresAt = oidc.expires_at;        // unix seconds
const subject = oidc.profile.sub;          // username

// CSRF (rotated per-session)
const pd = JSON.parse(localStorage.getItem('PD:https://gle-prod-eu.transperfect.com'));
const csrf = pd.csrf;
```

---

## 3. Broker integration

We run a Railway service that holds a persistent Chromium context with valid storage state. Hub adapters call broker, broker proxies the call from inside the page context (cookies attached automatically).

**Broker:** `https://globallink-token-broker-production.up.railway.app`

### Endpoints

| Path | Purpose | Auth |
|---|---|---|
| `GET /health` | liveness + token freshness | none |
| `GET /ready` | readiness for `.pd` calls | none |
| `GET /token` | current JWT | `x-internal-key` |
| `GET /csrf` | current CSRF token | `x-internal-key` |
| `POST /refresh` | force OIDC silent-renew | `x-internal-key` |
| `POST /auto-bootstrap` | force re-login (email-MFA) | `x-internal-key` |
| `POST /upload-state` | manual storage state upload | `x-internal-key` |
| `POST /probe-pd` | diagnostic: page-context `.pd` call | `x-internal-key` |
| **`POST /proxy/pd`** | **the workhorse — forward `.pd` from page context** | `x-broker-key` |

### `/proxy/pd` contract

```http
POST /proxy/pd
Content-Type: application/json
x-broker-key: <HUB_BROKER_KEY shared secret>

{
  "endpoint": "/PD/<name>.pd",   // required; full path under /PD/
  "method":   "POST",            // optional, default POST
  "body":     { ... }            // optional; sent as JSON body
}

→ 200 {
  "status":      <upstream HTTP code>,
  "redirected":  <bool>,
  "contentType": "application/json",
  "bodyJson":    { ... } or null,
  "bodyText":    "..." or null   // raw if not parseable as JSON
}
```

**Common errors:**
- `400 {"error":"endpoint (string) required"}` — missing `endpoint` field; old Hub adapters were sending `path` instead
- `401 {"error":"invalid broker key"}` — `x-broker-key` mismatch
- `500 {"error":"BROKER_KEY/HUB_BROKER_KEY env var not configured"}` — broker side env not set

---

## 4. Folder enums

TP's folder enum is **internally inconsistent**. Some have `_VENDOR` postfix, some don't:

| Folder | UI label | Notes |
|---|---|---|
| `AVAILABLE_SUBMISSION` | "Available" | Self-serve pool — claim from here |
| `INBOX_SUBMISSION` | "Inbox" | Claimed/assigned items waiting for action |
| `ACTIVE_SUBMISSION` (TBC) | "Active" | In-progress work — verify when needed |
| `SUBMISSION_COMPLETED_VENDOR` | "Completed" | Delivered/closed |

**Empirical:** querying with an unknown folder returns `200 {items:[], gridContentInfo:null}` — silent empty, no error. Always verify the enum first.

---

## 5. Locale conventions (the gotchas)

TP is internally inconsistent with locale formats:

| Context | Format | Example |
|---|---|---|
| `submissionTargetSearch` response → `sourceLanguage` | Display name | `"English (United States)"` |
| `submissionLanguageSearch` → `languageDirectionPreview.sourceLanguage.locale` | TitleCase BCP47 | `"en-US"` |
| `submissionView` request `sourceLanguageComboBox` | **lowercase, TARGET locale** | `"tr-tr"` |
| `task.pd` request `targetLanguages[]` | TitleCase BCP47 | `"tr-TR"` |

> ⚠️ **The biggest trap**: `submissionView.pd` parameter is named `sourceLanguageComboBox` but actually filters by **TARGET** locale and must be **lowercase**. Send `"en-us"` (the actual source) → returns empty. Send `"tr-tr"` (the target you want) → returns rich data with leverage tier breakdown.

---

## 6. Endpoint catalog

All endpoints are `POST /PD/<name>.pd` with `Content-Type: application/json` body.

### 6.1 `submissionTargetSearch.pd` — list submissions

**Request:**
```json
{
  "folder": "INBOX_SUBMISSION",
  "entityTickets": [],
  "parentEntityTickets": [],
  "index": 0,
  "size": 50
}
```

**Response (key fields):**
```json
{
  "success": true,
  "gridContentInfo": {
    "totalCount": 26,
    "hasNext": false,
    "hasPrevious": false,
    "totalPageCount": 1
  },
  "items": [
    {
      "submissionId": "0121166",
      "submissionName": "AWS-HO5174_AWS-CR-...",
      "ticket": "4YESyxwCtA...",
      "sourceLanguage": "English (United States)",
      "owner": [{ "name": "Frank Yen", "email": "frank.yen@transperfect.com" }],
      "submitterFullName": "...",
      "dateStarted": { "date": 1778792292000 },
      "date": { "date": 1778492000000 },
      "projectName": "Amazon ATMS",
      "priority": 1,
      "hasInstructions": true,
      "hasSubmissionBackground": false,
      "openQueriesCount": 0
    }
  ]
}
```

**Pagination:** `hasNext: true` → next page with `index: index + items.length`.

**Notes:**
- `submissionTicket` (used by other endpoints) = the `ticket` field here
- `owner[]` may contain TP-internal staff (PMs) when assigned by them
- Empty result for unknown folder → `{items:[], gridContentInfo:null}` (no error)

---

### 6.2 `submissionLanguageSearch.pd` — language directions in a submission

**Request:**
```json
{
  "submissionTicket": "4YESyxwCtA3//EyxcYRYVpMO2ZwViCoD",
  "folder": "INBOX_SUBMISSION",
  "index": 0,
  "size": 50
}
```

**Response items[i] (key fields):**
```json
{
  "languageDirectionPreview": {
    "sourceLanguage": { "value": "English (United States)", "locale": "en-US" },
    "targetLanguage": { "value": "Turkish (Turkiye)",       "locale": "tr-TR" }
  },
  "workflow": "NoDownload_FullPE-autoTransIQ1-Finalize Edit (nobudget) (noTMupdate)",
  "wordCount": 952,
  "subPhaseStatusDataHolders": [
    {
      "jobTicket": "4YESyxwCtA11h5fJeRdBrGMna8lWtbyR",
      "fileFormatName": "Batch1",
      "wordCount": 952,
      "phaseStatusData": [
        {
          "phaseName": "PostEdit",
          "phaseDueDate": { "date": 1778857200000, "critical": false },
          "phaseStatus": {
            "phaseFinished": false,
            "previousPhaseFinished": false,
            "reserved": false,
            "unclaimed": false,
            "downloaded": false
          }
        }
      ]
    }
  ]
}
```

**Use for:**
- Discovering target locale before calling `submissionView.pd`
- Extracting `jobTicket` (per-language job ID — used by claim continuation flows)
- Reading deadline (`phaseStatusData[0].phaseDueDate.date` — epoch ms)
- Reading workflow name + classifier (`fileFormatName`)
- Reading total word count (NOT tier breakdown — that's `submissionView`)

---

### 6.3 `submissionView.pd` — leverage tier breakdown ★ HIGH-VALUE

**Request:**
```json
{
  "submissionTicket": "<from submissionTargetSearch>",
  "classifier":            "Batch1",
  "folder":                "AVAILABLE_SUBMISSION",
  "sourceLanguageComboBox": "tr-tr",       ← TARGET locale lowercase!
  "index": 0,
  "size":  50
}
```

> ⚠️ Send `sourceLanguageComboBox` = the TARGET you want. Send the source locale here and you get `items: []`.

**Response (the gold):**
```json
{
  "success": true,
  "aditionalData": {                       ← yes, "aditionalData" with one 'd'
    "cumulativeTmStatistics": [
      { "wordCount": 700, "name": "inContextMatch" },
      { "wordCount": 0,   "name": "repetitions" },
      { "wordCount": 23,  "name": "match100" },
      { "wordCount": 0,   "name": "95% - 99%" },
      { "wordCount": 0,   "name": "85% - 94%" },
      { "wordCount": 3,   "name": "75% - 84%" },
      { "wordCount": 0,   "name": "50% - 74%" },
      { "wordCount": 0,   "name": "Reps95% - 99%" },
      { "wordCount": 0,   "name": "Reps85% - 94%" },
      { "wordCount": 0,   "name": "Reps75% - 84%" },
      { "wordCount": 0,   "name": "Reps50% - 74%" },
      { "wordCount": 2,   "name": "noMatch" }
    ],
    "canceledTmStatistics": [ /* same shape, all wordCount:null */ ]
  },
  "items": [
    {
      "fileName": "AWS-CR-...-tr-TR#POE_VLMGC#.json.txlf",
      "documentTicket": "4YESyxwCtA3gI7FBi9kn7OZZC6F0WkBa",
      "targetTicket":   "4YESyxwCtA16ml4sS3fGXU41uucukzKM",
      "cumulativeTmStatistics": { /* per-file detail, same field set */ },
      "phaseStatusData": [{ "phaseDueDate": { "date": 1778893200000 } }]
    }
  ]
}
```

**Tier band → name mapping:**
- `inContextMatch` = ICE / Context match (no edit required)
- `repetitions` = pure repetitions within document
- `match100` = 100% TM match
- `95% - 99%` / `85% - 94%` / `75% - 84%` / `50% - 74%` = fuzzy bands
- `Reps95% - 99%` etc. = repetitions WITHIN a fuzzy band — **per Cenk's rule, merge into the same fuzzy band column**
- `noMatch` = new translation

**WWC formula** (MTPE-aligned, Cenk's canonical — must match `functions/globallinkPoll.js` + `lib/leverage.js` + `AcceptedTask.weighted_wc`):

```
WWC = ctx*0
    + rep*0
    + 100*0
    + (95-99 + Reps95-99) * 0.2
    + (85-94 + Reps85-94) * 0.35
    + (75-84 + Reps75-84) * 0.45
    + (50-74 + Reps50-74 + noMatch) * 0.6
```

Context / pure-rep / 100% bands carry zero weight (free under MTPE).
WWC is NOT returned by TP — calculate client-side.

**Total WC** = sum of all bands (Reps merged) — also recompute client-side; `cumulativeTmStatistics.totalWordCount` (in `items[]`) does match.

---

### 6.4 `submissionAvailableItemsLookup.pd` — language picker grid (claim dialog)

**Request:**
```json
{
  "folder":          "AVAILABLE_SUBMISSION",
  "submissionTicket": "<T>",
  "taskName":        "claim.PostEdit",
  "phaseName":       "PostEdit",
  "index": 0,
  "size":  50
}
```

**Use:** part of claim dialog warmup chain. Returns the language rows the dialog displays. **Required step — skipping it makes claim no-op.**

---

### 6.5 `task.pd` — operational tasks (claim, deliver, etc.) ★ HIGH-VALUE

The same endpoint handles many `taskName` values. For claim, see § 7.1. For other tasks (deliver, query, etc.) the pattern is similar but `taskName` and `jsonTaskData` keys differ.

**Generic shape:**
```json
{
  "taskName":      "claim.PostEdit",        // or other action
  "parentTickets": ["<submissionTicket>"],  // submission scope
  "jsonTaskData":  "{\"folder\":\"...\",\"targetLanguages\":[\"tr-TR\"]}"
                   // ↑ string-encoded JSON, NOT a nested object
}
```

**Step-1 response shape:**
```json
{
  "success": true,
  "taskResponse": {
    "model": { "processUuid": "<uuid>" }
  },
  "version": "11.5.0"
}
```

**Step-2 (commit) response on success:**
```json
{
  "success": true,
  "taskResponse": {
    "model": { "nextTaskName": "process linguistic.PostEdit" }
                            // ↑ presence of nextTaskName = real success
  }
}
```

> ⚠️ `success: true` alone is NOT a success signal. Step-2 returns `success: true` with no `nextTaskName` when warmup chain (§ 7.1) was skipped. Always check for `nextTaskName`.

**Critical field naming:**
- `parentTickets` (NOT `jobTickets` — that field is from the old, broken Hub adapter)
- `jsonTaskData` is a **STRING**, not a JSON object — must be `JSON.stringify(...)` before sending

---

### 6.6 `taskPost.pd` — dialog state init (NOT a commit endpoint)

> Despite the name, `taskPost.pd` is for **opening a dialog/wizard**, not committing. The actual commit is `task.pd`.

**Used in pairs** during the claim dialog warmup. See § 7.1.

**Response shape:**
```json
{
  "success": true,
  "taskInfos": [
    { "model": { "processUuid": "<uuid>" } }   // step 1
    // OR
    { "model": { "supportEmail": "...", "specialInstructions": "<html>" } }  // step 2
  ]
}
```

---

### 6.7 `provideToken.pd` — file download token

**Request:** empty body.

**Response:**
```json
{
  "success": true,
  "version": "11.5.0",
  "token":   "eyJraWQiOiJwZEludGVybmFsS2lkIiwidHlwIjoiSldUIiwiYWxnIjoiUlMyNTYifQ..."
}
```

Returned as last call after a successful claim. Token is short-lived; used for downloading the actual translation files via `/PD/files/...` URLs.

---

### 6.8 Other observed endpoints (not yet fully mapped)

| Endpoint | Likely purpose | Status |
|---|---|---|
| `submissionFileSearch.pd` | List files within a submission | Returns 200, empty without right params |
| `submissionAcceptDeliveryFromVendor.pd` | (Reverse direction — internal use) | Out of scope |

---

## 7. Workflow recipes

### 7.1 Claim a submission from AVAILABLE pool ★ THE BIG ONE

**Verified working 2026-05-14, 5/5 successful claims (0122458, 0122462, 0122463, 0122465, 0122466).**

The chain has 6 calls. Steps 1-4 are **dialog state warmup** — server-side state machine requires them. Skipping straight to 5-6 returns `success:true` but is a silent no-op.

```
[1] submissionLanguageSearch.pd
    {"submissionTicket":"<T>", "folder":"AVAILABLE_SUBMISSION"}

[2] taskPost.pd  (dialog init)
    {"taskName":"claim.PostEdit",
     "parentTickets":["<T>"],
     "jsonTaskData": "{\"folder\":\"AVAILABLE_SUBMISSION\"}"}
    → returns processUuid_A

[3] taskPost.pd  (dialog continue)
    {"taskName":"claim.PostEdit",
     "parentTickets":["<T>"],
     "jsonTaskData": "{\"processUuid\":\"<A>\",\"folder\":\"AVAILABLE_SUBMISSION\"}"}
    → returns specialInstructions HTML; success:true

[4] submissionAvailableItemsLookup.pd
    {"folder":"AVAILABLE_SUBMISSION",
     "submissionTicket":"<T>",
     "taskName":"claim.PostEdit",
     "phaseName":"PostEdit",
     "index":0, "size":50}

[5] task.pd  (REAL claim init — language NOW selected)
    {"taskName":"claim.PostEdit",
     "parentTickets":["<T>"],
     "jsonTaskData": "{\"folder\":\"AVAILABLE_SUBMISSION\",\"targetLanguages\":[\"tr-TR\"]}"}
    → returns processUuid_B

[6] task.pd  (REAL commit)
    {"taskName":"claim.PostEdit",
     "parentTickets":["<T>"],
     "jsonTaskData": "{\"processUuid\":\"<B>\",\"folder\":\"AVAILABLE_SUBMISSION\",\"targetLanguages\":[\"tr-TR\"]}"}
    → SUCCESS = taskResponse.model.nextTaskName === "process linguistic.PostEdit"
```

**Multi-language note:** if a submission has multiple target locales for your tenant, send all in `targetLanguages: ["tr-TR", "ar-SA"]` in steps 5-6. One claim call per submission, all langs at once.

**Post-claim verification:** call `submissionTargetSearch.pd` with `folder:"INBOX_SUBMISSION"` — claimed submission appears there within ~5 sec.

### 7.2 Read leverage breakdown for one submission

```
[1] submissionTargetSearch.pd  → get submissionTicket
[2] submissionLanguageSearch.pd → get target locale (e.g. "tr-TR")
[3] submissionView.pd  with sourceLanguageComboBox = lowercase target
    → response.aditionalData.cumulativeTmStatistics has the 12-band breakdown
[4] Compute WWC + Total WC client-side (TP doesn't return WWC)
```

### 7.3 List Cenk's pending work (full inventory)

```
[1] submissionTargetSearch.pd folder:INBOX_SUBMISSION   → assigned/claimed items
[2] submissionTargetSearch.pd folder:AVAILABLE_SUBMISSION → self-serve pool
[3] For each, optionally chain submissionLanguageSearch + submissionView
    to enrich with deadline + leverage
```

---

## 8. Error patterns & silent failures

| Symptom | Cause | Diagnosis |
|---|---|---|
| `200 {items:[], gridContentInfo:null}` | Unknown folder enum | Check folder name spelling |
| `200 {items:[], gridContentInfo:{totalCount:0}}` on `submissionView` | `sourceLanguageComboBox` wrong (sent source, not target lowercase) | Use TARGET locale lowercase |
| `200 {success:true, taskResponse:{model:{processUuid}}}` on STEP 6 | Skipped dialog warmup | Run all 6 steps in order |
| `200 success:true` on STEP 6 but no `nextTaskName` | Same as above | Don't trust `success:true` alone |
| `400 {"error":"endpoint (string) required"}` from broker | Hub sent `path` instead of `endpoint` | Fix Hub adapter contract |
| `401 {"error":"invalid broker key"}` | `x-broker-key` mismatch | Align `BROKER_KEY` env on Hub side |
| `404 <html>` from broker | Endpoint name doesn't exist | Check spelling; PD names are case-sensitive |
| HTTP 401 from `.pd` upstream | JWT expired (>15 min) or storage state died | Trigger broker `/refresh` or `/auto-bootstrap` |
| Redirect to `sso.transperfect.com` | All cookies expired (>30 days) | Broker autoBootstrap with email-MFA |

---

## 9. Reverse-engineering playbook

How we figured out the claim chain:

1. **Connect to user's Chrome via Chrome MCP** (`mcp__Claude_in_Chrome__select_browser`)
2. **Navigate to TP** (`mcp__Claude_in_Chrome__navigate`)
3. **Inject XHR interceptor** (`mcp__Claude_in_Chrome__javascript_tool`):

```js
window.__xhrLog = [];
const _send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(body) {
  if (/\.pd\b/.test(String(this.__u || ''))) {
    const e = { url: this.__u, body, ts: Date.now() };
    this.addEventListener('load', () => {
      e.status = this.status;
      e.resp = String(this.responseText || '').slice(0, 2000);
    });
    window.__xhrLog.push(e);
  }
  return _send.apply(this, arguments);
};
```

> **Critical:** ExtJS uses `XMLHttpRequest`, NOT `fetch`. A `window.fetch` interceptor will capture nothing.

4. **Trigger UI action** via ExtJS API (more reliable than DOM clicks):

```js
const grid = Ext.getCmp('pdMainGrid-1041');
const store = grid.getStore();
const idx = store.findBy(r => String(r.get('submissionId')) === '0122463');
grid.getSelectionModel().select([store.getAt(idx)]);
// Then click button by label
[...document.querySelectorAll('a.x-btn')]
  .find(b => b.innerText.trim().includes('Claim'))?.click();
```

5. **Read captured XHRs** after ~3sec wait:

```js
window.__xhrLog.map(e => ({
  url: e.url.slice(-50),
  body: String(e.body || '').slice(0, 500),
  resp: String(e.resp || '').slice(0, 500)
}));
```

6. **Replay via broker `/proxy/pd`** — confirms the chain is portable outside the browser.

---

## 10. Open questions / parked items

- **REST v0 endpoints** — `/PD/rest/v0/submissions` works with bare JWT for listing, but doesn't expose leverage or claim. Worth a deeper inventory if we ever need lighter-weight queries.
- **Multi-tenant brokers** — Acolad uses GlobalLink too (different instance). Broker design is single-tenant; need refactor before onboarding 2nd tenant.
- **Other `taskName` values** — `deliver.PostEdit`, `query.create`, `query.respond`, etc. Same `task.pd` endpoint, different `jsonTaskData` keys. Capture via the playbook above.
- **REST v0 `provideToken.pd` equivalent** — file download flow needs deeper mapping.
- **`canceledTmStatistics`** — appears alongside cumulative; usage TBD (probably for canceled jobs).
- **Workflow strings** — TP uses cryptic strings like `NoDownload_FullPE-autoTransIQ1-Finalize Edit (nobudget) (noTMupdate)`. Need to map to internal phases.

---

## Appendix A: Sample full claim trace

Recorded 2026-05-14 17:42 UTC, claim of submission 0122462:

```
1. POST /PD/submissionLanguageSearch.pd
   body: {"submissionTicket":"4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR","folder":"AVAILABLE_SUBMISSION"}
   resp: {success:true, items:[1 lang]}

2. POST /PD/taskPost.pd
   body: {"taskName":"claim.PostEdit","parentTickets":["4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR"],
          "jsonTaskData":"{\"folder\":\"AVAILABLE_SUBMISSION\"}"}
   resp: {success:true, taskInfos:[{model:{processUuid:"9c945a7b-f94f-44a4-ba12-def2cbc13873"}}]}

3. POST /PD/taskPost.pd
   body: {"taskName":"claim.PostEdit","parentTickets":["4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR"],
          "jsonTaskData":"{\"processUuid\":\"9c945a7b...\",\"folder\":\"AVAILABLE_SUBMISSION\"}"}
   resp: {success:true, taskInfos:[{model:{specialInstructions:"<html>", supportEmail:"..."}}]}

4. POST /PD/submissionAvailableItemsLookup.pd
   body: {"folder":"AVAILABLE_SUBMISSION","index":0,"size":50,
          "submissionTicket":"4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR",
          "taskName":"claim.PostEdit","phaseName":"PostEdit"}
   resp: {success:true, items:[1], groupField:"targetLanguagevalue"}

[USER CLICKS "Claim" BUTTON]

5. POST /PD/task.pd
   body: {"taskName":"claim.PostEdit","parentTickets":["4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR"],
          "jsonTaskData":"{\"folder\":\"AVAILABLE_SUBMISSION\",\"targetLanguages\":[\"tr-TR\"]}"}
   resp: {success:true, taskResponse:{model:{processUuid:"eb298c0e-1f3d-465a-a53f-182c26ea59fb"}}}

6. POST /PD/task.pd
   body: {"taskName":"claim.PostEdit","parentTickets":["4YESyxwCtA3R9BuGW+KAyGMna8lWtbyR"],
          "jsonTaskData":"{\"processUuid\":\"eb298c0e...\",\"folder\":\"AVAILABLE_SUBMISSION\",
                            \"targetLanguages\":[\"tr-TR\"]}"}
   resp: {success:true, taskResponse:{model:{nextTaskName:"process linguistic.PostEdit"}}}
   ← CLAIM CONFIRMED

7. POST /PD/submissionTargetSearch.pd  (UI list refresh)
8. POST /PD/provideToken.pd           (file download token)
```

---

## Appendix B: Broker configuration reference

Required Railway env vars on broker:

| Variable | Purpose |
|---|---|
| `GLOBALLINK_URL` | `https://gle-prod-eu.transperfect.com/PD/` |
| `GLOBALLINK_USERNAME` | TP login email (`cenk@eltur.co`) |
| `GLOBALLINK_PASSWORD` | TP password |
| `MFA_IMAP_HOST` | `imap.gmail.com` |
| `MFA_IMAP_PORT` | `993` |
| `MFA_IMAP_USER` | Inbox that receives TP MFA mail |
| `MFA_IMAP_PASSWORD` | Gmail App Password (NOT account password) |
| `MFA_FROM_ADDRESS` | `sso_donotreply@transperfect.com` |
| `MFA_MAILBOX` | `INBOX` (with Skip-Inbox exception) |
| `HUB_BROKER_KEY` | Shared secret for `/proxy/pd` auth |
| `INTERNAL_API_KEY` | Internal admin endpoints auth |
| `HUB_BASE_URL` | Where to push refreshed tokens |
| `STORAGE_STATE_PATH` | Default `/data/globallink-storage-state.json` |
| `AUTO_BOOTSTRAP_ENABLED` | `true` for normal operation, `false` to pause |

---

**Maintained by:** Cowork (Cenk's project, eltur.co)
**Last verified:** 2026-05-14
**Authoritative source:** memory file `project_globallink_claim_chain.md