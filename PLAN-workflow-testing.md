# План: Автотестирование workflows в n8n Pilot

## Проблема

Сейчас расширение генерирует workflow и может его инжектить в n8n, но не может проверить, что workflow реально работает. Пользователь вынужден вручную открывать n8n, активировать workflow и запускать тест. Это прерывает flow «задал → получил → работает».

## Цель

Добавить полный цикл: **Generate → Deploy → Test → Report** — прямо из расширения. Одна кнопка «Test» после генерации.

---

## Архитектура решения

### n8n API: что доступно

n8n (self-hosted) поддерживает публичный endpoint:

```
POST /api/v1/workflows/{id}/execute
Header: X-N8N-API-KEY: ...
Response: { "executionId": 123 }
```

Выполнение **асинхронное** — возвращается `executionId`, результат забираем через:

```
GET /api/v1/executions/{executionId}
Response: { "id": 123, "status": "success|error|running|waiting", "data": {...} }
```

Также доступны:
- `GET /api/v1/credentials` — список credentials (имя, тип, ID; без секретов)
- `POST /api/v1/workflows` — создание workflow
- `PUT /api/v1/workflows/{id}` — обновление workflow
- `POST /api/v1/workflows/{id}/activate` — активация

### Полный цикл тестирования

```
[Generate] → [Create/Update via API] → [Execute] → [Poll status] → [Show results]
```

**Шаг 1: Deploy** — создаём workflow через n8n API (POST /workflows), получаем ID.

**Шаг 2: Execute** — запускаем через POST /workflows/{id}/execute, получаем executionId.

**Шаг 3: Poll** — опрашиваем GET /executions/{executionId} каждые 2 секунды, макс 60 секунд.

**Шаг 4: Report** — показываем результат: ✅ success / ❌ error + детали.

---

## Изменения по файлам

### 1. `lib/n8n-client.js` — новые методы

```javascript
// Запустить workflow
executeWorkflow(id) → POST /workflows/{id}/execute → { executionId }

// Ждать завершения (polling)
waitForExecution(executionId, { timeout: 60000, interval: 2000 }) → execution result

// Полный цикл: deploy + execute + wait
testWorkflow(workflowData, { timeout }) → { success, execution, duration, error }
```

### 2. `background.js` — новые обработчики сообщений

```javascript
case 'testWorkflow':
  // 1. createWorkflow(data) → получить id
  // 2. executeWorkflow(id) → получить executionId
  // 3. waitForExecution(executionId) → результат
  // 4. (опционально) deleteWorkflow(id) если тестовый
  return { success, execution, logs }

case 'executeWorkflow':
  // Запуск существующего workflow по id
  return { executionId }

case 'getExecutionResult':
  // Получить результат конкретного execution
  return execution
```

### 3. `popup.html` — кнопка Test в Generate-секции

Добавляем 5-ю кнопку **Test** рядом с Copy/Save/Inject/Download:

```html
<button id="test-workflow-btn" title="Deploy & test workflow">
  ▶ Test
</button>
```

Плюс секция для результатов теста:

```html
<div id="test-results" class="hidden">
  <div class="test-status"></div>    <!-- ✅ / ❌ / ⏳ -->
  <div class="test-details"></div>   <!-- время, ноды, ошибки -->
  <div class="test-node-log"></div>  <!-- пошаговый лог нодов -->
</div>
```

### 4. `popup.js` — логика тестирования

```javascript
async function testWorkflow() {
  showTestProgress('Deploying workflow...');

  const result = await chrome.runtime.sendMessage({
    action: 'testWorkflow',
    workflow: currentGeneratedWorkflow,
  });

  if (result.success) {
    showTestResult('success', result);
  } else {
    showTestResult('error', result);
  }
}
```

Показываем:
- ⏳ «Deploying...» → «Executing...» → «Waiting for result...»
- ✅ «Workflow passed — 3 nodes executed in 1.2s»
- ❌ «Node "HTTP Request" failed: Connection refused» + suggestions от Claude

### 5. `popup.css` — стили для тест-результатов

Стили для progress indicator, success/error cards, node execution log.

### 6. `lib/workflow-generator.js` — анализ ошибок через Claude

Новый метод:

