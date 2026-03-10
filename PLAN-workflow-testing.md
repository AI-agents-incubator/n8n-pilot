# Техническая спецификация: Автотестирование workflows в n8n Pilot

**Версия:** 3.2 | **Статус:** Ready for implementation | **Обновлено:** 2026-03-10

---

## 0. Scope & Modes

### 0.1 Scope — что тестируем

- Генерация workflow → валидация → привязка credentials по reference → webhook injection → запуск → assertions → cleanup
- Сохранение результатов тестов в chrome.storage.local
- UI: progress, result card, credential dialog, rerun

### 0.2 Scope — что НЕ тестируем

- Извлечение/чтение секретов из n8n credentials (только reference по ID/name)
- Запуск workflows в production режиме (только тестовые копии)
- Создание/модификация credentials в n8n
- Отдельная страница — UI отображается в injected side panel (Shadow DOM)

### 0.3 Test Modes

| Режим | Credentials | Ноды | Когда использовать |
|-------|-------------|------|--------------------|
| `mock-only` | Mock (тестовые) | Любые | Unit/E2E тесты, CI/CD |
| `safe-live` | Реальные (allowlisted) | Только безопасные | Dev-тестирование |
| `full-live` | Реальные | Все (с guardrails) | По явному флагу пользователя |

**`mock-only` (default для тестов):**
- Mock n8n сервер на localhost:5678
- Все credentials — фиктивные
- Webhook возвращает симулированный execution result
- Используется в `npm test` и `npm run test:e2e`

**`safe-live`:**
- Реальный n8n instance
- Credentials используются по reference (ID)
- Запрещены destructive ноды (см. Safety Gates)
- Workflow помечается `[TEST]` префиксом
- Обязательный cleanup после теста

**`full-live`:**
- Только по явному действию пользователя (нажатие Test с confirmation)
- Все ноды разрешены, включая Telegram, Email, Slack
- Пользователь предупреждён: «This will execute real integrations»
- Cleanup обязателен

### 0.4 Safety Gates

| Gate | Описание | Default |
|------|----------|---------|
| **Destructive node block** | Ноды DELETE/DROP/REMOVE заблокированы в `safe-live` | ON |
| **Test prefix** | Тестовый workflow обязан иметь `[TEST]` в имени | ON |
| **Execution timeout** | Max 60s для webhook ответа, 120s для polling | ON |
| **Retry limit** | Max 1 retry на webhook call (не бесконечный loop) | ON |
| **Domain allowlist** | В `safe-live` — только localhost, internal domains | OFF (user configurable) |
| **Cleanup enforcement** | Тестовый workflow удаляется после теста | ON |
| **Credential read-only** | Агент НИКОГДА не пытается извлечь credential secrets | ALWAYS ON |
| **Dry-run first** | Перед live-тестом показать план пользователю | ON in `full-live` |

#### 0.4.1 Destructive Node Blocklist (конкретные типы)

В `safe-live` режиме следующие ноды/операции **заблокированы**:

| Node type | Заблокированные operations | Причина |
|-----------|---------------------------|---------|
| `n8n-nodes-base.httpRequest` | `DELETE` method | Удаление ресурсов |
| `n8n-nodes-base.airtable` | `delete` operation | Удаление записей |
| `n8n-nodes-base.gmail` | `delete`, `trash` | Удаление/перемещение email |
| `n8n-nodes-base.telegram` | `deleteMessage`, `banChatMember` | Деструктивные Telegram-операции |
| `n8n-nodes-base.slack` | `delete` (messages, channels) | Удаление контента Slack |
| `n8n-nodes-base.postgres` / `mysql` | `executeQuery` с `DROP`/`DELETE`/`TRUNCATE` | SQL-деструкция |
| `n8n-nodes-base.ftp` | `delete` operation | Удаление файлов |
| `n8n-nodes-base.s3` | `delete` operation | Удаление объектов S3 |
| `n8n-nodes-base.googleDrive` | `delete` operation | Удаление файлов Drive |

**Детекция:** `isSafeForTesting(node)` проверяет `node.type` + `node.parameters.operation` / `node.parameters.method`.
Если нода в blocklist → `testWorkflow()` возвращает `BLOCKED` с объяснением.

#### 0.4.2 Domain Allowlist (для httpRequest в safe-live)

```javascript
const DEFAULT_DOMAIN_ALLOWLIST = [
  'localhost',
  '127.0.0.1',
  '*.local',           // mDNS / internal
  '*.internal',
  '*.test',            // RFC 2606
];
```

Пользователь может расширить через Settings → Test → «Allowed domains»:
```
httpbin.org, api.example.com, *.mycompany.internal
```

**Проверка:** `isDomainAllowed(url, allowlist)` парсит URL и сравнивает hostname.
`httpRequest` ноды с URL вне allowlist → `BLOCKED` в `safe-live`, разрешены в `full-live`.

#### 0.4.3 Side-effect Classification

| Категория | Примеры | safe-live | full-live |
|-----------|---------|-----------|-----------|
| **Read-only** | httpRequest GET, airtable list, gmail read | Разрешено | Разрешено |
| **Write (reversible)** | airtable create, gmail send draft | Разрешено (с предупреждением) | Разрешено |
| **Write (irreversible)** | telegram send, gmail send, slack post | Заблокировано | Разрешено (с confirmation) |
| **Destructive** | DELETE, DROP, remove | Заблокировано | Разрешено (с double confirmation) |

### 0.5 Credential Contract

1. Агент использует **только существующие** credentials по ID и имени
2. Credentials получаются через `GET /api/v1/credentials` → `{ id, name, type }` (без секретов)
3. Агент **НИКОГДА** не пытается:
   - Извлечь значения secrets (API keys, tokens, passwords)
   - Создать новые credentials
   - Модифицировать существующие credentials
   - Передать credentials наружу
4. Привязка к ноде: `node.credentials[credType] = { id: "123", name: "My Bot" }`
5. Если credential не найден — показать инструкцию, не пытаться обойти

### 0.6 Pass/Fail Contract

| Результат | Определение | Действие агента |
|-----------|-------------|-----------------|
| **PASS** | Execution status = `success`, все ноды без ошибок | Показать ✓, сохранить результат |
| **FAIL** | Execution status = `error`, хотя бы одна нода с ошибкой | Показать ✗ + детали, предложить Fix (Фаза 3) |
| **TIMEOUT** | Execution не завершился за 60s | Показать ⏱ «Still running», НЕ удалять workflow |
| **FLAKY** | Не применимо для single-run | — |
| **BLOCKED** | Missing credentials или n8n недоступен | Показать причину, не запускать тест |
| **SKIPPED** | Workflow невалидный (validate() errors) | Показать ошибки валидации |

**Retry policy:**
- Webhook call: 1 retry (если AbortError/timeout)
- Credential check: 0 retries (если n8n не отвечает — stop)
- Deploy/activate: 0 retries (если ошибка — stop, показать)

### 0.7 Artifacts

| Артефакт | Где хранится | Формат |
|----------|-------------|--------|
| Test results | `chrome.storage.local` (key: `n8nPilotTestResults`) | JSON array, max 50 entries |
| Generated workflow | In-memory (`currentWorkflow` в panel/chat.js) | n8n workflow JSON |
| Test workflow (temp) | n8n instance (создаётся при deploy, удаляется при cleanup) | n8n workflow JSON |
| Execution details | Читается из n8n API (`GET /api/v1/executions/{id}`) | n8n execution JSON |
| Mock server config | `tests/e2e/mocks/n8n-server.js` (in-memory data) | Express routes |

### 0.8 Regression Pack

Баги, которые ОБЯЗАНЫ иметь постоянные тесты (в `kodex-regression.test.js` или новых файлах):

