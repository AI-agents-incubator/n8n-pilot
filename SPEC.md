# n8n Pilot — Техническое задание и спецификация

**Версия:** 2.0
**Дата:** 2026-03-10
**Автор:** Alex Krol + Claude
**Статус:** Active — synced with code as of v1.0.0

---

## 0. Agent Operating Contract

> Этот раздел определяет исполнимые правила для AI-агента, работающего автономно.

### 0.1 Pipeline

Каждая задача обязана проходить полный pipeline:

```
READ → PLAN → IMPLEMENT → TEST → VERIFY → REPORT
```

| Шаг | Описание | Gate (условие перехода) |
|-----|----------|------------------------|
| READ | Прочитать связанные исходные файлы, SPEC.md, PLAN | Понимание контекста подтверждено |
| PLAN | Определить файлы, точки вставки, edge cases | Список файлов и изменений записан |
| IMPLEMENT | Написать код, следуя паттернам кодовой базы | Код компилируется / нет синтаксических ошибок |
| TEST | Запустить `npm test`, все тесты пройдены | Exit code 0, 0 failing tests |
| VERIFY | Проверить новый код: DOM IDs consistent, no regressions | Ручная перепроверка edge cases |
| REPORT | Обновить SPEC/PLAN если изменились контракты, отчитаться | Файлы синхронизированы |

### 0.2 Stop Conditions — когда агент ОБЯЗАН остановиться и спросить

- Тесты падают и причина не ясна после 2 попыток фикса
- Изменение требует нового Chrome permission
- Изменение ломает существующий публичный API-контракт (message actions в background.js)
- Нужно решение по UX/UI дизайну (расположение элементов, цвета)
- Обнаружена уязвимость безопасности
- Необходимо изменение, затрагивающее >5 файлов и не описанное в PLAN

### 0.3 Допустимые команды

```bash
npm test                  # Unit тесты (Vitest)
npm run test:e2e          # E2E тесты (Playwright + mock servers)
npm run build             # Build (если добавлен)
node scripts/bump-version.js {patch|minor|major}  # Версионирование
git status / git diff     # Проверка состояния
```

Агент НЕ запускает:
- `npm install` без явного разрешения
- Деструктивные git-операции (`reset --hard`, `push --force`)
- Скрипты, не описанные в package.json

### 0.4 Definition of Done (для любой задачи)

- [ ] Код написан и следует существующим паттернам (CSS variables, `msg()` helper, `$()` selector)
- [ ] `npm test` проходит без ошибок
- [ ] Новые DOM элементы имеют уникальные ID (проверены в `integration-ids.test.js`)
- [ ] Нет hardcoded цветов/размеров — используются CSS custom properties
- [ ] Edge cases из таблицы обработаны
- [ ] SPEC.md синхронизирован с кодом (если изменились контракты)
- [ ] PLAN-workflow-testing.md обновлён (если затронута функция тестирования)

### 0.5 Failure Escalation

| Ситуация | Действие |
|----------|----------|
| Тесты падают, фикс найден | Исправить, повторить pipeline |
| Тесты падают, причина неясна | STOP — спросить пользователя |
| Конфликт spec vs code | Код authoritative (см. раздел 15) |
| Требуется новая npm-зависимость | STOP — спросить пользователя |
| Lint/format ошибки | Исправить автоматически |
| Security concern | STOP — сообщить пользователю |

### 0.6 Non-goals

- Не тестируем в реальном n8n без явного разрешения
- Не создаём/модифицируем production credentials
- Не отправляем реальные HTTP-запросы к внешним API в тестах
- Не пишем код для неподдерживаемых браузеров (только Chrome 116+)

### 0.7 Assumptions

- n8n instance доступен по URL из settings (self-hosted)
- Claude API key валиден и имеет достаточный баланс
- Chrome Extension работает в Manifest V3 режиме
- Все API-ключи хранятся зашифрованными в chrome.storage.local
- Mock сервер на порту 5678 для E2E тестов

---

## 1. Обзор проекта

### 1.1 Цель

Создать единое Chrome-расширение **n8n Pilot**, объединяющее лучшие функции из трёх существующих расширений (n8n Chat, n8n Copilot, N8N Master), но полностью безопасное, локальное и под контролем пользователя.

### 1.2 Ключевые принципы

- **Полная локальность:** никаких внешних серверов, телеметрии, аналитики
- **Единственный AI:** Anthropic Claude API (прямые вызовы без прокси)
- **Self-hosted n8n:** работа только с собственным инстансом n8n
- **Безопасность по умолчанию:** минимальные permissions, шифрование секретов, CSP
- **Нет монетизации:** никаких подписок, лицензий, feature gates

### 1.3 Источники функциональности

| Функция | Источник | Статус |
|---------|----------|--------|
| AI-генерация workflows | n8n Copilot | Переработана |
| Управление workflows (list/CRUD) | N8N Master | Переработана |
| Управление executions | N8N Master | Переработана |
| Управление variables | N8N Master | Переработана |
| Шаблоны workflows | N8N Master | Переработана |
| История генераций | n8n Copilot | Переработана |
| Версионирование workflows | n8n Copilot | Переработана |
| Debug-режим | n8n Copilot | Переработана |
| Инъекция в n8n editor | n8n Copilot + Chat | Переработана |
| Чат-интерфейс | n8n Chat | Упрощён |

---

## 2. Архитектура

