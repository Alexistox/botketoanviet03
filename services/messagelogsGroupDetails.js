const Group = require('../models/Group');
const Transaction = require('../models/Transaction');

function getBot() {
  try {
    return require('../app').bot || null;
  } catch (_) {
    return null;
  }
}

function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const ts = {};
  if (startDate) ts.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    ts.$lte = end;
  }
  return ts;
}

/**
 * @param {string} chatId
 * @param {{ startDate?: string, endDate?: string }} opts
 */
async function fetchGroupDetails(chatId, opts = {}) {
  const { startDate, endDate } = opts;
  const group = await Group.findOne({ chatId: String(chatId) }).lean();
  if (!group) {
    return null;
  }

  const bot = getBot();
  let groupTitle = group.groupName || `Chat ${chatId}`;
  let memberCount = 0;
  let members = [];
  let operators = (group.operators || []).map((op) => ({
    userId: op.userId,
    username: op.username || '',
    dateAdded: op.dateAdded,
    telegramLink: op.username ? `https://t.me/${op.username}` : null,
    statusText: 'Bot Operator',
    fullName: op.username || 'Unknown'
  }));

  if (bot) {
    try {
      const chatInfo = await bot.getChat(chatId);
      groupTitle = chatInfo.title || groupTitle;
      memberCount = await bot.getChatMemberCount(chatId);
    } catch (_) {
      /* ignore */
    }
    try {
      const administrators = await bot.getChatAdministrators(chatId);
      members = administrators.map((admin) => ({
        id: admin.user.id,
        username: admin.user.username || '',
        fullName:
          `${admin.user.first_name || ''} ${admin.user.last_name || ''}`.trim() ||
          admin.user.username ||
          'Unknown',
        telegramLink: admin.user.username ? `https://t.me/${admin.user.username}` : null,
        status: admin.status,
        statusText: admin.status === 'creator' ? 'Chủ nhóm' : 'Quản trị viên',
        isBot: admin.user.is_bot || false
      }));
    } catch (_) {
      members = [];
    }
  }

  const txFilter = { chatId: String(chatId), skipped: { $ne: true } };
  const dateRange = buildDateFilter(startDate, endDate);
  if (dateRange) txFilter.timestamp = dateRange;

  const transactionCount = await Transaction.countDocuments(txFilter);

  const typeStats = await Transaction.aggregate([
    { $match: txFilter },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalUsdt: { $sum: '$usdtAmount' }
      }
    }
  ]);

  const statsByType = {};
  typeStats.forEach((row) => {
    statsByType[row._id] = {
      count: row.count,
      totalAmount: row.totalAmount || 0,
      totalUsdt: row.totalUsdt || 0
    };
  });

  const dailyData = await Transaction.aggregate([
    { $match: txFilter },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          type: '$type'
        },
        totalAmount: { $sum: '$amount' },
        totalUsdtAmount: { $sum: '$usdtAmount' },
        count: { $sum: 1 },
        avgRate: { $avg: '$rate' },
        avgExchangeRate: { $avg: '$exchangeRate' }
      }
    },
    { $sort: { '_id.date': -1 } }
  ]);

  const summary = {};
  let periodVND = 0;
  let periodUSDT = 0;
  let periodPaid = 0;

  dailyData.forEach((item) => {
    const date = item._id.date;
    const type = item._id.type;
    if (!summary[date]) {
      summary[date] = {
        date,
        deposits: { amount: 0, usdtAmount: 0, count: 0 },
        withdraws: { amount: 0, usdtAmount: 0, count: 0 },
        payments: { amount: 0, usdtAmount: 0, count: 0 },
        transactionCount: 0,
        avgRate: 0,
        avgExchangeRate: 0
      };
    }
    if (type === 'deposit') {
      summary[date].deposits = {
        amount: item.totalAmount,
        usdtAmount: item.totalUsdtAmount,
        count: item.count
      };
    } else if (type === 'withdraw') {
      summary[date].withdraws = {
        amount: Math.abs(item.totalAmount),
        usdtAmount: Math.abs(item.totalUsdtAmount),
        count: item.count
      };
    } else if (type === 'payment') {
      summary[date].payments = {
        amount: item.totalAmount,
        usdtAmount: item.totalUsdtAmount,
        count: item.count
      };
    }
    summary[date].avgRate = item.avgRate || summary[date].avgRate;
    summary[date].avgExchangeRate = item.avgExchangeRate || summary[date].avgExchangeRate;
    summary[date].transactionCount += item.count;
  });

  Object.values(summary).forEach((day) => {
    day.totalVND = day.deposits.amount - day.withdraws.amount;
    day.totalUSDT = day.deposits.usdtAmount - day.withdraws.usdtAmount;
    day.totalPaid = day.payments.usdtAmount;
    day.remaining = day.totalUSDT - day.totalPaid;
    periodVND += day.totalVND;
    periodUSDT += day.totalUSDT;
    periodPaid += day.totalPaid;
  });

  const dailySummary = Object.values(summary).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const totalPaidAll = await Transaction.aggregate([
    { $match: { chatId: String(chatId), type: 'payment', skipped: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$usdtAmount' } } }
  ]);
  const totalPaidAmount = totalPaidAll.length ? totalPaidAll[0].total : 0;

  const startHistory = await Transaction.find({ chatId: String(chatId), type: 'clear' })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

  return {
    chatId: String(chatId),
    groupTitle,
    group: {
      totalVND: group.totalVND || 0,
      totalVNDPlus: group.totalVNDPlus || 0,
      totalVNDMinus: group.totalVNDMinus || 0,
      totalUSDT: group.totalUSDT || 0,
      totalUSDTPlus: group.totalUSDTPlus || 0,
      totalUSDTMinus: group.totalUSDTMinus || 0,
      usdtPaid: group.usdtPaid || 0,
      remainingUSDT: group.remainingUSDT ?? group.totalUSDT - totalPaidAmount,
      rate: group.rate || 0,
      exchangeRate: group.exchangeRate || 0,
      wrate: group.wrate || 0,
      wexchangeRate: group.wexchangeRate || 0,
      currency: group.currency || 'USDT',
      lastClearDate: group.lastClearDate,
      numberFormat: group.numberFormat || 'comma'
    },
    memberCount,
    members,
    operators,
    transactionCount,
    statsByType,
    dailySummary,
    periodTotals: {
      totalVND: periodVND,
      totalUSDT: periodUSDT,
      totalPaid: periodPaid,
      remaining: periodUSDT - periodPaid
    },
    summary: {
      totalVND: group.totalVND || 0,
      totalUSDT: group.totalUSDT || 0,
      totalPaid: totalPaidAmount,
      remaining: (group.totalUSDT || 0) - totalPaidAmount,
      rate: group.rate || 0,
      exchangeRate: group.exchangeRate || 0,
      wrate: group.wrate || 0,
      wexchangeRate: group.wexchangeRate || 0
    },
    startHistory: startHistory.map((t) => ({
      date: t.timestamp.toISOString().split('T')[0],
      time: t.timestamp,
      senderName: t.senderName
    })),
    filters: { startDate: startDate || null, endDate: endDate || null }
  };
}

module.exports = { fetchGroupDetails };
