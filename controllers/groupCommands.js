const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const Config = require('../models/Config');
const { formatSmart, formatRateValue, formatTelegramMessage, formatDateUS, getNumberFormat } = require('../utils/formatter');
const { getButtonsStatus, getInlineKeyboard } = require('./userCommands');
const messages = require('../src/messages/vi');
const { getCurrencyForGroup } = require('../utils/permissions');

/**
 * Xử lý lệnh clear (上课) - Reset các giá trị về 0
 */
const handleClearCommand = async (bot, msg) => {
  try {
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: msg.chat.id.toString() });
    
    // Lấy rate và exchangeRate hiện tại
    const currentRate = group ? group.rate : 0;
    const currentExRate = group ? group.exchangeRate : 0;
    
    if (!group) {
      group = new Group({
        chatId: msg.chat.id.toString(),
        totalVND: 0,
        totalUSDT: 0,
        usdtPaid: 0,
        remainingUSDT: 0,
        rate: currentRate,
        exchangeRate: currentExRate,
        lastClearDate: new Date()
      });
    } else {
      group.totalVND = 0;
      group.totalUSDT = 0;
      group.usdtPaid = 0;
      group.remainingUSDT = 0;
      group.lastClearDate = new Date();
    }
    
    await group.save();

    // Xóa tất cả thông tin thẻ
    await Card.deleteMany({ chatId: msg.chat.id.toString() });
    
    // Lưu transaction mới
    const transaction = new Transaction({
      chatId: msg.chat.id.toString(),
      type: 'clear',
      message: '/clear',
      senderName: msg.from.first_name,
      rate: currentRate,
      exchangeRate: currentExRate,
      timestamp: new Date()
    });
    
    await transaction.save();
    
    // Tính toán giá trị ví dụ
    let exampleValue = 0;
    if (currentExRate > 0) {
      exampleValue = (100000 / currentExRate) * (1 - currentRate / 100);
    }
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(msg.chat.id);
    const numberFormat = await getNumberFormat(msg.chat.id);
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(msg.chat.id);
    const paymentData = await getPaymentHistory(msg.chat.id);
    const cardSummary = await getCardSummary(msg.chat.id, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(currentRate) + "%",
      exchangeRate: formatRateValue(currentExRate),
      example: formatSmart(exampleValue, numberFormat),
      totalAmount: "0",
      totalUSDT: "0",
      paidUSDT: "0",
      remainingUSDT: "0",
      currencyUnit,
      numberFormat,
      cards: [] // Empty after clear
    };
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(msg.chat.id);
    const keyboard = showButtons ? await getInlineKeyboard(msg.chat.id) : null;
    
    bot.sendMessage(msg.chat.id, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handleClearCommand:', error);
    bot.sendMessage(msg.chat.id, messages.error);
  }
};

/**
 * Xử lý lệnh đặt rate (设置费率)
 */
const handleRateCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    
    // Trích xuất giá trị rate từ tin nhắn
    const inputText = messageText.substring(4).trim();
    
    if (!inputText) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: 设置费率2 (tương ứng 2%)");
      return;
    }
    
    // Chuyển đổi sang số
    const xValue = parseFloat(inputText);
    if (isNaN(xValue)) {
      bot.sendMessage(chatId, "Giá trị nhập vào không hợp lệ.");
      return;
    }
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        rate: xValue
      });
    } else {
      group.rate = xValue;
    }
    
    await group.save();
    
    // Lưu transaction mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'setRate',
      amount: 0,
      message: messageText,
      senderName,
      rate: xValue,
      exchangeRate: group.exchangeRate,
      timestamp: new Date()
    });
    
    await transaction.save();
    
    // Tính toán giá trị ví dụ
    let exampleValue = 0;
    if (group.exchangeRate > 0) {
      exampleValue = (100000 / group.exchangeRate) * (1 - xValue / 100);
    }
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(xValue) + "%",
      exchangeRate: formatRateValue(group.exchangeRate),
      example: formatSmart(exampleValue, numberFormat),
      totalAmount: formatSmart(group.totalVND, numberFormat),
      totalUSDT: formatSmart(group.totalUSDT, numberFormat),
      paidUSDT: formatSmart(group.usdtPaid, numberFormat),
      remainingUSDT: formatSmart(group.remainingUSDT, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in handleRateCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingRate);
  }
};

/**
 * Xử lý lệnh đặt tỷ giá (设置汇率)
 */
const handleExchangeRateCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    
    // Trích xuất giá trị tỷ giá từ tin nhắn
    const inputText = messageText.substring(4).trim();
    
    if (!inputText) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: 设置汇率14600");
      return;
    }
    
    // Chuyển đổi sang số
    const yValue = parseFloat(inputText);
    if (isNaN(yValue)) {
      bot.sendMessage(chatId, "Giá trị nhập vào không hợp lệ.");
      return;
    }
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        exchangeRate: yValue
      });
    } else {
      group.exchangeRate = yValue;
    }
    
    await group.save();
    
    // Lưu transaction mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'setExchangeRate',
      amount: 0,
      message: messageText,
      senderName,
      rate: group.rate,
      exchangeRate: yValue,
      timestamp: new Date()
    });
    
    await transaction.save();
    
    // Tính toán giá trị ví dụ
    let exampleValue = 0;
    if (yValue > 0) {
      exampleValue = (100000 / yValue) * (1 - group.rate / 100);
    }
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(group.rate) + "%",
      exchangeRate: formatRateValue(yValue),
      example: formatSmart(exampleValue, numberFormat),
      totalAmount: formatSmart(group.totalVND, numberFormat),
      totalUSDT: formatSmart(group.totalUSDT, numberFormat),
      paidUSDT: formatSmart(group.usdtPaid, numberFormat),
      remainingUSDT: formatSmart(group.remainingUSDT, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in handleExchangeRateCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingExchangeRate);
  }
};

/**
 * Xử lý lệnh đặt cả 2 giá trị rate và exchangeRate (/d)
 */
const handleDualRateCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    
    // Trích xuất giá trị rate và tỷ giá từ tin nhắn
    const inputText = messageText.substring(3).trim();
    
    if (!inputText) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /d 2/14600");
      return;
    }
    
    // Tách rate và tỷ giá
    const [rateStr, exRateStr] = inputText.split('/');
    if (!rateStr || !exRateStr) {
      bot.sendMessage(chatId, "Định dạng không hợp lệ. Ví dụ: /d 2/14600");
      return;
    }
    
    // Chuyển đổi sang số
    const newRate = parseFloat(rateStr);
    const newExRate = parseFloat(exRateStr);
    
    if (isNaN(newRate) || isNaN(newExRate)) {
      bot.sendMessage(chatId, "Giá trị nhập vào không hợp lệ.");
      return;
    }
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        rate: newRate,
        exchangeRate: newExRate
      });
    } else {
      group.rate = newRate;
      group.exchangeRate = newExRate;
    }
    
    await group.save();
    
    // Lưu transaction mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'setRate',
      amount: 0,
      message: messageText,
      senderName,
      rate: newRate,
      exchangeRate: newExRate,
      timestamp: new Date()
    });
    
    await transaction.save();
    
    // Tính toán giá trị ví dụ
    const exampleValue = (100000 / newExRate) * (1 - newRate / 100);
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(newRate) + "%",
      exchangeRate: formatRateValue(newExRate),
      example: formatSmart(exampleValue, numberFormat),
      totalAmount: formatSmart(group.totalVND, numberFormat),
      totalUSDT: formatSmart(group.totalUSDT, numberFormat),
      paidUSDT: formatSmart(group.usdtPaid, numberFormat),
      remainingUSDT: formatSmart(group.remainingUSDT, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in handleDualRateCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingDualRate);
  }
};

/**
 * Xử lý lệnh xóa dữ liệu nhóm (/delete)
 */
const handleDeleteCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Xóa tất cả giao dịch của nhóm
    await Transaction.deleteMany({ chatId: chatId.toString() });
    
    // Xóa tất cả thông tin thẻ
    await Card.deleteMany({ chatId: chatId.toString() });
    
    // Reset thông tin nhóm
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({ chatId: chatId.toString() });
    } else {
      group.totalVND = 0;
      group.totalUSDT = 0;
      group.usdtPaid = 0;
      group.remainingUSDT = 0;
      group.rate = 0;
      group.exchangeRate = 0;
      group.lastClearDate = new Date();
    }
    
    await group.save();
    
    // Lưu transaction mới về lệnh delete
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'delete',
      message: '/delete',
      senderName: msg.from.first_name,
      timestamp: new Date()
    });
    
    await transaction.save();
    
    bot.sendMessage(chatId, "Dữ liệu đã được xóa.");
    
  } catch (error) {
    console.error('Error in handleDeleteCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingMessage);
  }
};

/**
 * Hàm lấy lịch sử giao dịch deposit
 */