| Bug ID | Описание | Тест |
|--------|----------|------|
| REG-001 | Status mapping в executions (success→✅, error→❌) | kodex-regression.test.js ✅ |
| REG-002 | Debug response mapping (model, tokens, duration) | kodex-regression.test.js ✅ |
| REG-003 | Model propagation в generate → sendMessage | kodex-regression.test.js ✅ |
| REG-004 | Version save on inject/save | kodex-regression.test.js ✅ |
| REG-005 | Validation failure не ломает UI | kodex-regression.test.js ✅ |
| REG-006 | Webhook injection не мутирует оригинальный workflow | ⏳ n8n-client-execute.test.js |
| REG-007 | Cleanup вызывается даже при ошибке (finally) | ⏳ n8n-client-execute.test.js |
| REG-008 | Credential matching — auto-match при одном кандидате | ⏳ n8n-client-execute.test.js |
| REG-009 | Тестовый workflow помечен `[TEST]` префиксом | ⏳ n8n-client-execute.test.js |
| REG-010 | Timeout не крашит UI | ⏳ n8n-client-execute.test.js |

---

## 1. Проблема

Расширение генерирует workflow и инжектит его в n8n, но не может проверить, что workflow работает. Пользователь вынужден вручную открывать n8n, активировать и тестировать. Это прерывает flow «задал → получил → работает».

## 2. Цель

Добавить полный цикл: **Generate → Deploy → Test → Report** — прямо из расширения. Одна кнопка «Test» после генерации.

---

## 3. Архитектура решения

### 3.1. n8n API: реальное состояние

> **ВАЖНО:** `POST /api/v1/workflows/{id}/execute` — НЕ существует в публичном API.
> PR #20234 был закрыт без мержа. Внутренний endpoint `/rest/workflows/run`
> — недокументированный, требует session auth, может измениться.

**Стратегия запуска workflow — Webhook Injection:**

Поскольку n8n не предоставляет endpoint для прямого запуска workflow по ID, используем подход **Webhook Injection**: перед тестом автоматически добавляем Webhook-триггер в workflow, деплоим, вызываем webhook URL, получаем результат.

### 3.2. Доступные API endpoints (стабильные)

```
POST   /api/v1/workflows              — создание workflow
GET    /api/v1/workflows/{id}          — получение workflow
PUT    /api/v1/workflows/{id}          — обновление workflow
DELETE /api/v1/workflows/{id}          — удаление workflow
POST   /api/v1/workflows/{id}/activate — активация
POST   /api/v1/workflows/{id}/deactivate — деактивация
GET    /api/v1/executions              — список выполнений
GET    /api/v1/executions/{id}         — детали выполнения
GET    /api/v1/credentials             — список credentials (id, name, type)
GET    /api/v1/credentials/schema/{credentialTypeName} — JSON Schema для credential type
```

> **Примечание:** Endpoint `GET /api/v1/credentials/schema/{type}` возвращает JSON Schema
> описывающий все поля для credential type (например, `telegramApi` → `{botToken: string}`).
> Мы НЕ используем его в MVP, но он полезен для Фазы 3 (smart error analysis).

### 3.3. Полный цикл тестирования

```
[Generate] → [Credential Check] → [Inject Webhook] → [Deploy via API] → [Activate] → [Call Webhook] → [Poll executions] → [Show results] → [Cleanup]
```

**Шаг 1: Credential Check** — анализируем `node.credentials` в JSON, сверяем с `GET /api/v1/credentials`. Auto-match или предупреждение.

**Шаг 2: Prepare** — берём сгенерированный workflow, добавляем Webhook-триггер + настраиваем `responseMode: 'lastNode'` для синхронного ответа.

**Шаг 3: Deploy** — создаём workflow через `POST /api/v1/workflows`, получаем ID.

**Шаг 4: Activate** — активируем через `POST /api/v1/workflows/{id}/activate` (webhook регистрируется только у активных workflow).

**Шаг 5: Execute** — вызываем webhook URL: `POST {n8nBaseUrl}/webhook/{webhookPath}`. Ждём синхронного ответа. Fallback — poll `GET /api/v1/executions?workflowId={id}`.

**Шаг 6: Report** — показываем результат: ✅ success / ❌ error + детали по нодам.

**Шаг 7: Cleanup** — деактивируем и удаляем тестовый workflow. Если cleanup не удался — логируем, показываем предупреждение.

---

## 4. Webhook Injection — детали реализации

### 4.1. Алгоритм определения trigger-ноды

В `lib/workflow-validator.js:10-21` уже определён массив `TRIGGER_TYPES`. Используем его же для нахождения существующего триггера:

```javascript
// Импортируем из validator или дублируем
const TRIGGER_TYPES = [
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.cronTrigger',
  'n8n-nodes-base.emailTrigger',
  'n8n-nodes-base.errorTrigger',
  'n8n-nodes-base.workflowTrigger',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.chatTrigger',
];

function findTriggerNode(nodes) {
  return nodes.find(node =>
    TRIGGER_TYPES.includes(node.type)
    || (node.type && node.type.toLowerCase().includes('trigger'))
  );
}
```

### 4.2. Webhook injection logic

```javascript
// В lib/n8n-client.js

import { uuid } from './utils.js';

/**
 * Подготовить workflow для тестирования.
 * Добавляет Webhook-триггер, возвращает модифицированный workflow и webhookPath.
 */
export function prepareTestWorkflow(workflowData) {
  const testWebhookPath = `n8n-pilot-test-${uuid().slice(0, 8)}`;
  const workflow = JSON.parse(JSON.stringify(workflowData)); // deep clone

  // Webhook-триггер для тестирования
  const webhookNode = {
    id: uuid(),
    name: 'n8n Pilot Test Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300], // Будет скорректирована ниже
    parameters: {
      path: testWebhookPath,
      httpMethod: 'POST',
      responseMode: 'lastNode', // Синхронный ответ — ждёт всю цепочку
    },
    webhookId: uuid(),
  };

  const existingTrigger = findTriggerNode(workflow.nodes);

  if (existingTrigger) {
    if (existingTrigger.type === 'n8n-nodes-base.webhook') {
      // Workflow уже имеет webhook — используем его path
      const existingPath = existingTrigger.parameters?.path;
      if (existingPath) {
        // Убедимся что responseMode = lastNode для синхронного ответа
        existingTrigger.parameters.responseMode = 'lastNode';
        return {
          workflow,
          webhookPath: existingPath,
          reusedExistingWebhook: true,
        };
      }
    }

    // Для других типов триггеров — заменяем на webhook
    webhookNode.position = [...existingTrigger.position];

    // Переключаем connections: заменяем имя триггера на имя webhook-ноды
    const triggerName = existingTrigger.name;
    const connections = workflow.connections;

    // Outgoing connections от триггера → переносим на webhook
    if (connections[triggerName]) {
      connections[webhookNode.name] = connections[triggerName];
      delete connections[triggerName];
    }

    // Удаляем старый триггер, добавляем webhook
    workflow.nodes = workflow.nodes.filter(n => n.id !== existingTrigger.id);
    workflow.nodes.unshift(webhookNode);
  } else {
    // Нет триггера — вставляем webhook перед первой нодой
    if (workflow.nodes.length > 0) {
      const firstNode = workflow.nodes[0];
      webhookNode.position = [firstNode.position[0] - 300, firstNode.position[1]];

      // Создаём connection от webhook к первой ноде
      workflow.connections[webhookNode.name] = {
        main: [[{ node: firstNode.name, type: 'main', index: 0 }]],
      };
    } else {
      webhookNode.position = [250, 300];
    }
    workflow.nodes.unshift(webhookNode);
  }

  // Имя workflow для тестирования
  workflow.name = `[TEST] ${workflow.name || 'Untitled'}`;

  return {
    workflow,
    webhookPath: testWebhookPath,
    reusedExistingWebhook: false,
  };
}
```

---

## 5. Обработка Credentials

### 5.1. Динамическое определение (без hardcoded маппинга)

> **ВАЖНО:** Не используем статический `NODE_CREDENTIAL_MAP`.
> Вместо этого парсим `node.credentials` прямо из workflow JSON.

В n8n workflow JSON каждая нода, требующая credentials, содержит поле:

```json
{
  "type": "n8n-nodes-base.telegram",
  "credentials": {
    "telegramApi": {        // ← credentialTypeName
      "id": "5",            // ← credentialId (если уже привязан)
      "name": "My Bot"      // ← credentialName
    }
  }
}
```

