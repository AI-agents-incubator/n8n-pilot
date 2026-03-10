# n8n Pilot — Diagnostic Report: Claude API Connection Error

**Date:** 10 March 2026 | **Author:** Claude (AI Agent) | **Status:** UNRESOLVED

---

## 1. Executive Summary

The n8n Pilot Chrome extension cannot connect to the Anthropic Claude API. Every API call returns HTTP 400 with the message: *"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."* This error occurs despite the user having $25 credit balance and the same API key working successfully in Anthropic's Workbench.

This report documents all diagnostic tests performed, hypotheses investigated, and recommended next steps.

---

## 2. Environment

| Parameter | Value |
|-----------|-------|
| Extension | n8n Pilot v1.0.0 (Chrome Extension, Manifest V3) |
| Extension ID | `dnjfpbmjaiohnkeedgjhcoobhgeeobdk` |
| Browser | Google Chrome (latest) |
| API Endpoint | `https://api.anthropic.com/v1/messages` |
| API Version Header | `2023-06-01` |
| n8n Instance | `https://n8n.srv927837.hstgr.cloud` (self-hosted, Hostinger) |
| User Account Balance | $25 (confirmed by user) |
| Anthropic Organization | Single organization, single API key |

---

## 3. Error Description

### 3.1. Exact Error Message

```
Error: Bad request: Your credit balance is too low to access the Anthropic API.
Please go to Plans & Billing to upgrade or purchase credits.
```

### 3.2. HTTP Response Details

| Field | Value |
|-------|-------|
| HTTP Status | **400 Bad Request** |
| Error Type | `invalid_request_error` |
| Authentication | **PASSES** (not 401) — API key is recognized as valid |

### 3.3. Key Observation

The error is HTTP 400 (Bad Request), NOT 401 (Unauthorized). This proves the API key itself is valid and recognized by Anthropic. The billing check happens AFTER authentication and rejects the request based on the key's associated billing state.

---

## 4. Tests Performed

### 4.1. Test 1: Extension UI (popup.js → background.js → Claude API)

| | |
|---|---|
| **Method** | Click "Generate Workflow" button in extension popup |
| **Flow** | popup.js → chrome.runtime.sendMessage → background.js → settings.getApiKey('claude') → decrypt AES-256-GCM → fetch() to api.anthropic.com |
| **Models Tested** | Claude Opus 4 (`claude-opus-4-20250514`), Claude Sonnet (`claude-sonnet-4-20250514`) |
| **Result** | **FAIL — HTTP 400, credit balance too low** |

### 4.2. Test 2: Standalone Diagnostic Page (direct browser fetch, no extension)

| | |
|---|---|
| **Method** | Separate HTML file (`diagnostic.html`) opened in Chrome. User pastes raw API key manually. JavaScript `fetch()` calls API directly. |
| **Purpose** | Eliminates encryption, service worker, message passing — tests ONLY the API call itself |
| **Models Tested** | 6 models: `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-4-20250514`, `claude-haiku-3-5-20241022`, `claude-opus-4-6`, `claude-opus-4-20250514` |
| **Result** | **FAIL — ALL 6 models return identical HTTP 400 error** |

**This test proves:**
- The problem is NOT in our encryption code
- The problem is NOT in model IDs (all fail identically)
- The problem is NOT in the extension's service worker or message routing

### 4.3. Test 3: Anthropic Workbench (user's manual test)

| | |
|---|---|
| **Method** | User logged into console.anthropic.com, opened Workbench, sent a test prompt |
| **Model Used** | `claude-sonnet-4-5-20250929` |
| **Result** | **SUCCESS — received valid JSON response with content** |

**CRITICAL: The Workbench uses SESSION AUTHENTICATION (browser cookies), NOT the API key.** The Workbench success proves the user's ACCOUNT has credits, but does NOT prove the API KEY's associated workspace has credits.

### 4.4. Tests NOT Yet Performed

