const CONFIG_DEFAULTS = {
  gmailLabel: 'TG_Notified',
  processedLabel: 'kwork-processed',
  searchWindowHours: 24,
  minBudgetRub: 0,
  maxBudgetRub: 0,
  requiredKeywords: '',
  excludedKeywords: '',
  telegramParseMode: 'HTML',
  telegramMessageDelayMs: 1500,
  telegramMaxRetries: 3,
  processedMessagesProperty: 'PROCESSED_MESSAGE_IDS'
};

let lastTelegramSendAtMs_ = 0;
let nextTelegramSendAtMs_ = 0;

function processKworkEmails() {
  const config = getConfig_();
  const sourceLabel = getOrCreateLabel_(config.gmailLabel);
  const processedLabel = getOrCreateLabel_(config.processedLabel);
  const threads = sourceLabel.getThreads(0, 50);
  const processedMessageIds = getProcessedMessageIds_(config);
  console.log('processKworkEmails:start label=%s processedLabel=%s threads=%s processedMessages=%s', config.gmailLabel, config.processedLabel, threads.length, Object.keys(processedMessageIds).length);

  threads.forEach(function(thread) {
    console.log('thread:start id=%s subject=%s hasProcessed=%s messageCount=%s', thread.getId(), thread.getFirstMessageSubject(), threadHasLabel_(thread, processedLabel.getName()), thread.getMessageCount());

    const messages = thread.getMessages();
    let foundProjectsInThread = false;
    let processedMessagesInThread = 0;

    messages.forEach(function(message) {
      if (isMessageProcessed_(processedMessageIds, message.getId())) {
        console.log('message:skip_processed id=%s subject=%s', message.getId(), message.getSubject());
        return;
      }

      console.log('message:start id=%s subject=%s date=%s', message.getId(), message.getSubject(), message.getDate());
      const projects = parseKworkProjectsFromMessage_(message, config);
      console.log('message:projects_found id=%s count=%s', message.getId(), projects.length);
      if (projects.length === 0) {
        console.log('message:not_marked_no_projects id=%s', message.getId());
        return;
      }

      foundProjectsInThread = true;
      const matchingProjects = projects.filter(function(project) {
        return matchesFilters_(project, config);
      });
      console.log('message:projects_matched id=%s count=%s', message.getId(), matchingProjects.length);

      if (matchingProjects.length > 0) {
        sendTelegramDigest_(matchingProjects, message, config);
      } else {
        console.log('message:no_matches id=%s', message.getId());
      }

      markMessageProcessed_(processedMessageIds, message.getId());
      processedMessagesInThread++;
    });

    if (processedMessagesInThread > 0) {
      saveProcessedMessageIds_(config, processedMessageIds);
    }

    if (foundProjectsInThread && !threadHasLabel_(thread, processedLabel.getName())) {
      markThreadProcessed_(thread, processedLabel);
      console.log('thread:marked_processed id=%s label=%s', thread.getId(), processedLabel.getName());
    } else if (foundProjectsInThread) {
      console.log('thread:already_marked_processed id=%s label=%s', thread.getId(), processedLabel.getName());
    } else {
      console.log('thread:not_marked_no_projects id=%s', thread.getId());
    }
  });

  console.log('processKworkEmails:done');
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

function debugKworkEmails() {
  const config = getConfig_();
  const sourceLabel = getOrCreateLabel_(config.gmailLabel);
  const processedLabel = getOrCreateLabel_(config.processedLabel);
  const threads = sourceLabel.getThreads(0, 10);
  console.log('debugKworkEmails:start label=%s processedLabel=%s threads=%s', config.gmailLabel, config.processedLabel, threads.length);

  threads.forEach(function(thread) {
    const hasProcessed = threadHasLabel_(thread, processedLabel.getName());
    console.log('debug:thread id=%s subject=%s hasProcessed=%s messageCount=%s', thread.getId(), thread.getFirstMessageSubject(), hasProcessed, thread.getMessageCount());

    thread.getMessages().slice(-3).forEach(function(message) {
      const htmlBody = message.getBody() || '';
      const newOfferCount = countMatches_(htmlBody, /new_offer\?project/g);
      const rows = extractProjectRows_(htmlBody);
      const projects = rows.map(function(rowHtml) {
        return parseProjectRow_(rowHtml, message.getDate());
      }).filter(function(project) {
        return !!project;
      });
      const matched = projects.filter(function(project) {
        return matchesFilters_(project, config);
      });

      console.log(
        'debug:message id=%s subject=%s date=%s htmlLength=%s newOfferCount=%s rows=%s projects=%s matched=%s firstTitle=%s',
        message.getId(),
        message.getSubject(),
        message.getDate(),
        htmlBody.length,
        newOfferCount,
        rows.length,
        projects.length,
        matched.length,
        projects[0] ? projects[0].title : ''
      );
    });
  });

  console.log('debugKworkEmails:done');
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
    telegramParseMode: properties.getProperty('TELEGRAM_PARSE_MODE') || CONFIG_DEFAULTS.telegramParseMode,
    telegramMessageDelayMs: Number(properties.getProperty('TELEGRAM_MESSAGE_DELAY_MS') || CONFIG_DEFAULTS.telegramMessageDelayMs),
    telegramMaxRetries: Number(properties.getProperty('TELEGRAM_MAX_RETRIES') || CONFIG_DEFAULTS.telegramMaxRetries),
    processedMessagesProperty: CONFIG_DEFAULTS.processedMessagesProperty
  };
}

