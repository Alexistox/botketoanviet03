const axios = require('axios');
const { extractBdsdFromImage } = require('../utils/openai');
const { getDownloadLink, runWithChatAction } = require('../utils/telegramUtils');
const { isUserOperator } = require('../utils/permissions');
const { shouldBlockForSubscription } = require('../utils/subscriptionGate');
const messages = require('../src/messages/vi');
const {
  parseBdsdProfile,
  transactionsFromVision,
  buildBdsdCommands,
  commandsFromCsv
} = require('../utils/bdsdParser');

const SESSION_TTL_SEC = 30 * 60;
const MESSAGE_LIMIT = 4000;

const PROFILE_PROMPT = [
  'Gửi thông tin theo mẫu (mật khẩu không có dấu cách):',
  '/bdsd SĐT MẬT_KHẨU TÊN STK',
  '',
  'Ví dụ:',
  '/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321',
  '',
  'Sau đó gửi file CSV sao kê hoặc ảnh chụp thông báo.'
].join('\n');

const sessionKey = (userId) => `bdsd:${userId}`;

const isGroupChat = (chat) => Boolean(
  chat && (chat.type === 'group' || chat.type === 'supergroup' || Number(chat.id) < 0)
);

const isCsvDocument = (doc) => {
  if (!doc) return false;
  const name = (doc.file_name || '').toLowerCase();
  const mime = (doc.mime_type || '').toLowerCase();
  return name.endsWith('.csv') || mime === 'text/csv' || mime === 'application/csv';
};

const looksLikeProfileAttempt = (text) => {
  const raw = String(text || '').trim().replace(/^\/bdsd(?:@[A-Za-z0-9_]+)?\s*/i, '');
  return raw.split(/\s+/).filter(Boolean).length >= 2 && !/\bGD\s*:/i.test(raw);
};

const profileFromSession = (session) => ({
  phone: session.phone,
  password: session.password,
  name: session.name,
  stk: session.stk
});

const getSession = (cache, userId) => {
  if (!cache || userId == null) return null;
  return cache.get(sessionKey(userId)) || null;
};

const saveSession = (cache, userId, session) => {
  cache.set(sessionKey(userId), session, SESSION_TTL_SEC);
};

const sendLines = async (bot, chatId, lines) => {
  const chunks = [];
  let current = '';
  lines.forEach((line) => {
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > MESSAGE_LIMIT) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  });
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk);
  }
};

const allowBdsd = async (bot, msg, cache) => {
  const session = getSession(cache, msg.from.id);
  const groupChatId = (session && session.groupChatId)
    || (isGroupChat(msg.chat) ? String(msg.chat.id) : '');
  const gateChatId = groupChatId || String(msg.chat.id);
  if (await shouldBlockForSubscription(msg.from.id, '/bdsd', msg, gateChatId)) {
    await bot.sendMessage(msg.chat.id, messages.subscriptionExpired, { parse_mode: 'Markdown' });
    return false;
  }
  if (!groupChatId) return true;
  if (!(await isUserOperator(msg.from.id, groupChatId))) {
    await bot.sendMessage(msg.chat.id, 'Chỉ người điều hành mới dùng được /bdsd.');
    return false;
  }
  return true;
};

const downloadTelegramFile = async (fileId) => {
  const url = await getDownloadLink(fileId, process.env.TELEGRAM_BOT_TOKEN);
  if (!url) return null;
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
};

const deliverCommands = async (bot, msg, session, lines) => {
  if (!lines.length) {
    await bot.sendMessage(msg.chat.id, 'Không đọc được giao dịch nào. Kiểm tra file CSV hoặc ảnh thông báo.');
    return;
  }

  await sendLines(bot, session.groupChatId, lines);
  if (String(msg.chat.id) !== String(session.groupChatId)) {
    await bot.sendMessage(msg.chat.id, 'Đã gửi lệnh vào nhóm.');
  }
};

