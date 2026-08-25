const { hasActiveSubscription, hasActiveSubscriptionForChat } = require('../services/subscriptionService');
const { isMathExpression, isSingleNumber } = require('../utils/formatter');
const { isTransferMessage } = require('../utils/qrGenerator');
const messages = require('../src/messages/vi');

const FREE_COMMANDS_EXACT = new Set([
  '/plan',
  '/goi',
  '/mysub',
  '/help',
  '/start',
  '/st',
  '开始'
]);

const REPLY_MENU_LABELS = new Set([
  messages.subscriptionReplyPlan,
  messages.subscriptionReplyMysub,
  messages.subscriptionReplyHelp,
  messages.subscriptionReplyCalcBtn,
  messages.subscriptionReplyHide
]);

function isReplyMenuAction(messageText) {
  return REPLY_MENU_LABELS.has((messageText || '').trim());
}

function isFreeCommand(messageText) {
  const t = (messageText || '').trim();
  if (!t) return false;
  if (isReplyMenuAction(t)) return true;
  const lower = t.toLowerCase();
  if (FREE_COMMANDS_EXACT.has(t) || FREE_COMMANDS_EXACT.has(lower)) return true;
  if (lower.startsWith('/subscribe')) return true;
  return false;
}

function isRecognizedBotAction(messageText, msg) {
  const t = (messageText || '').trim();
  if (!t) return false;

  if (t.startsWith('/')) return true;

  const chinesePrefixes = [
    '设置费率',
    '设置汇率',
    '下发',
    '撤回',
    '设置操作',
    '删除操作',
    '添加管理员',
    '删除管理员'
  ];
  if (chinesePrefixes.some((p) => t.startsWith(p))) return true;

  if (['上课', '结束', '操作人', 'start', 'Start', 'Bắt đầu'].includes(t)) return true;
  if (t.startsWith('+') || t.startsWith('-') || t.startsWith('%')) return true;
  if (t === '价格' || t.startsWith('价格 ') || t.startsWith('价格/') || t.startsWith('价格:')) {
    return true;
  }
  if (isMathExpression(t) && !isSingleNumber(t)) return true;
  if (isTransferMessage(t)) return true;

  if (msg.reply_to_message && /^[123]$/.test(t)) return true;

  return false;
}

function isCalculationAction(messageText) {
  const t = (messageText || '').trim();
  if (!t) return false;
  // Lệnh kế toán +100 / -100 — không phải máy tính
  if (t.startsWith('+') || t.startsWith('-')) return false;
  if (t.startsWith('/t ') || t.startsWith('/v ')) return true;
  if (isMathExpression(t) && !isSingleNumber(t)) return true;
  return false;
}

async function shouldBlockForSubscription(userId, messageText, msg, chatId) {
  if (await hasActiveSubscriptionForChat(userId, chatId)) return false;
  if (isFreeCommand(messageText)) return false;
  if (isCalculationAction(messageText)) return false;
  if (!isRecognizedBotAction(messageText, msg)) return false;
  return true;
}

async function enforceSubscriptionGate(bot, chatId, userId, messageText, msg) {
  if (!(await shouldBlockForSubscription(userId, messageText, msg, chatId))) return false;
  await bot.sendMessage(chatId, messages.subscriptionExpired, { parse_mode: 'Markdown' });
  return true;
}

module.exports = {
  FREE_COMMANDS_EXACT,
  isFreeCommand,
  isReplyMenuAction,
  isCalculationAction,
  isRecognizedBotAction,
  shouldBlockForSubscription,
  enforceSubscriptionGate
};
