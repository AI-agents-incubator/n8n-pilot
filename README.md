# n8n Pilot

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![Chrome Extension](https://img.shields.io/badge/chrome-Manifest%20V3-green)
![Tests](https://img.shields.io/badge/tests-415%20passing-brightgreen)
![Node](https://img.shields.io/badge/node-18%2B-339933)
![Claude API](https://img.shields.io/badge/Claude-Sonnet%204.5%20%7C%20Opus%204-blueviolet)
![License](https://img.shields.io/badge/license-Private-lightgrey)

AI-powered Chrome-расширение для управления n8n workflows с интеграцией Claude.

Объединяет функции n8n Chat, n8n Copilot и N8N Master в одном расширении. Полностью локальное — без внешних серверов, телеметрии и подписок.

---

## Быстрый старт

### 1. Установка расширения

1. Откройте Chrome и перейдите в `chrome://extensions/`
2. Включите **Developer mode** (переключатель в правом верхнем углу)
3. Нажмите **Load unpacked**
4. Выберите папку `n8n-pilot/`
5. Расширение появится в панели — закрепите его кнопкой 📌

### 2. Настройка

После установки нажмите иконку расширения и откройте **Settings** (⚙️ в правом верхнем углу).

#### Claude API (обязательно)

1. Перейдите на [console.anthropic.com](https://console.anthropic.com)
2. Убедитесь, что у вашего **workspace** есть кредиты (Settings → Billing)
3. Создайте API ключ (API Keys → Create Key)
4. Вставьте ключ в поле **Claude API Key** в настройках расширения

> ⚠️ Ключ привязан к конкретному workspace. Если у workspace нет кредитов — API не будет работать, даже если на аккаунте есть деньги.

#### n8n (обязательно для управления workflows)

1. В поле **n8n URL** введите адрес вашего инстанса (например `https://n8n.example.com`)
2. В поле **n8n API Key** введите API-ключ n8n (Settings → API → Create API Key в вашем n8n)
3. Chrome запросит разрешение на доступ к этому хосту — подтвердите

#### Настройки (опционально)

- **Default Model** — модель Claude по умолчанию (рекомендуется Sonnet 4.5)
- **Auto-inject** — автоматически инжектить workflow в n8n после генерации
- **Keep history** — сохранять историю генераций локально
- **Notifications** — показывать уведомления о результатах

Нажмите **Save Settings**.

### 3. Проверка подключения

После сохранения настроек статус-бар внизу покажет состояние:

- 🟢 **Зелёный** — оба сервиса подключены
- 🟡 **Жёлтый** — подключен только один (Claude или n8n)
- 🔴 **Красный** — ничего не подключено

---

## Использование

### Генерация workflow (вкладка Generate)

1. Откройте ваш n8n и **создайте новый пустой workflow** (или откройте существующий)
2. Нажмите иконку расширения n8n Pilot
3. На вкладке **Generate** опишите нужный workflow, например:

   ```
   Каждый час проверяй сайт https://example.com.
   Если он не отвечает — отправь сообщение в Telegram.
   ```

4. Выберите модель (по умолчанию Sonnet 4.5) и нажмите **Generate Workflow**
5. После генерации появятся 4 кнопки:

| Кнопка | Действие |
|--------|----------|
| **Copy** | Копирует JSON workflow в буфер обмена |
| **Inject** | Вставляет workflow прямо в открытый n8n-редактор |
| **Save** | Сохраняет workflow через n8n API |
| **Download** | Скачивает JSON-файл |

> 💡 **Inject** работает только если у вас открыт n8n в активной вкладке. Если ноды не появились автоматически — нажмите **Cmd+V** (Mac) или **Ctrl+V** (Windows) на canvas.

### Модификация workflow

Если у вас уже есть workflow в n8n и вы хотите его изменить:

1. Откройте workflow в n8n-редакторе
2. В расширении опишите изменение, например:

   ```
   Добавь обработку ошибок: если HTTP Request вернёт 500,
   подожди 30 секунд и попробуй ещё раз (макс. 3 попытки).
   ```

3. Нажмите **Generate** — расширение модифицирует текущий workflow

### Управление workflows (вкладка Workflows)

- Просмотр всех workflows вашего n8n инстанса
- Фильтр по статусу: All / Active / Inactive
- Поиск по названию
- Активация/деактивация workflows

### Мониторинг (вкладка Executions)

- Просмотр последних выполнений
- Фильтр по workflow и статусу (Success / Error / Running)

### История генераций (вкладка History)

- Все ранее сгенерированные workflows
- Поиск по промпту
- Повторное использование предыдущих генераций

### Debug-режим (вкладка Debug)

Для продвинутых пользователей:

1. Введите **System Prompt** и **User Prompt**
2. Нажмите **Send** — получите сырой ответ от Claude API
3. Полезно для тестирования промптов и отладки

---

## Безопасность

- **API ключи шифруются** (AES-256-GCM) перед сохранением в `chrome.storage.local`
- **Нет внешних серверов** — все запросы идут напрямую к Anthropic API и вашему n8n
- **Минимальные permissions** — расширение запрашивает доступ только к нужным хостам
- **Content Security Policy** — запрещает inline-скрипты и внешние ресурсы

---

## Разработка

### Требования

- Node.js 18+
- Chrome 116+

### Установка зависимостей

```bash
cd n8n-pilot
npm install
```

### Запуск тестов

```bash
# Все юнит-тесты
npm test

# Тесты в режиме watch
npm run test:watch

# С покрытием
npm run test:coverage
```

### Структура проекта

```
n8n-pilot/
├── manifest.json          # Chrome Extension Manifest V3
├── background.js          # Service Worker (роутинг сообщений)
├── content.js             # Content Script (инъекция панели в n8n)
├── panel/
│   ├── panel.html         # Разметка боковой панели (Shadow DOM)
│   ├── panel.css          # Стили панели (dark theme)
│   ├── chat.js            # Чат контроллер (standalone)
│   └── settings-view.js   # Контроллер настроек
├── lib/
│   ├── claude-client.js       # Клиент Anthropic API (streaming)
│   ├── workflow-generator.js  # Генерация с blueprint + template hints
│   ├── workflow-validator.js  # Normalize pipeline (параметры, модели)
│   ├── prompt-analyzer.js     # NLP: промпт → blueprint (55+ платформ)
│   ├── model-actualizer.js    # Актуализация устаревших AI моделей
│   ├── template-search.js     # Клиент библиотеки шаблонов (2053 шт.)
│   ├── node-catalog-core.js   # Схемы параметров ключевых нод
│   ├── node-catalog-index.js  # Реестр 150+ типов нод n8n
│   ├── n8n-client.js          # Клиент n8n REST API
│   ├── settings.js            # Управление настройками
│   ├── history.js             # История генераций
│   ├── versions.js            # Версионирование workflows
│   ├── crypto.js              # Шифрование API ключей (AES-256-GCM)
│   └── utils.js               # Утилиты
├── example/                   # 6 реальных workflow JSON
├── tests/
│   ├── unit/                  # 415 юнит-тестов (Vitest)
│   ├── e2e/                   # E2E тесты (Playwright)
│   └── acceptance/            # Интеграционные тесты с n8n
└── icons/                     # Иконки 16-128px
```

### Поддерживаемые модели Claude

| Модель | ID | Описание |
|--------|----|----------|
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | Лучший баланс скорости и качества |
| Claude Sonnet 4 | `claude-sonnet-4-6` | Быстрый и способный |
| Claude Opus 4 | `claude-opus-4-6` | Самый мощный, медленнее |
| Claude Haiku 3.5 | `claude-haiku-3-5-20241022` | Самый быстрый и дешёвый |

---

## Устранение проблем

### «Credit balance too low»

Ваш API ключ привязан к workspace без кредитов. Решение:
1. Откройте [console.anthropic.com](https://console.anthropic.com)
2. Проверьте workspace в левом верхнем углу
3. Перейдите в Settings → Billing
4. Убедитесь, что у этого workspace есть кредиты
5. Создайте новый ключ **в правильном workspace**

### «Invalid x-api-key»

API ключ невалиден или отозван. Создайте новый в консоли Anthropic.

### Inject не работает

1. Убедитесь, что n8n открыт в активной вкладке Chrome
2. Должен быть открыт **редактор workflow** (canvas с нодами)
3. Если автоматическая вставка не сработала — нажмите **Cmd+V** / **Ctrl+V** на canvas
4. При первом использовании Chrome может запросить разрешение на доступ к хосту n8n — подтвердите

### Статус жёлтый (partial)

Подключен только один сервис. Проверьте настройки второго:
- Claude: правильный API ключ с кредитами
- n8n: правильный URL и API ключ, n8n инстанс доступен

---

## Лицензия

Приватный проект. Автор: Alex Krol.
