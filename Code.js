const CONFIG_DEFAULTS = {
  gmailLabel: 'kwork-orders',
  processedLabel: 'kwork-processed',
  searchWindowHours: 24,
  minBudgetRub: 0,
  maxBudgetRub: 0,
  requiredKeywords: '',
  excludedKeywords: '',
  telegramParseMode: 'HTML'
};

function processKworkEmails() {
  const config = getConfig_();
  const sourceLabel = getOrCreateLabel_(config.gmailLabel);
  const processedLabel = getOrCreateLabel_(config.processedLabel);
  const threads = sourceLabel.getThreads(0, 50);

  threads.forEach(function(thread) {
    if (threadHasLabel_(thread, processedLabel.getName())) {
      return;
    }

    const messages = thread.getMessages();

    messages.forEach(function(message) {
      const order = parseKworkMessage_(message, config);
      if (!order) {
        return;
      }

      if (!matchesFilters_(order, config)) {
        return;
      }

      sendTelegramAlert_(order, config);
    });

    markThreadProcessed_(thread, processedLabel);
  });
}

function setupTrigger() {
  const handler = 'processKworkEmails';
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === handler;
  });

  if (!exists) {
    ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
  }
}

function saveConfig(config) {
  const properties = PropertiesService.getScriptProperties();
  Object.keys(config).forEach(function(key) {
    properties.setProperty(key, String(config[key]));
  });
}

function setDefaultConfig() {
  saveConfig({
    GMAIL_LABEL: CONFIG_DEFAULTS.gmailLabel,
    PROCESSED_LABEL: CONFIG_DEFAULTS.processedLabel,
    SEARCH_WINDOW_HOURS: CONFIG_DEFAULTS.searchWindowHours,
    MIN_BUDGET_RUB: CONFIG_DEFAULTS.minBudgetRub,
    MAX_BUDGET_RUB: CONFIG_DEFAULTS.maxBudgetRub,
    REQUIRED_KEYWORDS: CONFIG_DEFAULTS.requiredKeywords,
    EXCLUDED_KEYWORDS: CONFIG_DEFAULTS.excludedKeywords,
    TELEGRAM_PARSE_MODE: CONFIG_DEFAULTS.telegramParseMode
  });
}

function testTelegram() {
  const config = getConfig_();
  sendTelegramMessage_(
    [
      '<b>Kwork monitor connected</b>',
      '',
      'Test message from Google Apps Script.'
    ].join('\n'),
    config
  );
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();

  return {
    gmailLabel: properties.getProperty('GMAIL_LABEL') || CONFIG_DEFAULTS.gmailLabel,
    processedLabel: properties.getProperty('PROCESSED_LABEL') || CONFIG_DEFAULTS.processedLabel,
    searchWindowHours: Number(properties.getProperty('SEARCH_WINDOW_HOURS') || CONFIG_DEFAULTS.searchWindowHours),
    minBudgetRub: Number(properties.getProperty('MIN_BUDGET_RUB') || CONFIG_DEFAULTS.minBudgetRub),
    maxBudgetRub: Number(properties.getProperty('MAX_BUDGET_RUB') || CONFIG_DEFAULTS.maxBudgetRub),
    requiredKeywords: splitKeywords_(properties.getProperty('REQUIRED_KEYWORDS') || CONFIG_DEFAULTS.requiredKeywords),
    excludedKeywords: splitKeywords_(properties.getProperty('EXCLUDED_KEYWORDS') || CONFIG_DEFAULTS.excludedKeywords),
    telegramBotToken: properties.getProperty('TELEGRAM_BOT_TOKEN') || '',
    telegramChatId: properties.getProperty('TELEGRAM_CHAT_ID') || '',
    telegramParseMode: properties.getProperty('TELEGRAM_PARSE_MODE') || CONFIG_DEFAULTS.telegramParseMode
  };
}