### 2.1 Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────┐
│                    Chrome Browser                     │
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Popup    │  │  Background  │  │ Content Script │ │
│  │  (UI)     │◄─►  Service    │◄─► (n8n pages     │ │
│  │           │  │  Worker      │  │  only)         │ │
│  └──────────┘  └──────┬───────┘  └────────────────┘ │
│                        │                              │
│                        ▼                              │
│                ┌───────────────┐                      │
│                │chrome.storage │                      │
│                │   .local      │                      │
│                └───────────────┘                      │
└────────────────────────┬─────────────────────────────┘
                         │ HTTPS (direct)
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌──────────────┐    ┌──────────────────┐
     │ Anthropic API │    │  Self-hosted n8n  │
     │ api.anthropic │    │  (user's server)  │
     │   .com        │    │                   │
     └──────────────┘    └──────────────────┘
```

### 2.2 Компоненты

#### 2.2.1 Background Service Worker (`background.js`)
- Центральный хаб всей логики
- Обработка сообщений от popup и content script
- Прямые вызовы к Anthropic API
- Прямые вызовы к n8n REST API
- Управление chrome.storage
- Шифрование/дешифрование API-ключей
- Валидация и нормализация workflow JSON

#### 2.2.2 Popup UI (`popup.html` + `popup.js` + `popup.css`)
- Основной интерфейс пользователя
- Вкладки: Generate, Workflows, Executions, History, Settings
- Тёмная тема (согласованная с n8n)
- Responsive: 420px ширина

#### 2.2.3 Content Script (`content.js`)
- Инъекция ТОЛЬКО на страницы n8n (не на все сайты)
- Отображение уведомлений на странице n8n
- Инъекция сгенерированных workflows в n8n editor
- Отслеживание сохранения workflows для версионирования

### 2.3 Что УБРАНО из оригиналов

| Убрано | Причина |
|--------|---------|
| Внешний backend (login.n8ncopilot.com) | Полная локальность |
| Firebase Auth / Google OAuth | Не нужна авторизация |
| Телеметрия и аналитика | Приватность |
| Подписки и лицензии | Личное использование |
| OpenClaw интеграция | Зависимость от внешнего сервиса |
| Content script на все сайты | Безопасность |
| Загрузка кода с GitHub | Supply chain risk |
| Tally.so feedback forms | Не нужно |
| Все AI-провайдеры кроме Claude | Упрощение |

---

## 3. Manifest V3

### 3.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "n8n Pilot",
  "version": "1.0.0",
  "description": "AI-powered n8n workflow manager with Claude integration",
  "author": "Alex Krol",

  "permissions": [
    "storage",
    "clipboardWrite",
    "notifications",
    "scripting",
    "activeTab"
  ],

  "host_permissions": [
    "https://api.anthropic.com/*"
  ],

  "optional_host_permissions": [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*",
    "https://*/*"
  ],

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'"
  },

  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 3.2 Обоснование permissions

| Permission | Зачем | Альтернатива |
|------------|-------|--------------|
| `storage` | Хранение настроек, истории, ключей | Нет — необходим |
| `clipboardWrite` | Копирование JSON в буфер | Можно убрать, но неудобно |
| `notifications` | Уведомления о генерации | Можно использовать in-page |
| `scripting` | Программная инъекция content.js на n8n-таб | Нет — необходим для `chrome.scripting.executeScript` |
| `activeTab` | Доступ к активному табу для инъекции | Нет — необходим |
| `host_permissions: api.anthropic.com` | Прямые вызовы Claude API | Нет — необходим |
| `optional: localhost:*` | Подключение к self-hosted n8n | Запрашивается при настройке |
| `optional: 127.0.0.1:*` | Альтернативный localhost | Запрашивается при настройке |
| `optional: https://*/*` | n8n на кастомном домене | Запрашивается при настройке |

### 3.3 Что НЕ запрашиваем (в отличие от оригиналов)

- `<all_urls>` — НЕТ. Content script инъектируется программно только на n8n
- `tabs` — НЕТ. Не нужен доступ ко всем вкладкам
- `content_scripts` в manifest — НЕТ. Программная инъекция через `chrome.scripting.executeScript` вместо декларативной

### 3.4 Content Script — программная инъекция

Вместо `content_scripts` в manifest (которые инъектируются на все matching URLs), используем программную инъекцию только когда нужно:

```javascript
// background.js — инъекция только на конкретный n8n таб
async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}
```

---

## 4. Модули и API-контракты

### 4.1 Модуль: Crypto (шифрование секретов)

**Файл:** `lib/crypto.js`

**Назначение:** Шифрование API-ключей перед сохранением в chrome.storage. В оригинальных расширениях ключи хранятся в открытом виде — это критическая уязвимость.

**Алгоритм:** AES-GCM 256-bit через Web Crypto API

```typescript
interface CryptoModule {
  // Генерация ключа шифрования при первом запуске
  generateEncryptionKey(): Promise<CryptoKey>;

  // Экспорт ключа для хранения
  exportKey(key: CryptoKey): Promise<JsonWebKey>;

  // Импорт ключа из хранилища
  importKey(jwk: JsonWebKey): Promise<CryptoKey>;

  // Шифрование строки
  encrypt(plaintext: string, key: CryptoKey): Promise<{
    ciphertext: string;  // base64
    iv: string;          // base64
  }>;

  // Дешифрование строки
  decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string>;
}
```

**Логика:**
1. При первом запуске генерируется AES-256-GCM ключ
2. Ключ хранится в `chrome.storage.local` как JWK
3. Все API-ключи шифруются перед сохранением
4. Дешифрование происходит только в момент использования (in-memory)

**Ограничение:** Ключ шифрования хранится в том же storage — это защита от casual access, но не от целенаправленной атаки с доступом к файловой системе. Для полной защиты потребовался бы OS-level keychain, но Chrome Extension API его не предоставляет.

---

### 4.2 Модуль: Settings (настройки)

**Файл:** `lib/settings.js`

**Назначение:** CRUD для всех настроек расширения.

```typescript
// Actual DEFAULTS from lib/settings.js
interface Settings {
  // n8n instance
  n8nBaseUrl: string;            // e.g. "http://localhost:5678"
  n8nApiKeyCipher: string;       // encrypted (AES-256-GCM ciphertext, base64)
  n8nApiKeyIv: string;           // IV для расшифровки (base64)

  // Claude API
  claudeApiKeyCipher: string;    // encrypted
  claudeApiKeyIv: string;        // IV
  claudeModel: string;           // default: "claude-sonnet-4-5-20250929"
  claudeMaxTokens: number;       // default: 4096
  claudeTemperature: number;     // default: 0.3

  // UI preferences
  theme: 'dark' | 'light';      // default: 'dark'
  language: 'en' | 'ru';        // default: 'en'

  // Feature flags
  autoInject: boolean;           // default: true — auto-inject generated workflow
  saveHistory: boolean;          // default: true — save generation history
  notifications: boolean;       // default: true — show Chrome notifications
  historyLimit: number;          // default: 50
  versionLimit: number;          // default: 30
}

interface SettingsModule {
  get(key: keyof Settings): Promise<any>;       // single key lookup
  set(updates: Partial<Settings>): Promise<Settings>;  // merge updates into stored settings
  getAll(): Promise<Settings>;                  // all settings, merged with DEFAULTS
  reset(): Promise<Settings>;                   // restore DEFAULTS

  // Encrypted API key management
  setApiKey(provider: 'claude' | 'n8n', apiKey: string): Promise<void>;
  getApiKey(provider: 'claude' | 'n8n'): Promise<string>;
  hasApiKey(provider: 'claude' | 'n8n'): Promise<boolean>;

  // Backup (strips encrypted fields)
  exportSettings(): Promise<Partial<Settings>>;
  importSettings(data: Partial<Settings>): Promise<void>;
}
```

---

### 4.3 Модуль: Claude API Client

**Файл:** `lib/claude-client.js`

**Назначение:** Прямые вызовы к Anthropic Messages API. В отличие от n8n Copilot, который проксирует через свой backend, мы вызываем API напрямую.

```typescript
interface ClaudeClient {
  // Основной метод — отправка сообщения Claude API
  sendMessage(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;       // override claudeModel из settings
    maxTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
  }): Promise<ClaudeResponse>;

  // Проверка доступности API (минимальный запрос)
  testConnection(apiKey: string): Promise<{ connected: boolean; error: string | null }>;

  // Список доступных моделей (hardcoded, не API-запрос)
  getAvailableModels(): Array<{ id: string; name: string; description: string }>;
}

// sendMessage возвращает unified response (и для generate, и для debug)
interface ClaudeResponse {
  success: boolean;
  content: string | null;    // текстовый ответ (парсинг JSON — ответственность вызывающего)
  rawResponse: string;       // raw API response JSON
  tokensUsed: {
    input: number;
    output: number;
  };
  duration: number;          // ms
  model?: string;            // actual model used
  stopReason?: string;       // end_turn, max_tokens, etc.
  error: string | null;
}
```

**API endpoint:** `POST https://api.anthropic.com/v1/messages`

**Headers:**
```
x-api-key: {apiKey}
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
content-type: application/json
```

**Примечание:** Заголовок `anthropic-dangerous-direct-browser-access: true` необходим для вызовов из браузера. Anthropic требует его для прямых browser-to-API запросов, чтобы подтвердить, что разработчик осознаёт риски (API-ключ виден в extension storage).

**Retry logic:**
- Max retries: 3
- Backoff: exponential (2s, 4s, 8s)
- Retry на: 429 (rate limit), 529 (overloaded), 5xx (server errors)
- Не retry на: 400 (bad request), 401 (auth error)

---

### 4.4 Модуль: n8n API Client

**Файл:** `lib/n8n-client.js`

**Назначение:** Работа с n8n REST API. На основе N8N Master, но без лишнего.

```typescript
interface N8nClient {
  // === Workflows ===
  listWorkflows(params?: {
    limit?: number;
    cursor?: string;
    tags?: string[];
    name?: string;       // search
    active?: boolean;
  }): Promise<PaginatedResponse<Workflow>>;

  getWorkflow(id: string): Promise<Workflow>;
  createWorkflow(data: WorkflowCreate): Promise<Workflow>;
  updateWorkflow(id: string, data: WorkflowUpdate): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  activateWorkflow(id: string): Promise<Workflow>;
  deactivateWorkflow(id: string): Promise<Workflow>;

  // === Executions ===
  listExecutions(params?: {
    workflowId?: string;
    status?: 'success' | 'error' | 'waiting';
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<Execution>>;

  getExecution(id: string): Promise<ExecutionDetail>;
  deleteExecution(id: string): Promise<void>;

  // === Variables ===
  listVariables(): Promise<Variable[]>;
  createVariable(data: VariableCreate): Promise<Variable>;
  updateVariable(id: string, data: VariableUpdate): Promise<Variable>;
  deleteVariable(id: string): Promise<void>;

  // === Tags ===
  listTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;

  // === Credentials ===
  listCredentials(): Promise<Credential[]>;

  // === Connection ===
  testConnection(): Promise<{
    connected: boolean;
    version?: string;
    error?: string;
  }>;
}

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes: Node[];
  connections: object;
  settings?: object;
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
}

interface Execution {
  id: string;
  workflowId: string;
  status: 'success' | 'error' | 'waiting' | 'running';
  startedAt: string;
  stoppedAt?: string;
  mode: string;
}

interface Variable {
  id: string;
  key: string;
  value: string;
  type: string;
}
```

**Base URL:** Настраивается пользователем (e.g. `http://localhost:5678`)

**Authentication:**
```
X-N8N-API-KEY: {apiKey}
```

**n8n REST API endpoints:**
| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/v1/workflows` | Список workflows |
| POST | `/api/v1/workflows` | Создать workflow |
| GET | `/api/v1/workflows/:id` | Получить workflow |
| PUT | `/api/v1/workflows/:id` | Обновить workflow |
| DELETE | `/api/v1/workflows/:id` | Удалить workflow |
| POST | `/api/v1/workflows/:id/activate` | Активировать |
| POST | `/api/v1/workflows/:id/deactivate` | Деактивировать |
| GET | `/api/v1/executions` | Список executions |
| GET | `/api/v1/executions/:id` | Детали execution |
| DELETE | `/api/v1/executions/:id` | Удалить execution |
| GET | `/api/v1/variables` | Список variables |
| POST | `/api/v1/variables` | Создать variable |
| PATCH | `/api/v1/variables/:id` | Обновить variable |
| DELETE | `/api/v1/variables/:id` | Удалить variable |
| GET | `/api/v1/tags` | Список tags |
| POST | `/api/v1/tags` | Создать tag |
| GET | `/api/v1/credentials` | Список credentials |

---

### 4.5 Модуль: Workflow Generator

**Файл:** `lib/workflow-generator.js`

**Назначение:** Генерация n8n workflow JSON через Claude. Включает system prompt, валидацию, нормализацию.

```typescript
interface WorkflowGenerator {
  // Основная генерация
  generate(params: {
    prompt: string;
    model?: string;              // model override
    abortSignal?: AbortSignal;
  }): Promise<GenerationResult>;

  // Модификация существующего workflow
  modify(params: {
    workflow: object;
    instruction: string;
    model?: string;              // model override
    abortSignal?: AbortSignal;
  }): Promise<GenerationResult>;

  // Объяснение workflow
  explain(workflow: object): Promise<string>;
}

interface GenerationResult {
  success: boolean;
  workflow: object | null;
  prompt: string;
  model: string;
  tokensUsed: { input: number; output: number };
  duration: number;
  validationErrors: string[];
  error?: string;
}
```

**System Prompt (основа — из n8n Copilot, но переработан):**

```
You are an expert n8n workflow builder. Your task is to generate valid n8n workflow JSON based on user descriptions.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no explanations, no code blocks.
2. The JSON must be a complete n8n workflow object with these required fields:
   - name: string (descriptive workflow name)
   - nodes: array of node objects
   - connections: object mapping node connections
   - settings: object with workflow settings

NODE STRUCTURE:
Each node must have:
- id: unique UUID string
- name: string (descriptive, unique within workflow)
- type: string (valid n8n node type, e.g. "n8n-nodes-base.webhook")
- typeVersion: number (use latest stable version)
- position: [x, y] array (spread nodes horizontally, ~300px apart)
- parameters: object (node-specific configuration)

CONNECTION STRUCTURE:
connections: {
  "NodeName": {
    "main": [[{ "node": "NextNodeName", "type": "main", "index": 0 }]]
  }
}

WORKFLOW SETTINGS:
settings: {
  "executionOrder": "v1"
}

COMMON NODE TYPES:
- Trigger: n8n-nodes-base.webhook, n8n-nodes-base.scheduleTrigger, n8n-nodes-base.manualTrigger
- HTTP: n8n-nodes-base.httpRequest
- Code: n8n-nodes-base.code
- IF: n8n-nodes-base.if
- Switch: n8n-nodes-base.switch
- Set: n8n-nodes-base.set
- Merge: n8n-nodes-base.merge
- Split Out: n8n-nodes-base.splitOut
- Loop: n8n-nodes-base.splitInBatches
- Wait: n8n-nodes-base.wait
- AI: @n8n/n8n-nodes-langchain.agent, @n8n/n8n-nodes-langchain.chainLlm

PARAMETER FORMAT FOR SET NODE (v3.4+):
{
  "mode": "manual",
  "assignments": {
    "assignments": [
      { "id": "uuid", "name": "fieldName", "value": "fieldValue", "type": "string" }
    ]
  },
  "options": {}
}

PARAMETER FORMAT FOR IF NODE (v2+):
{
  "conditions": {
    "options": { "caseSensitive": true, "leftValue": "" },
    "conditions": [
      {
        "id": "uuid",
        "leftValue": "={{ $json.fieldName }}",
        "rightValue": "expectedValue",
        "operator": { "type": "string", "operation": "equals" }
      }
    ],
    "combinator": "and"
  },
  "options": {}
}

IMPORTANT:
- Every workflow MUST have exactly one trigger node
- Node positions should be logical (left to right flow)
- Use expression syntax {{ $json.field }} for dynamic values
- Generate valid UUIDs for node and condition IDs
```

**Валидация и нормализация (на основе n8n Copilot):**

```typescript
interface WorkflowValidator {
  // Полная валидация
  validate(workflow: object): ValidationResult;

  // Нормализация (автоматическое исправление)
  normalize(workflow: object): object;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

**Правила нормализации (из реверс-инжиниринга Copilot):**

1. **convertNumericObjectsToArrays** — `{"0": node1, "1": node2}` → `[node1, node2]`
2. **fixNodePositions** — добавить `[800, 300]` если отсутствует
3. **fixSetNodeParameters** — нормализовать формат Set node v3.4+
4. **fixIfNodeConditions** — нормализовать формат IF node v2+
5. **fixConnections** — нормализовать `connections[name].main` в `[[{...}]]`
6. **ensureTriggerNode** — проверить наличие trigger node
7. **generateMissingIds** — UUID для nodes без id
8. **fixParameterCollections** — рекурсивная нормализация коллекций

---

### 4.6 Модуль: History (история генераций)

**Файл:** `lib/history.js`

```typescript
interface HistoryModule {
  // CRUD
  add(entry: HistoryEntry): Promise<void>;
  get(id: string): Promise<HistoryEntry | null>;
  list(params?: { limit?: number; offset?: number }): Promise<HistoryEntry[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;

  // Search
  search(query: string): Promise<HistoryEntry[]>;
}

interface HistoryEntry {
  id: string;              // UUID
  timestamp: string;       // ISO 8601
  prompt: string;          // user prompt
  workflow: object;        // generated JSON
  model: string;           // claude model used
  tokensUsed: {
    input: number;
    output: number;
  };
  duration: number;        // generation time in ms
  injected: boolean;       // was it injected into n8n?
  n8nWorkflowId?: string;  // if injected, the n8n workflow ID
}
```

**Хранение:** `chrome.storage.local` с ключом `generationHistory`

**Лимит:** 50 записей (настраивается), FIFO при переполнении

---

### 4.7 Модуль: Version Tracker (версионирование)

**Файл:** `lib/versions.js`

```typescript
interface VersionTracker {
  // Сохранить версию workflow
  saveVersion(workflowId: string, workflow: object): Promise<void>;

  // Получить все версии workflow
  getVersions(workflowId: string): Promise<WorkflowVersion[]>;

  // Получить конкретную версию
  getVersion(workflowId: string, versionNumber: number): Promise<WorkflowVersion | null>;

  // Сравнить две версии (diff)
  diff(workflowId: string, v1: number, v2: number): Promise<WorkflowDiff>;

  // Удалить версию
  deleteVersion(workflowId: string, versionNumber: number): Promise<void>;
}

interface WorkflowVersion {
  version: number;
  workflow: object;
  timestamp: string;
  source: 'generated' | 'saved' | 'imported';
}

interface WorkflowDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  connectionsChanged: boolean;
}
```

**Хранение:** `chrome.storage.local` с ключом `workflowVersions`

**Лимит:** 30 версий на workflow (настраивается)

---

### 4.8 Модуль: Content Script

**Файл:** `content.js`

**Инъектируется:** Программно, только на tabs с URL n8n инстанса

```typescript
// Сообщения, которые content script обрабатывает:
type ContentMessage =
  | { type: 'INJECT_WORKFLOW'; workflow: object }
  | { type: 'SHOW_NOTIFICATION'; success: boolean; message: string }
  | { type: 'GET_CURRENT_WORKFLOW' }
  | { type: 'DETECT_SAVE' };

// Сообщения, которые content script отправляет:
type ContentOutMessage =
  | { type: 'WORKFLOW_SAVED'; workflowId: string; workflow: object }
  | { type: 'CURRENT_WORKFLOW'; workflow: object | null };
```

**Инъекция workflow в n8n editor:**
1. Фокус на canvas n8n editor
2. Симуляция Ctrl+V с workflow JSON
3. Альтернативно: использование n8n postMessage API (если доступен)

**Детекция сохранения:**
- Слушать click на кнопку Save в n8n UI
- Извлечь workflow ID из URL
- Отправить в background для версионирования

---

### 4.9 Модуль: Message Router (background)

**Файл:** `background.js`

Центральный обработчик всех сообщений между компонентами.

```typescript
// Все типы сообщений от popup:
type PopupMessage =
  // Settings
  | { action: 'getSettings' }
  | { action: 'updateSettings'; data: Partial<Settings> }
  | { action: 'testClaudeConnection' }
  | { action: 'testN8nConnection' }

  // Generation
  | { action: 'generateWorkflow'; prompt: string }
  | { action: 'modifyWorkflow'; workflow: object; instruction: string }
  | { action: 'cancelGeneration' }
  | { action: 'explainWorkflow'; workflow: object }

  // n8n API
  | { action: 'listWorkflows'; params?: object }
  | { action: 'getWorkflow'; id: string }
  | { action: 'createWorkflow'; data: object }
  | { action: 'updateWorkflow'; id: string; data: object }
  | { action: 'deleteWorkflow'; id: string }
  | { action: 'activateWorkflow'; id: string }
  | { action: 'deactivateWorkflow'; id: string }
  | { action: 'listExecutions'; params?: object }
  | { action: 'getExecution'; id: string }
  | { action: 'deleteExecution'; id: string }
  | { action: 'listVariables' }
  | { action: 'createVariable'; data: object }
  | { action: 'updateVariable'; id: string; data: object }
  | { action: 'deleteVariable'; id: string }
  | { action: 'listTags' }
  | { action: 'listCredentials' }

  // History
  | { action: 'getHistory'; params?: object }
  | { action: 'deleteHistoryEntry'; id: string }
  | { action: 'clearHistory' }

  // Versions
  | { action: 'getVersions'; workflowId: string }
  | { action: 'restoreVersion'; workflowId: string; version: number }

  // Inject
  | { action: 'injectWorkflow'; workflow: object }

  // Debug
  | { action: 'debugRequest'; systemPrompt: string; userPrompt: string };
```

---

## 5. UI/UX Спецификация

### 5.1 Popup Layout

```
┌─────────────────────────────────┐
│  ⚡ n8n Pilot          [⚙️]    │  ← Header + Settings gear
├─────────────────────────────────┤
│ [Generate] [Workflows] [Exec]   │  ← Tab bar
│ [History]  [Debug]              │
├─────────────────────────────────┤
│                                  │
│     Tab Content Area             │  ← Dynamic content
│     (scrollable)                 │
│                                  │
│                                  │
│                                  │
│                                  │
├─────────────────────────────────┤
│ 🟢 Connected to n8n             │  ← Status bar
└─────────────────────────────────┘
```

**Размеры:** 420px x 600px (min), расширяется по контенту до 800px высота

### 5.2 Вкладка: Generate

```
┌─────────────────────────────────┐
│ Prompt:                          │
│ ┌───────────────────────────┐   │
│ │ Describe your workflow... │   │
│ │                           │   │
│ │                           │   │
│ └───────────────────────────┘   │
│                                  │
│ Model: [claude-sonnet-4-20250514 ▼]│
│                                  │
│ [🔮 Generate Workflow]           │
│                                  │
│ ─── Output ────────────────────  │
│ ┌───────────────────────────┐   │
│ │ {                         │   │
│ │   "name": "My Workflow",  │   │
│ │   "nodes": [...]          │   │
│ │ }                         │   │
│ └───────────────────────────┘   │
│                                  │
│ [📋 Copy] [💾 Save] [🚀 Inject] │
│ [📁 Download JSON]              │
└─────────────────────────────────┘
```

### 5.3 Вкладка: Workflows

```
┌─────────────────────────────────┐
│ 🔍 Search workflows...          │
│ Filter: [All ▼] [Active ▼]     │
│                                  │
│ ┌───────────────────────────┐   │
│ │ ▶ Email Notification       │   │
│ │   Active · Updated 2h ago  │   │
│ │   [Edit] [Toggle] [Delete] │   │
│ ├───────────────────────────┤   │
│ │ ⏸ Data Backup              │   │
│ │   Inactive · Updated 1d    │   │
│ │   [Edit] [Toggle] [Delete] │   │
│ ├───────────────────────────┤   │
│ │ ▶ Webhook Handler          │   │
│ │   Active · Updated 5m ago  │   │
│ │   [Edit] [Toggle] [Delete] │   │
│ └───────────────────────────┘   │
│                                  │
│ [+ New Workflow] [📥 Import]     │
└─────────────────────────────────┘
```

### 5.4 Вкладка: Executions

```
┌─────────────────────────────────┐
│ Workflow: [All workflows ▼]      │
│ Status:  [All ▼]                │
│                                  │
│ ┌───────────────────────────┐   │
│ │ ✅ Email Notification      │   │
│ │   Success · 2 min ago      │   │
│ │   Duration: 1.2s           │   │
│ ├───────────────────────────┤   │
│ │ ❌ Data Backup             │   │
│ │   Error · 15 min ago       │   │
│ │   "Connection timeout"     │   │
│ ├───────────────────────────┤   │
│ │ ✅ Webhook Handler         │   │
│ │   Success · 1h ago         │   │
│ │   Duration: 0.3s           │   │
│ └───────────────────────────┘   │
│                                  │
│ Showing 3 of 127 executions      │
│ [Load more...]                   │
└─────────────────────────────────┘
```

### 5.5 Вкладка: History

```
┌─────────────────────────────────┐
│ Generation History               │
│ 🔍 Search prompts...            │
│                                  │
│ ┌───────────────────────────┐   │
│ │ "Create webhook that..."   │   │
│ │ claude-sonnet · 2h ago     │   │
│ │ 1.2k tokens · 3.4s        │   │
│ │ [View] [Re-gen] [Delete]  │   │
│ ├───────────────────────────┤   │
│ │ "Build email pipeline..."  │   │
│ │ claude-sonnet · 1d ago     │   │
│ │ 2.1k tokens · 5.1s        │   │
│ │ [View] [Re-gen] [Delete]  │   │
│ └───────────────────────────┘   │
│                                  │
│ 12 items · [Clear All]          │
└─────────────────────────────────┘
```

### 5.6 Вкладка: Debug

```
┌─────────────────────────────────┐
│ Debug Mode                       │
│                                  │
│ System Prompt:                   │
│ ┌───────────────────────────┐   │
│ │ You are an n8n expert...  │   │
│ └───────────────────────────┘   │
│                                  │
│ User Prompt:                     │
│ ┌───────────────────────────┐   │
│ │ Create a simple webhook   │   │
│ └───────────────────────────┘   │
│                                  │
│ [🔍 Send Debug Request]         │
│                                  │
│ ─── Response ────────────────── │
│ Model: claude-sonnet-4-20250514 │
│ Tokens: 342 in / 1,204 out     │
│ Duration: 2.3s                  │
│ Stop reason: end_turn           │
│ ┌───────────────────────────┐   │
│ │ Raw response text...      │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

### 5.7 Settings (модальное окно или отдельный экран)

```
┌─────────────────────────────────┐
│ ⚙️ Settings                     │
│                                  │
│ ── n8n Instance ──────────────  │
│ URL: [http://localhost:5678   ] │
│ API Key: [••••••••••] [👁]      │
│ [Test Connection]  🟢 Connected │
│                                  │
│ ── Claude API ────────────────  │
│ API Key: [••••••••••] [👁]      │
│ Model: [claude-sonnet-4-20250514 ▼]│
│ Temperature: [0.3]              │
│ Max Tokens: [4096]              │
│ [Test Connection]  🟢 OK        │
│                                  │
│ ── Preferences ───────────────  │
│ Theme: [Dark ▼]                 │
│ Language: [English ▼]           │
│ History limit: [50]             │
│ Auto-inject: [✓]               │
│ Notifications: [✓]             │
│                                  │
│ ── Data ──────────────────────  │
│ [Export Settings] [Import]       │
│ [Clear All Data]                │
│                                  │
│            [Save] [Cancel]       │
└─────────────────────────────────┘
```

### 5.8 Цветовая схема (Dark Theme)

```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #1a1a1a;
  --bg-tertiary: #262626;
  --bg-hover: #333333;
  --text-primary: #e0e0e0;
  --text-secondary: #999999;
  --text-muted: #666666;
  --accent: #ff6d5a;          /* n8n orange-red */
  --accent-hover: #ff8a7a;
  --success: #4caf50;
  --error: #f44336;
  --warning: #ff9800;
  --border: #333333;
  --input-bg: #1e1e1e;
  --code-bg: #0d0d0d;
}
```

---

## 6. Безопасность

### 6.1 Модель угроз

| Угроза | Вероятность | Влияние | Меры |
|--------|------------|---------|------|
| Утечка Claude API key | Средняя | Высокое | Шифрование AES-256-GCM |
| Утечка n8n API key | Средняя | Критическое | Шифрование + minimal permissions |
| XSS через сгенерированный JSON | Низкая | Среднее | DOMPurify + textContent |
| Content script injection | Низкая | Высокое | Программная инъекция только на n8n |
| Man-in-the-middle | Низкая | Высокое | Только HTTPS для API |
| Malicious n8n response | Низкая | Среднее | JSON schema validation |
| Extension compromise | Очень низкая | Критическое | CSP, no eval, no remote code |

### 6.2 Content Security Policy

```json
{
  "extension_pages": "script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'; connect-src https://api.anthropic.com"
}
```

### 6.3 Принципы безопасности

1. **Нет eval()** — никогда. Даже для JSON — только `JSON.parse()`
2. **Нет innerHTML для пользовательских данных** — только `textContent` и DOM API
3. **Нет remote code** — весь код локальный, нет динамической загрузки
4. **Input sanitization** — все входные данные валидируются
5. **Output encoding** — все данные, вставляемые в DOM, экранируются
6. **Minimal permissions** — запрашиваем только необходимое
7. **Optional permissions** — n8n URL запрашивается динамически
8. **No telemetry** — никаких отправок данных, кроме Claude API и n8n API
9. **Encrypted storage** — API-ключи шифруются AES-256-GCM

### 6.4 Безопасность content script

В оригиналах content script инъектируется на ВСЕ сайты. Наш подход:

```javascript
// background.js — инъекция ТОЛЬКО на n8n
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const n8nUrl = await settings.get('n8nBaseUrl');
    if (tab.url && tab.url.startsWith(n8nUrl)) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    }
  }
});
```

### 6.5 Безопасность API-вызовов

```javascript
// Валидация URL перед запросом к n8n
function validateN8nUrl(url) {
  const parsed = new URL(url);
  // Запрет: file://, javascript:, data:
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Invalid protocol');
  }
  return parsed.origin;
}