**Алгоритм:**

1. Проходим по `workflow.nodes` — собираем все `node.credentials` → извлекаем `credentialTypeName`
2. Запрашиваем `GET /api/v1/credentials` → получаем список `{ id, name, type }` из n8n
3. Для каждого требуемого `credentialTypeName`:
   - Если credential уже привязан в JSON (есть `id`) → проверяем что он существует в n8n
   - Если credential не привязан → ищем в n8n по `type`
   - Если найден ровно один → auto-match
   - Если найдено несколько → конфликт (предлагаем выбор)
   - Если не найден → missing (показываем инструкцию)
4. Ноды без поля `credentials` — не требуют credentials (webhook, set, if, etc.)

### 5.2. Реализация

```javascript
// В lib/n8n-client.js

/**
 * Сопоставить credentials workflow с доступными в n8n.
 * Парсит node.credentials из workflow JSON, сверяет с GET /api/v1/credentials.
 *
 * @param {Object} workflow — workflow JSON (nodes[].credentials)
 * @returns {{ matched, missing, conflicts }}
 */
export async function matchCredentials(workflow) {
  // 1. Получить список credentials из n8n
  const credentialsResponse = await request('GET', '/credentials');
  const availableCredentials = credentialsResponse?.data || [];

  const matched = [];
  const missing = [];
  const conflicts = [];

  // 2. Пройтись по нодам
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;

    for (const [credTypeName, credRef] of Object.entries(node.credentials)) {
      // Если credential уже привязан с ID — проверяем существование
      if (credRef.id) {
        const exists = availableCredentials.some(c =>
          String(c.id) === String(credRef.id) && c.type === credTypeName
        );
        if (exists) {
          matched.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            credentialType: credTypeName,
            credentialId: credRef.id,
            credentialName: credRef.name,
          });
          continue;
        }
        // ID не найден — будем искать по типу
      }

      // Ищем по типу
      const candidates = availableCredentials.filter(c => c.type === credTypeName);

      if (candidates.length === 1) {
        // Auto-match
        matched.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          credentialType: credTypeName,
          credentialId: String(candidates[0].id),
          credentialName: candidates[0].name,
        });
      } else if (candidates.length > 1) {
        // Конфликт — пользователь должен выбрать
        conflicts.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          credentialType: credTypeName,
          options: candidates.map(c => ({
            id: String(c.id),
            name: c.name,
          })),
        });
      } else {
        // Credential не найден
        missing.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          credentialType: credTypeName,
        });
      }
    }
  }

  return { matched, missing, conflicts };
}

/**
 * Применить matched credentials к workflow.
 * Устанавливает credentialId и credentialName в node.credentials.
 */
export function applyCredentials(workflow, matched) {
  const wf = JSON.parse(JSON.stringify(workflow));

  for (const match of matched) {
    const node = wf.nodes.find(n => n.id === match.nodeId);
    if (node && node.credentials && node.credentials[match.credentialType]) {
      node.credentials[match.credentialType] = {
        id: match.credentialId,
        name: match.credentialName,
      };
    }
  }

  return wf;
}
```

### 5.3. Ноды, которые НЕ требуют credentials

Следующие ноды не имеют поля `credentials` в JSON (определяется автоматически):
- `n8n-nodes-base.webhook` — входной триггер
- `n8n-nodes-base.set` / `n8n-nodes-base.code` — трансформация данных
- `n8n-nodes-base.if` / `n8n-nodes-base.switch` — условия
- `n8n-nodes-base.noOp` — no-op
- `n8n-nodes-base.httpRequest` — может работать БЕЗ credentials (для публичных API)

Если `httpRequest` имеет `node.credentials` (например, `httpBasicAuth`) — обрабатываем по общему алгоритму. Если `credentials` отсутствует — игнорируем.

---

## 6. Конфигурация разработки

### 6.1. .env.example

Файл `.env.example` уже создан в корне проекта:

```bash
# n8n Pilot — Development Configuration
# Copy to .env and fill in your values
# .env is in .gitignore — never committed

# n8n Instance
N8N_BASE_URL=https://your-n8n-instance.com
N8N_API_KEY=your-n8n-api-key

# Claude API
CLAUDE_API_KEY=sk-ant-api03-your-key

# Testing (used by E2E tests with mock servers)
TEST_N8N_URL=http://localhost:5678
TEST_N8N_API_KEY=test-api-key
TEST_CLAUDE_API_KEY=test-claude-key
```

Файл `.env` уже в `.gitignore`. Расширение хранит credentials зашифрованными в `chrome.storage.local` (AES-256-GCM через Web Crypto API). `.env` нужен **только для разработки и тестов**.

### 6.2. База данных

**Не нужна.** `chrome.storage.local` покрывает все потребности:
- Settings + encrypted API keys → `lib/settings.js` (уже есть)
- History → `lib/history.js` (уже есть, паттерн для `test-results.js`)
- Test results → добавим в `chrome.storage.local` (аналогично history)
- Workflow versions → `lib/versions.js` (уже есть)

Лимит `chrome.storage.local` = 10MB, это более чем достаточно для сотен тестов.

---

## 7. Изменения по файлам — точки вставки

### 7.1. `lib/n8n-client.js` — новые методы

