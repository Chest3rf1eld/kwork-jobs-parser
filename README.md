# Kwork Jobs Parser

[Русская версия документации](README.ru.md)

Google Apps Script project for monitoring Kwork order emails in Gmail and forwarding matching orders to Telegram.

The script reads Gmail messages with the configured source label, parses Kwork order cards, applies budget and keyword filters, sends one Telegram digest per source email, and marks processed Gmail messages with a separate label.

## Features

- Parses Kwork email notifications from Gmail.
- Sends matching orders to Telegram through a bot.
- Sends one Telegram message per one Kwork email.
- Separates orders inside the Telegram digest with `---`.
- Shows email date, budget, category, buyer nickname, buyer level, number of buyer projects, and hire percentage.
- Tracks processed state per Gmail message through the Advanced Gmail service, so new messages in an old Gmail thread can still be processed.
- Handles Telegram `429 Too Many Requests` responses by waiting for `retry_after + 5` seconds before retrying.

## Requirements

- Google account with Gmail and Apps Script access.
- Telegram bot token from BotFather.
- Telegram chat id for the target private chat or group.
- Node.js and npm for local development.
- `clasp` for pushing code to Apps Script.

## Installation

1. Install dependencies:

```powershell
npm install
```

2. Log in to `clasp`:

```powershell
.\node_modules\.bin\clasp.cmd login
```

3. Create or link an Apps Script project:

```powershell
.\node_modules\.bin\clasp.cmd create --type standalone --title "Kwork Jobs Parser"
```

If you already have an Apps Script project, create a local `.clasp.json` with your `scriptId`. Do not commit `.clasp.json`; it is ignored by git.

4. Enable the Advanced Gmail service in Apps Script:

- Open the Apps Script editor.
- Go to Services.
- Add Gmail API.
- Use service identifier `Gmail`.

5. Push the code:

```powershell
.\node_modules\.bin\clasp.cmd push
```

6. Create a Gmail filter for Kwork notification emails and apply the label `TG_Notified`.

7. Open Apps Script project settings and add script properties:

- `TELEGRAM_BOT_TOKEN`: your Telegram bot token.
- `TELEGRAM_CHAT_ID`: Telegram chat id where notifications should be sent.
- `GMAIL_LABEL`: source Gmail label, default `TG_Notified`.
- `PROCESSED_LABEL`: processed Gmail label, default `kwork-processed`.
- `MIN_BUDGET_RUB`: minimum budget filter, `0` disables it.
- `MAX_BUDGET_RUB`: maximum budget filter, `0` disables it.
- `REQUIRED_KEYWORDS`: comma-separated required keywords, empty disables it.
- `EXCLUDED_KEYWORDS`: comma-separated excluded keywords, empty disables it.
- `TELEGRAM_PARSE_MODE`: default `HTML`.
- `TELEGRAM_MESSAGE_DELAY_MS`: delay between Telegram API calls, default `1500`.
- `TELEGRAM_MAX_RETRIES`: default `3`.
- `MAX_MESSAGES_PER_RUN`: maximum Gmail messages processed per run, default `20`.

8. Run `testTelegram()` once in Apps Script and grant permissions.

9. Run `setupTrigger()` once to create a 5-minute time trigger.

10. Run `processKworkEmails()` manually once or wait for the trigger.

## Telegram Output

Example:

```text
Дата: 06.09.2026 12:09
Заказов: 2

---

1 500 ₽ | Аудит по юзабилити
Разработка и IT > Юзабилити, тесты и помощь > Юзабилити-аудит
Заказчик: alexandrsalmin | ур. 6
История: Проектов на бирже: 560 | Нанял: 37%
Открыть заказ

---

500 ₽ | Помощь в изменении юзернейма бота
Разработка и IT > Юзабилити, тесты и помощь > Компьютерная и IT помощь
Заказчик: Elena_Benetskaya | ур. 1
История: Проектов на бирже: 12 | Нанял: 75%
Открыть заказ
```

## Local Commands

```powershell
.\node_modules\.bin\clasp.cmd status
.\node_modules\.bin\clasp.cmd push
.\node_modules\.bin\clasp.cmd pull
.\node_modules\.bin\clasp.cmd open
node --check Code.js
```

## Security Notes

- Do not store Telegram tokens, chat ids, `.clasp.json`, `.env` files, or exported emails in git.
- Store runtime secrets only in Apps Script script properties.
- `.eml` files are ignored because they may contain private email content.
- If a Telegram bot token was exposed outside script properties, rotate it in BotFather.