// Rate limiting для Claude API
const rateLimiter = {
  lastRequest: 0,
  minInterval: 1000, // 1 second between requests
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequest = Date.now();
  }
};
```

---

## 7. Структура файлов проекта

```
n8n-pilot/
├── manifest.json
├── background.js              # Service worker (entry point, message router)
├── popup.html                 # Popup UI (5 tabs + settings modal)
├── popup.js                   # Popup logic (861 lines)
├── popup.css                  # Popup styles (967 lines, dark theme)
├── content.js                 # Content script (n8n pages only)
├── diagnostic.html            # API diagnostic tool (standalone)
├── lib/
│   ├── crypto.js              # AES-256-GCM encryption (Web Crypto API)
│   ├── settings.js            # Settings management (encrypted API keys)
│   ├── claude-client.js       # Anthropic API client (sendMessage, testConnection)
│   ├── n8n-client.js          # n8n REST API client (CRUD + testConnection)
│   ├── workflow-generator.js  # AI workflow generation (generate, modify, explain)
│   ├── workflow-validator.js  # JSON validation & normalization
│   ├── history.js             # Generation history (chrome.storage.local)
│   ├── versions.js            # Workflow version tracking
│   └── utils.js               # Shared utilities (uuid, sleep, extractJson, etc.)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/
│   └── bump-version.js        # Syncs version across package.json, manifest.json, SNAPSHOT, README
├── tests/
│   ├── unit/
│   │   ├── setup.js                   # Chrome API mocks (in-memory storage)
│   │   ├── crypto.test.js             # ✅ EXISTS — encryption tests
│   │   ├── settings.test.js           # ✅ EXISTS — settings CRUD tests
│   │   ├── workflow-validator.test.js  # ✅ EXISTS — validation/normalization
│   │   ├── history.test.js            # ✅ EXISTS — history CRUD/FIFO
│   │   ├── versions.test.js           # ✅ EXISTS — version tracking
│   │   ├── utils.test.js              # ✅ EXISTS — utility functions
│   │   ├── integration-ids.test.js    # ✅ EXISTS — DOM ID consistency
│   │   └── kodex-regression.test.js   # ✅ EXISTS — regression suite (17 tests)
│   └── e2e/
│       ├── mocks/
│       │   └── n8n-server.js          # ✅ EXISTS — Express mock n8n API (port 5678)
│       └── (E2E specs planned, not yet implemented)
├── .env.example               # Development env vars template
├── package.json
├── CHANGELOG.md               # Keep a Changelog format
├── README.md
├── SPEC.md                    # THIS FILE — technical specification
└── PLAN-workflow-testing.md   # Workflow auto-testing spec (v3.0)
```

> **IMPORTANT — Test file status:**
> Files marked ✅ EXISTS are real and passing. The following test files from SPEC v1.0 do NOT exist yet:
> `claude-client.test.js`, `n8n-client.test.js`, `workflow-generator.test.js`,
> `background.test.js`, `popup.test.js`, `content.test.js`, and all E2E `.e2e.js` files.
> These are planned but not yet implemented.

---

## 8. План тестирования

> **Статус:** 8 файлов / ~301 тест (Vitest). Нет E2E-тестов.
> Файлы `claude-client.test.js`, `n8n-client.test.js`, `workflow-generator.test.js` — запланированы, не реализованы.
> Integration-тесты (8.2) и E2E-тесты (8.3) — запланированы, не реализованы.

### 8.1 Unit-тесты (Vitest)

#### 8.1.1 Crypto module ✅
```
✓ generateEncryptionKey creates valid AES-256-GCM key
✓ encrypt/decrypt round-trip preserves original text
✓ encrypt produces different ciphertext for same input (random IV)
✓ decrypt with wrong key throws error
✓ decrypt with wrong IV throws error
✓ handles empty string
✓ handles unicode text
✓ handles very long strings (10KB+)
✓ exportKey/importKey round-trip preserves key
```

#### 8.1.2 Settings module ✅
```
✓ get returns default value when key not set
✓ set persists value to chrome.storage
✓ getAll returns complete settings object
✓ reset restores all defaults
✓ setApiKey encrypts before storing
✓ getApiKey decrypts before returning
✓ setApiKey with empty string clears the key
✓ handles concurrent reads/writes
```

#### 8.1.3 Claude Client ⏳ PLANNED (file does not exist)
```
✓ generateWorkflow sends correct request to Anthropic API
✓ generateWorkflow parses JSON from response
✓ generateWorkflow handles markdown-wrapped JSON
✓ generateWorkflow handles rate limit (429) with retry
✓ generateWorkflow handles overloaded (529) with retry
✓ generateWorkflow respects abort signal
✓ generateWorkflow times out after 3 minutes
✓ testConnection returns true for valid key
✓ testConnection returns false for invalid key
✓ handles network errors gracefully
✓ does not retry on 401 errors
✓ exponential backoff: 2s, 4s, 8s
✓ max 3 retries then fail
```

#### 8.1.4 n8n Client ⏳ PLANNED (file does not exist)
```
✓ listWorkflows sends GET with correct params
✓ listWorkflows handles pagination
✓ getWorkflow returns workflow by ID
✓ createWorkflow sends POST with correct body
✓ updateWorkflow sends PUT with correct body
✓ deleteWorkflow sends DELETE
✓ activateWorkflow sends POST to /activate
✓ deactivateWorkflow sends POST to /deactivate
✓ listExecutions supports filtering by status
✓ listExecutions supports filtering by workflowId
✓ testConnection returns version on success
✓ testConnection returns error message on failure
✓ handles 401 (invalid API key)
✓ handles 404 (not found)
✓ handles network errors
✓ validates base URL before requests
✓ rejects non-HTTP(S) URLs
```

#### 8.1.5 Workflow Validator ✅
```
✓ validates correct workflow as valid
✓ rejects workflow without nodes
✓ rejects workflow without trigger node
✓ rejects nodes without required fields (id, name, type, position)
✓ warns about duplicate node names
✓ warns about disconnected nodes
✓ normalizes numeric objects to arrays
✓ normalizes missing positions to defaults
✓ fixes Set node parameter format
✓ fixes IF node condition format
✓ fixes connections format
✓ generates UUIDs for nodes without id
✓ handles empty workflow
✓ handles malformed JSON
```

#### 8.1.6 History module ✅
```
✓ add creates new entry with UUID and timestamp
✓ list returns entries in reverse chronological order
✓ list respects limit parameter
✓ delete removes entry by ID
✓ clear removes all entries
✓ search finds entries by prompt text
✓ FIFO: oldest entry removed when limit reached
✓ handles concurrent add operations
```

#### 8.1.7 Versions module ✅
```
✓ saveVersion creates new version with incremented number
✓ getVersions returns all versions for workflow
✓ getVersion returns specific version
✓ diff detects added nodes
✓ diff detects removed nodes
✓ diff detects modified nodes
✓ diff detects connection changes
✓ deleteVersion removes specific version
✓ FIFO: oldest version removed when limit reached
```

### 8.2 Integration-тесты ⏳ PLANNED

```
✓ Background processes generate message correctly
✓ Background routes messages to correct modules
✓ Settings changes propagate to all modules
✓ Generation result saves to history
✓ Workflow injection triggers version save
✓ Content script receives messages from background
✓ Popup receives state updates from background
```

> **Note:** integration-ids.test.js и kodex-regression.test.js существуют и проверяют
> часть integration-сценариев (DOM consistency, regression pack).

### 8.3 E2E-тесты (Playwright) ⏳ PLANNED

#### 8.3.1 Playwright Setup

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    // Load extension
    launchOptions: {
      args: [
        '--disable-extensions-except=./dist',
        '--load-extension=./dist',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
```

