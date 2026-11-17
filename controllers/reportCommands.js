const Transaction = require('../models/Transaction');
const Group = require('../models/Group');
const Config = require('../models/Config');
const crypto = require('crypto');
const { Readable } = require('stream');
const { isUserOperator } = require('../utils/permissions');
const { getNumberFormat: getGroupNumberFormat } = require('../utils/formatter');
const {
  groupTransactionsBySession,
  buildHistoryRichHtmlChunks,
  buildHistoryPlainFallback,
  buildHistoryExcelBuffer,
  sendRichHtml
} = require('../utils/reportHistory');

/**
 * /report h [群组ID] — rich table (Excel-like) lịch sử theo từng phiên 上课 + file .xlsx
 */
const handleReportHCommand = async (bot, msg, options = {}) => {
  const replyChatId = msg.chat.id;
  const replyIdStr = replyChatId.toString();
  const userId = msg.from && msg.from.id != null ? String(msg.from.id) : null;

  try {
    const reportChatId =
      options.reportChatId != null ? String(options.reportChatId) : replyIdStr;
    const isPrivate = !String(reportChatId).startsWith('-');

    if (userId == null) {
      await bot.sendMessage(replyChatId, '⛔ Không xác thực được danh tính.');
      return;
    }

    // Quyền: sổ riêng (DM = userId) luôn được; nhóm khác cần operator/admin
    const isOwnDmLedger = isPrivate && userId === String(reportChatId);
    const sameChat = reportChatId === replyIdStr;
    if (!isOwnDmLedger) {
      const allowed = await isUserOperator(userId, reportChatId);
      if (!allowed) {
        await bot.sendMessage(
          replyChatId,
          sameChat
            ? '⛔ Chỉ operator/admin mới dùng được /report h.'
            : '⛔ Không có quyền xem lịch sử nhóm này. Cần là operator của nhóm hoặc admin hệ thống.'
        );
        return;
      }
    }

    const group = await Group.findOne({ chatId: reportChatId });
    if (!group) {
      await bot.sendMessage(
        replyChatId,
        reportChatId === replyIdStr
          ? 'Không có dữ liệu. Hãy Bắt đầu phiên hoặc ghi sổ trước.'
          : 'Không tìm thấy nhóm hoặc nhóm chưa đăng ký. Kiểm tra ID nhóm.'
      );
      return;
    }

    const transactions = await Transaction.find({
      chatId: reportChatId,
      skipped: { $ne: true }
    })
      .sort({ timestamp: 1 })
      .lean();

    if (!transactions.length) {
      await bot.sendMessage(replyChatId, 'Chưa có giao dịch.');
      return;
    }

    const sessions = groupTransactionsBySession(transactions);
    const configCurrency = await Config.findOne({
      key: `CURRENCY_UNIT_${reportChatId}`
    });
    const currencyUnit = configCurrency ? configCurrency.value : 'USDT';
    const numberFormat = await getGroupNumberFormat(reportChatId);

    const meta = {
      chatId: reportChatId,
      currencyUnit,
      numberFormat,
      isPrivate
    };

    const richChunks = buildHistoryRichHtmlChunks(meta, sessions);
    let richOk = true;
    for (let i = 0; i < richChunks.length; i += 1) {
      const mode = await sendRichHtml(bot, replyChatId, richChunks[i]);
      if (!mode) {
        richOk = false;
        break;
      }
    }

    if (!richOk) {
      const plain = buildHistoryPlainFallback(meta, sessions);
      // Chia nếu quá dài
      const max = 3500;
      for (let i = 0; i < plain.length; i += max) {
        const part = plain.slice(i, i + max);
        await bot.sendMessage(replyChatId, part, { parse_mode: 'HTML' });
      }
    }

    // Kèm file Excel (dashboard spreadsheet)
    try {
      const { buffer, filename } = buildHistoryExcelBuffer(meta, sessions);
      const stream = Readable.from(buffer);
      await bot.sendDocument(
        replyChatId,
        stream,
        {
          caption: `📎 Excel báo cáo · ${sessions.length} phiên · ${transactions.length} GD`
        },
        {
          filename,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      );
    } catch (excelErr) {
      console.warn(
        '[reportH] excel send failed:',
        excelErr && excelErr.message ? excelErr.message : excelErr
      );
    }
  } catch (error) {
    console.error('Error in handleReportHCommand:', error);
    await bot.sendMessage(replyChatId, 'Lỗi tạo báo cáo lịch sử. Thử lại sau.');
  }
};

/**
 * /report [群组ID] — tạo link website dashboard (24h).
 * /report1 giữ làm alias.
 */
const handleReportWebCommand = async (bot, msg, options = {}) => {
  const replyChatId = msg.chat.id;
  const replyIdStr = replyChatId.toString();
  const userId = msg.from && msg.from.id != null ? String(msg.from.id) : null;

  try {
    const reportChatId =
      options.reportChatId != null ? String(options.reportChatId) : replyIdStr;
    const isPrivate = !String(reportChatId).startsWith('-');

    if (userId == null) {
      await bot.sendMessage(replyChatId, '⛔ Không xác thực được danh tính.');
      return;
    }

    const isOwnDmLedger = isPrivate && userId === String(reportChatId);
    const sameChat = reportChatId === replyIdStr;
    if (!isOwnDmLedger) {
      const allowed = await isUserOperator(userId, reportChatId);
      if (!allowed) {
        await bot.sendMessage(
          replyChatId,
          sameChat
            ? '⛔ Chỉ operator/admin mới dùng được /report.'
            : '⛔ Không có quyền xem dashboard nhóm này. Cần là operator của nhóm hoặc admin hệ thống.'
        );
        return;
      }
    }

    const group = await Group.findOne({ chatId: reportChatId });
    if (!group) {
      await bot.sendMessage(
        replyChatId,
        reportChatId === replyIdStr
          ? '❌ Chưa có sổ. Hãy Bắt đầu phiên hoặc ghi sổ trước.'
          : '❌ Không tìm thấy nhóm hoặc nhóm chưa đăng ký.'
      );
      return;
    }

    const timestamp = Date.now();
    const token = crypto
      .createHash('md5')
      .update(
        `${reportChatId}-${timestamp}-${process.env.REPORT_SECRET || 'default-secret'}`
      )
      .digest('hex');

    group.reportToken = token;
    group.reportTokenExpiry = new Date(timestamp + 24 * 60 * 60 * 1000);
    await group.save();

    const { getBaseUrl } = require('../utils/serverUrl');
    const baseUrl = getBaseUrl();
    const reportUrl = `${baseUrl}/report/${encodeURIComponent(reportChatId)}?token=${token}`;

    const transactionCount = await Transaction.countDocuments({
      chatId: reportChatId,
      skipped: { $ne: true }
    });
    const clearCount = await Transaction.countDocuments({
      chatId: reportChatId,
      type: 'clear'
    });

    const scope = isPrivate ? 'Chat riêng' : 'Nhóm';
    const message =
      `📊 <b>Bảng báo cáo giao dịch</b>\n\n` +
      `🔗 <a href="${reportUrl}">Nhấn để mở báo cáo web</a>\n\n` +
      `📂 ${scope} <code>${reportChatId}</code>\n` +
      `📝 ${transactionCount} giao dịch · ${clearCount} phiên\n` +
      `⏰ Link có hiệu lực 24 giờ\n` +
      `🔒 Chỉ người có link mới xem được\n\n` +
      `Gợi ý: <code>/report h</code> bảng+Excel · <code>结束</code> báo cáo phiên hiện tại trên Telegram`;

    await bot.sendMessage(replyChatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Mở báo cáo web', url: reportUrl }]
        ]
      }
    });
  } catch (error) {
    console.error('Error in handleReportWebCommand:', error);
    await bot.sendMessage(replyChatId, '❌ Lỗi tạo link báo cáo. Thử lại.');
  }
};

/** @deprecated dùng handleReportWebCommand — giữ tên cũ cho import */
const handleReport1Command = handleReportWebCommand;

module.exports = {
  handleReport1Command,
  handleReportWebCommand,
  handleReportHCommand
}; 