function parseKworkProjectsFromMessage_(message, config) {
  const messageDate = message.getDate();
  const htmlBody = message.getBody() || '';
  const subject = String(message.getSubject() || '').toLowerCase();
  if (!htmlBody || subject.indexOf('kwork') === -1) {
    console.log('message:skip_non_kwork id=%s subject=%s html=%s', message.getId(), message.getSubject(), htmlBody ? 'yes' : 'no');
    return [];
  }

  const rows = extractProjectRows_(htmlBody);
  console.log('message:project_rows id=%s rows=%s', message.getId(), rows.length);
  return rows.map(function(rowHtml) {
    return parseProjectRow_(rowHtml, messageDate);
  }).filter(function(project) {
    return !!project;
  });
}

function extractProjectRows_(html) {
  const normalizedHtml = String(html || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ');
  const rowPattern = /<tr\b[^>]*>\s*<td\b[^>]*>\s*<div\b[^>]*>\s*<a\b[^>]+href=["']https:\/\/kwork\.ru\/new_offer\?project[^"']*["'][\s\S]*?<\/tr>/gi;
  const rows = normalizedHtml.match(rowPattern);
  return rows || [];
}

function parseProjectRow_(rowHtml, messageDate) {
  const cells = rowHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi);
  if (!cells || cells.length < 3) {
    console.log('project:skip_bad_row cells=%s', cells ? cells.length : 0);
    return null;
  }

  const projectLink = extractAttribute_(cells[0], /<a[^>]+href="([^"]+)"/i);
  const title = cleanText_(extractInnerHtml_(cells[0], /<a[^>]*>([\s\S]*?)<\/a>/i));
  const category = cleanText_(extractAllInnerHtml_(cells[0], /<div[^>]*>([\s\S]*?)<\/div>/gi).slice(1).join(' '));

  const buyerLink = extractAttribute_(cells[1], /<a[^>]+href="([^"]+)"/i);
  const buyerName = cleanText_(extractFirstBuyerName_(cells[1]));
  const buyerStats = extractBuyerStats_(cells[1]);
  const budgetText = cleanText_(stripTags_(cells[2]));
  const budgetRub = extractBudgetRub_(budgetText);

  const normalizedText = normalizeText_([
    title,
    category,
    buyerName,
    buyerStats.projectsText,
    buyerStats.hiredText,
    budgetText
  ].join(' '));

  return {
    title: title,
    category: category,
    url: projectLink,
    buyerName: buyerName,
    buyerUrl: buyerLink,
    buyerProjectsText: buyerStats.projectsText,
    buyerHiredText: buyerStats.hiredText,
    budgetText: budgetText,
    budgetRub: budgetRub,
    date: messageDate,
    normalizedText: normalizedText
  };
}