const getDepositHistory = async (chatId) => {
  try {
    // Tìm nhóm và lấy ngày clear cuối cùng
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) return { entries: [] };
    
    const lastClearDate = group.lastClearDate;
    
    // Lấy tất cả giao dịch deposit và withdraw sau lần clear cuối
    const transactions = await Transaction.find({
      chatId: chatId.toString(),
      type: { $in: ['deposit', 'withdraw'] },
      timestamp: { $gt: lastClearDate },
      skipped: { $ne: true } // Không lấy các giao dịch đã bị skip
    }).sort({ timestamp: 1 }); // Sắp xếp theo thời gian tăng dần (ID sẽ tăng dần, cũ đến mới)
    
    if (transactions.length === 0) return { entries: [] };
    
    // Format lại các chi tiết với messageId và senderName
    // Gán ID theo thứ tự giao dịch
    const entries = transactions.map((t, index) => {
      return {
        id: index + 1, // ID theo thứ tự trong mảng
        details: t.details,
        messageId: t.messageId || null,
        chatLink: t.messageId ? `https://t.me/c/${chatId.toString().replace('-100', '')}/${t.messageId}` : null,
        timestamp: t.timestamp,
        senderName: t.senderName || ''
      };
    });
    
    // Chỉ lấy 6 giao dịch gần đây nhất nếu có quá nhiều giao dịch
    return { entries: entries.slice(-5), totalCount: entries.length };
  } catch (error) {
    console.error('Error in getDepositHistory:', error);
    return { entries: [], totalCount: 0 };
  }
};

/**
 * Hàm lấy lịch sử giao dịch thanh toán
 */
const getPaymentHistory = async (chatId) => {
  try {
    // Tìm nhóm và lấy ngày clear cuối cùng
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) return { entries: [] };
    
    const lastClearDate = group.lastClearDate;
    
    // Lấy tất cả giao dịch payment sau lần clear cuối
    const transactions = await Transaction.find({
      chatId: chatId.toString(),
      type: 'payment',
      timestamp: { $gt: lastClearDate },
      skipped: { $ne: true } // Không lấy các giao dịch đã bị skip
    }).sort({ timestamp: 1 }); // Sắp xếp theo thời gian tăng dần (ID sẽ tăng dần, cũ đến mới)
    
    if (transactions.length === 0) return { entries: [] };
    
    // Format lại các chi tiết với messageId và senderName
    // Gán ID theo thứ tự giao dịch
    const entries = transactions.map((t, index) => {
      return {
        id: index + 1, // ID theo thứ tự trong mảng
        details: t.details,
        messageId: t.messageId || null,
        chatLink: t.messageId ? `https://t.me/c/${chatId.toString().replace('-100', '')}/${t.messageId}` : null,
        timestamp: t.timestamp,
        senderName: t.senderName || ''
      };
    });
    
    // Chỉ lấy 3 giao dịch gần đây nhất nếu có quá nhiều giao dịch
    return { entries: entries.slice(-3), totalCount: entries.length };
  } catch (error) {
    console.error('Error in getPaymentHistory:', error);
    return { entries: [], totalCount: 0 };
  }
};

/**
 * Hàm lấy thông tin các thẻ
 */
const getCardSummary = async (chatId, numberFormat) => {
  try {
    // Lấy tất cả thẻ của nhóm không bị ẩn
    const cards = await Card.find({
      chatId: chatId.toString(),
      hidden: false
    });
    
    if (cards.length === 0) return [];
    
    // Lấy thông tin group
    const group = await Group.findOne({ chatId: chatId.toString() });
    const showRemaining = (group && group.rate === 0 && group.exchangeRate === 1);
    
    // Nếu không có numberFormat được truyền vào, lấy từ database
    if (!numberFormat) {
      numberFormat = await getNumberFormat(chatId);
    }
    
    // Format thông tin từng thẻ
    const summary = cards.map(card => {
      let cardInfo = `${card.cardCode}=[${formatSmart(card.total, numberFormat)}](https://t.me/@id7590104666)`;
      
      // Thêm thông tin limit nếu có
      if (card.limit > 0) {
        const remaining = card.limit - card.total;
        cardInfo += `|Hạn mức:[${formatSmart(remaining, numberFormat)}](https://t.me/@id7590104666)`;
      }
      
      // Thêm thông tin thanh toán còn lại nếu rate=0 và exchange rate=1
      if (showRemaining) {
        const remainingPayment = card.total - card.paid;
        cardInfo += `|\nSố dư trong thẻ:[${formatSmart(remainingPayment, numberFormat)}](https://t.me/@id7590104666)`;
      }
      
      return cardInfo;
    });
    
    return summary;
  } catch (error) {
    console.error('Error in getCardSummary:', error);
    return [];
  }
};

module.exports = {
  handleClearCommand,
  handleRateCommand,
  handleExchangeRateCommand,
  handleDualRateCommand,
  handleDeleteCommand,
  getDepositHistory,
  getPaymentHistory,
  getCardSummary
}; 