const handleBdsdCommand = async (bot, msg, cache) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || msg.caption || '';

  if (!(await allowBdsd(bot, msg, cache))) return;

  if (/\bGD\s*:/i.test(text) && !parseBdsdProfile(text)) return;

  const existing = getSession(cache, userId);
  const profile = parseBdsdProfile(text);

  if (!profile) {
    if (!isGroupChat(msg.chat) && !existing) {
      await bot.sendMessage(chatId, 'Hãy gõ /bdsd trong nhóm trước, rồi nhập thông tin ở đây.');
      return;
    }

    const groupChatId = isGroupChat(msg.chat)
      ? String(chatId)
      : existing.groupChatId;
    saveSession(cache, userId, {
      step: 'await_profile',
      groupChatId: String(groupChatId),
      userId: String(userId)
    });

    if (!isGroupChat(msg.chat)) {
      await bot.sendMessage(chatId, PROFILE_PROMPT);
      return;
    }

    if (looksLikeProfileAttempt(text)) {
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }

    try {
      await bot.sendMessage(userId, looksLikeProfileAttempt(text)
        ? `Sai mẫu.\n${PROFILE_PROMPT}`
        : PROFILE_PROMPT);
      await bot.sendMessage(chatId, 'Đã gửi hướng dẫn /bdsd vào chat riêng. Mở tin nhắn với bot để nhập thông tin.');
    } catch (error) {
      await bot.sendMessage(chatId, 'Hãy mở chat riêng với bot, bấm /start, rồi gõ lại /bdsd trong nhóm này.');
    }
    return;
  }

  if (!isGroupChat(msg.chat) && !existing) {
    await bot.sendMessage(chatId, 'Hãy gõ /bdsd trong nhóm trước, rồi nhập thông tin ở đây.');
    return;
  }

  const groupChatId = isGroupChat(msg.chat)
    ? String(chatId)
    : existing.groupChatId;

  saveSession(cache, userId, {
    step: 'ready',
    groupChatId: String(groupChatId),
    userId: String(userId),
    phone: profile.phone,
    password: profile.password,
    name: profile.name,
    stk: profile.stk
  });

  if (isGroupChat(msg.chat)) {
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
  }
  await bot.sendMessage(chatId, 'Đã nhận thông tin. Gửi file CSV sao kê hoặc ảnh chụp thông báo biến động số dư.');
};

const readySession = async (bot, msg, cache) => {
  const session = getSession(cache, msg.from.id);
  if (!session) return null;
  if (!(await allowBdsd(bot, msg, cache))) return false;
  if (session.step !== 'ready' || !session.phone) {
    await bot.sendMessage(msg.chat.id, 'Hãy gửi SĐT, mật khẩu, tên và STK trước khi gửi sao kê.');
    return false;
  }
  return session;
};

const tryHandleBdsdDocument = async (bot, msg, cache) => {
  if (!isCsvDocument(msg.document)) return false;
  const session = await readySession(bot, msg, cache);
  if (!session) return session === null ? false : true;

  try {
    const lines = await runWithChatAction(bot, msg.chat.id, async () => {
      const buffer = await downloadTelegramFile(msg.document.file_id);
      if (!buffer) return null;
      return commandsFromCsv(profileFromSession(session), buffer.toString('utf8'));
    });
    if (!lines) {
      await bot.sendMessage(msg.chat.id, 'Không tải được file CSV.');
      return true;
    }
    saveSession(cache, msg.from.id, session);
    await deliverCommands(bot, msg, session, lines);
  } catch (error) {
    console.error('Error in tryHandleBdsdDocument:', error.message);
    await bot.sendMessage(msg.chat.id, 'Không gửi được lệnh /bdsd từ file CSV.');
  }
  return true;
};

const tryHandleBdsdPhoto = async (bot, msg, cache) => {
  if (msg.caption && msg.caption.trim()) return false;
  const session = await readySession(bot, msg, cache);
  if (!session) return session === null ? false : true;
  if (!msg.photo || !msg.photo.length) return false;

  try {
    const lines = await runWithChatAction(bot, msg.chat.id, async () => {
      const photo = msg.photo[msg.photo.length - 1];
      const buffer = await downloadTelegramFile(photo.file_id);
      if (!buffer) return null;
      const items = await extractBdsdFromImage(buffer);
      if (!items) return null;
      return buildBdsdCommands(profileFromSession(session), transactionsFromVision(items));
    });
    if (!lines) {
      await bot.sendMessage(msg.chat.id, 'Không đọc được ảnh. Hãy gửi file CSV sao kê.');
      return true;
    }
    saveSession(cache, msg.from.id, session);
    await deliverCommands(bot, msg, session, lines);
  } catch (error) {
    console.error('Error in tryHandleBdsdPhoto:', error.message);
    await bot.sendMessage(msg.chat.id, 'Không gửi được lệnh /bdsd từ ảnh.');
  }
  return true;
};

module.exports = {
  handleBdsdCommand,
  tryHandleBdsdDocument,
  tryHandleBdsdPhoto
};