**Файл:** 197 строк. Текущая структура:
- L1-57: `request()` helper (15s timeout, `X-N8N-API-KEY` header)
- L59-95: Workflows CRUD (`listWorkflows`, `getWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `activateWorkflow`, `deactivateWorkflow`)
- L97-116: Executions (`listExecutions`, `getExecution`, `deleteExecution`)
- L118-134: Variables
- L136-150: Tags, Credentials
- L152-197: `testConnection()`

**Точка вставки:** после L150 (после `listCredentials`), перед `testConnection()`.

**Добавить новый import** в начало файла (L6):
```javascript
import { uuid, sleep } from './utils.js';
```

**Новые экспортируемые функции:**

```javascript
// === Workflow Testing ===

/**
 * Подготовить workflow для тестирования (webhook injection).
 * @param {Object} workflowData — оригинальный workflow JSON
 * @returns {{ workflow, webhookPath, reusedExistingWebhook }}
 */
export function prepareTestWorkflow(workflowData) { /* см. секцию 4.2 */ }

/**
 * Сопоставить credentials workflow с доступными в n8n.
 * @param {Object} workflow — workflow JSON
 * @returns {{ matched, missing, conflicts }}
 */
export async function matchCredentials(workflow) { /* см. секцию 5.2 */ }

/**
 * Применить matched credentials к workflow.
 * @param {Object} workflow — workflow JSON
 * @param {Array} matched — результат matchCredentials().matched
 * @returns {Object} — workflow с установленными credential IDs
 */
export function applyCredentials(workflow, matched) { /* см. секцию 5.2 */ }

/**
 * Вызвать webhook для запуска workflow.
 * @param {string} webhookPath — path из prepareTestWorkflow()
 * @param {Object} data — payload для webhook (default: {})
 * @param {number} timeout — timeout в ms (default: 30000)
 * @returns {Object} — ответ webhook
 */
export async function callWebhook(webhookPath, data = {}, timeout = 30_000) {
  const baseUrl = await settings.get('n8nBaseUrl');
  if (!baseUrl) throw new Error('n8n base URL not configured');

  const url = `${baseUrl.replace(/\/+$/, '')}/webhook/${webhookPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    const responseText = await response.text();

    // Webhook может вернуть не-JSON (если lastNode возвращает текст)
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: responseData,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Ждать появления execution для workflow (polling).
 *
 * Стратегия корреляции: correlationId
 * ------------------------------------
 * Webhook body содержит `{ __n8nPilotCorrelationId: "<uuid>" }`.
 * Тестовый workflow имеет Code node в начале, который копирует correlationId
 * в execution metadata. При polling ищем execution по этому ID.
 *
 * Fallback: если correlationId не найден в execution data, используем
 * workflowId + afterTimestamp (менее надёжно при параллельных запусках).
 *
 * @param {string} workflowId — ID workflow в n8n
 * @param {Object} options
 * @param {number} options.timeout — макс. ожидание (default: 60000)
 * @param {number} options.interval — интервал polling (default: 2000)
 * @param {string} options.correlationId — UUID для точного match execution
 * @param {string} options.afterTimestamp — fallback: искать executions после ISO timestamp
 * @returns {Object|null} — execution result или null если timeout
 */
export async function waitForExecution(workflowId, {
  timeout = 60_000,
  interval = 2_000,
  correlationId = null,
  afterTimestamp = null,
} = {}) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await listExecutions({ workflowId, limit: 10 });
    const executions = result?.data || [];

    // Стратегия 1: точный match по correlationId в execution data
    let match = null;
    if (correlationId) {
      match = executions.find(ex => {
        // correlationId хранится в первом node output → $json.__n8nPilotCorrelationId
        const firstNodeData = ex.data?.resultData?.runData;
        if (!firstNodeData) return false;
        const firstNode = Object.values(firstNodeData)[0];
        return firstNode?.[0]?.data?.main?.[0]?.[0]?.json?.__n8nPilotCorrelationId === correlationId;
      });
    }

    // Стратегия 2 (fallback): по afterTimestamp
    if (!match && afterTimestamp) {
      match = executions.find(ex => {
        if (ex.startedAt) {
          return new Date(ex.startedAt) > new Date(afterTimestamp);
        }
        return false;
      });
    }

    if (match && (match.status === 'success' || match.status === 'error')) {
      return getExecution(match.id);
    }

    await sleep(interval);
  }

  return null; // timeout
}

/**
 * Полный цикл тестирования: prepare → credential check → deploy → activate → call → poll → cleanup.
 * @param {Object} workflowData — оригинальный workflow JSON
 * @param {Object} options
 * @param {number} options.timeout — timeout для выполнения (default: 60000)
 * @param {boolean} options.cleanup — удалять тестовый workflow после теста (default: true)
 * @param {Array} options.resolvedCredentials — resolved conflicts от пользователя
 * @returns {{ success, execution, duration, error, nodeResults, credentialStatus }}
 */
export async function testWorkflow(workflowData, {
  timeout = 60_000,
  cleanup = true,
  resolvedCredentials = [],
} = {}) {
  const startTime = Date.now();
  let deployedWorkflowId = null;

  try {
    // 1. Credential check
    const credStatus = await matchCredentials(workflowData);

    if (credStatus.missing.length > 0) {
      return {
        success: false,
        execution: null,
        duration: Date.now() - startTime,
        error: `Missing credentials: ${credStatus.missing.map(m => `${m.nodeName} needs "${m.credentialType}"`).join(', ')}`,
        nodeResults: [],
        credentialStatus: credStatus,
      };
    }

    if (credStatus.conflicts.length > 0 && resolvedCredentials.length === 0) {
      return {
        success: false,
        execution: null,
        duration: Date.now() - startTime,
        error: 'credential_conflict',
        nodeResults: [],
        credentialStatus: credStatus,
      };
    }

    // 2. Apply credentials
    const allMatched = [...credStatus.matched, ...resolvedCredentials];
    let workflow = applyCredentials(workflowData, allMatched);

    // 3. Prepare (webhook injection)
    const prepared = prepareTestWorkflow(workflow);
    workflow = prepared.workflow;
    const webhookPath = prepared.webhookPath;

    // 4. Deploy
    const deployed = await createWorkflow(workflow);
    deployedWorkflowId = deployed.id;

    // 5. Activate
    await activateWorkflow(deployedWorkflowId);

    // 6. Execute via webhook with correlationId
    const correlationId = uuid();
    const beforeExec = new Date().toISOString();

    let webhookResult;
    try {
      webhookResult = await callWebhook(webhookPath, { __n8nPilotCorrelationId: correlationId }, 30_000);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Webhook timeout — fallback to polling
        webhookResult = null;
      } else {
        throw err;
      }
    }

    // 7. Get execution details (correlationId primary, afterTimestamp fallback)
    let execution;
    if (webhookResult && webhookResult.ok) {
      // Синхронный ответ получен — но всё равно получим execution для nodeResults
      execution = await waitForExecution(deployedWorkflowId, {
        timeout: 15_000,
        interval: 1_000,
        correlationId,
        afterTimestamp: beforeExec,
      });
    } else {
      // Polling (асинхронный workflow или webhook timeout)
      execution = await waitForExecution(deployedWorkflowId, {
        timeout,
        interval: 2_000,
        correlationId,
        afterTimestamp: beforeExec,
      });
    }

    if (!execution) {
      return {
        success: false,
        execution: null,
        duration: Date.now() - startTime,
        error: 'Execution timeout — workflow may still be running in n8n',
        nodeResults: [],
        credentialStatus: credStatus,
      };
    }

    // 8. Parse results
    const nodeResults = parseNodeResults(execution);
    const success = execution.status === 'success';

    return {
      success,
      execution,
      duration: Date.now() - startTime,
      error: success ? null : extractExecutionError(execution),
      nodeResults,
      credentialStatus: credStatus,
    };

  } finally {
    // 9. Cleanup
    if (cleanup && deployedWorkflowId) {
      try {
        await deactivateWorkflow(deployedWorkflowId);
        await deleteWorkflow(deployedWorkflowId);
      } catch (cleanupErr) {
        console.warn('Test cleanup failed:', cleanupErr.message);
        // Не кидаем — основной результат важнее
      }
    }
  }
}

// --- Helper functions (not exported) ---

function findTriggerNode(nodes) {
  const TRIGGER_TYPES = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.cronTrigger',
    'n8n-nodes-base.emailTrigger',
    'n8n-nodes-base.errorTrigger',
    'n8n-nodes-base.workflowTrigger',
    'n8n-nodes-base.formTrigger',
    'n8n-nodes-base.chatTrigger',
  ];
  return nodes.find(node =>
    TRIGGER_TYPES.includes(node.type)
    || (node.type && node.type.toLowerCase().includes('trigger'))
  );
}

function parseNodeResults(execution) {
  if (!execution?.data?.resultData?.runData) return [];

  const runData = execution.data.resultData.runData;
  return Object.entries(runData).map(([nodeName, nodeRuns]) => {
    const lastRun = nodeRuns[nodeRuns.length - 1];
    return {
      name: nodeName,
      status: lastRun?.error ? 'error' : 'success',
      data: lastRun?.data?.main?.[0]?.[0]?.json || null,
      error: lastRun?.error?.message || null,
      executionTime: lastRun?.executionTime || 0,
    };
  });
}

function extractExecutionError(execution) {
  if (!execution?.data?.resultData) return 'Unknown error';

  const lastError = execution.data.resultData.error;
  if (lastError) return lastError.message || String(lastError);

  // Ищем ошибку в нодах
  const runData = execution.data.resultData.runData || {};
  for (const [nodeName, nodeRuns] of Object.entries(runData)) {
    const lastRun = nodeRuns[nodeRuns.length - 1];
    if (lastRun?.error) {
      return `Node "${nodeName}": ${lastRun.error.message || 'Unknown error'}`;
    }
  }

  return 'Workflow execution failed';
}
```

**Timeout стратегия:**
- Webhook call: 30s timeout (для синхронного ответа)
- Execution polling: 60s timeout (fallback если webhook не вернул результат)
- Deploy/activate: стандартный 15s timeout (уже есть в `request()`)

### 7.2. `lib/test-results.js` — новый модуль

**Паттерн:** копия `lib/history.js` (строки 1-116) — та же архитектура: STORAGE_KEY, FIFO лимит, chrome.storage.local.

```javascript
/**
 * n8n Pilot — Workflow Test Results
 * Stores test execution results locally.
 * Pattern: identical to lib/history.js
 */

import { uuid, now } from './utils.js';

const STORAGE_KEY = 'n8nPilotTestResults';
const MAX_RESULTS = 50;

/**
 * Save a test result.
 * @param {Object} result
 * @returns {Object} — saved entry with id and timestamp
 */
export async function save(result) {
  const results = await loadResults();

  const entry = {
    id: uuid(),
    timestamp: now(),
    workflowName: result.workflowName || 'Untitled',
    prompt: result.prompt || '',
    success: result.success || false,
    duration: result.duration || 0,
    nodesExecuted: result.nodeResults?.length || 0,
    nodeResults: result.nodeResults || [],
    error: result.error || null,
    testWorkflowId: result.testWorkflowId || null,
    credentialStatus: result.credentialStatus || null,
  };

  results.unshift(entry);

  // Enforce FIFO limit
  while (results.length > MAX_RESULTS) {
    results.pop();
  }

  await saveResults(results);
  return entry;
}

/**
 * Get results, optionally filtered by workflowName.
 */
export async function list({ limit, offset, workflowName } = {}) {
  let results = await loadResults();

  if (workflowName) {
    const q = workflowName.toLowerCase();
    results = results.filter(r =>
      r.workflowName && r.workflowName.toLowerCase().includes(q)
    );
  }

  const start = offset || 0;
  const end = limit ? start + limit : undefined;
  return results.slice(start, end);
}

/**
 * Get a single result by ID.
 */
export async function get(id) {
  const results = await loadResults();
  return results.find(r => r.id === id) || null;
}

/**
 * Clear all results.
 */
export async function clear() {
  await saveResults([]);
}

/**
 * Get total count.
 */
export async function count() {
  const results = await loadResults();
  return results.length;
}

// --- Internal ---

async function loadResults() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveResults(results) {
  await chrome.storage.local.set({ [STORAGE_KEY]: results });
}
```

### 7.3. `background.js` — новые обработчики сообщений

**Файл:** 337 строк. Текущая структура:
- L1-12: imports (`settings`, `claudeClient`, `n8nClient`, `generator`, `history`, `versions`)
- L14: `let generationController = null;`
- L18-52: Lifecycle + tab monitoring
- L54-60: Message router (`handleMessage`)
- L62-336: `handleMessage()` — большой switch с ~30 case блоками
- L333: `default: return { error: 'Unknown action' };`

**Точка вставки imports (L12):**
```javascript
import * as testResults from './lib/test-results.js';
```

**Точка вставки case блоков (L332, перед `default:`):**

```javascript
    // === Workflow Testing ===
    case 'testWorkflow': {
      const result = await n8nClient.testWorkflow(msg.workflow, {
        timeout: msg.options?.timeout || 60000,
        cleanup: msg.options?.cleanup !== false,
        resolvedCredentials: msg.options?.resolvedCredentials || [],
      });

      // Сохраняем результат
      await testResults.save({
        workflowName: msg.workflow?.name || 'Untitled',
        prompt: msg.prompt || '',
        success: result.success,
        duration: result.duration,
        nodeResults: result.nodeResults,
        error: result.error,
        credentialStatus: result.credentialStatus,
      });

      return result;
    }

    case 'checkCredentials': {
      return n8nClient.matchCredentials(msg.workflow);
    }

    case 'getTestResults': {
      return testResults.list(msg.options || {});
    }

    case 'clearTestResults': {
      await testResults.clear();
      return { success: true };
    }
```

### 7.4. `panel/panel.html` — кнопка Test + секция результатов

> **Architecture note (v3.1):** После архитектурного pivot popup→panel, все UI-элементы
> тестирования размещаются внутри injected side panel (Shadow DOM). Элементы доступны
> через `shadowRoot.getElementById()` в panel/chat.js.

**Контекст:** panel.html — основной HTML-шаблон панели, загружаемый в Shadow DOM.
Секция тестирования встраивается в workflow card (после кнопок Copy/Inject/Save).

**Кнопка Test в workflow card:**

```html
<button id="btnTestOutput" class="btn btn-primary btn-small" title="Deploy & test workflow">▶ Test</button>
```

**Секция результатов теста (внутри workflow card):**

```html
<!-- Test Results Section -->
<div id="test-section" class="test-section hidden">
  <!-- Progress -->
  <div id="test-progress" class="test-progress hidden">
    <span class="spinner"></span>
    <span id="test-progress-text" class="test-progress-text">Preparing test...</span>
  </div>

  <!-- Credential Conflict Dialog -->
  <div id="test-credential-dialog" class="test-credential-dialog hidden">
    <p class="test-cred-message"></p>
    <div id="test-credential-options" class="test-credential-options"></div>
    <button id="btnTestCredentialConfirm" class="btn btn-primary btn-small">Continue</button>
  </div>

  <!-- Result Card -->
  <div id="test-result-card" class="test-result-card hidden">
    <div class="test-result-header">
      <span id="test-status-icon" class="test-status-icon"></span>
      <span id="test-summary" class="test-summary"></span>
    </div>
    <div id="test-node-log" class="test-node-log"></div>
    <div class="test-actions">
      <button id="btnTestRerun" class="btn btn-secondary btn-small">Rerun</button>
      <button id="btnTestFix" class="btn btn-primary btn-small hidden">Fix & Retest</button>
    </div>
  </div>
</div>
```

### 7.5. `panel/chat.js` — логика тестирования

> **Architecture note (v3.1):** Логика тестирования мигрирует из popup.js в panel/chat.js.
> DOM-доступ через `shadowRoot.getElementById()`. Сообщения в background.js через `msg()`.

**Модульная переменная:**
```javascript
let lastTestResult = null;
```

**Инициализация (в setup-функции chat.js):**
```javascript
  const testBtn = $('btnTestOutput');
  const testRerunBtn = $('btnTestRerun');
  const testFixBtn = $('btnTestFix');

  if (testBtn) testBtn.addEventListener('click', testCurrentWorkflow);
  if (testRerunBtn) testRerunBtn.addEventListener('click', testCurrentWorkflow);
  if (testFixBtn) testFixBtn.addEventListener('click', fixAndRetest);
```

**Функции тестирования (в panel/chat.js):**

```javascript
// ============================================================================
// WORKFLOW TESTING
// ============================================================================

async function testCurrentWorkflow() {
  if (!currentWorkflow) {
    alert('Please generate a workflow first');
    return;
  }

  const testSection = $('test-section');
  const testProgress = $('test-progress');
  const testProgressText = $('test-progress-text');
  const testResultCard = $('test-result-card');
  const testCredDialog = $('test-credential-dialog');

  // Show section, hide previous results
  if (testSection) testSection.classList.remove('hidden');
  if (testResultCard) testResultCard.classList.add('hidden');
  if (testCredDialog) testCredDialog.classList.add('hidden');
  if (testProgress) testProgress.classList.remove('hidden');

  try {
    // Step 1: Check credentials
    updateTestProgress('Checking credentials...');
    const credCheck = await msg('checkCredentials', { workflow: currentWorkflow });

    if (credCheck.missing && credCheck.missing.length > 0) {
      showTestResult('error', {
        summary: 'Missing credentials',
        details: credCheck.missing.map(m =>
          `${m.nodeName} needs "${m.credentialType}" — create it in n8n Settings → Credentials`
        ).join('\n'),
      });
      return;
    }

    // Handle credential conflicts (ask user to choose)
    let resolvedCredentials = [];
    if (credCheck.conflicts && credCheck.conflicts.length > 0) {
      resolvedCredentials = await showCredentialDialog(credCheck.conflicts);
      if (!resolvedCredentials) return; // User cancelled
    }

    // Step 2: Deploy & test
    updateTestProgress('Deploying workflow...');

    const result = await msg('testWorkflow', {
      workflow: currentWorkflow,
      prompt: ($('prompt') || {}).value || '',
      options: {
        timeout: 60000,
        cleanup: true,
        resolvedCredentials,
      },
    });

    lastTestResult = result;

    if (result.success) {
      const nodesCount = result.nodeResults?.length || 0;
      const duration = (result.duration / 1000).toFixed(1);
      showTestResult('success', {
        summary: `${nodesCount} nodes executed in ${duration}s`,
        nodeResults: result.nodeResults,
      });
    } else {
      showTestResult('error', {
        summary: result.error || 'Unknown error',
        nodeResults: result.nodeResults,
      });
    }

  } catch (err) {
    showTestResult('error', { summary: err.message });
  }
}

function updateTestProgress(text) {
  const el = $('test-progress-text');
  if (el) el.textContent = text;
}

function showTestResult(status, data) {
  const testProgress = $('test-progress');
  const testResultCard = $('test-result-card');
  const statusIcon = $('test-status-icon');
  const summaryEl = $('test-summary');
  const nodeLog = $('test-node-log');
  const fixBtn = $('btnTestFix');

  if (testProgress) testProgress.classList.add('hidden');
  if (testResultCard) testResultCard.classList.remove('hidden');

  if (statusIcon) {
    statusIcon.textContent = status === 'success' ? '✓' : '✗';
    statusIcon.className = `test-status-icon test-status-${status}`;
  }
  if (summaryEl) {
    summaryEl.textContent = data.summary || '';
  }

  // Node execution log
  if (nodeLog && data.nodeResults && data.nodeResults.length > 0) {
    nodeLog.innerHTML = data.nodeResults.map(nr => {
      const icon = nr.status === 'success' ? '✓' : '✗';
      const cls = `node-result node-result-${nr.status}`;
      const time = nr.executionTime ? ` (${nr.executionTime}ms)` : '';
      const errorText = nr.error ? `<span class="node-error">${escapeHtml(nr.error)}</span>` : '';
      return `<div class="${cls}"><span class="node-icon">${icon}</span> ${escapeHtml(nr.name)}${time}${errorText}</div>`;
    }).join('');
  } else if (nodeLog && data.details) {
    nodeLog.textContent = data.details;
  } else if (nodeLog) {
    nodeLog.innerHTML = '';
  }

  // Show Fix button on error (Фаза 3 — пока hidden)
  if (fixBtn) {
    fixBtn.classList.toggle('hidden', status === 'success');
  }
}

function showCredentialDialog(conflicts) {
  return new Promise((resolve) => {
    const dialog = $('test-credential-dialog');
    const optionsContainer = $('test-credential-options');
    const confirmBtn = $('btnTestCredentialConfirm');

    if (!dialog || !optionsContainer) {
      resolve(null);
      return;
    }

    const testProgress = $('test-progress');
    if (testProgress) testProgress.classList.add('hidden');
    dialog.classList.remove('hidden');

    // Render credential selectors
    optionsContainer.innerHTML = conflicts.map(conflict => {
      const options = conflict.options.map(opt =>
        `<option value="${escapeHtml(opt.id)}">${escapeHtml(opt.name)}</option>`
      ).join('');
      return `
        <div class="cred-select-group">
          <label>${escapeHtml(conflict.nodeName)} (${escapeHtml(conflict.credentialType)})</label>
          <select class="select-input select-sm" data-node-id="${conflict.nodeId}"
                  data-cred-type="${escapeHtml(conflict.credentialType)}">
            ${options}
          </select>
        </div>
      `;
    }).join('');

    // Confirm handler
    const handler = () => {
      confirmBtn.removeEventListener('click', handler);
      dialog.classList.add('hidden');

      const selects = optionsContainer.querySelectorAll('select');
      const resolved = Array.from(selects).map(sel => ({
        nodeId: sel.dataset.nodeId,
        credentialType: sel.dataset.credType,
        credentialId: sel.value,
        credentialName: sel.options[sel.selectedIndex]?.textContent || '',
      }));

      resolve(resolved);
    };

    confirmBtn.addEventListener('click', handler);
  });
}

async function fixAndRetest() {
  // Фаза 3: Smart error analysis через Claude API
  // TODO: implement in Phase 3
  alert('Fix & Retest will be available in a future version');
}
```

**Инициализация:** тест-кнопки инициализируются при создании workflow card в chat.js (не требуется отдельный init).

### 7.6. `panel/panel.css` — стили для тест-результатов

> **Architecture note (v3.1):** Стили мигрируют из popup.css в panel/panel.css.
> CSS custom properties объявляются в `:host` (Shadow DOM), не в `:root`.

**CSS custom properties (`:host`):**
- Colors: `--color-success: #37c896`, `--color-error: #ff5c5c`, `--color-warning: #ffc947`, `--color-info: #5ba8ff`
- Spacing: `--spacing-xs: 4px`, `--spacing-sm: 8px`, `--spacing-md: 12px`, `--spacing-lg: 16px`
- Transitions: `--transition-fast: 150ms ease-out`

**Все новые стили ДОЛЖНЫ использовать CSS custom properties** (не хардкодить цвета).

**Точка вставки:** в конец panel.css.

```css
/* ============================================================
   Workflow Testing
   ============================================================ */

.test-section {
    margin-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
    padding-top: var(--spacing-md);
}

/* Progress */
.test-progress {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-bg-tertiary);
    border-radius: 6px;
}

.test-progress-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
}

/* Result Card */
.test-result-card {
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    padding: var(--spacing-md);
    border-left: 3px solid var(--color-border);
}

.test-result-card:has(.test-status-success) {
    border-left-color: var(--color-success);
}

.test-result-card:has(.test-status-error) {
    border-left-color: var(--color-error);
}

.test-result-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
}

.test-status-icon {
    font-weight: bold;
    font-size: var(--font-size-lg);
}

.test-status-success {
    color: var(--color-success);
}

.test-status-error {
    color: var(--color-error);
}

.test-summary {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
}

/* Node Log */
.test-node-log {
    margin-top: var(--spacing-sm);
    font-size: var(--font-size-xs);
}

.node-result {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
    padding: 2px 0;
    color: var(--color-text-secondary);
}

.node-result-success .node-icon {
    color: var(--color-success);
}

.node-result-error .node-icon {
    color: var(--color-error);
}

.node-error {
    color: var(--color-error);
    font-size: var(--font-size-xs);
    margin-left: var(--spacing-xs);
}

/* Test Actions */
.test-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
}

/* Credential Dialog */
.test-credential-dialog {
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    padding: var(--spacing-md);
    border-left: 3px solid var(--color-warning);
}

.test-cred-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-sm);
}

.cred-select-group {
    margin-bottom: var(--spacing-sm);
}

.cred-select-group label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-xs);
}
```

### 7.7. `lib/workflow-generator.js` — анализ ошибок (Фаза 3)

**Файл:** 270 строк. Текущие функции: `generate()`, `modify()`, `explain()`.

**Фаза 3. Точка вставки:** после `explain()` (конец файла).

```javascript
/**
 * Analyze workflow execution error via Claude API.
 * @param {Object} options
 * @param {Object} options.workflow — оригинальный workflow JSON
 * @param {Object} options.execution — execution data от n8n
 * @param {string} options.error — текст ошибки
 * @param {string} options.apiKey — Claude API key
 * @param {string} options.model — Claude model
 * @returns {{ diagnosis, fix, fixedWorkflow, confidence }}
 */
export async function analyzeError({ workflow, execution, error, apiKey, model }) {
  const prompt = `Analyze this n8n workflow execution error and suggest a fix.

Error: ${error}

Workflow JSON:
${JSON.stringify(workflow, null, 2)}

Execution data:
${JSON.stringify(execution?.data?.resultData || {}, null, 2)}

Return JSON:
{
  "diagnosis": "what went wrong",
  "fix": "how to fix it",
  "fixedWorkflow": { /* corrected workflow JSON, or null if auto-fix not possible */ },
  "confidence": 0.8 /* 0-1, how confident are you */
}`;

  const result = await claude.sendMessage({
    messages: [{ role: 'user', content: prompt }],
    model: model || 'claude-sonnet-4-5-20250929',
    apiKey,
    maxTokens: 4096,
  });

  return extractJson(result.content);
}
```

---

## 8. Тестирование

### 8.1. Unit тесты — новые файлы

**Фреймворк:** Vitest. **Setup:** `tests/unit/setup.js` (91 строк) — Chrome API mocks с in-memory storage.

**Паттерн тестов:** `beforeEach(() => { storageData = {}; vi.clearAllMocks(); })` — каждый тест начинает с чистого состояния.

#### `tests/unit/n8n-client-execute.test.js` (~35 тестов)

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setStorageData } from './setup.js';

// Mock settings module
vi.mock('../../lib/settings.js', () => ({
  get: vi.fn(async (key) => {
    if (key === 'n8nBaseUrl') return 'http://localhost:5678';
    return null;
  }),
  getApiKey: vi.fn(async () => 'test-api-key'),
}));

describe('prepareTestWorkflow', () => {
  // 1. Webhook injection — workflow без триггера
  // 2. Webhook injection — workflow с scheduleTrigger → замена
  // 3. Webhook injection — workflow с существующим webhook → reuse
  // 4. Webhook injection — workflow с manualTrigger → замена
  // 5. Connections переключаются при замене триггера
  // 6. Workflow name получает префикс [TEST]
  // 7. webhookPath генерируется уникальный
  // 8. Deep clone — оригинал не мутируется
});

describe('matchCredentials', () => {
  // 9. Нода без credentials → не попадает в результат
  // 10. Credential с ID — существует в n8n → matched
  // 11. Credential с ID — не существует → fallback поиск по типу
  // 12. Credential без ID — один кандидат → auto-match
  // 13. Credential без ID — несколько кандидатов → conflict
  // 14. Credential без ID — нет кандидатов → missing
  // 15. Несколько нод с разными credential types
  // 16. Два credentials одного типа в разных нодах
});

describe('applyCredentials', () => {
  // 17. Устанавливает credentialId и name
  // 18. Не мутирует оригинальный workflow
  // 19. Игнорирует ноды без credentials
});

describe('callWebhook', () => {
  // 20. Успешный вызов → возвращает data
  // 21. Ошибка HTTP → ok: false + status
  // 22. Timeout → AbortError
  // 23. Не-JSON ответ → raw field
  // 24. Корректный URL (trailing slash handled)
});

describe('waitForExecution', () => {
  // 25. Находит execution по correlationId (primary strategy)
  // 26. Polling — несколько попыток до success
  // 27. Timeout → возвращает null
  // 28. Execution в статусе 'error' → тоже возвращает
  // 29. Fallback: afterTimestamp когда correlationId не найден
  // 29a. Игнорирует executions до afterTimestamp (fallback)
  // 29b. correlationId match приоритетнее afterTimestamp
});

describe('testWorkflow', () => {
  // 30. Полный цикл success
  // 31. Missing credentials → error без deploy
  // 32. Credential conflict → error с credentialStatus
  // 33. Webhook timeout → fallback polling
  // 34. Execution timeout → error
  // 35. Cleanup вызывается даже при ошибке
});
```

#### `tests/unit/test-results.test.js` (~15 тестов)

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setStorageData } from './setup.js';

describe('test-results', () => {
  // 1. save() — создаёт entry с id и timestamp
  // 2. save() — FIFO: 51-й элемент вытесняет первый (MAX_RESULTS=50)
  // 3. list() — возвращает все результаты (newest first)
  // 4. list({ limit: 5 }) — лимит
  // 5. list({ offset: 10 }) — offset
  // 6. list({ workflowName: 'test' }) — фильтрация по имени
  // 7. get(id) — возвращает конкретный результат
  // 8. get('nonexistent') — возвращает null
  // 9. clear() — очищает все результаты
  // 10. count() — возвращает количество
  // 11. save() — сохраняет все поля (success, nodeResults, etc.)
  // 12. Данные сохраняются в chrome.storage.local
  // 13. Работает с пустым хранилищем
  // 14. Несколько save() подряд — правильный порядок
  // 15. workflowName фильтрация — case-insensitive
});
```

### 8.2. E2E — обновление mock n8n сервера

**Файл:** `tests/e2e/mocks/n8n-server.js` (212 строк).

**Добавить после L136 (после `deactivate` endpoint), перед `// === Executions ===`:**

```javascript
// === Webhook (для тестирования workflow) ===

// Хранилище активных webhooks: { [webhookPath]: workflowId }
let activeWebhooks = {};

// Регистрация webhook при активации workflow
// (переопределяем activate endpoint выше)
// Уже обработан в POST /api/v1/workflows/:id/activate

app.post('/webhook/:path', (req, res) => {
  const webhookPath = req.params.path;

  // Находим активный workflow с этим webhook path
  const wf = workflows.find(w =>
    w.active && w.nodes.some(n =>
      n.type === 'n8n-nodes-base.webhook' && n.parameters?.path === webhookPath
    )
  );

  if (!wf) {
    return res.status(404).json({ message: 'Webhook not found or workflow not active' });
  }

  // Simulate execution
  const execution = {
    id: 'ex-' + Date.now(),
    workflowId: wf.id,
    status: 'success',
    startedAt: new Date().toISOString(),
    stoppedAt: new Date(Date.now() + 500).toISOString(),
    mode: 'webhook',
    data: {
      resultData: {
        runData: {},
        error: null,
      },
    },
  };

  // Simulate node execution results
  for (const node of wf.nodes) {
    execution.data.resultData.runData[node.name] = [{
      data: { main: [[{ json: { success: true, triggered: true } }]] },
      error: null,
      executionTime: Math.floor(Math.random() * 200) + 50,
    }];
  }

  executions.unshift(execution);

  // responseMode: lastNode → синхронный ответ
  const lastNode = wf.nodes[wf.nodes.length - 1];
  res.json({
    success: true,
    executionId: execution.id,
    data: execution.data.resultData.runData[lastNode?.name]?.[0]?.data?.main?.[0]?.[0]?.json || {},
  });
});
```

**Обновить данные credentials (L64-66) — добавить больше типов для тестирования:**

```javascript
let credentials = [
  { id: 'cred-001', name: 'HTTP Basic Auth', type: 'httpBasicAuth', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cred-002', name: 'My Telegram Bot', type: 'telegramApi', createdAt: '2026-02-01T00:00:00Z' },
  { id: 'cred-003', name: 'Slack Workspace', type: 'slackApi', createdAt: '2026-02-15T00:00:00Z' },
  { id: 'cred-004', name: 'Google Sheets', type: 'googleSheetsOAuth2Api', createdAt: '2026-03-01T00:00:00Z' },
];
```

### 8.3. E2E — новый spec файл

#### `tests/e2e/workflow-test.spec.js`

```
Тесты:
1. Generate → Test → Success: полный flow через mock сервер
2. Generate → Test → Credential missing: показывает ошибку
3. Generate → Test → Credential conflict: показывает выбор
4. Test без генерации: кнопка не активна
5. Test timeout handling (mock сервер задерживает ответ)
6. Cleanup: тестовый workflow удаляется после теста
```

### 8.4. Обновления существующих тестов

- `tests/unit/integration-ids.test.js` — добавить проверку новых DOM элементов: `#btnTestOutput`, `#test-section`, `#test-progress`, `#test-result-card`
- `tests/unit/kodex-regression.test.js` — добавить проверки для test flow (prepareTestWorkflow, matchCredentials)

### 8.5. Запуск тестов

```bash
npm test                           # Все unit тесты (Vitest)
npm run test:e2e                   # E2E с mock серверами (Playwright)
```

---

## 9. Обработка ошибок и edge cases

| # | Ситуация | Решение | Реализация |
|---|----------|---------|------------|
| 1 | Workflow уже имеет Webhook-триггер | Используем существующий webhook path, устанавливаем `responseMode: lastNode` | `prepareTestWorkflow()` → `reusedExistingWebhook: true` |
| 2 | Workflow с Schedule Trigger | Заменяем на Webhook-триггер, переключаем connections | `prepareTestWorkflow()` → `findTriggerNode()` + replace |
| 3 | Workflow с Manual Trigger | Заменяем на Webhook-триггер | Аналогично #2 |
| 4 | Workflow без триггера | Добавляем Webhook перед первой нодой, создаём connection | `prepareTestWorkflow()` → prepend + connection |
| 5 | Множественные trigger nodes | Заменяем ПЕРВЫЙ найденный, остальные игнорируем | `findTriggerNode()` → `Array.find()` |
| 6 | Нет нужных credentials | Показываем: «Node X needs "credType" — create it in n8n Settings → Credentials» | `matchCredentials()` → `missing[]` |
| 7 | Несколько credentials одного типа | Показываем dialog с выбором (select dropdown) | `matchCredentials()` → `conflicts[]` → `showCredentialDialog()` |
| 8 | Credential ID в JSON, но не существует в n8n | Fallback: ищем по типу. Если найден → auto-match | `matchCredentials()` → fallback logic |
| 9 | Execution timeout (>60s) | Показываем: «Execution still running» + предупреждение. Cleanup пропускает delete | `testWorkflow()` → `waitForExecution()` returns null |
| 10 | n8n не отвечает | `request()` кидает error → показываем: «n8n connection failed» | Существующий error handling в `request()` |
| 11 | Webhook вернул не-JSON | Парсим как raw text, показываем в результатах | `callWebhook()` → `{ raw: responseText }` |
| 12 | Нет n8n API key | `request()` кидает: «n8n API key not configured» | Существующая проверка в `request()` L17 |
| 13 | Workflow невалидный | Рекомендация: вызвать `validate()` перед тестом в panel/chat.js | Проверка в `testCurrentWorkflow()` |
| 14 | Cleanup не удался | Логируем `console.warn`, НЕ кидаем ошибку. Показываем предупреждение | `finally` block в `testWorkflow()` |
| 15 | Workflow с credentials для httpRequest (опциональный) | Если `node.credentials` есть → обрабатываем. Если нет → пропускаем | Динамический парсинг `node.credentials` |
| 16 | Два credentials одного типа в РАЗНЫХ нодах | Каждая нода обрабатывается независимо — может быть auto-match для обеих | `matchCredentials()` → per-node loop |

---

## 10. UI Flow — пользовательский сценарий

```
1. Пользователь вводит промпт: "Check site every hour, alert Telegram if down"
2. Нажимает Generate → workflow создан, отображён в JSON-выводе
3. Нажимает ▶ Test:
   3a. Расширение анализирует node.credentials из workflow JSON:
       - HTTP Request → credentials отсутствует → OK (публичный запрос)
       - Telegram → credentials: { telegramApi: {} } → ищем в n8n
       - GET /api/v1/credentials → найден "My Telegram Bot" (type: telegramApi, id: 5)
       - Auto-match: подставляем id: 5
   3b. Webhook-триггер заменяет scheduleTrigger (n8n-pilot-test-a1b2c3d4)
   3c. [TEST] workflow деплоится в n8n (POST /api/v1/workflows)
   3d. Workflow активируется (POST /api/v1/workflows/{id}/activate)
   3e. Webhook вызван (POST /webhook/n8n-pilot-test-a1b2c3d4)
   3f. Ожидание синхронного ответа (responseMode: lastNode)...
   3g. Результат: ✓ Success — 4 nodes executed, 1.8s
       ✓ n8n Pilot Test Trigger (52ms)
       ✓ HTTP Request (890ms)
       ✓ IF (12ms)
       ✓ Telegram (640ms)
   3h. Cleanup: деактивация + удаление тестового workflow
4. Пользователь видит: workflow работает
5. Нажимает Inject → оригинальный workflow (без тестового webhook) вставляется в n8n редактор
```

**При ошибке:**
```
3g. Результат: ✗ Error — Node "HTTP Request": ETIMEDOUT
    ✓ n8n Pilot Test Trigger (52ms)
    ✗ HTTP Request — Connection timeout (error)
    [Fix & Retest] кнопка появляется
```

---

## 11. Порядок реализации

### Фаза 1: Базовый цикл (MVP)
1. `lib/n8n-client.js` — добавить `import { uuid, sleep } from './utils.js'`
2. `lib/n8n-client.js` — функции: `prepareTestWorkflow()`, `callWebhook()`, `waitForExecution()`, `testWorkflow()` + helpers (`findTriggerNode`, `parseNodeResults`, `extractExecutionError`)
3. `lib/test-results.js` — новый модуль (по паттерну `lib/history.js`)
4. `background.js` — import `testResults`, case блоки: `testWorkflow`, `getTestResults`, `clearTestResults`
5. `panel/panel.html` — кнопка `▶ Test` в workflow card, секция `#test-section`
6. `panel/chat.js` — `testCurrentWorkflow()`, `updateTestProgress()`, `showTestResult()`
7. `panel/panel.css` — стили для `.test-section`, `.test-result-card`, `.test-node-log`
8. Unit тесты: `tests/unit/n8n-client-execute.test.js` (~20 тестов для prepareTestWorkflow, callWebhook, waitForExecution)
9. Unit тесты: `tests/unit/test-results.test.js` (~15 тестов)
10. Mock сервер: `tests/e2e/mocks/n8n-server.js` — добавить `POST /webhook/:path`

### Фаза 2: Credentials matching
11. `lib/n8n-client.js` — `matchCredentials()`, `applyCredentials()`
12. `background.js` — case `checkCredentials`
13. `panel/chat.js` — credential check в `testCurrentWorkflow()`, `showCredentialDialog()`
14. `panel/panel.html` — `#test-credential-dialog`
15. `panel/panel.css` — стили для `.test-credential-dialog`
16. Mock сервер — расширить credentials list (больше типов)
17. Unit тесты: `tests/unit/n8n-client-execute.test.js` — добавить ~15 тестов для matchCredentials

### Фаза 3: Smart error analysis
18. `lib/workflow-generator.js` — `analyzeError()` через Claude API
19. `panel/chat.js` — `fixAndRetest()`: analyzeError → apply fix → re-test (макс 3 попытки)
20. Unit тесты для error analysis (~10 тестов)

### Фаза 4: Advanced
21. Pinned data (mock входные данные для тестирования через Webhook body)
22. Пошаговый лог выполнения нодов (expandable в UI, анимация)
23. Сравнение expected vs actual output
24. E2E тесты полного цикла: `tests/e2e/workflow-test.spec.js`

---

## 12. Оценка объёма

| Фаза | Файлы | Новый код | Тесты |
|------|-------|-----------|-------|
| Фаза 1 (MVP) | 7 файлов (4 modify + 1 new + 2 test files) | ~400 строк | ~35 |
| Фаза 2 (Credentials) | 5 файлов (3 modify + 2 test updates) | ~250 строк | ~20 |
| Фаза 3 (Error analysis) | 2 файла (2 modify) | ~150 строк | ~10 |
| Фаза 4 (Advanced) | 4 файла (2 modify + 2 new) | ~300 строк | ~20 |
| **Итого** | | **~1100 строк** | **~85 тестов** |

---

## 13. Зависимости и permissions

- **n8n API** (стабильные endpoints): workflows CRUD, executions read, credentials list
- **Webhook support**: стандартная функция n8n, работает на всех self-hosted версиях
- **Claude API**: только Фаза 3 (error analysis)
- **Новые npm-пакеты**: не требуются
- **Новые Chrome permissions**: не требуются
  - Webhook вызов идёт через n8n host, уже покрыт `optional_host_permissions: ["https://*/*", "http://localhost:*/*"]` в manifest.json
- **Существующие утилиты**: `uuid()`, `sleep()`, `extractJson()` из `lib/utils.js`

---

## 14. Глоссарий

| Термин | Описание |
|--------|----------|
| **Webhook Injection** | Автоматическое добавление Webhook-триггера в workflow для тестового запуска |
| **Credential matching** | Сопоставление `node.credentials` из workflow JSON с доступными credentials в n8n |
| **Auto-match** | Автоматическая подстановка credential, если в n8n есть ровно один credential нужного типа |
| **responseMode: lastNode** | Настройка Webhook-ноды — ждёт выполнения всей цепочки и возвращает результат синхронно |
| **Cleanup** | Деактивация + удаление тестового workflow из n8n после теста |
| **FIFO** | First In, First Out — стратегия вытеснения старых записей из test-results при достижении лимита |

---

*Источники:*
- [n8n Public API docs](https://docs.n8n.io/api/)
- [n8n Webhook node docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [PR #20234: Execute endpoint (closed, NOT merged)](https://github.com/n8n-io/n8n/pull/20234)
- [Community: Execute workflow via API](https://community.n8n.io/t/executing-a-workflow-via-api-call-without-webhook-or-cli-command/212895)
- [n8n source: INodeCredentialDescription](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/Interfaces.ts)
- [n8n source: nodes-base credentials](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/credentials)
