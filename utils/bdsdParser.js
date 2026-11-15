const STAMP_RE = /(\d{2})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})/;
const RECIPIENT_RE = /(?:cho\s+)?TK\s+(\d+)_([A-Za-z]+(?:\s+[A-Za-z]+)*?)(?=\s*(?:,|\bIB\b|\bGD\b|$))/i;
const OWNER_IB_RE = /IB\s+((?:[A-Z]{2,}\s+){1,}[A-Z]{2,})\s+CHUYEN/i;

const pad2 = (value) => String(value).padStart(2, '0');

const collapse = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const fold = (value) => collapse(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase();

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const parseAmount = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.abs(value));
  }
  const digits = digitsOnly(value);
  if (!digits) return null;
  const amount = parseInt(digits, 10);
  return amount > 0 ? amount : null;
};

const formatTimeToken = (day, month, year, hour, minute, second) => {
  const yy = String(year).slice(-2);
  return `${pad2(day)}${pad2(month)}${pad2(yy)}-${pad2(hour)}:${pad2(minute)}:${pad2(second || 0)}`;
};

const timeTokenFromText = (text) => {
  const source = collapse(text);
  if (!source) return '';

  const stamp = source.match(STAMP_RE);
  if (stamp) {
    return `${stamp[1]}${stamp[2]}${stamp[3]}-${stamp[4]}:${stamp[5]}:${stamp[6]}`;
  }

  let match = source.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return formatTimeToken(match[4], match[5], match[6], match[1], match[2], match[3] || 0);
  }

  match = source.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return formatTimeToken(match[1], match[2], match[3], match[4], match[5], match[6] || 0);
  }

  return '';
};

const composeContent = (content, timeToken) => {
  const text = collapse(content).replace(/^GD\s*:\s*/i, '').trim();
  if (!text) return '';
  if (STAMP_RE.test(text)) return text;
  if (timeToken) return `${text} ${timeToken}`;
  return text;
};

const parseRecipient = (content) => {
  const match = collapse(content).match(RECIPIENT_RE);
  if (!match) return null;
  const name = collapse(match[2]).toUpperCase();
  if (!name) return null;
  return { account: match[1], name };
};

const indexOwnerNames = (transactions) => {
  const owners = new Map();
  transactions.forEach((tx) => {
    if (tx.accountNumber && tx.accountName) {
      owners.set(tx.accountNumber, collapse(tx.accountName));
    }
  });
  transactions.forEach((tx) => {
    if (tx.direction !== 'out' || !tx.accountNumber || owners.has(tx.accountNumber)) return;
    const match = collapse(tx.content).match(OWNER_IB_RE);
    if (match) owners.set(tx.accountNumber, collapse(match[1]).toUpperCase());
  });
  return owners;
};

const parseBdsdProfile = (text) => {
  if (!text || typeof text !== 'string') return null;
  const raw = text.trim().replace(/^\/bdsd(?:@[A-Za-z0-9_]+)?\s*/i, '');
  if (!raw || raw.startsWith('/')) return null;

  const parts = raw.split(/\s+/);
  if (parts.length < 4) return null;

  const phone = parts[0];
  const password = parts[1];
  const stk = parts[parts.length - 1];
  const name = parts.slice(2, -1).join(' ');

  if (!/^\+?\d{8,15}$/.test(phone)) return null;
  if (!password) return null;
  if (!/^\d{4,20}$/.test(stk)) return null;
  if (!name) return null;

  return { phone, password, name, stk };
};

const isBdsdCommand = (text) => /^\/bdsd(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(collapse(text));

const redactBdsdContent = (text) => {
  const source = text == null ? '' : String(text);
  const match = source.match(/^(\/bdsd(?:@[A-Za-z0-9_]+)?\s+\S+\s+)(\S+)([\s\S]*)$/i);
  if (!match) return source;
  return `${match[1]}***${match[3]}`;
};

const parseCsvRows = (text) => {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  return rows;
};

const columnIndex = (headers, name) => headers.findIndex((header) => fold(header) === name);

const directionFrom = (value) => {
  const folded = fold(value);
  if (!folded) return '';
  if (folded === 'out' || folded === 'ra' || folded === '-' || folded.includes('tien ra')) return 'out';
  if (folded === 'in' || folded === 'vao' || folded === '+' || folded.includes('tien vao')) return 'in';
  return '';
};

const cleanName = (value) => {
  const name = collapse(value);
  if (!name || name.toLowerCase() === 'null') return '';
  return name;
};

const transactionFromParts = ({
  direction,
  amount,
  accountNumber,
  accountName,
  content,
  timeToken,
  recipientName,
  recipientAccount
}) => {
  const parsedAmount = parseAmount(amount);
  const parsedContent = collapse(content);
  if (!parsedAmount || !parsedContent) return null;
  const resolvedDirection = direction === 'out' ? 'out' : 'in';
  return {
    direction: resolvedDirection,
    amount: parsedAmount,
    accountNumber: digitsOnly(accountNumber),
    accountName: cleanName(accountName),
    content: parsedContent,
    timeToken: timeToken || '',
    recipientName: cleanName(recipientName),
    recipientAccount: digitsOnly(recipientAccount)
  };
};

const parseBdsdCsv = (csvText) => {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const accountCol = columnIndex(headers, 'tai khoan');
  const ownerCol = columnIndex(headers, 'chu tai khoan');
  const timeCol = columnIndex(headers, 'thoi gian');
  const typeCol = columnIndex(headers, 'loai giao dich');
  const amountCol = columnIndex(headers, 'tien');
  const contentCol = columnIndex(headers, 'noi dung');
  if ([accountCol, timeCol, typeCol, amountCol, contentCol].some((index) => index < 0)) {
    return [];
  }

  const transactions = [];
  rows.slice(1).forEach((row) => {
    const direction = directionFrom(row[typeCol]);
    if (!direction) return;
    const tx = transactionFromParts({
      direction,
      amount: row[amountCol],
      accountNumber: row[accountCol],
      accountName: ownerCol >= 0 ? row[ownerCol] : '',
      content: row[contentCol],
      timeToken: timeTokenFromText(row[timeCol])
    });
    if (!tx) return;
    if (direction === 'in' && !tx.accountNumber) return;
    transactions.push(tx);
  });
  return transactions;
};

const NEXT_CARD_RE = /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}|thong bao thay doi so du/i;

