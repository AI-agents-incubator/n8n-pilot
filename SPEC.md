# n8n Pilot — Техническое задание и спецификация

**Версия:** 3.2
**Дата:** 2026-03-10
**Автор:** Alex Krol + Claude
**Статус:** Active — architecture pivot v2.0 (popup → injected side panel + smart generator)

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
# Build не требуется — нативные ES modules, programmatic injection (нет bundler)
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

### 1.4 Implementation Status Matrix

> **Цель:** одним взглядом понять, что уже есть и что запланировано.

| Module / File | Status | Phase | Notes |
|---------------|--------|-------|-------|
| `manifest.json` | Implemented (v1.0) | — | Needs update: remove popup, add contextMenus, web_accessible_resources |
| `background.js` | Implemented (v1.0) | 1 | Needs update: icon click toggle, streaming relay |
| `content.js` | Implemented (v1.0) | 1 | Needs rewrite: Shadow DOM panel injection |
| `lib/settings.js` | Implemented | — | Stable |
| `lib/crypto.js` | Implemented | — | Stable |
| `lib/n8n-client.js` | Implemented | — | Stable, testing funcs planned (PLAN §6-7) |
| `lib/claude-client.js` | Implemented | 2 | Needs: `sendMessageStream()`, `sendConversation()` |
| `lib/workflow-generator.js` | Implemented | 3 | Needs: multi-step pipeline, blueprint-based generation |
| `lib/workflow-validator.js` | Implemented | — | Stable |
| `lib/history.js` | Implemented | — | Stable |
| `lib/versions.js` | Implemented | — | Stable |
| `lib/utils.js` | Implemented | — | Stable |
| `panel/panel.html` | Planned | 1 | Replaces popup.html |
| `panel/panel.css` | Planned | 1 | Replaces popup.css (`:root` → `:host`) |
| `panel/panel.js` | Planned | 1 | Replaces popup.js (msg, routing, helpers) |
| `panel/chat.js` | Planned | 2 | Chat UI, streaming display, workflow cards |
| `panel/chat-memory.js` | Planned | 2 | Per-workflow conversation storage |
| `panel/settings-view.js` | Planned | 1 | Settings form + API test |
| `panel/workflows-view.js` | Planned | 4 | Workflow list (migrated from popup.js) |
| `panel/executions-view.js` | Planned | 4 | Execution list (migrated from popup.js) |
| `panel/history-view.js` | Planned | 4 | History list (migrated from popup.js) |
| `panel/n8n-context.js` | Planned | 4 | Workflow/node detection from DOM/URL |
| `panel/context-menu.js` | Planned | 5 | Right-click action handler |
| `lib/prompt-analyzer.js` | Planned | 3 | Structured task → node mapping → blueprint |
| `lib/node-catalog-core.js` | Planned | 3 | 20-30 nodes with full parameter schemas |
| `lib/node-catalog-index.js` | Planned | 3 | ~280 nodes brief index |
| `lib/test-results.js` | Planned | Testing | Test result storage (PLAN §7.3) |
| `popup.html` | To Delete | 1 | Replaced by panel/panel.html |
| `popup.js` | To Delete | 1 | Replaced by panel/*.js |
| `popup.css` | To Delete | 1 | Replaced by panel/panel.css |

---

## 2. Архитектура

> **PIVOT v2.0:** Popup заменён на injected side panel в DOM n8n-редактора.
> Причина: popup закрывается при клике вне него, не имеет доступа к DOM n8n,
> не поддерживает streaming и контекстное меню. Конкурент N8N Master (5000 юзеров)
> использует injected panel — это стандарт UX для n8n-расширений.

### 2.1 Высокоуровневая архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    n8n Editor Tab                              │ │
│  │                                                                │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐  │ │
│  │  │     n8n Canvas           │  │   n8n Pilot Panel        │  │ │
│  │  │   (workflow editor)      │  │   (Shadow DOM, 380px)    │  │ │
│  │  │                          │  │                          │  │ │
│  │  │   content.js detects     │  │   Chat / Settings /      │  │ │
│  │  │   workflow context       │  │   Workflows / Executions │  │ │
│  │  └──────────────────────────┘  └──────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────┐                  ┌───────────────┐              │
│  │  Background   │ ◄── messages ──► │chrome.storage │              │
│  │  Service      │                  │   .local      │              │
│  │  Worker       │                  └───────────────┘              │
│  └──────┬────────┘                                                 │
│          │ streaming relay (SSE chunks → tabs.sendMessage)         │
└──────────┼─────────────────────────────────────────────────────────┘
           │ HTTPS (direct)
  ┌────────┴────────┐
  ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│ Anthropic API │  │  Self-hosted n8n  │
│ (streaming    │  │  v2.1.5           │
│  SSE support) │  │  (user's server)  │
└──────────────┘  └──────────────────┘
```

### 2.2 Компоненты

#### 2.2.1 Background Service Worker (`background.js`)
- Центральный хаб всей логики (без изменений бизнес-логики)
- Обработка сообщений от **panel** (content script) — НЕ от popup
- Прямые вызовы к Anthropic API (включая **streaming SSE**)
- Прямые вызовы к n8n REST API
- **Streaming relay:** получает SSE chunks от Claude, пересылает в content script через `chrome.tabs.sendMessage`
- Управление chrome.storage
- Шифрование/дешифрование API-ключей
- Регистрация context menu items
- Toggle panel по клику на иконку расширения (`chrome.action.onClicked`)

#### 2.2.2 Injected Side Panel (`panel/` + `content.js`)
- **Заменяет popup.html/js/css** — popup удалён
- Content script (`content.js`) инжектит panel в DOM n8n через **closed Shadow DOM**
- Panel UI: chat-first интерфейс + drawer-views (Settings, Workflows, Executions, History)
- Прямой доступ к DOM n8n — контекст workflow, выбранные ноды, URL
- Streaming: ответы Claude появляются token-by-token
- Per-workflow chat memory
- CSS изолирован через Shadow DOM (n8n CSS не влияет на panel и наоборот)
- Ширина: 380px (collapsible to 48px icon strip)

#### 2.2.3 Content Script — Panel Orchestrator (`content.js`)
- Инъекция панели в DOM n8n при загрузке страницы
- Shadow DOM создание и управление
- Определение контекста: текущий workflow (URL parsing), выбранные ноды (DOM queries)
- SPA navigation watching (MutationObserver + popstate)
- Workflow injection в n8n editor (clipboard + paste simulation)
- Отслеживание сохранения workflows для версионирования
- Обработка context menu actions
- Приём streaming chunks от background.js

#### 2.2.4 Smart Generator Pipeline (NEW)
- **Guided Dialog** (panel/chat.js) → структурированное описание задачи
- **Prompt Analyzer** (lib/prompt-analyzer.js) → маппинг на ноды из каталога
- **Node Catalog** (lib/node-catalog-core.js + node-catalog-index.js) → параметры нод
- **JSON Generator** (lib/workflow-generator.js) → финальный workflow JSON
- Подробнее в разделе 4.5

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
  "version": "2.0.0",
  "description": "AI-powered n8n workflow manager with Claude integration",
  "author": "Alex Krol",

  "permissions": [
    "storage",
    "clipboardWrite",
    "notifications",
    "scripting",
    "activeTab",
    "contextMenus"
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
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "web_accessible_resources": [
    {
      "resources": ["panel/panel.css", "icons/*"],
      "matches": ["https://*/*", "http://localhost:*/*", "http://127.0.0.1:*/*"]
    }
  ],

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

