# Commit Policy — Что можно коммитить?

**Цель:** Защита от случайной утечки конфиденциальной информации в git.

**Как работает:** Claude AI читает этот файл перед каждым коммитом и проверяет изменения.

---

## ❌ НИКОГДА не коммитим (автоматически блокируется)

### 1. Внутренняя кухня разработки

```
notes/                  # Личные заметки, TODO списки
scratch/                # Черновики, эксперименты
experiments/            # Эксперименты и тесты
WIP_*                   # Work in progress файлы
INTERNAL_*              # Внутренние документы
DRAFT_*                 # Черновики
```

### 2. Framework логи и диалоги (КРИТИЧНО!)

```
dialog/                 # Claude диалоги (могут содержать credentials!)
.claude/logs/           # Framework execution logs
*.debug.log             # Debug логи
debug/                  # Debug файлы
reports/                # Bug reports и migration logs (уже в GitHub Issues)
```

### 3. Технические файлы

```
*.local.*               # Локальные конфиги
.env.local              # Локальные environment переменные
.vscode/                # IDE настройки (личные)
.idea/                  # IDE настройки (личные)
```

### 4. Чувствительные данные

```
secrets/                # Секреты
credentials/            # Credentials
*.key                   # Приватные ключи
*.pem                   # SSL certificates
.production-credentials # Production credentials
backup/                 # Backup файлы
```

---

## ✅ ВСЕГДА коммитим (автоматически одобряется)

### 1. Исходный код

```
src/                    # Source code
lib/                    # Libraries
tests/                  # Tests
```

### 2. Публичная документация

```
README.md               # Project README
CHANGELOG.md            # Version history
LICENSE                 # License file
```

### 3. Конфигурация проекта

```
package.json            # npm config
tsconfig.json           # TypeScript config
.gitignore              # Git ignore rules
```

---

## ⚠️ СПРОСИТЬ ПОЛЬЗОВАТЕЛЯ (требует подтверждения)

- Новые папки не из списков выше
- Имена содержат: `api-key`, `password`, `secret`, `prod`
- Файлы >1000 строк

---

## 🔧 Настройка под ваш проект

**Добавьте ваши правила здесь:**

```markdown
## ❌ НИКОГДА (n8n-pilot):

# Добавьте папки/файлы специфичные для вашего проекта
# Пример:
# business-plans/
# internal-docs/
```

---

**Редактируйте этот файл под свой проект!**