const stripFollowingCard = (part) => {
  const acb = part.search(/ACB:\s*TK\s+\d+/i);
  if (acb < 0) return part;
  const rest = part.slice(acb + 4);
  const cut = rest.search(NEXT_CARD_RE);
  if (cut < 0) return part;
  return part.slice(0, acb + 4 + cut).trim();
};

const parseNotificationText = (text) => {
  const flat = stripFollowingCard(collapse(text));
  const account = flat.match(/TK\s+(\d+)\s*\(\s*VND\s*\)\s*([+-])\s*([\d.,]+)/i);
  if (!account) return null;

  const gdIndex = flat.search(/\bGD\s*:/i);
  if (gdIndex < 0) return null;

  return transactionFromParts({
    direction: account[2] === '-' ? 'out' : 'in',
    amount: account[3],
    accountNumber: account[1],
    content: flat.slice(gdIndex),
    timeToken: timeTokenFromText(flat)
  });
};

const parseNotificationBatch = (text) => {
  const flat = collapse(text);
  if (!flat) return [];
  return flat
    .split(/(?=ACB:\s*TK\s+\d+)/i)
    .map((part) => parseNotificationText(part))
    .filter(Boolean);
};

const transactionsFromVision = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const direction = directionFrom(item.direction) || (String(item.amount || '').trim().startsWith('-') ? 'out' : 'in');
    const tx = transactionFromParts({
      direction,
      amount: item.amount,
      accountNumber: item.accountNumber,
      accountName: item.accountName,
      content: item.content,
      timeToken: timeTokenFromText(item.datetime || item.time || ''),
      recipientName: item.recipientName,
      recipientAccount: item.recipientAccount
    });
    if (!tx) return null;
    if (tx.direction === 'in' && !tx.accountNumber) return null;
    return tx;
  }).filter(Boolean);
};

const buildBdsdCommands = (profile, transactions) => {
  if (!profile || !Array.isArray(transactions)) return [];
  const owners = indexOwnerNames(transactions);
  const lines = [];

  transactions.forEach((tx) => {
    const content = composeContent(tx.content, tx.timeToken);
    if (!tx.amount || !content) return;

    let name = '';
    let stk = '';
    if (tx.direction === 'out') {
      const recipient = (tx.recipientAccount && tx.recipientName)
        ? { account: tx.recipientAccount, name: collapse(tx.recipientName).toUpperCase() }
        : parseRecipient(tx.content);
      if (recipient) {
        name = recipient.name;
        stk = recipient.account;
      } else {
        name = profile.name;
        stk = profile.stk;
      }
    } else {
      stk = tx.accountNumber;
      name = tx.accountName || owners.get(stk) || '';
      if (!stk) return;
      if (!name) name = profile.name;
    }

    if (!name || !stk) return;
    lines.push(`/bdsd ${profile.phone} ${profile.password} ${name} ${stk} ${tx.amount} GD: ${content}`);
  });

  return lines;
};

const commandsFromCsv = (profile, csvText) => buildBdsdCommands(profile, parseBdsdCsv(csvText));

const commandsFromNotificationText = (profile, text) => (
  buildBdsdCommands(profile, parseNotificationBatch(text))
);

module.exports = {
  parseBdsdProfile,
  isBdsdCommand,
  redactBdsdContent,
  parseBdsdCsv,
  parseNotificationText,
  parseNotificationBatch,
  transactionsFromVision,
  buildBdsdCommands,
  commandsFromCsv,
  commandsFromNotificationText,
  timeTokenFromText
};