> **PIVOT v2.0:** `action.default_popup` удалён. Клик по иконке → `chrome.action.onClicked` → toggle panel.
> Добавлены: `contextMenus` permission, `web_accessible_resources` для panel CSS.

### 3.2 Обоснование permissions

| Permission | Зачем | Альтернатива |
|------------|-------|--------------|
| `storage` | Хранение настроек, истории, ключей, chat memory | Нет — необходим |
| `clipboardWrite` | Копирование JSON в буфер, workflow injection | Нет — необходим |
| `notifications` | Уведомления вне n8n-страницы | Можно использовать in-page |
| `scripting` | Программная инъекция panel scripts на n8n-таб | Нет — необходим для `chrome.scripting.executeScript` |
| `activeTab` | Доступ к активному табу для инъекции | Нет — необходим |
| `contextMenus` | ПКМ: Explain / Generate Code / Optimize | Нет — необходим для UX |
| `host_permissions: api.anthropic.com` | Прямые вызовы Claude API (включая streaming) | Нет — необходим |
| `optional: localhost:*` | Подключение к self-hosted n8n | Запрашивается при настройке |
| `optional: 127.0.0.1:*` | Альтернативный localhost | Запрашивается при настройке |
| `optional: https://*/*` | n8n на кастомном домене | Запрашивается при настройке |

### 3.3 Что НЕ запрашиваем (в отличие от оригиналов)

- `<all_urls>` — НЕТ. Content script инъектируется программно только на n8n
- `tabs` — НЕТ. Не нужен доступ ко всем вкладкам
- `content_scripts` в manifest — НЕТ. Программная инъекция через `chrome.scripting.executeScript`
- `default_popup` — УДАЛЁН. UI живёт в injected panel, не в popup

### 3.4 Panel Script Injection

Panel инжектится программно при обнаружении n8n-страницы:

```javascript
// background.js — инъекция panel на n8n таб
async function injectPanel(tabId) {
  // Инъекция всех panel-скриптов в правильном порядке
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      'panel/n8n-context.js',    // контекст n8n (workflow ID, selected nodes)
      'panel/chat-memory.js',     // per-workflow chat storage
      'panel/chat.js',            // chat interface
      'panel/settings-view.js',   // settings form
      'panel/workflows-view.js',  // workflow list
      'panel/executions-view.js', // executions list
      'panel/history-view.js',    // history list
      'panel/context-menu.js',    // right-click handler
      'panel/panel.js',           // main controller
      'content.js'                // orchestrator (creates Shadow DOM, bootstraps panel)
    ]
  });
}
```

### 3.5 Shadow DOM — CSS изоляция

Panel использует closed Shadow DOM для полной изоляции CSS:

```javascript
// content.js — создание Shadow DOM
const host = document.createElement('div');
host.id = 'n8n-pilot-root';
host.style.cssText = 'position:fixed; top:0; right:0; height:100vh; width:380px; z-index:99999;';
document.body.appendChild(host);

const shadow = host.attachShadow({ mode: 'closed' });

// CSS загружается из web_accessible_resources
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('panel/panel.css');
shadow.appendChild(link);
```

- `closed` mode: n8n JS не может получить доступ к `host.shadowRoot`
- CSS variables определены на `:host` вместо `:root`
- Никакого leakage в обе стороны

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

#### 4.1.1 Master Password (опционально)

> Усиление модели угроз: защита от кражи Chrome-профиля (malware, физический доступ).

**Режимы:**

| Режим | Как хранится ключ | Защита от |
|-------|-------------------|-----------|
| **Default** (текущий) | JWK в `chrome.storage.local` | XSS, casual access |
| **Master Password** | Ключ деривируется через PBKDF2 от пароля, хранится только in-memory | Кража профиля, malware, физический доступ |

