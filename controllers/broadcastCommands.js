const BroadcastGroupSet = require('../models/BroadcastGroupSet');
const BroadcastSavedMessage = require('../models/BroadcastSavedMessage');
const BroadcastSchedule = require('../models/BroadcastSchedule');
const { splitTelegramText } = require('../utils/telegramChunks');

const SCHEDULE_TZ = 'Asia/Phnom_Penh';

function commandSource(msg) {
  return (msg.text || msg.caption || '').trim();
}

function firstCommandToken(source) {
  const first = source.split(/\s+/).filter(Boolean)[0] || '';
  return first.split('@')[0];
}

function argsAfterCommand(source) {
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  return parts.slice(1).join(' ').trim();
}

function isCmCommandSource(source) {
  return firstCommandToken(source) === '/cm';
}

function isNumericChatId(s) {
  return /^-?\d+$/.test(String(s).trim());
}

async function removeEmptyGroupSets() {
  await BroadcastGroupSet.deleteMany({ chatIds: { $size: 0 } });
}

/**
 * @param {import('node-telegram-bot-api').TelegramBot} bot
 * @param {string[]} chatIdStrings
 * @returns {Promise<Record<string, string>>}
 */
async function buildChatTitleMap(bot, chatIdStrings) {
  const unique = [...new Set(chatIdStrings.map(String))];
  const map = {};
  await Promise.all(
    unique.map(async (id) => {
      try {
        const chat = await bot.getChat(id);
        const name =
          chat.title ||
          [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
          (chat.username ? `@${chat.username}` : null) ||
          '?';
        map[id] = name;
      } catch {
        map[id] = 'Không lấy được tên';
      }
    })
  );
  return map;
}

const TELEGRAM_CHUNK = 4000;

async function sendTelegramChunks(bot, chatId, text) {
  const chunks = splitTelegramText(text, TELEGRAM_CHUNK);
  const total = chunks.length;
  for (let i = 0; i < total; i += 1) {
    const body = total > 1 ? `(${i + 1}/${total})\n${chunks[i]}` : chunks[i];
    await bot.sendMessage(chatId, body);
  }
}

/**
 * /cm — reply tin cần lưu, hoặc media kèm caption /cm <mã>
 */
const handleBroadcastCm = async (bot, msg) => {
  const source = commandSource(msg);
  const codeRaw = argsAfterCommand(source);
  if (!codeRaw) {
    await bot.sendMessage(
      msg.chat.id,
      'Thiếu mã tin. Cách dùng: /cm <mã> (reply tin cần lưu, hoặc gửi media kèm chú thích /cm <mã>).'
    );
    return;
  }
  const code = codeRaw.toLowerCase();

  let fromChatId;
  let messageId;

  if (msg.reply_to_message) {
    fromChatId = msg.reply_to_message.chat.id.toString();
    messageId = msg.reply_to_message.message_id;
  } else {
    const hasMedia = !!(
      msg.photo ||
      msg.video ||
      msg.animation ||
      msg.document ||
      msg.audio ||
      msg.voice ||
      msg.video_note ||
      msg.sticker
    );
    const cap = msg.caption || '';
    if (hasMedia && isCmCommandSource(cap)) {
      fromChatId = msg.chat.id.toString();
      messageId = msg.message_id;
    } else {
      await bot.sendMessage(
        msg.chat.id,
        'Hãy reply tin cần lưu, hoặc gửi media kèm chú thích /cm <mã>.'
      );
      return;
    }
  }

  await BroadcastSavedMessage.findOneAndUpdate(
    { code },
    { fromChatId, messageId },
    { upsert: true, new: true }
  );
  await bot.sendMessage(msg.chat.id, `Đã lưu tin "${code}"。`);
};

/**
 * /g <tag> — thêm nhóm hiện tại vào tập
 */
const handleBroadcastG = async (bot, msg) => {
  const source = commandSource(msg);
  const tag = argsAfterCommand(source).toLowerCase();
  if (!tag) {
    await bot.sendMessage(msg.chat.id, 'Thiếu mã tập nhóm. Cách dùng: /g <mã>');
    return;
  }
  if (msg.chat.type === 'private') {
    await bot.sendMessage(msg.chat.id, 'Lệnh /g chỉ dùng trong nhóm/siêu nhóm.');
    return;
  }
  const chatIdStr = msg.chat.id.toString();
  await BroadcastGroupSet.findOneAndUpdate(
    { tag },
    { $setOnInsert: { tag }, $addToSet: { chatIds: chatIdStr } },
    { upsert: true, new: true }
  );
  await bot.sendMessage(msg.chat.id, `Đã thêm nhóm này vào tập "${tag}"。`);
};

/**
 * /glist
 */
const handleBroadcastGlist = async (bot, msg) => {
  const sets = await BroadcastGroupSet.find().sort({ tag: 1 }).lean();
  if (!sets.length) {
    await bot.sendMessage(msg.chat.id, 'Chưa có tập nhóm. Trong mỗi nhóm dùng /g <mã> để thêm.');
    return;
  }
  const allIds = sets.flatMap((s) => s.chatIds);
  const titleMap = await buildChatTitleMap(bot, allIds);

  const lines = sets.map((s) => {
    const rows = s.chatIds.map((id) => {
      const idStr = String(id);
      const title = titleMap[idStr] ?? 'Không lấy được tên';
      return `  ${idStr} — ${title}`;
    });
    return [`• ${s.tag}: ${s.chatIds.length} nhóm`, ...rows].join('\n');
  });
  const text = lines.join('\n\n');
  await sendTelegramChunks(bot, msg.chat.id, text);
};

/**
 * /cmlist
 */
const handleBroadcastCmlist = async (bot, msg) => {
  const list = await BroadcastSavedMessage.find().sort({ code: 1 }).lean();
  if (!list.length) {
    await bot.sendMessage(msg.chat.id, 'Chưa có tin đã lưu. Dùng /cm <mã> (reply hoặc caption media).');
    return;
  }
  const lines = list.map((row) => {
    const t = row.updatedAt || row.createdAt;
    const time = t ? new Date(t).toISOString() : '';
    return `• ${row.code}: chat ${row.fromChatId}, msg ${row.messageId}${time ? ` (${time})` : ''}`;
  });
  await sendTelegramChunks(bot, msg.chat.id, lines.join('\n'));

  // Gửi đầy đủ nội dung từng tin đã lưu để xem trực tiếp.
  for (const row of list) {
    await bot.sendMessage(msg.chat.id, `Mã "${row.code}" — nội dung:`);
    try {
      await bot.copyMessage(msg.chat.id, row.fromChatId, row.messageId);
    } catch (e) {
      await bot.sendMessage(
        msg.chat.id,
        `无法加载Mã "${row.code}" (${row.fromChatId}/${row.messageId}）：${e.message || e}`
      );
    }
  }
};

/**
 * Ưu tiên tập /g theo tag; không có thì coi là id nhóm (số).
 */
async function resolveBroadcastTargets(target) {
  const tag = target.toLowerCase();
  const set = await BroadcastGroupSet.findOne({ tag });
  if (set) {
    if (!set.chatIds.length) {
      return {
        ok: false,
        message: `Tập "${tag}" chưa có nhóm. Trong mỗi nhóm đích dùng /g ${tag}。`
      };
    }
    return { ok: true, targets: [...set.chatIds] };
  }
  if (isNumericChatId(target)) {
    return { ok: true, targets: [target.trim()] };
  }
  return {
    ok: false,
    message: `未找到Tập "${tag}". Trong nhóm dùng /g ${tag}, hoặc nhập đúng chat ID Telegram (thường âm, dạng -100...).`
  };
}

/**
 * /send <mã tin đã lưu> <mã nhóm hoặc id>
 * hoặc reply tin nhắn + /send <mã nhóm hoặc id> — gửi đúng tin được reply
 */
const handleBroadcastSend = async (bot, msg) => {
  const source = commandSource(msg);
  const parts = source.split(/\s+/).filter(Boolean);
  const cmd = parts[0].split('@')[0];
  if (cmd !== '/send' || parts.length < 2) {
    await bot.sendMessage(
      msg.chat.id,
      'Cách dùng: /send <mã tin> <mã tập|ID>, hoặc reply tin rồi /send <mã tập|ID>.'
    );
    return;
  }

  let fromChatId;
  let messageId;

  if (parts.length === 2) {
    if (!msg.reply_to_message) {
      await bot.sendMessage(
        msg.chat.id,
        'Reply tin cần gửi rồi /send <mã tập|ID>; hoặc /send <mã tin> <mã tập|ID>.'
      );
      return;
    }
    fromChatId = msg.reply_to_message.chat.id.toString();
    messageId = msg.reply_to_message.message_id;
  } else {
    const msgCode = parts[1].toLowerCase();
    const saved = await BroadcastSavedMessage.findOne({ code: msgCode });
    if (!saved) {
      await bot.sendMessage(msg.chat.id, `Không tìm thấy tin "${msgCode}"。`);
      return;
    }
    fromChatId = saved.fromChatId;
    messageId = saved.messageId;
  }

  const target =
    parts.length === 2 ? parts[1] : parts.slice(2).join(' ').trim();
  const resolved = await resolveBroadcastTargets(target);
  if (!resolved.ok) {
    await bot.sendMessage(msg.chat.id, resolved.message);
    return;
  }
  const targets = resolved.targets;

  let ok = 0;
  const errors = [];
  for (const tid of targets) {
    try {
      await bot.copyMessage(tid, fromChatId, messageId);
      ok += 1;
    } catch (e) {
      errors.push(`${tid}: ${e.message || e}`);
    }
  }

  let report = `Gửi xong: ${ok}/${targets.length} thành công.`;
  if (errors.length) {
    report += `\nLỗi:\n${errors.slice(0, 10).join('\n')}`;
    if (errors.length > 10) report += `\n... và thêm ${errors.length - 10} lỗi`;
  }
  await bot.sendMessage(msg.chat.id, report);
};

/**
 * /dm <mã tin>
 */
const handleBroadcastDm = async (bot, msg) => {
  const source = commandSource(msg);
  const code = argsAfterCommand(source).toLowerCase();
  if (!code) {
    await bot.sendMessage(msg.chat.id, 'Cách dùng: /dm <mã tin>');
    return;
  }
  const res = await BroadcastSavedMessage.deleteOne({ code });
  if (res.deletedCount) {
    await bot.sendMessage(msg.chat.id, `Đã xóa tin "${code}"。`);
  } else {
    await bot.sendMessage(msg.chat.id, `Không có tin "${code}"。`);
  }
};

/**
 * /dg — xóa chat hiện tại khỏi mọi tập
 * /dg <id số> — xóa id đó khỏi mọi tập
 * /dg <tag> — xóa chat hiện tại khỏi tập tag
 */
const handleBroadcastDg = async (bot, msg) => {
  const source = commandSource(msg);
  const arg = argsAfterCommand(source);

  if (!arg) {
    const cid = msg.chat.id.toString();
    const r = await BroadcastGroupSet.updateMany({}, { $pull: { chatIds: cid } });
    await removeEmptyGroupSets();
    await bot.sendMessage(
      msg.chat.id,
      `Đã gỡ nhóm này khỏi mọi tập (khớp ${r.matchedCount}）。`
    );
    return;
  }

  if (isNumericChatId(arg)) {
    const idStr = arg.trim();
    const r = await BroadcastGroupSet.updateMany({}, { $pull: { chatIds: idStr } });
    await removeEmptyGroupSets();
    await bot.sendMessage(
      msg.chat.id,
      `Đã gỡ chat ${idStr} khỏi mọi tập (khớp ${r.matchedCount}）。`
    );
    return;
  }

  const tag = arg.toLowerCase();
  const cid = msg.chat.id.toString();
  const r = await BroadcastGroupSet.updateOne({ tag }, { $pull: { chatIds: cid } });
  await removeEmptyGroupSets();
  if (r.matchedCount) {
    await bot.sendMessage(msg.chat.id, `已将本群从Tập "${tag}" 中移除。`);
  } else {
    await bot.sendMessage(msg.chat.id, `没有Tập "${tag}"。`);
  }
};

function parseHHmm(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** Ngày + giờ hiện tại theo Asia/Phnom_Penh (Campuchia) */
function getScheduleNowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = parts.hour;
  if (hour === '24') hour = '00';
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeHHmm: `${hour}:${parts.minute}`
  };
}