#### 8.3.2 Mock Servers

```javascript
// mocks/claude-server.js — Express mock для Anthropic API
// Запускается перед тестами на localhost:3100

app.post('/v1/messages', (req, res) => {
  // Validate headers
  // Return mock workflow JSON
  // Simulate delays, errors, rate limits
});

// mocks/n8n-server.js — Express mock для n8n API
// Запускается перед тестами на localhost:5678

app.get('/api/v1/workflows', (req, res) => { ... });
app.post('/api/v1/workflows', (req, res) => { ... });
// etc.
```

#### 8.3.3 E2E Test Scenarios

```
=== Settings ===
✓ First launch shows settings with empty fields
✓ Save n8n URL and API key
✓ Test n8n connection — success
✓ Test n8n connection — failure (wrong URL)
✓ Test n8n connection — failure (wrong key)
✓ Save Claude API key
✓ Test Claude connection — success
✓ Test Claude connection — failure
✓ Change model selection
✓ Export and import settings

=== Generate ===
✓ Generate workflow from prompt
✓ Generated JSON displayed in output
✓ Copy to clipboard works
✓ Download JSON creates valid file
✓ Inject into n8n tab
✓ Cancel generation mid-request
✓ Handle generation error (API error)
✓ Handle invalid JSON from Claude
✓ Auto-normalize malformed workflow

=== Workflows ===
✓ List workflows from n8n
✓ Search workflows by name
✓ Filter by active/inactive
✓ Activate workflow
✓ Deactivate workflow
✓ Delete workflow with confirmation
✓ Import workflow from JSON file
✓ View workflow details

=== Executions ===
✓ List all executions
✓ Filter by workflow
✓ Filter by status
✓ View execution details
✓ Delete execution
✓ Load more (pagination)

=== History ===
✓ Generation appears in history
✓ View historical generation
✓ Re-generate from history
✓ Delete history entry
✓ Clear all history
✓ Search history by prompt

=== Debug ===
✓ Send debug request with custom prompts
✓ Display raw response
✓ Show token usage
✓ Show response time

=== Security ===
✓ API keys stored encrypted
✓ No API keys in console logs
✓ Content script only on n8n pages
✓ CSP prevents eval/remote scripts
✓ XSS: generated JSON rendered safely
✓ No data sent to unexpected endpoints
✓ Rate limiting prevents API abuse
```