**Логика Master Password:**
1. Пользователь задаёт Master Password в Settings (опционально)
2. При установке пароля: `PBKDF2(password, salt, 100_000 iterations, 256 bit)` → encryption key
3. Salt хранится в `chrome.storage.local` (не секрет)
4. Encryption key хранится **только in-memory** (session variable в background.js)
5. При каждом старте расширения / wake-up Service Worker → запрос пароля
6. Если пароль не задан → fallback на текущую схему (JWK в storage) с предупреждением в Settings

**UX:** При включённом Master Password — при первом обращении к API в сессии
показывается модальное окно «Enter Master Password» в панели.

**Phase:** 5 (polish) — не блокирует основной функционал.

---

### 4.2 Модуль: Settings (настройки)

**Файл:** `lib/settings.js`

**Назначение:** CRUD для всех настроек расширения.

```typescript
// Actual DEFAULTS from lib/settings.js
interface Settings {
  // n8n instance (single environment — текущая реализация v1.0)
  n8nBaseUrl: string;            // e.g. "http://localhost:5678"
  n8nApiKeyCipher: string;       // encrypted (AES-256-GCM ciphertext, base64)
  n8nApiKeyIv: string;           // IV для расшифровки (base64)

  // Multi-environment (v2.0 — planned)
  n8nEnvironments: N8nEnvironment[];  // массив окружений
  activeEnvironmentId: string;        // ID активного окружения

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

// Multi-environment support (v2.0)
interface N8nEnvironment {
  id: string;                    // UUID
  name: string;                  // "Dev", "Staging", "Production"
  url: string;                   // "https://n8n.example.com"
  apiKeyCipher: string;          // encrypted
  apiKeyIv: string;              // IV
  color?: string;                // badge color in panel header (e.g. "#ff5c5c" for prod)
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

**Multi-environment migration (v1.0 → v2.0):**
- При первом запуске v2.0: если `n8nBaseUrl` задан, автоматически создать
  `n8nEnvironments: [{ id: uuid(), name: 'Default', url: n8nBaseUrl, ... }]`
  и установить `activeEnvironmentId`.
- Старые поля `n8nBaseUrl`, `n8nApiKeyCipher`, `n8nApiKeyIv` сохраняются
  для backward compatibility, но читаются только если `n8nEnvironments` пуст.
- UX: selector окружения в header панели (badge с цветом + имя).
  Смена окружения = переподключение content script + перезагрузка контекста.
- **Phase:** 4 (Context Awareness) — после базового функционала.

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

  // Streaming generation (NEW in v2.0 — для chat panel)
  sendMessageStream(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
    onChunk: (text: string) => void;     // called per SSE delta
    onDone: (result: { content: string; tokensUsed: TokenUsage }) => void;
    onError: (error: string) => void;
  }): Promise<void>;

  // Multi-turn conversation (NEW in v2.0 — для chat memory)
  sendConversation(params: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
    stream?: boolean;
    onChunk?: (text: string) => void;
    onDone?: (result: { content: string; tokensUsed: TokenUsage }) => void;
    onError?: (error: string) => void;
  }): Promise<ClaudeResponse>;

  // Проверка доступности API (минимальный запрос)
  testConnection(apiKey: string): Promise<{ connected: boolean; error: string | null }>;

  // Список доступных моделей (hardcoded, не API-запрос)
  getAvailableModels(): Array<{ id: string; name: string; description: string }>;
}

// === Context Window Management (chat-memory.js) ===
//
// Проблема: длинная история чата + workflow JSON + node schemas = превышение
// контекстного окна Claude (200K tokens) или неоправданные расходы на токены.
//
// Стратегия Context Truncation:
//
// 1. SLIDING WINDOW: хранить все сообщения в storage, но передавать в API
//    только последние N (default: 20 сообщений). Старые — обрезаются.
//
// 2. SUMMARY COMPACTION: при превышении 20 сообщений — отправить отдельный
//    запрос Claude: "Summarize this conversation in 3 sentences" → сохранить
//    summary как первое system-level сообщение, удалить оригиналы.
//
// 3. WORKFLOW CONTEXT BUDGET:
//    - Полный workflow JSON передаётся ТОЛЬКО при modify/explain запросах
//    - При обычном чате — передаётся только blueprint (nodes + connections, без parameters)
//    - Node schemas из каталога — только для запрошенных типов (не все 30)
//
// 4. TOKEN ESTIMATION: перед отправкой оценить размер контекста
//    (1 token ≈ 4 chars для English, ≈ 2 chars для JSON).
//    Если > 150K chars → принудительная обрезка старых сообщений.
//
// Phase: 2 (Chat + Streaming)

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
    includeData?: boolean;  // default: false для списков, true для getExecution
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

**Payload Size Protection:**
- `listExecutions()` — по умолчанию `includeData=false` (только метаданные: id, status, startedAt).
  В UI списков execution data не нужна.
- `getExecution(id)` — возвращает полные данные, но обрезает `resultData.runData`
  до первых 500KB (per-node). Бинарные данные (`binary` поля) заменяются на
  `{ truncated: true, size: N }`.
- Фронтенд: lazy-loading деталей execution (показываем метаданные, загружаем runData по клику).

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

### 4.5 Модуль: Smart Workflow Generator (PIVOT v2.0)

> **PIVOT:** Одноэтапная генерация заменена на 4-этапный pipeline.
> Причина: freeform промпт → Claude угадывает ноды → часто сломанный JSON.
> Новый подход: Guided Dialog → Prompt Analyzer → Node Mapping → JSON Generation.

#### 4.5.1 Pipeline Overview

```
Step 1: Guided Dialog (panel/chat.js)
  → "Что запускает workflow?" → Webhook / Schedule / RSS / Manual
  → "Какие сервисы?" → Telegram, OpenAI, Airtable...
  → "Что делать с результатом?" → Send / Save / Return
  → Output: StructuredTask