function extractFirstBuyerName_(html) {
  const spans = extractAllInnerHtml_(html, /<span\b[^>]*>([\s\S]*?)<\/span>/gi)
    .map(function(item) {
      return cleanText_(item);
    })
    .filter(function(item) {
      return item.length > 0;
    });

  return spans.length > 0 ? spans[spans.length - 1] : '';
}

function extractBuyerStats_(html) {
  const divs = extractAllInnerHtml_(html, /<div\b[^>]*>([\s\S]*?)<\/div>/gi)
    .map(function(item) {
      return cleanText_(item);
    })
    .filter(function(item) {
      return item.length > 0;
    });

  return {
    projectsText: divs[0] || '',
    hiredText: divs[1] || ''
  };
}

function matchesFilters_(project, config) {
  if (!project.normalizedText) {
    console.log('project:skip_empty_text title=%s', project.title || '');
    return false;
  }

  if (config.minBudgetRub > 0 && project.budgetRub > 0 && project.budgetRub < config.minBudgetRub) {
    console.log('project:skip_min_budget title=%s budget=%s min=%s', project.title, project.budgetRub, config.minBudgetRub);
    return false;
  }

  if (config.maxBudgetRub > 0 && project.budgetRub > 0 && project.budgetRub > config.maxBudgetRub) {
    console.log('project:skip_max_budget title=%s budget=%s max=%s', project.title, project.budgetRub, config.maxBudgetRub);
    return false;
  }

  if (config.requiredKeywords.length > 0) {
    const hasRequired = config.requiredKeywords.some(function(keyword) {
      return project.normalizedText.indexOf(keyword) !== -1;
    });
    if (!hasRequired) {
      console.log('project:skip_required title=%s required=%s', project.title, config.requiredKeywords.join(','));
      return false;
    }
  }

  const hasExcluded = config.excludedKeywords.some(function(keyword) {
    return project.normalizedText.indexOf(keyword) !== -1;
  });
  if (hasExcluded) {
    console.log('project:skip_excluded title=%s excluded=%s', project.title, config.excludedKeywords.join(','));
    return false;
  }

  console.log('project:match title=%s budget=%s buyer=%s', project.title, project.budgetRub, project.buyerName);
  return true;
}

function sendTelegramDigest_(projects, message, config) {
  console.log('telegram:digest_start messageId=%s projectCount=%s', message.getId(), projects.length);
  const header = [
    '<b>Kwork projects: ' + projects.length + '</b>',
    '<b>Date:</b> ' + Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    ''
  ].join('\n');

  let currentMessage = header;

  projects.forEach(function(project, index) {
    const card = formatProjectCard_(project, index + 1);
    const separator = currentMessage ? '\n\n' : '';

    if ((currentMessage + separator + card).length > 3500) {
      console.log('telegram:digest_flush partialLength=%s nextTitle=%s', currentMessage.length, project.title);
      sendTelegramMessage_(currentMessage, config);
      currentMessage = card;
      return;
    }

    currentMessage += separator + card;
  });

  if (currentMessage) {
    console.log('telegram:digest_send finalLength=%s', currentMessage.length);
    sendTelegramMessage_(currentMessage, config);
  }

  console.log('telegram:digest_done messageId=%s', message.getId());
}