```javascript
analyzeError({ workflow, execution, error }) → {
  diagnosis: 'причина ошибки',
  fix: 'предложение по исправлению',
  fixedWorkflow: { ... }  // опционально — автофикс
}
```

Если тест упал — Claude анализирует ошибку и предлагает фикс. Пользователь может нажать «Apply Fix & Retest».

---

## Обработка credentials

Credentials в n8n управляются отдельно и привязываются к нодам по ID. Наш подход:

1. **Перед тестом** — запрашиваем `GET /credentials` и показываем список доступных
2. **При генерации** — Claude знает типы credentials (Telegram, HTTP, Gmail, etc.)
3. **Auto-matching** — если в n8n есть credential нужного типа, подставляем автоматически
4. **Ручной выбор** — если credentials несколько одного типа, показываем выбор пользователю

```javascript
// n8n-client.js
listCredentials() // уже есть
matchCredentials(workflow) // НОВЫЙ — сопоставляет ноды с credentials по типу
```

---

## UI Flow (пользовательский сценарий)

```
1. Пользователь вводит промпт: "Check site every hour, alert Telegram if down"
2. Нажимает Generate → workflow создан
3. Нажимает Test:
   3a. Расширение проверяет credentials:
       - HTTP Request → не требует credentials ✅
       - Telegram → нужен credential типа "telegramApi"
       - Найден: "My Telegram Bot" (id: 5) → подставлен автоматически
   3b. Workflow деплоится в n8n (POST /workflows)
   3c. Workflow запускается (POST /workflows/{id}/execute)
   3d. Polling результата...
   3e. Результат: ✅ Success — 4 nodes executed, 1.8s
4. Пользователь видит: workflow работает, можно активировать
5. Нажимает Inject → workflow вставляется в редактор
```

---

## Ограничения и что делать

| Ситуация | Решение |
|----------|---------|
| Workflow с Webhook-триггером | Нельзя протестировать автоматически — пропускаем триггер, тестируем остальные ноды |
| Workflow с Schedule Trigger | Запускаем вручную через API (execute endpoint игнорирует триггер и запускает всю цепочку) |
| Нет нужных credentials | Показываем: «Для теста нужен Telegram credential. Создайте его в n8n Settings → Credentials» |
| Execution timeout (>60s) | Показываем: «Execution still running» + ссылка на n8n UI |
| n8n API не поддерживает execute | Fallback: workflow деплоится, пользователю даётся прямая ссылка на n8n для ручного теста |

---

## Порядок реализации

### Фаза 1: Базовый цикл (MVP)
1. `n8n-client.js` — добавить `executeWorkflow()` и `waitForExecution()`
2. `background.js` — обработчик `testWorkflow`
3. `popup.html/js/css` — кнопка Test + display результатов
4. Тесты для новых методов

### Фаза 2: Credentials matching
5. `n8n-client.js` — `matchCredentials(workflow)`
6. UI для выбора credentials при конфликтах
7. Автоматическая подстановка credentials перед тестом

### Фаза 3: Smart error analysis
8. `workflow-generator.js` — `analyzeError()` через Claude
9. UI для «Apply Fix & Retest» цикла
10. Итеративный цикл: test → fix → retest (макс 3 итерации)

### Фаза 4: Advanced
11. Тестирование с mock-данными (pinned data)
12. Пошаговый лог выполнения нодов
13. Сравнение expected vs actual output

---

## Оценка объёма

| Фаза | Файлы | Строки кода | Тесты |
|------|-------|-------------|-------|
| Фаза 1 (MVP) | 5 | ~200 | ~30 |
| Фаза 2 (Credentials) | 3 | ~150 | ~20 |
| Фаза 3 (Error analysis) | 2 | ~100 | ~15 |
| Фаза 4 (Advanced) | 4 | ~250 | ~30 |
| **Итого** | **~700** | **~95 тестов** |

---

*Источники:*
- [PR #20234: Add workflow execute endpoint](https://github.com/n8n-io/n8n/pull/20234) — POST /workflows/{id}/execute
- [n8n Public API docs](https://docs.n8n.io/api/)
- [Community: Execute workflow via API](https://community.n8n.io/t/execute-a-workflow-through-api/3197)