Step 2: Prompt Analyzer (lib/prompt-analyzer.js) — API call #1
  → Input: StructuredTask
  → Checks node-catalog-core.js (20-30 detailed nodes)
  → Falls back to node-catalog-index.js (~280 brief entries)
  → Output: WorkflowBlueprint

Step 3: JSON Generation (lib/workflow-generator.js) — API call #2
  → Input: WorkflowBlueprint + relevant node schemas from catalog
  → System prompt includes ONLY the node schemas needed (not all 300)
  → Output: complete n8n workflow JSON

Step 4: Validate + Normalize (lib/workflow-validator.js)
  → Same as before
```

#### 4.5.2 Новые модули

**Файл:** `lib/prompt-analyzer.js` (NEW)

```typescript
interface PromptAnalyzer {
  // Анализ структурированного запроса → blueprint
  analyze(params: {
    task: StructuredTask;
    model?: string;
    abortSignal?: AbortSignal;
  }): Promise<AnalysisResult>;
}

interface StructuredTask {
  trigger: string;            // "webhook" | "schedule" | "rss" | "manual" | описание
  services: string[];         // ["telegram", "openai", "airtable"]
  outputAction: string;       // "send" | "save" | "return" | описание
  description: string;        // freeform дополнение
  context?: object;           // текущий workflow (если модификация)
}

interface WorkflowBlueprint {
  nodes: Array<{
    type: string;             // "n8n-nodes-base.webhook"
    role: string;             // "trigger" | "process" | "output"
    params_hint: object;      // ключевые параметры из каталога
    credentials_type?: string; // "telegramApi" | "openAiApi" | etc.
  }>;
  connections: Array<[number, number]>;  // [fromIndex, toIndex]
  credentials_needed: string[];           // credential types to resolve
}
```

**Файл:** `lib/node-catalog-core.js` (NEW)

Содержит полные параметры для 20-30 самых используемых нод, извлечённые из `description.ts` файлов репозитория n8n (https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes).

```typescript
// Формат записи в каталоге
interface NodeSchema {
  type: string;                 // "n8n-nodes-base.webhook"
  displayName: string;          // "Webhook"
  typeVersion: number;          // 2.1
  category: string;             // "Triggers"
  credentials: string[];        // ["webhookAuth"] — типы credentials
  parameters: ParameterDef[];   // полное описание параметров
  outputs: number;              // количество выходов (1 для обычных, 2 для IF)
  description: string;          // краткое описание
}

// Ноды в core-каталоге:
// webhook, httpRequest, code, if, filter, switch, set, merge, splitOut,
// scheduleTrigger, manualTrigger, telegram, gmail, airtable, openAi,
// googleGemini, rssFeedReadTrigger, convertToFile, html, stickyNote,
// splitInBatches, wait, noOp, formTrigger
```

**Файл:** `lib/node-catalog-index.js` (NEW)

Содержит краткие описания ~280 оставшихся нод для маппинга:

```typescript
interface NodeIndexEntry {
  type: string;                 // "n8n-nodes-base.slack"
  displayName: string;          // "Slack"
  category: string;             // "Communication"
  credentials: string;          // "slackApi"
  description: string;          // "Send messages, manage channels in Slack"
}
```

#### 4.5.3 Обновлённый Workflow Generator

**Файл:** `lib/workflow-generator.js`

```typescript
interface WorkflowGenerator {
  // Полный pipeline: blueprint → JSON
  generateFromBlueprint(params: {
    blueprint: WorkflowBlueprint;
    nodeSchemas: NodeSchema[];    // только нужные, из каталога
    model?: string;
    abortSignal?: AbortSignal;
    stream?: boolean;
    onChunk?: (text: string) => void;
  }): Promise<GenerationResult>;

  // Legacy: прямая генерация из промпта (для обратной совместимости)
  generate(params: {
    prompt: string;
    model?: string;
    abortSignal?: AbortSignal;
    onProgress?: (msg: string) => void;
  }): Promise<GenerationResult>;