---

## 9. Зависимости

### 9.1 Runtime (расширение)
- Нет внешних зависимостей — всё нативным JS (Web Crypto API, Fetch API, Chrome Extension API)

### 9.2 Development
```json
{
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "vitest": "^2.0.0",
    "express": "^4.19.0"
  }
}
```

### 9.3 Обоснование нулевых runtime-зависимостей
- Меньше attack surface
- Нет supply chain risks
- Нет node_modules в расширении
- Web Crypto API покрывает шифрование
- Fetch API покрывает HTTP-запросы
- Chrome Extension API покрывает storage, notifications, scripting

---

## 10. Шаблоны workflows (из N8N Master)

Встроенные шаблоны для быстрого старта:

```json
[
  {
    "id": "webhook-http",
    "name": "Webhook → HTTP Request",
    "description": "Receive webhook, make HTTP request, return response",
    "category": "basic"
  },
  {
    "id": "schedule-email",
    "name": "Schedule → Email",
    "description": "Run on schedule, send email notification",
    "category": "basic"
  },
  {
    "id": "webhook-code-respond",
    "name": "Webhook → Code → Respond",
    "description": "Receive webhook, process with code, respond",
    "category": "basic"
  },
  {
    "id": "webhook-if-split",
    "name": "Webhook → IF → Split paths",
    "description": "Conditional routing based on webhook data",
    "category": "logic"
  },
  {
    "id": "ai-agent",
    "name": "AI Agent with Tools",
    "description": "LangChain agent with tool access",
    "category": "ai"
  },
  {
    "id": "error-handler",
    "name": "Error Handler Pattern",
    "description": "Workflow with error trigger and notification",
    "category": "patterns"
  }
]
```

