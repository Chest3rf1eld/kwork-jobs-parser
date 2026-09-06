# Kwork Jobs Parser

Google Apps Script project for monitoring Kwork order emails in Gmail and forwarding matching orders to Telegram.
Each Kwork email is sent as one Telegram digest with the email date at the top and `---` between orders.

## Stack

- Gmail notifications from Kwork
- Google Apps Script
- Telegram Bot API
- `clasp` for local development

## Local commands

```powershell
.\node_modules\.bin\clasp.cmd status
.\node_modules\.bin\clasp.cmd push
.\node_modules\.bin\clasp.cmd pull
.\node_modules\.bin\clasp.cmd open
```

## Gmail setup

Create a Gmail filter for Kwork emails and assign label `TG_Notified`.

Recommended filter:

- sender: Kwork notification address
- subject: order notification keywords

The script reads only messages with the configured label and adds `kwork-processed` after handling them.
Processed state is stored per Gmail message through the Gmail API, so new emails in an old Gmail thread can still be processed.

## Script properties

Open Apps Script project settings and add these script properties:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GMAIL_LABEL` default: `TG_Notified`
- `PROCESSED_LABEL` default: `kwork-processed`
- `SEARCH_WINDOW_HOURS` default: `24`
- `MIN_BUDGET_RUB` default: `0`
- `MAX_BUDGET_RUB` default: `0`
- `REQUIRED_KEYWORDS` example: `python, parser, telegram`
- `EXCLUDED_KEYWORDS` example: `design, logo`
- `TELEGRAM_PARSE_MODE` default: `HTML`
- `TELEGRAM_MESSAGE_DELAY_MS` default: `1500`
- `TELEGRAM_MAX_RETRIES` default: `3`
- `MAX_MESSAGES_PER_RUN` default: `20`

`MIN_BUDGET_RUB` and `MAX_BUDGET_RUB` use `0` to mean "disabled".

## First run

1. Push code:
```powershell
.\node_modules\.bin\clasp.cmd push
```
2. Open Apps Script:
```powershell
.\node_modules\.bin\clasp.cmd open
```
3. In editor, run `setDefaultConfig()` once.
4. Add script properties with real Telegram values.
5. Run `testTelegram()` once and approve permissions.
6. Run `setupTrigger()` once to create a 5-minute trigger.
7. Send a test Kwork email into the labeled mailbox and run `processKworkEmails()`.

## Notes

- Email parsing is based on notification content and may need adjustments if Kwork changes email format.
- Budget extraction is heuristic and currently expects Latin currency markers such as `RUB`.
- The script uses the Advanced Gmail service to search only messages with `TG_Notified` and without `kwork-processed`.
- If you want, the next step is moving filters into a Google Sheet for non-code editing.