  // Модификация существующего workflow
  modify(params: {
    workflow: object;
    instruction: string;
    model?: string;
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
  validationWarnings?: string[];
  error?: string;
}
```

#### 4.5.4 System Prompt (динамический)

System prompt теперь **не hardcoded**, а собирается динамически на основе blueprint:

```
STATIC PART (всегда включена):
- Правила JSON формата
- Node structure, Connection structure
- Positioning rules
- Expression syntax: {{ $json.field }}

DYNAMIC PART (добавляется из каталога):
- Полные параметры ТОЛЬКО для нод из blueprint
- Формат credentials reference
- Resource Locator (__rl) pattern где нужно
```

Это критичное улучшение: вместо того чтобы надеяться, что Claude угадает параметры из обучающих данных, мы передаём точные схемы из n8n source code.

#### 4.5.5 Источник данных для каталога нод

Данные извлекаются из:
- `https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/{NodeName}/description.ts` — полные параметры
- `https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/{NodeName}/__schema__/vX.Y.Z/output.json` — output schema
- `example/` — 6 реальных workflow JSON из n8n 2.1.5 пользователя (верифицированные рабочие конфигурации)

Каталог хранится статически в JS-файлах (не загружается на лету). Обновляется при смене версии n8n.
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

## 5. UI/UX Спецификация (PIVOT v2.0)

> **PIVOT:** Popup (420x520px) заменён на injected side panel в DOM n8n-редактора.
> Chat-first интерфейс. Secondary views (Workflows, Executions, History) — drawer overlays.

### 5.1 Panel Layout (injected в n8n editor)

```
┌─────────────────────────────────────────────┬──────────────────────────────┐
│                                             │ ⚡ n8n Pilot    [W][E][H][⚙] │ ← Header + view icons
│                                             ├──────────────────────────────┤
│         n8n Canvas Editor                   │ Context: My Workflow (abc123)│ ← Auto-detected
│         (workflow nodes)                    ├──────────────────────────────┤
│                                             │                              │
│         margin-right: 380px                 │  [assistant] Привет! Что     │ ← Chat messages
│         (pushed left when panel open)       │  создаём сегодня?            │
│                                             │                              │
│                                             │  [user] Нужен webhook →      │
│                                             │  Telegram notification       │
│                                             │                              │
│                                             │  [assistant] streaming...    │ ← Real-time SSE
│                                             │  ┌─ Workflow Card ─────────┐ │
│                                             │  │ "Webhook → Telegram"    │ │
│                                             │  │ 3 nodes · valid         │ │
│                                             │  │ [Copy] [Inject] [Save]  │ │
│                                             │  └────────────────────────┘ │
│                                             ├──────────────────────────────┤
│                                             │ [📎] Type message... [Send]  │ ← Input
│                                             ├──────────────────────────────┤
│                                             │ 🟢 Connected · 342/1.2k tok │ ← Status
└─────────────────────────────────────────────┴──────────────────────────────┘
       ~calc(100vw - 380px)                              380px
```

**Размеры:** 380px ширина (фиксированная), 100vh высота.
Collapsible: при сворачивании → 48px icon strip с логотипом.
Drag-handle: пользователь может расширять до 600px.

### 5.2 Chat Interface (основной вид)

```
┌──────────────────────────────┐
│ Message list (scrollable)     │
│                               │
│ [assistant bubble]            │  ← markdown rendering
│ [user bubble]                 │  ← plain text
│ [assistant bubble streaming]  │  ← token-by-token
│                               │
│ ── Workflow Card ────────── │  ← extracted from JSON in response
│ │ name, node count, status   │
│ │ [Copy] [Inject] [Save]     │
│ └─────────────────────────── │
│                               │
├──────────────────────────────┤
│ [📎 Attach WF] [input] [⏎]  │  ← input area
└──────────────────────────────┘
```

**Guided Dialog Mode** (при клике "New workflow" или первом сообщении):
1. Bot: "Что должно запускать этот workflow?" → кнопки: Webhook / Schedule / RSS / Manual / Other
2. Bot: "Какие сервисы нужны?" → multi-select с иконками нод
3. Bot: "Что делать с результатом?" → Send / Save / Return / Other
4. Bot: "Дополнительные детали?" → freeform textarea
5. → StructuredTask → Prompt Analyzer → Generation

### 5.3 Drawer Views (overlay поверх чата)

При клике на иконки [W][E][H][⚙] в header открывается drawer, закрывающий чат:

**[W] Workflows:**
```
┌──────────────────────────────┐
│ ← Back          Workflows     │
│ 🔍 Search...    [All ▼]      │
│ ┌────────────────────────┐   │
│ │ ▶ Email Notification    │   │
│ │   Active · 2h ago       │   │
│ │   [Toggle] [Delete]     │   │
│ ├────────────────────────┤   │
│ │ ⏸ Data Backup           │   │
│ │   Inactive · 1d ago     │   │
│ └────────────────────────┘   │
└──────────────────────────────┘
```

**[E] Executions:** аналогичный формат со статусами и фильтрами
**[H] History:** список предыдущих генераций с [Re-gen] [Delete]
**[⚙] Settings:** inline form (не modal)

### 5.4 Settings View (внутри panel)

```
┌──────────────────────────────┐
│ ← Back          Settings      │
│                               │
│ ── n8n Instance ──────────── │
│ URL: [https://n8n.srv...    ] │
│ API Key: [••••••••] [👁]     │
│ [Test] 🟢 Connected · v2.1.5 │
│                               │
│ ── Claude API ────────────── │
│ API Key: [••••••••] [👁]     │
│ Model: [claude-sonnet-4.5 ▼] │
│ [Test] 🟢 OK                 │
│                               │
│ ── Preferences ──────────── │
│ History limit: [50]           │
│ Auto-inject: [✓]             │
│ Notifications: [✓]           │
│                               │
│ [Export] [Import] [Reset]     │
│           [Save]              │
└──────────────────────────────┘
```

### 5.5 Context Menu (правый клик)

При выделении текста в n8n editor:
```
┌─────────────────────────────┐
│ 🔍 Explain with n8n Pilot   │
│ 💻 Generate Code Node        │
│ ✨ Optimize with AI          │
└─────────────────────────────┘
```

Результат появляется в chat panel.

### 5.6 Уведомления (toast)

Остаются как в v1.0 — injected DOM элемент, top-right corner, auto-dismiss 6s.
Используются для: workflow saved, injection result, errors.

### 5.7 Settings (модальное окно — УДАЛЕНО)

> Settings теперь живут в drawer view внутри panel (см. 5.4). Modal удалён вместе с popup.

### 5.8 Цветовая схема (Dark Theme)

> В panel CSS переменные объявлены на `:host` (Shadow DOM), не на `:root`:

```css
:host {
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
| MV3 worker suspend mid-stream | Средняя | Высокое | Keep-alive ping (§17.3.1) |
| Chrome profile theft (malware) | Низкая | Критическое | Optional Master Password (§4.1.1) |
| Execution payload OOM | Средняя | Среднее | includeData=false, lazy-loading (§4.4) |

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

## 7. Структура файлов проекта (PIVOT v2.0)

```
n8n-pilot/
├── manifest.json              # MODIFIED: no popup, +contextMenus, +web_accessible_resources
├── background.js              # MODIFIED: +streaming relay, +icon toggle, +context menu
├── content.js                 # REWRITTEN: panel injection orchestrator + Shadow DOM
│
├── panel/                     # NEW — injected panel UI (replaces popup)
│   ├── panel.html             # Panel HTML template (loaded into Shadow DOM)
│   ├── panel.css              # Panel styles (CSS variables on :host, dark theme)
│   ├── panel.js               # Main controller, msg() helper, view routing
│   ├── chat.js                # Chat interface, streaming display, guided dialog
│   ├── chat-memory.js         # Per-workflow conversation storage (chrome.storage.local)
│   ├── settings-view.js       # Settings form + API connection test
│   ├── workflows-view.js      # Workflow list drawer
│   ├── executions-view.js     # Executions list drawer
│   ├── history-view.js        # Generation history drawer
│   ├── context-menu.js        # Right-click action handler
│   └── n8n-context.js         # Detect current workflow, selected nodes, URL watching
│
├── lib/                       # Business logic
│   ├── crypto.js              # UNCHANGED — AES-256-GCM encryption
│   ├── settings.js            # UNCHANGED — Settings management
│   ├── claude-client.js       # MODIFIED — +sendMessageStream(), +sendConversation()
│   ├── n8n-client.js          # UNCHANGED — n8n REST API client
│   ├── workflow-generator.js  # MODIFIED — +generateFromBlueprint(), dynamic system prompt
│   ├── workflow-validator.js  # UNCHANGED — JSON validation & normalization
│   ├── prompt-analyzer.js     # NEW — structured task → node mapping → blueprint
│   ├── node-catalog-core.js   # NEW — 20-30 common nodes with full parameter schemas
│   ├── node-catalog-index.js  # NEW — ~280 remaining nodes (brief index)
│   ├── history.js             # UNCHANGED — Generation history
│   ├── versions.js            # UNCHANGED — Workflow version tracking
│   └── utils.js               # UNCHANGED — Shared utilities
│
├── example/                   # Real workflow JSONs from user's n8n 2.1.5 (reference data)
│   ├── Supabase-plugin.json
│   ├── MacWhisper (1).json
│   ├── inoreader_AI-_196267257.json
│   ├── inoreader_AI_Telegram-_196267257.json
│   ├── rss.app_Twitter_AI_selebs-_196267257.json
│   └── rss_app_Twitter_AI_feed__196267257.json
│
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── scripts/
│   └── bump-version.js        # Syncs version across package.json, manifest.json, SNAPSHOT, README
├── tests/
│   ├── unit/
│   │   ├── setup.js                   # ✅ Chrome API mocks (in-memory storage)
│   │   ├── crypto.test.js             # ✅ encryption tests
│   │   ├── settings.test.js           # ✅ settings CRUD tests
│   │   ├── workflow-validator.test.js  # ✅ validation/normalization
│   │   ├── history.test.js            # ✅ history CRUD/FIFO
│   │   ├── versions.test.js           # ✅ version tracking
│   │   ├── utils.test.js              # ✅ utility functions
│   │   ├── integration-ids.test.js    # ✅ DOM ID consistency (needs update for panel)
│   │   ├── kodex-regression.test.js   # ✅ regression suite (17 tests)
│   │   ├── prompt-analyzer.test.js    # ⏳ PLANNED — analyzer unit tests
│   │   ├── node-catalog.test.js       # ⏳ PLANNED — catalog integrity tests
│   │   └── chat-memory.test.js        # ⏳ PLANNED — chat memory tests
│   └── e2e/
│       ├── mocks/
│       │   └── n8n-server.js          # ✅ Express mock n8n API (port 5678)
│       └── (E2E specs planned — panel injection, chat flow, streaming)
│
├── popup.html                 # ❌ DELETED in v2.0 (replaced by panel/)
├── popup.js                   # ❌ DELETED in v2.0 (logic migrated to panel/)
├── popup.css                  # ❌ DELETED in v2.0 (styles migrated to panel/panel.css)
│
├── .env.example
├── package.json
├── CHANGELOG.md
├── README.md
├── SPEC.md                    # THIS FILE — technical specification v3.0
└── PLAN-workflow-testing.md   # Workflow auto-testing spec (v3.2)
```

> **File status legend:** ✅ = exists and passing, ⏳ = planned, ❌ = deleted
> Test files not yet implemented: claude-client.test.js, n8n-client.test.js,
> workflow-generator.test.js, content.test.js, panel/*.test.js, all E2E specs.

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
✓ Panel receives state updates from background (via tabs.sendMessage)
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

#### 8.3.1a Shadow DOM Testing Strategy

> **Проблема:** Closed Shadow DOM (`mode: 'closed'`) недоступен через обычные
> Playwright-селекторы (`page.locator()`). Элементы панели невидимы для E2E.

**Решение: Test Mode с Open Shadow DOM**

```javascript
// content.js — при создании Shadow DOM
const shadowMode = globalThis.__N8N_PILOT_TEST_MODE__ ? 'open' : 'closed';
const shadow = host.attachShadow({ mode: shadowMode });
```

```javascript
// E2E тест — перед инъекцией панели устанавливает флаг
await page.evaluate(() => { globalThis.__N8N_PILOT_TEST_MODE__ = true; });
```

**Доступ к Shadow DOM элементам в тестах:**

```javascript
// Helper для Playwright
async function panelLocator(page, selector) {
  const host = page.locator('#n8n-pilot-root');
  // В open mode Playwright может pierce через shadowRoot
  return host.locator(`pierce/${selector}`);
}

// Использование
const chatInput = await panelLocator(page, '#chat-input');
await chatInput.fill('Create a webhook workflow');
await panelLocator(page, '#btnSend').click();
```

**Альтернатива (без pierce):**
```javascript
// evaluate внутри Shadow DOM
const text = await page.evaluate(() => {
  const host = document.getElementById('n8n-pilot-root');
  return host.shadowRoot.querySelector('#chat-input').value;
});
```

**Важно:** `__N8N_PILOT_TEST_MODE__` = `true` ТОЛЬКО в E2E тестах.
В production всегда `closed` — гарантия CSS-изоляции и безопасности.

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

### 8.4 Coverage Map — New Modules (v2.0 architecture)

> Тесты для модулей, добавляемых в рамках архитектурного pivot. Все — `⏳ PLANNED`.

| Module | Test file | Key scenarios |
|--------|-----------|---------------|
| `panel/chat.js` | `tests/unit/chat.test.js` | Message rendering, workflow card extraction, streaming display, test button integration |
| `panel/chat-memory.js` | `tests/unit/chat-memory.test.js` | Save/load per-workflow, 100-msg limit, FIFO eviction, cross-workflow isolation |
| `panel/settings-view.js` | `tests/unit/settings-view.test.js` | Form validation, API test button, save/load, encryption |
| `panel/n8n-context.js` | `tests/unit/n8n-context.test.js` | URL parsing (workflowId), SPA navigation detection, selected nodes from DOM |
| `panel/context-menu.js` | `tests/unit/context-menu.test.js` | Action routing, selection text handling |
| `lib/prompt-analyzer.js` | `tests/unit/prompt-analyzer.test.js` | Structured task parsing, node mapping from catalog, blueprint generation |
| `lib/node-catalog-core.js` | `tests/unit/node-catalog.test.js` | Schema completeness (all 20-30 nodes), parameter validation |
| `lib/node-catalog-index.js` | (same file) | Index lookup, category filtering, fallback to index for unknown nodes |
| `content.js` (rewrite) | `tests/unit/content.test.js` | Shadow DOM creation, panel toggle, CSS isolation, n8n canvas resize |
| `background.js` (streaming) | `tests/unit/background-stream.test.js` | SSE chunk relay, abort handling, stream error propagation |

#### 8.4.1 E2E — Panel Architecture (⏳ PLANNED)

```
=== Panel Injection ===
✓ Panel appears in n8n editor DOM
✓ Panel toggle via extension icon click
✓ Shadow DOM isolates CSS (no leakage)
✓ n8n canvas resizes when panel opens/closes
✓ Panel survives SPA navigation

=== Chat + Streaming ===
✓ Chat message sent → streaming response appears token-by-token
✓ Workflow JSON detected → card with Copy/Inject/Save/Test
✓ Chat history persists per-workflow
✓ Switching workflow loads correct chat history
✓ Abort button stops streaming

=== Smart Generator ===
✓ Guided dialog: trigger → services → output questions
✓ Prompt analyzer maps to correct nodes from catalog
✓ Generated workflow passes validation
✓ Blueprint includes correct node types and connections

=== Context Awareness ===
✓ Workflow ID detected from URL
✓ Workflow name shown in panel header
✓ Selected nodes passed to AI context
✓ Context updates on SPA navigation

=== Context Menu ===
✓ Right-click "Explain" sends selection to chat
✓ Right-click "Generate Code Node" creates code node
✓ Menu items only appear on n8n pages
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
| Permissions | ≤ 6 обязательных (storage, clipboardWrite, notifications, scripting, activeTab, contextMenus) |
| Bundle size | < 300 KB (без иконок, включая panel/ и node catalogs) |
| Panel inject time | < 500ms (Shadow DOM creation + CSS load) |
| Streaming first token | < 2s (зависит от Claude) |
| Generation time (full pipeline) | < 45s (analyzer + generator) |
| Unit test coverage | > 90% |
| E2E test scenarios | > 40 |
| 0 external dependencies | runtime |
| 0 eval/innerHTML | безопасность |
| 0 telemetry calls | приватность |

---

## 12. Этапы разработки (PIVOT v2.0)

| Phase | Описание | Ключевые файлы |
|-------|----------|----------------|
| **1. Foundation** | Panel appears in n8n, settings work | content.js, panel/panel.html+css+js, panel/settings-view.js, manifest.json, background.js |
| **2. Chat + Streaming** | Chat UI, streaming generation | panel/chat.js, panel/chat-memory.js, lib/claude-client.js (+streaming), background.js |
| **3. Smart Generator** | Guided dialog, prompt analyzer, node catalogs | lib/prompt-analyzer.js, lib/node-catalog-core.js, lib/node-catalog-index.js, lib/workflow-generator.js |
| **4. Context + Views** | Workflow detection, secondary drawers | panel/n8n-context.js, panel/workflows-view.js, panel/executions-view.js, panel/history-view.js |
| **5. Polish** | Context menu, resize, keyboard shortcut, delete popup | panel/context-menu.js, tests/, SPEC.md, version bump to 2.0.0 |

---

## 13. Environment Matrix

| Параметр | Значение | Примечание |
|----------|----------|------------|
| Node.js | 18+ | Для запуска тестов и скриптов |
| Chrome | 116+ | `minimum_chrome_version` в manifest.json |
| n8n | **2.1.5** (self-hosted) | REST API v1, instance URL задаётся в Settings |
| Vitest | ^2.0.0 | Unit test framework |
| Playwright | ^1.45.0 | E2E test framework |
| Express | ^4.19.0 | Mock servers для E2E |
| Mock n8n port | 5678 | `tests/e2e/mocks/n8n-server.js` |
| Mock Claude port | 3100 | Planned, not yet implemented |
| Panel width | 380px (collapsible to 48px) | Injected into n8n editor DOM |
| Shadow DOM | closed mode | CSS isolation from n8n |
| Build mode | None | Нет bundler — нативные ES modules, programmatic injection |
| Manifest | V3 | Service Worker, no popup, contextMenus, web_accessible_resources |

**Self-host assumptions:**
- n8n 2.1.5 доступен по HTTPS URL (задаётся пользователем в Settings)
- n8n API key создан через Settings → API → Generate key
- Webhook URLs работают без дополнительной авторизации
- Claude API key с достаточным балансом для streaming
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
- Текущая версия: **SPEC v3.2** (architecture pivot, code v1.0.0 → v2.0.0 planned)

---

## 16. Workflow Testing — Overview

> Полная техническая спецификация: **[PLAN-workflow-testing.md](./PLAN-workflow-testing.md)** (v3.2)

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

## 17. Message Protocol (PIVOT v2.0)

> Все сообщения проходят через `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.
> Panel (content script) ↔ Background Service Worker.

### 17.1 Существующие actions (без изменений)

| Category | Actions |
|----------|---------|
| Settings | `getSettings`, `updateSettings`, `setApiKey`, `getApiKeyStatus`, `resetSettings`, `importSettings`, `exportSettings` |
| Connection | `testClaudeConnection`, `testN8nConnection` |
| Claude | `getClaudeModels` |
| Generation | `generateWorkflow`, `modifyWorkflow`, `explainWorkflow`, `cancelGeneration` |
| n8n CRUD | `listWorkflows`, `getWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `activateWorkflow`, `deactivateWorkflow` |
| Executions | `listExecutions`, `getExecution`, `deleteExecution` |
| Variables | `listVariables`, `createVariable`, `updateVariable`, `deleteVariable` |
| Tags/Creds | `listTags`, `createTag`, `listCredentials` |
| History | `getHistory`, `getHistoryEntry`, `deleteHistoryEntry`, `clearHistory`, `searchHistory` |
| Versions | `saveVersion`, `getVersions`, `getVersion`, `deleteVersion`, `diffVersions` |
| Injection | `injectWorkflow`, `showN8nNotification` |

### 17.2 Новые actions (v2.0)

| Action | Direction | Payload | Response |
|--------|-----------|---------|----------|
| `generateWorkflowStream` | panel → bg | `{ prompt, model, workflowId }` | `{ started: true }` |
| `STREAM_CHUNK` | bg → content | `{ type, text }` | — (fire-and-forget) |
| `STREAM_DONE` | bg → content | `{ type, content, workflow, tokensUsed }` | — |
| `STREAM_ERROR` | bg → content | `{ type, error }` | — |
| `analyzePrompt` | panel → bg | `{ task: StructuredTask }` | `{ blueprint: WorkflowBlueprint }` |
| `generateFromBlueprint` | panel → bg | `{ blueprint, stream: true }` | `{ started: true }` |
| `saveChatMessage` | panel → bg | `{ workflowId, role, content, metadata }` | `{ success: true }` |
| `getChatHistory` | panel → bg | `{ workflowId }` | `{ messages: [...] }` |
| `clearChatHistory` | panel → bg | `{ workflowId }` | `{ success: true }` |
| `togglePanel` | bg → content | `{ type: 'togglePanel' }` | — |
| `CONTEXT_MENU_ACTION` | bg → content | `{ type, menuId, selectedText }` | — |

### 17.3 Streaming Data Flow

```
1. User types prompt in chat → panel/chat.js
2. chat.js calls msg('generateWorkflowStream', { prompt, model, workflowId })
3. background.js receives, calls claudeClient.sendMessageStream(...)
4. claude-client.js: fetch(API_URL, { stream: true })
5. response.body.getReader() loop:
   - Parse SSE: "data: {type: 'content_block_delta', delta: {text: '...'} }"
   - For each text delta: onChunk(text)
6. background.js onChunk: chrome.tabs.sendMessage(tabId, { type: 'STREAM_CHUNK', text })
7. content.js receives STREAM_CHUNK → forwards to panel via Shadow DOM reference
8. panel/chat.js appends text to current assistant bubble (real-time)
9. On stream end: background.js sends STREAM_DONE with full content + extracted workflow
10. panel/chat.js finalizes message, shows workflow card if JSON detected
```

#### 17.3.1 MV3 Service Worker Keep-Alive

> **Проблема:** Manifest V3 Service Workers усыпляются Chrome при неактивности
> (таймаут ~30s без events, максимум ~5min). Длинный streaming от Claude API
> (10-60s) может быть прерван suspend'ом воркера.

**Решение: Keep-Alive Ping**

```javascript
// panel/chat.js — при начале стриминга запускает keep-alive
let keepAliveInterval = null;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'keepAlive' });
  }, 25_000); // каждые 25s (таймаут suspend ~30s)
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// background.js — обработчик
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'keepAlive') {
    sendResponse({ alive: true });
    return true;
  }
});
```

**Дополнительная защита:** `chrome.tabs.sendMessage()` в onChunk сам по себе
является event, сбрасывающим таймер suspend. Для потоков с редкими чанками
(>25s между ними) keep-alive ping обеспечивает непрерывность.

**Phase:** 2 (Chat + Streaming) — критично для базового функционала.

### 17.4 Extension Icon Click

```javascript
// background.js — no popup, toggle panel instead
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'togglePanel' });
  } catch {
    // Content script not yet injected — inject panel first
    await injectPanel(tab.id);
  }
});
```

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