function formatProjectCard_(project, index) {
  const lines = [
    '<b>' + index + '. ' + escapeHtml_(project.title || 'Untitled project') + '</b>'
  ];

  if (project.budgetText) {
    lines.push('<b>Budget:</b> ' + escapeHtml_(project.budgetText));
  }

  if (project.category) {
    lines.push('<b>Category:</b> ' + escapeHtml_(project.category));
  }

  if (project.buyerName) {
    let buyerLine = '<b>Buyer:</b> ' + escapeHtml_(project.buyerName);
    if (project.buyerProjectsText) {
      buyerLine += ' | ' + escapeHtml_(project.buyerProjectsText);
    }
    if (project.buyerHiredText) {
      buyerLine += ' | ' + escapeHtml_(project.buyerHiredText);
    }
    lines.push(buyerLine);
  }

  if (project.url) {
    lines.push('<a href="' + escapeHtml_(project.url) + '">Open project</a>');
  }

  return lines.join('\n');
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

  const maxRetries = Math.max(1, config.telegramMaxRetries || 1);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    waitForTelegramRateLimit_(config);
    console.log('telegram:send_attempt attempt=%s length=%s chatId=%s', attempt, text.length, config.telegramChatId);

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    lastTelegramSendAtMs_ = Date.now();

    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log('telegram:send_success attempt=%s code=%s', attempt, code);
      return;
    }

    const body = response.getContentText();
    const retryAfterSeconds = getTelegramRetryAfterSeconds_(body);
    if (code === 429 && retryAfterSeconds > 0 && attempt < maxRetries) {
      console.log('telegram:rate_limited attempt=%s retryAfter=%s', attempt, retryAfterSeconds);
      nextTelegramSendAtMs_ = Date.now() + (retryAfterSeconds * 1000) + 5000;
      waitForTelegramRateLimit_(config);
      continue;
    }

    console.log('telegram:send_error attempt=%s code=%s body=%s', attempt, code, body);
    throw new Error('Telegram API error: ' + code + ' ' + body);
  }
}

function waitForTelegramRateLimit_(config) {
  const delayMs = Math.max(0, config.telegramMessageDelayMs || 0);
  const baseNextSendAtMs = lastTelegramSendAtMs_ ? lastTelegramSendAtMs_ + delayMs : 0;
  const waitUntilMs = Math.max(baseNextSendAtMs, nextTelegramSendAtMs_);

  if (!waitUntilMs) {
    return;
  }

  const remainingMs = waitUntilMs - Date.now();
  if (remainingMs > 0) {
    console.log('telegram:wait ms=%s', remainingMs);
    Utilities.sleep(remainingMs);
  }
}

function getTelegramRetryAfterSeconds_(responseText) {
  try {
    const parsed = JSON.parse(responseText);
    return Number(parsed && parsed.parameters && parsed.parameters.retry_after) || 0;
  } catch (error) {
    return 0;
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

function getProcessedMessageIds_(config) {
  const raw = PropertiesService.getScriptProperties().getProperty(config.processedMessagesProperty);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.log('processed_messages:parse_error property=%s error=%s', config.processedMessagesProperty, error);
    return {};
  }
}

function isMessageProcessed_(processedMessageIds, messageId) {
  return Object.prototype.hasOwnProperty.call(processedMessageIds, messageId);
}

function markMessageProcessed_(processedMessageIds, messageId) {
  processedMessageIds[messageId] = Date.now();
}

function saveProcessedMessageIds_(config, processedMessageIds) {
  pruneProcessedMessageIds_(processedMessageIds, 1000);
  PropertiesService.getScriptProperties().setProperty(config.processedMessagesProperty, JSON.stringify(processedMessageIds));
  console.log('processed_messages:saved count=%s', Object.keys(processedMessageIds).length);
}

function pruneProcessedMessageIds_(processedMessageIds, keepCount) {
  const entries = Object.keys(processedMessageIds)
    .map(function(messageId) {
      return {
        messageId: messageId,
        timestamp: Number(processedMessageIds[messageId]) || 0
      };
    })
    .sort(function(a, b) {
      return b.timestamp - a.timestamp;
    });

  entries.slice(keepCount).forEach(function(entry) {
    delete processedMessageIds[entry.messageId];
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

function countMatches_(text, pattern) {
  const matches = String(text || '').match(pattern);
  return matches ? matches.length : 0;
}

function extractBudgetRub_(text) {
  const numeric = String(text || '').replace(/[^\d]/g, '');
  return numeric ? Number(numeric) : 0;
}

function extractAttribute_(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? decodeHtmlEntities_(match[1]) : '';
}

function extractInnerHtml_(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? match[1] : '';
}

function extractAllInnerHtml_(text, pattern) {
  const results = [];
  String(text || '').replace(pattern, function(full, group) {
    results.push(group);
    return full;
  });
  return results;
}

function stripTags_(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ');
}

function cleanText_(text) {
  return decodeHtmlEntities_(stripTags_(text))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