function describeScheduleSource(row) {
  if (row.msgCode) return `code:${row.msgCode}`;
  if (row.fromChatId != null && row.messageId != null) {
    return `reply ${row.fromChatId}/${row.messageId}`;
  }
  return '?';
}

async function resolveScheduleMessageSource(row) {
  if (row.msgCode) {
    const saved = await BroadcastSavedMessage.findOne({ code: String(row.msgCode).toLowerCase() });
    if (!saved) {
      return { ok: false, message: `Không tìm thấy tin "${row.msgCode}"。` };
    }
    return { ok: true, fromChatId: saved.fromChatId, messageId: saved.messageId };
  }
  if (row.fromChatId != null && row.messageId != null) {
    return { ok: true, fromChatId: String(row.fromChatId), messageId: Number(row.messageId) };
  }
  return { ok: false, message: 'Lịch thiếu nguồn tin.' };
}

/**
 * Chạy một lịch: copyMessage tới mọi target. Cập nhật lastFiredDate khi bắt đầu (tránh trùng).
 * @returns {{ ok: number, total: number, errors: string[] }}
 */
async function fireBroadcastSchedule(bot, schedule) {
  const source = await resolveScheduleMessageSource(schedule);
  if (!source.ok) {
    return { ok: 0, total: 0, errors: [source.message] };
  }
  const resolved = await resolveBroadcastTargets(schedule.target);
  if (!resolved.ok) {
    return { ok: 0, total: 0, errors: [resolved.message] };
  }

  const today = getScheduleNowParts().dateStr;
  await BroadcastSchedule.updateOne(
    { _id: schedule._id },
    { $set: { lastFiredDate: today } }
  );

  let ok = 0;
  const errors = [];
  for (const tid of resolved.targets) {
    try {
      await bot.copyMessage(tid, source.fromChatId, source.messageId);
      ok += 1;
    } catch (e) {
      errors.push(`${tid}: ${e.message || e}`);
    }
  }
  return { ok, total: resolved.targets.length, errors };
}