function parseKworkMessage_(message, config) {
  const messageDate = message.getDate();
  const minDate = new Date(Date.now() - config.searchWindowHours * 60 * 60 * 1000);
  if (messageDate < minDate) {
    return null;
  }

  const subject = message.getSubject() || '';
  const plainBody = message.getPlainBody() || '';
  const htmlBody = message.getBody() || '';
  const combinedText = [subject, plainBody].join('\n').trim();
  const normalizedText = normalizeText_(combinedText);
  const budgetRub = extractBudgetRub_(combinedText);
  const url = extractFirstUrl_(htmlBody) || extractFirstUrl_(plainBody) || '';

  return {
    id: message.getId(),
    date: messageDate,
    subject: subject,
    body: plainBody,
    text: combinedText,
    normalizedText: normalizedText,
    budgetRub: budgetRub,
    url: url
  };
}

function matchesFilters_(order, config) {
  if (!order.normalizedText) {
    return false;
  }

  if (config.minBudgetRub > 0 && order.budgetRub > 0 && order.budgetRub < config.minBudgetRub) {
    return false;
  }

  if (config.maxBudgetRub > 0 && order.budgetRub > 0 && order.budgetRub > config.maxBudgetRub) {
    return false;
  }

  if (config.requiredKeywords.length > 0) {
    const hasRequired = config.requiredKeywords.some(function(keyword) {
      return order.normalizedText.indexOf(keyword) !== -1;
    });
    if (!hasRequired) {
      return false;
    }
  }

  const hasExcluded = config.excludedKeywords.some(function(keyword) {
    return order.normalizedText.indexOf(keyword) !== -1;
  });
  if (hasExcluded) {
    return false;
  }

  return true;
}

function sendTelegramAlert_(order, config) {
  const lines = [
    '<b>New Kwork order</b>',
    '',
    '<b>Subject:</b> ' + escapeHtml_(order.subject || 'No subject'),
    '<b>Budget:</b> ' + (order.budgetRub > 0 ? order.budgetRub + ' RUB' : 'unknown'),
    '<b>Date:</b> ' + Utilities.formatDate(order.date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    ''
  ];

  const excerpt = truncateText_(order.body || order.text, 1200);
  if (excerpt) {
    lines.push('<b>Text:</b>');
    lines.push(escapeHtml_(excerpt));
    lines.push('');
  }

  if (order.url) {
    lines.push('<a href="' + escapeHtml_(order.url) + '">Open order</a>');
  }

  sendTelegramMessage_(lines.join('\n'), config);
}

function sendTelegramMessage_(text, config) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured.');
  }

  const url = 'https://api.telegram.org/bot' + config.telegramBotToken + '/sendMessage';
  const payload = {
    chat_id: config.telegramChatId,
    text: text,
    parse_mode: config.telegramParseMode,
    disable_web_page_preview: true
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Telegram API error: ' + code + ' ' + response.getContentText());
  }
}

function getOrCreateLabel_(name) {
  const existing = GmailApp.getUserLabelByName(name);
  return existing || GmailApp.createLabel(name);
}

function markThreadProcessed_(thread, processedLabel) {
  thread.addLabel(processedLabel);
}

function threadHasLabel_(thread, labelName) {
  return thread.getLabels().some(function(label) {
    return label.getName() === labelName;
  });
}

function splitKeywords_(value) {
  return String(value)
    .split(',')
    .map(function(item) {
      return normalizeText_(item);
    })
    .filter(function(item) {
      return item.length > 0;
    });
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBudgetRub_(text) {
  const normalized = String(text || '').replace(/\s/g, '');
  const match = normalized.match(/(\d[\d.,]*)\s*(?:rub|rur|p\.|r\.)/i);
  if (!match) {
    return 0;
  }

  const numeric = match[1].replace(/[^\d]/g, '');
  return numeric ? Number(numeric) : 0;
}

function extractFirstUrl_(text) {
  const match = String(text || '').match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : '';
}

function truncateText_(text, maxLength) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength - 3).trim() + '...';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