- Server-side `curl` test (bypasses browser entirely, eliminates CORS / browser-access header as factor)
- Test with a freshly generated API key from the workspace that has credits
- Verification of which workspace the API key belongs to vs. which workspace has the billing credits

---

## 5. Hypotheses Analysis

| # | Hypothesis | Evidence For | Evidence Against | Status |
|---|-----------|-------------|-----------------|--------|
| H1 | **API key belongs to a workspace with no credits (workspace billing mismatch)** | Workbench uses session auth, not API key. Error is billing-related 400, not auth 401. Known issue in Anthropic GitHub. | User states single organization and single API key. | **🔴 MOST LIKELY** |
| H2 | **`anthropic-dangerous-direct-browser-access` header triggers different billing path** | Header is relatively new (Aug 2024). Different code paths possible on Anthropic side. | Diagnostic page uses the same header and fails too. Some users report it works fine. | **🟡 POSSIBLE** |
| H3 | **AES-256-GCM encryption corrupts the API key during save/retrieve** | Extension uses encrypt/decrypt pipeline for key storage. | Diagnostic page pastes raw key (no encryption). Same error. | **✅ ELIMINATED** |
| H4 | **Invalid or outdated model IDs** | Extension originally used old model IDs. | Batch test with 6 different model IDs (including current ones from docs) ALL fail identically. | **✅ ELIMINATED** |
| H5 | **API key has trailing whitespace or invisible characters** | Copy-paste into diagnostic could introduce whitespace. | Diagnostic uses `.trim()`. Error is 400 not 401 — key IS valid. | **⚪ UNLIKELY** |
| H6 | **Anthropic billing system sync delay (temporary server-side issue)** | Known issue on GitHub: users with credits still get this error. User recently purchased credits. | Error persists after multiple attempts over extended period. | **🟡 POSSIBLE** |
| H7 | **Account tier requires minimum balance higher than current** | Different tiers may have different requirements. | User has $25, more than enough for basic usage. | **⚪ UNLIKELY** |

---

## 6. Detailed Analysis of Leading Hypothesis

### 6.1. Workspace Billing Mismatch (H1)

The Anthropic Console supports multiple workspaces within an organization. Each workspace has its own billing, API keys, and credit balance. The key architectural distinction:

- The **Workbench** (console.anthropic.com/workbench) authenticates via browser session cookies tied to the user's ACCOUNT, and uses the DEFAULT workspace's credits.
- **API keys** are tied to a SPECIFIC workspace. When an API key is used, billing is charged to THAT workspace's balance, not the account-level balance.

If the user created an API key in Workspace A, but purchased credits in Workspace B (the default), the API key would authenticate successfully (valid key → no 401) but fail the billing check (Workspace A has $0 → 400 error).

This exact pattern matches all our observations.

### 6.2. Browser-Direct-Access Billing Path (H2)

The `anthropic-dangerous-direct-browser-access: true` header was introduced in August 2024 to enable CORS for browser-based API calls. It is possible (though undocumented) that Anthropic applies different billing rules for requests with this header.

**To test:** Run a server-side curl command (without the header). If curl succeeds but browser requests fail, this confirms the header is the issue.

---

## 7. Request Format Verification

| Component | Our Implementation | Anthropic Docs |
|-----------|-------------------|----------------|
| Endpoint | `POST https://api.anthropic.com/v1/messages` | `POST https://api.anthropic.com/v1/messages` |
| Content-Type | `application/json` ✅ | `application/json` |
| x-api-key | `sk-ant-api03-...` ✅ | (API key) |
| anthropic-version | `2023-06-01` ✅ | `2023-06-01` |
| Browser header | `anthropic-dangerous-direct-browser-access: true` | (required for browser CORS) |
| Body: model | `claude-sonnet-4-5-20250929` ✅ | `claude-opus-4-6` (in examples) |
| Body: max_tokens | `16` (test) / `4096` (production) ✅ | `1024` (in examples) |
| Body: messages | `[{role:"user", content:"Say hello"}]` ✅ | `[{role:"user", content:"..."}]` |