/**
 * /cs <消息代码> <群组代码|ID> <HH:mm>
 * hoặc reply + /cs <群组代码|ID> <HH:mm>
 */
const handleBroadcastCs = async (bot, msg) => {
  const source = commandSource(msg);
  const parts = source.split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || '').split('@')[0];
  if (cmd !== '/cs' || parts.length < 3) {
    await bot.sendMessage(
      msg.chat.id,
      '用法：/cs <消息代码> <群组代码或ID> <HH:mm>\n或回复消息后：/cs <群组代码或ID> <HH:mm>\n时区：Asia/Phnom_Penh（柬埔寨）'
    );
    return;
  }

  const timeRaw = parts[parts.length - 1];
  const timeHHmm = parseHHmm(timeRaw);
  if (!timeHHmm) {
    await bot.sendMessage(msg.chat.id, 'Giờ không hợp lệ. Dùng HH:mm (vd 09:00).');
    return;
  }

  let msgCode = null;
  let fromChatId = null;
  let messageId = null;
  let target;

  if (parts.length === 3) {
    // /cs target HH:mm  (reply)  HOẶC  /cs code target HH:mm cần 4 tokens
    // parts.length === 3 means: cmd + 2 args → reply form
    if (!msg.reply_to_message) {
      await bot.sendMessage(
        msg.chat.id,
        '请先回复要定时发送的消息，再发送 /cs <群组代码或ID> <HH:mm>；\n或不回复，使用 /cs <消息代码> <群组代码或ID> <HH:mm>。'
      );
      return;
    }
    target = parts[1];
    fromChatId = msg.reply_to_message.chat.id.toString();
    messageId = msg.reply_to_message.message_id;
  } else {
    // /cs code target HH:mm  (parts.length >= 4)
    msgCode = parts[1].toLowerCase();
    target = parts.slice(2, -1).join(' ').trim();
    const saved = await BroadcastSavedMessage.findOne({ code: msgCode });
    if (!saved) {
      await bot.sendMessage(msg.chat.id, `Không tìm thấy tin "${msgCode}". Hãy /cm trước.`);
      return;
    }
  }

  if (!target) {
    await bot.sendMessage(msg.chat.id, 'Thiếu mã tập nhóm hoặc ID.');
    return;
  }

  const resolved = await resolveBroadcastTargets(target);
  if (!resolved.ok) {
    await bot.sendMessage(msg.chat.id, resolved.message);
    return;
  }

  const createdBy = msg.from ? String(msg.from.id) : '';
  const row = await BroadcastSchedule.create({
    msgCode,
    fromChatId,
    messageId,
    target: target.trim(),
    timeHHmm,
    enabled: true,
    lastFiredDate: null,
    createdBy
  });

  const srcLabel = describeScheduleSource(row);
  await bot.sendMessage(
    msg.chat.id,
    `Đã cài gửi hàng ngày (${SCHEDULE_TZ}）：\n` +
      `#${row._id.toString().slice(-6)} ${timeHHmm} → ${target} ← ${srcLabel}\n` +
      `Số nhóm đích: ${resolved.targets.length}`
  );
};