---

## 11. Метрики качества

| Метрика | Цель |
|---------|------|
| Permissions | ≤ 3 обязательных |
| Bundle size | < 200 KB (без иконок) |
| Popup load time | < 200ms |
| Generation time | < 30s (зависит от Claude) |
| Unit test coverage | > 90% |
| E2E test scenarios | > 40 |
| 0 external dependencies | runtime |
| 0 eval/innerHTML | безопасность |
| 0 telemetry calls | приватность |

---

## 12. Этапы разработки

| # | Этап | Файлы | Оценка |
|---|------|-------|--------|
| 1 | Skeleton + manifest + crypto | manifest.json, lib/crypto.js | 1 час |
| 2 | Settings + UI skeleton | lib/settings.js, popup.html/css/js | 2 часа |
| 3 | Claude client + generator | lib/claude-client.js, lib/workflow-generator.js, lib/workflow-validator.js | 3 часа |
| 4 | n8n client | lib/n8n-client.js | 2 часа |
| 5 | Background router | background.js | 2 часа |
| 6 | Content script | content.js | 1 час |
| 7 | Full popup UI | popup.js (все вкладки) | 4 часа |
| 8 | History + Versions | lib/history.js, lib/versions.js | 1 час |
| 9 | Unit tests | tests/unit/*.test.js | 3 часа |
| 10 | Mock servers | tests/e2e/mocks/*.js | 1 час |
| 11 | E2E tests | tests/e2e/*.e2e.js | 3 часа |
| 12 | Security audit + polish | Review all code | 1 час |

**Итого:** ~24 часа разработки

---

## 13. Environment Matrix

| Параметр | Значение | Примечание |
|----------|----------|------------|
| Node.js | 18+ | Для запуска тестов и скриптов |
| Chrome | 116+ | `minimum_chrome_version` в manifest.json |
| n8n | 1.0+ (self-hosted) | Публичный REST API v1 |
| Vitest | ^2.0.0 | Unit test framework |
| Playwright | ^1.45.0 | E2E test framework |
| Express | ^4.19.0 | Mock servers для E2E |
| Mock n8n port | 5678 | `tests/e2e/mocks/n8n-server.js` |
| Mock Claude port | 3100 | Planned, not yet implemented |
| Extension popup | 420x520px | Fixed dimensions |
| Build mode | None | Нет bundler — нативные ES modules |
| Manifest | V3 | Service Worker, не background page |

**Self-host assumptions:**
- n8n доступен по HTTP/HTTPS URL, указанному пользователем
- n8n API key создан через Settings → API → Generate key
- Webhook URLs работают без дополнительной авторизации
- `GET /api/v1/credentials` возвращает список без секретов (только id, name, type)

---

## 14. Acceptance Criteria by Feature

### 14.1 Crypto (lib/crypto.js)

| Критерий | Must | Test |
|----------|------|------|
| AES-256-GCM encryption round-trip | ✅ | crypto.test.js ✅ |
| Разный ciphertext для одного plaintext (random IV) | ✅ | crypto.test.js ✅ |
| Ошибка при неверном ключе/IV | ✅ | crypto.test.js ✅ |
| Unicode и пустые строки | ✅ | crypto.test.js ✅ |

### 14.2 Settings (lib/settings.js)

| Критерий | Must | Test |
|----------|------|------|
| Defaults merge с сохранёнными значениями | ✅ | settings.test.js ✅ |
| set(updates) — partial update | ✅ | settings.test.js ✅ |
| Encrypted API key storage/retrieval | ✅ | settings.test.js ✅ |
| hasApiKey() без дешифрования | ✅ | settings.test.js ✅ |
| export/import без encrypted fields | ✅ | settings.test.js ✅ |

### 14.3 Claude Client (lib/claude-client.js)

| Критерий | Must | Test |
|----------|------|------|
| sendMessage() отправляет корректный request | ✅ | ⏳ claude-client.test.js |
| Retry на 429/529/5xx с exponential backoff | ✅ | ⏳ |
| Не retry на 400/401 | ✅ | ⏳ |
| AbortSignal cancellation | ✅ | ⏳ |
| testConnection() minimal request | ✅ | ⏳ |
| 3-minute generation timeout | ✅ | ⏳ |

### 14.4 n8n Client (lib/n8n-client.js)

| Критерий | Must | Test |
|----------|------|------|
| All CRUD operations (workflows, executions, variables, tags) | ✅ | ⏳ n8n-client.test.js |
| X-N8N-API-KEY header | ✅ | ⏳ |
| 15s request timeout | ✅ | ⏳ |
| testConnection() health check | ✅ | ⏳ |
| Error handling (401, 404, timeout) | ✅ | ⏳ |

### 14.5 Workflow Generator (lib/workflow-generator.js)

| Критерий | Must | Test |
|----------|------|------|
| generate() → valid workflow JSON | ✅ | ⏳ workflow-generator.test.js |
| modify() → modified workflow | ✅ | ⏳ |
| explain() → текстовое описание | ✅ | ⏳ |
| model override parameter | ✅ | ⏳ |
| JSON extraction из markdown-wrapped ответа | ✅ | ⏳ |

### 14.6 Workflow Validator (lib/workflow-validator.js)

| Критерий | Must | Test |
|----------|------|------|
| validate() errors для missing nodes/connections | ✅ | workflow-validator.test.js ✅ |
| normalize() fixes numeric objects, positions, IDs | ✅ | workflow-validator.test.js ✅ |
| Warning для отсутствующего trigger | ✅ | workflow-validator.test.js ✅ |

### 14.7 Workflow Testing (PLAN-workflow-testing.md — будущая функция)

| Критерий | Must | Test |
|----------|------|------|
| Webhook injection в workflow без триггера | ✅ | ⏳ n8n-client-execute.test.js |
| Webhook injection — замена scheduleTrigger | ✅ | ⏳ |
| Reuse existing webhook | ✅ | ⏳ |
| Credential matching (auto, conflict, missing) | ✅ | ⏳ |
| Full test cycle: deploy → activate → webhook → poll → cleanup | ✅ | ⏳ |
| Execution timeout handling | ✅ | ⏳ |
| Cleanup даже при ошибке (finally) | ✅ | ⏳ |

### 14.8 Negative cases (обязательные для каждого модуля)

Каждый модуль ОБЯЗАН иметь тесты на:
- Invalid/missing input parameters
- Network errors (timeout, connection refused)
- Unexpected API responses (malformed JSON, empty body)
- Storage full/unavailable
- Concurrent access conflicts

---

## 15. Spec vs Code Sync Rules

### 15.1 Что authoritative

| Ситуация | Source of truth | Действие |
|----------|----------------|----------|
| Spec описывает контракт, код ещё не реализован | Spec | Реализовать по spec |
| Код реализован, spec устарел | Код | Обновить spec под код |
| Spec и код конфликтуют | Код (если работает и тесты проходят) | Обновить spec |
| Новая функция не описана ни в spec ни в PLAN | STOP | Сначала обновить PLAN/spec, потом реализовать |

### 15.2 Когда агент обязан обновить spec

- Добавлен новый message action в background.js → обновить Section 4.9
- Изменена сигнатура экспортируемой функции → обновить соответствующий Section 4.x
- Добавлен новый файл → обновить Section 7 (файловая структура)
- Добавлен новый тестовый файл → обновить Section 8 (план тестирования)
- Изменены Chrome permissions → обновить Section 3

### 15.3 Когда агент обязан обновить PLAN

- Изменён алгоритм тестирования workflow
- Добавлен/удалён edge case
- Изменена стратегия credential matching
- Добавлена новая фаза реализации

### 15.4 Version bump rules

- Фикс расхождений spec↔code: minor version spec (1.0 → 1.1)
- Новая функция: major version spec (1.0 → 2.0)
- Текущая версия: **SPEC v2.0** (synced with code v1.0.0)

---

## 16. Workflow Testing — Overview

> Полная техническая спецификация: **[PLAN-workflow-testing.md](./PLAN-workflow-testing.md)** (v3.0)

### 16.1 Что это

Автоматическое тестирование сгенерированных workflow: Generate → Deploy → Test → Report.

### 16.2 Почему отдельный документ

PLAN содержит ~500 строк детального implementation guide с кодом, точками вставки и тест-планом. Включение в SPEC увеличило бы документ вдвое. PLAN — исполнимый контракт для реализации, SPEC — описание контрактов модулей.

### 16.3 Ключевые решения (зафиксированы в PLAN)

- **Webhook Injection** вместо несуществующего execute endpoint
- **Динамический credential matching** из `node.credentials` JSON (не hardcoded map)
- **chrome.storage.local** для test results (не database)
- **4 фазы** реализации (MVP → Credentials → Error Analysis → Advanced)

---

## Приложение A: Полный реверс-инжиниринг n8n Copilot

### Файлы и размеры
- manifest.json — 1.5 KB (MV3, 7 host permissions, OAuth2)
- background.js — 3,244 строк (центральная логика)
- script/popup.js — 5,302 строки (UI state management)
- script/content-script.js — 319 строк (page injection)
- script/tally.js — 9 строк (feedback forms)
- style/popup.css — 3,406 строк (dark theme)
- popup.html — 828 строк

### Ключевые находки
- 7 AI-провайдеров (OpenAI, Gemini, Claude, Mistral, Groq, OpenRouter, Grok)
- Все API-ключи отправляются на login.n8ncopilot.com
- Firebase Auth для Google OAuth
- 3-уровневая подписка (Free/Pro/Pro Plus)
- WebSocket для OpenClaw интеграции
- Хранение ключей в chrome.storage.local без шифрования
- Массовое использование innerHTML (XSS-уязвимости)
- System prompt строится на сервере, не в расширении

### API Endpoints (backend)
- POST /api/user — валидация пользователя
- POST /api/generate — генерация workflow (проксирует к AI)
- POST /api/debug — debug-запросы
- GET /api/user-plan — информация о подписке
- POST /api/openclaw-save-apikey — сохранение настроек OpenClaw
- POST /api/openclaw-logout — логаут
- POST /api/create-billing-portal — Stripe billing
- POST /api/cancel-subscription — отмена подписки

## Приложение B: Полный реверс-инжиниринг N8N Master

### Файлы и размеры
- manifest.json — permissions: `https://*/*`, `http://*/*` (все сайты)
- background.js — основная логика (минифицирован, ~50 KB)
- popup.js — UI управления
- options/options.js — страница настроек
- welcome.js — welcome page
- lib/n8n-demo.bundled.js — bundled web component (~500 KB)
- templates.json — шаблоны workflows

### Ключевые находки
- Host permissions на ВСЕ сайты (http и https)
- Content script инъектируется на все страницы
- API-ключи хранятся в SQLite без шифрования
- Загрузка кода с GitHub без проверки подписи
- 4 AI-провайдера (OpenAI, Anthropic, LM Studio, OpenRouter)
- Управление workflows, executions, variables через n8n API
- Шаблоны workflows встроены в templates.json
- Слабая валидация лицензий (обход за 30-90 дней)
- Телеметрия и analytics

## Приложение C: Полный реверс-инжиниринг n8n Chat

### Файлы и размеры
- manifest.json — `<all_urls>` для content scripts
- static/background/index.js — Plasmo framework
- content.*.js — multiple content scripts (~815 KB total)
- popup.*.js — popup scripts
- stateManager.*.js — state management

### Ключевые находки
- Построен на Plasmo framework (React-based)
- Content script (815 KB) на все сайты
- Чат-интерфейс через боковую панель
- Коммуникация с n8nchat.com backend
- Bearer-токены без шифрования
- Email/UUID отправляются на сервер
- Отсутствует CSP
- Web-accessible resources открыты для всех

---

*Конец спецификации*