**Conclusion: The request format is fully compliant with Anthropic's documented API. No format issues detected.**

---

## 8. Relevant Code Architecture

### 8.1. API Call Chain

```
popup.js: msg('generateWorkflow', { prompt, model })
    → chrome.runtime.sendMessage()
background.js: case 'generateWorkflow': claudeClient.sendMessage(...)
    → settings.getApiKey('claude')
        → crypto.decryptString(cipher, iv)
            → crypto.getOrCreateKey()  // AES-256-GCM from chrome.storage
            → crypto.subtle.decrypt(...)
    → fetch('https://api.anthropic.com/v1/messages', { headers, body })
    ← HTTP 400: 'credit balance is too low'
```

### 8.2. Headers Construction (`lib/claude-client.js`, line 212)

```javascript
function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}
```

### 8.3. Extension Permissions (`manifest.json`)

```json
"host_permissions": ["https://api.anthropic.com/*"]
```

This grants the extension permission to make requests to the Anthropic API without CORS restrictions from the service worker.

---

## 9. Known Issues from Anthropic GitHub

Multiple GitHub issues report the same error with valid credits:

- **Issue #867** (claude-code): "Credit balance is too low" with credits on account
- **Issue #627** (claude-code): "Credit balance is too low - but I have credit"
- **Issue #5300** (claude-code): "PRO account shows Credit balance is too low"
- **Issue #4207** (claude-code): Same error pattern, credits visible in Console

Common thread: the API key's workspace billing state differs from the account's visible balance. Most cases resolved by ensuring credits are in the correct workspace.

---

## 10. Recommended Next Steps

### 10.1. Immediate Actions (User)

1. **Verify API key workspace:** Go to `console.anthropic.com/settings/keys`, identify which workspace owns the API key.
2. **Check workspace billing:** Switch to that specific workspace → Plans & Billing. Confirm credits exist in THAT workspace (not just the default/personal workspace).
3. **Generate new API key:** If workspace mismatch is confirmed, create a new API key from the workspace that has the $25 credit balance.

### 10.2. Diagnostic Actions (Developer)

1. **Run server-side curl test:** Execute the curl command from `diagnostic.html` in terminal. This eliminates the browser-direct-access header as a variable.
2. **If curl also fails:** Confirms workspace billing issue (H1). Solution is workspace/key alignment.
3. **If curl succeeds but browser fails:** Indicates the `anthropic-dangerous-direct-browser-access` header triggers different billing logic (H2). Contact Anthropic support.

### 10.3. Fallback Actions

- Contact Anthropic support with the `request-id` from the error response for server-side diagnosis.
- Try creating a completely new Anthropic account/organization and generating a fresh API key.
- Consider adding a proxy server mode to the extension (sends API calls from a server, avoiding the browser-direct-access header).

---

## 11. Test Results Summary

| Test Suite | Result | Details |
|-----------|--------|---------|
| Unit Tests (Vitest) | **267/267 PASS** | All modules: crypto, settings, utils, claude-client, n8n-client, workflow-generator, workflow-validator, history, versions, integration-ids |
| Integration ID Test | **11/11 PASS** | popup.js ↔ popup.html element ID consistency, background.js message routing |
| Extension UI Render | **PASS** | Popup displays correctly at 420×520px with all tabs functional |
| Claude API Connection | **FAIL** | HTTP 400: credit balance too low (all 6 models, both extension and standalone diagnostic) |

---

## 12. Conclusion

The root cause is almost certainly NOT in our code. The request format, headers, and body are all compliant with Anthropic's API documentation. The most likely cause is a **workspace billing mismatch**: the API key belongs to a workspace that does not have credits, while the user's account-level balance (visible in the Console and Workbench) shows $25.

The recommended path to resolution: (1) verify the API key's workspace billing, (2) run the curl test to eliminate browser-specific causes, (3) if needed, generate a new API key from the workspace with credits.