/**
 * /cslist
 */
const handleBroadcastCslist = async (bot, msg) => {
  const list = await BroadcastSchedule.find().sort({ timeHHmm: 1, createdAt: 1 }).lean();
  if (!list.length) {
    await bot.sendMessage(msg.chat.id, 'Chưa có lịch. Cách dùng: /cs <mã tin> <mã tập|ID> <HH:mm>');
    return;
  }
  const lines = list.map((row, i) => {
    const n = i + 1;
    const short = String(row._id).slice(-6);
    const on = row.enabled === false ? ' [tắt]' : '';
    const last = row.lastFiredDate ? ` last=${row.lastFiredDate}` : '';
    return `${n}. #${short} ${row.timeHHmm} → ${row.target} ← ${describeScheduleSource(row)}${on}${last}`;
  });
  await sendTelegramChunks(
    bot,
    msg.chat.id,
    `Danh sách lịch gửi (${SCHEDULE_TZ}）：\n${lines.join('\n')}\n\nXóa: /ds <số TT> hoặc /ds <mã ngắn>`
  );
};

/**
 * /ds <序号|短码>
 */
const handleBroadcastDs = async (bot, msg) => {
  const source = commandSource(msg);
  const arg = argsAfterCommand(source).trim();
  if (!arg) {
    await bot.sendMessage(msg.chat.id, 'Cách dùng: /ds <số TT> hoặc /ds <mã ngắn> (xem /cslist)');
    return;
  }

  const list = await BroadcastSchedule.find().sort({ timeHHmm: 1, createdAt: 1 });
  if (!list.length) {
    await bot.sendMessage(msg.chat.id, 'Không có lịch để xóa.');
    return;
  }

  let row = null;
  if (/^\d+$/.test(arg)) {
    const idx = Number(arg);
    if (idx >= 1 && idx <= list.length) {
      row = list[idx - 1];
    }
  }
  if (!row) {
    const needle = arg.replace(/^#/, '').toLowerCase();
    row = list.find((r) => String(r._id).toLowerCase().endsWith(needle)) || null;
  }
  if (!row) {
    await bot.sendMessage(msg.chat.id, `Không tìm thấy lịch "${arg}". Xem /cslist.`);
    return;
  }

  await BroadcastSchedule.deleteOne({ _id: row._id });
  await bot.sendMessage(
    msg.chat.id,
    `Đã xóa lịch #${String(row._id).slice(-6)} ${row.timeHHmm} → ${row.target}`
  );
};

module.exports = {
  isCmCommandSource,
  handleBroadcastCm,
  handleBroadcastG,
  handleBroadcastGlist,
  handleBroadcastCmlist,
  handleBroadcastSend,
  handleBroadcastDm,
  handleBroadcastDg,
  handleBroadcastCs,
  handleBroadcastCslist,
  handleBroadcastDs,
  fireBroadcastSchedule,
  getScheduleNowParts,
  getSaigonNowParts: getScheduleNowParts,
  parseHHmm,
  SCHEDULE_TZ
};
