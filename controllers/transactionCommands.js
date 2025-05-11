const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const Config = require('../models/Config');
const { formatSmart, formatRateValue, formatTelegramMessage, isSingleNumber, formatDateUS, formatTimeString } = require('../utils/formatter');
const { getDepositHistory, getPaymentHistory, getCardSummary } = require('./groupCommands');
const { getButtonsStatus, getInlineKeyboard } = require('./userCommands');

/**
 * Xử lý lệnh thêm tiền (+)
 */
const handlePlusCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    const messageId = msg.message_id.toString();
    
    // Phân tích tin nhắn
    const parts = messageText.split('+');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "指令无效。格式为：+数字 或 +数字 [卡号] [额度]");
      return;
    }
    
    // Xử lý các tham số
    const inputParts = parts[1].trim().split(' ');
    const expr = inputParts[0];
    const cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
    const cardLimit = inputParts.length > 2 ? parseFloat(inputParts[2]) : 0;
    
    // Tính toán số tiền
    let amountVND;
    if (!isSingleNumber(expr)) {
      try {
        amountVND = eval(expr);
      } catch(err) {
        bot.sendMessage(chatId, "表达式无效，请重试。");
        return;
      }
    } else {
      amountVND = parseFloat(expr);
    }
    
    if (isNaN(amountVND)) {
      bot.sendMessage(chatId, "金额无效。");
      return;
    }

    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    // Kiểm tra tỷ giá
    if (!group.exchangeRate) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    // Lấy đơn vị tiền tệ
    const configCurrency = await Config.findOne({ key: 'CURRENCY_UNIT' });
    const currencyUnit = configCurrency ? configCurrency.value : 'USDT';

    // Bỏ qua giao dịch +0
    if (amountVND === 0) {
      // Chỉ hiển thị thông tin hiện tại mà không ghi nhận giao dịch
      const todayDate = new Date();
      const depositData = await getDepositHistory(chatId);
      const paymentData = await getPaymentHistory(chatId);
      const cardSummary = await getCardSummary(chatId);
      
      // Tạo response JSON
      const responseData = {
        date: formatDateUS(todayDate),
        depositData,
        paymentData,
        rate: formatRateValue(group.rate) + "%",
        exchangeRate: formatRateValue(group.exchangeRate),
        totalAmount: formatSmart(group.totalVND),
        totalUSDT: formatSmart(group.totalUSDT),
        paidUSDT: formatSmart(group.usdtPaid),
        remainingUSDT: formatSmart(group.remainingUSDT),
        currencyUnit,
        cards: cardSummary
      };
      
      // Format và gửi tin nhắn
      const response = formatTelegramMessage(responseData);
      
      // Kiểm tra trạng thái hiển thị buttons
      const showButtons = await getButtonsStatus(chatId);
      const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
      
      bot.sendMessage(chatId, response, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      return;
    }
   
    
    // Tính toán giá trị USDT
    const xValue = group.rate;
    const yValue = group.exchangeRate;
    const newUSDT = (amountVND / yValue) * (1 - xValue / 100);
    
    // Tính toán phần (1-(费率/100))
    const rateFactor = (1 - xValue / 100).toFixed(2);
    
    // Cập nhật group
    group.totalVND += amountVND;
    group.totalUSDT += newUSDT;
    group.remainingUSDT = group.totalUSDT - group.usdtPaid;
    await group.save();
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND)}*\\*${rateFactor}/${yValue} = ${formatSmart(newUSDT)} (${cardCode}) \`${senderName}\``;
    } else {
      details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND)}*\\*${rateFactor}/${yValue} = ${formatSmart(newUSDT)} \`${senderName}\``;
    }
    
    // Lưu giao dịch mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'deposit',
      amount: amountVND,
      usdtAmount: newUSDT,
      message: messageText,
      details,
      senderName,
      cardCode,
      limit: cardLimit,
      rate: xValue,
      exchangeRate: yValue,
      timestamp: new Date(),
      messageId
    });
    
    await transaction.save();
    
    // Nếu có mã thẻ, cập nhật hoặc tạo thẻ mới
    if (cardCode) {
      let card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      if (!card) {
        card = new Card({
          chatId: chatId.toString(),
          cardCode,
          total: amountVND,
          paid: 0,
          limit: cardLimit > 0 ? cardLimit : 0,
          hidden: false,
          lastUpdated: new Date()
        });
      } else {
        card.total += amountVND;
        if (cardLimit > 0) {
          card.limit = cardLimit;
        }
        card.lastUpdated = new Date();
      }
      await card.save();
    }
    
    // Tính toán giá trị ví dụ
    let exampleValue = null;
    if (Math.abs(amountVND) < 1) {
      exampleValue = (100000 / yValue) * (1 - xValue / 100);
    }
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(xValue) + "%",
      exchangeRate: formatRateValue(yValue),
      totalAmount: formatSmart(group.totalVND),
      totalUSDT: formatSmart(group.totalUSDT),
      paidUSDT: formatSmart(group.usdtPaid),
      remainingUSDT: formatSmart(group.remainingUSDT),
      currencyUnit,
      cards: cardSummary
    };
    
    // Thêm ví dụ nếu cần
    if (exampleValue !== null) {
      responseData.example = formatSmart(exampleValue);
    }
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(chatId);
    const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
    
    bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handlePlusCommand:', error);
    bot.sendMessage(msg.chat.id, "处理入款命令时出错。请稍后再试。");
  }
};

/**
 * Xử lý lệnh rút tiền (-)
 */
const handleMinusCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    const messageId = msg.message_id.toString();
    
    // Phân tích tin nhắn
    const parts = messageText.split('-');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "指令无效。格式为：-数字 或 -数字 [卡号]");
      return;
    }
    
    // Xử lý các tham số
    const inputParts = parts[1].trim().split(' ');
    const expr = inputParts[0];
    const cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
    
    // Tính toán số tiền
    let amountVND;
    if (!isSingleNumber(expr)) {
      try {
        amountVND = eval(expr);
      } catch(err) {
        bot.sendMessage(chatId, "表达式无效，请重试。");
        return;
      }
    } else {
      amountVND = parseFloat(expr);
    }
    
    if (isNaN(amountVND)) {
      bot.sendMessage(chatId, "金额无效。");
      return;
    }
   
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    
    // Kiểm tra tỷ giá
    if (!group.exchangeRate) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    
    // Tính toán giá trị USDT
    const xValue = group.rate;
    const yValue = group.exchangeRate;
    const minusUSDT = (amountVND / yValue) * (1 - xValue / 100);
    
    // Tính toán phần (1-(费率/100))
    const rateFactor = (1 - xValue / 100).toFixed(2);
    
    // Cập nhật group
    group.totalVND -= amountVND;
    group.totalUSDT -= minusUSDT;
    group.remainingUSDT = group.totalUSDT - group.usdtPaid;
    await group.save();
    
    // Lấy đơn vị tiền tệ
    const configCurrency = await Config.findOne({ key: 'CURRENCY_UNIT' });
    const currencyUnit = configCurrency ? configCurrency.value : 'USDT';
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND)}*\\*${rateFactor}/${yValue} = -${formatSmart(minusUSDT)} (${cardCode}) \`${senderName}\``;
    } else {
      details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND)}*\\*${rateFactor}/${yValue} = -${formatSmart(minusUSDT)} \`${senderName}\``;
    }
    // Lưu giao dịch mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'withdraw',
      amount: -amountVND,
      usdtAmount: -minusUSDT,
      message: messageText,
      details,
      senderName,
      cardCode,
      rate: xValue,
      exchangeRate: yValue,
      timestamp: new Date(),
      messageId
    });
    
    await transaction.save();
    
    // Nếu có mã thẻ, cập nhật thẻ
    if (cardCode) {
      let card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      if (card) {
        card.total -= amountVND;
        card.lastUpdated = new Date();
        await card.save();
      } else {
        // Tạo thẻ mới với số tiền âm
        card = new Card({
          chatId: chatId.toString(),
          cardCode,
          total: -amountVND,
          paid: 0,
          hidden: false,
          lastUpdated: new Date()
        });
        await card.save();
      }
    }
    
    // Tính toán giá trị ví dụ
    let exampleValue = null;
    if (Math.abs(amountVND) < 1) {
      exampleValue = (100000 / yValue) * (1 - xValue / 100);
    }
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(xValue) + "%",
      exchangeRate: formatRateValue(yValue),
      totalAmount: formatSmart(group.totalVND),
      totalUSDT: formatSmart(group.totalUSDT),
      paidUSDT: formatSmart(group.usdtPaid),
      remainingUSDT: formatSmart(group.remainingUSDT),
      currencyUnit,
      cards: cardSummary
    };
    
    // Thêm ví dụ nếu cần
    if (exampleValue !== null) {
      responseData.example = formatSmart(exampleValue);
    }
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(chatId);
    const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
    
    bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handleMinusCommand:', error);
    bot.sendMessage(msg.chat.id, "处理出款命令时出错。请稍后再试。");
  }
};

/**
 * Xử lý lệnh thanh toán (下发 hoặc %)
 */
const handlePercentCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    const messageId = msg.message_id.toString();
    
    // Phân tích tin nhắn - hỗ trợ cả 下发 và % prefix
    let parts;
    if (messageText.startsWith('下发')) {
      parts = messageText.split('下发');
    } else if (messageText.startsWith('%')) {
      parts = messageText.split('%');
    } else {
      bot.sendMessage(chatId, "指令无效。格式为：下发数字 (USDT) 或 %数字 (USDT) 或 下发数字 [卡号] 或 %数字 [卡号]");
      return;
    }
    
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "指令无效。格式为：下发数字 (USDT) 或 %数字 (USDT) 或 下发数字 [卡号] 或 %数字 [卡号]");
      return;
    }
    
    // Xử lý các tham số
    const inputParts = parts[1].trim().split(' ');
    const expr = inputParts[0];
    const cardCode = inputParts.length > 1 ? inputParts[1].toUpperCase() : '';
    
    // Tính toán số tiền USDT
    let payUSDT;
    if (!isSingleNumber(expr)) {
      try {
        payUSDT = eval(expr);
      } catch(err) {
        bot.sendMessage(chatId, "表达式无效，请重试。");
        return;
      }
    } else {
      payUSDT = parseFloat(expr);
    }
    
    if (isNaN(payUSDT)) {
      bot.sendMessage(chatId, "USDT金额无效。");
      return;
    }
    
    // Ignore zero-value transactions
    if (payUSDT === 0) {
      bot.sendMessage(chatId, "金额为零，不处理。");
      return;
    }
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    
    // Kiểm tra tỷ giá
    if (!group.exchangeRate) {
      bot.sendMessage(chatId, "请设置汇率，费率");
      return;
    }
    
    // Lấy đơn vị tiền tệ
    const configCurrency = await Config.findOne({ key: 'CURRENCY_UNIT' });
    const currencyUnit = configCurrency ? configCurrency.value : 'USDT';
    
    // Cập nhật group
    group.usdtPaid += payUSDT;
    group.remainingUSDT = group.totalUSDT - group.usdtPaid;
    await group.save();
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      details = `\`${formatTimeString(new Date())}\`    *${formatSmart(payUSDT)}*  ${currencyUnit} (${cardCode})`;
    } else {
      details = `\`${formatTimeString(new Date())}\`    *${formatSmart(payUSDT)}*  ${currencyUnit}`;
    }
    
    // Lưu giao dịch mới
    const transaction = new Transaction({
      chatId: chatId.toString(),
      type: 'payment',
      usdtAmount: payUSDT,
      message: messageText,
      details,
      senderName,
      cardCode,
      rate: group.rate,
      exchangeRate: group.exchangeRate,
      timestamp: new Date(),
      messageId
    });
    
    await transaction.save();
    
    // Nếu có mã thẻ, cập nhật thẻ
    if (cardCode) {
      let card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      if (card) {
        card.paid += payUSDT;
        card.lastUpdated = new Date();
        await card.save();
      } else {
        // Không tạo thẻ mới khi chỉ thanh toán mà không có tiền gửi
        bot.sendMessage(chatId, `卡号 ${cardCode} 不存在。`);
        return;
      }
    }
    
    // Tính toán giá trị ví dụ
    let exampleValue = null;
    if (Math.abs(payUSDT) < 0.1) {
      exampleValue = (100000 / group.exchangeRate) * (1 - group.rate / 100);
    }
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(group.rate) + "%",
      exchangeRate: formatRateValue(group.exchangeRate),
      totalAmount: formatSmart(group.totalVND),
      totalUSDT: formatSmart(group.totalUSDT),
      paidUSDT: formatSmart(group.usdtPaid),
      remainingUSDT: formatSmart(group.remainingUSDT),
      currencyUnit,
      cards: cardSummary
    };
    
    // Thêm ví dụ nếu cần
    if (exampleValue !== null) {
      responseData.example = formatSmart(exampleValue);
    }
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(chatId);
    const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
    
    bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handlePercentCommand:', error);
    bot.sendMessage(msg.chat.id, "处理下发命令时出错。请稍后再试。");
  }
};

/**
 * Xử lý lệnh skip (/skip) - Xóa một giao dịch theo ID
 */
const handleSkipCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const senderName = msg.from.first_name;
    const messageText = msg.text;
    
    // Phân tích tin nhắn để lấy ID
    const parts = messageText.split('/skip');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "指令无效。格式为：/skip [ID] 例如: /skip 3 或 /skip !2");
      return;
    }
    
    // Xử lý ID, loại bỏ khoảng trắng và ký tự !
    let idStr = parts[1].trim();
    let isPaymentId = false;
    
    if (idStr.startsWith('!')) {
      isPaymentId = true;
      idStr = idStr.substring(1);
    }
    
    // Chuyển đổi ID thành số
    const id = parseInt(idStr);
    if (isNaN(id) || id <= 0) {
      bot.sendMessage(chatId, "ID无效。应为正整数。");
      return;
    }
    
    // Tìm nhóm
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "没有找到群组信息。");
      return;
    }
    
    // Lấy tất cả giao dịch trong nhóm sau lần clear cuối
    const lastClearDate = group.lastClearDate;
    
    let transactions;
    if (isPaymentId) {
      // Lấy các giao dịch payment
      transactions = await Transaction.find({
        chatId: chatId.toString(),
        type: 'payment',
        timestamp: { $gt: lastClearDate },
        skipped: { $ne: true }
      }).sort({ timestamp: 1 });
    } else {
      // Lấy các giao dịch deposit và withdraw
      transactions = await Transaction.find({
        chatId: chatId.toString(),
        type: { $in: ['deposit', 'withdraw'] },
        timestamp: { $gt: lastClearDate },
        skipped: { $ne: true }
      }).sort({ timestamp: 1 });
    }
    
    // Kiểm tra xem ID có hợp lệ không
    if (id > transactions.length) {
      bot.sendMessage(chatId, `ID无效。${isPaymentId ? '下发' : '入款'}记录中只有 ${transactions.length} 个条目。`);
      return;
    }
    
    // Lấy giao dịch cần skip - vì ID là số thứ tự trong mảng (bắt đầu từ 1), nên cần trừ 1
    const transaction = transactions[id - 1];
    
    // Bắt đầu xử lý skip dựa trên loại giao dịch
    if (transaction.type === 'deposit') {
      // Revert deposit: trừ VND và USDT
      group.totalVND -= transaction.amount;
      group.totalUSDT -= transaction.usdtAmount;
      group.remainingUSDT = group.totalUSDT - group.usdtPaid;
      
      // Nếu có mã thẻ, cập nhật thẻ
      if (transaction.cardCode) {
        const card = await Card.findOne({ chatId: chatId.toString(), cardCode: transaction.cardCode });
        if (card) {
          card.total -= transaction.amount;
          await card.save();
        }
      }
    } else if (transaction.type === 'withdraw') {
      // Revert withdraw: cộng VND và USDT
      group.totalVND += Math.abs(transaction.amount);
      group.totalUSDT += Math.abs(transaction.usdtAmount);
      group.remainingUSDT = group.totalUSDT - group.usdtPaid;
      
      // Nếu có mã thẻ, cập nhật thẻ
      if (transaction.cardCode) {
        const card = await Card.findOne({ chatId: chatId.toString(), cardCode: transaction.cardCode });
        if (card) {
          card.total += Math.abs(transaction.amount);
          await card.save();
        }
      }
    } else if (transaction.type === 'payment') {
      // Revert payment: trừ USDT đã thanh toán
      group.usdtPaid -= transaction.usdtAmount;
      group.remainingUSDT = group.totalUSDT - group.usdtPaid;
      
      // Nếu có mã thẻ, cập nhật thẻ
      if (transaction.cardCode) {
        const card = await Card.findOne({ chatId: chatId.toString(), cardCode: transaction.cardCode });
        if (card) {
          card.paid -= transaction.usdtAmount;
          await card.save();
        }
      }
    }
    
    // Lưu thay đổi vào group
    await group.save();
    
    // Đánh dấu giao dịch là đã skip
    transaction.skipped = true;
    transaction.skipReason = `Skipped by ${senderName} at ${new Date().toLocaleString()}`;
    await transaction.save();
    
    // Lưu transaction mới về lệnh skip
    const skipTransaction = new Transaction({
      chatId: chatId.toString(),
      type: 'skip',
      message: messageText,
      details: `Skip transaction ID: ${id}${isPaymentId ? '!' : ''} - ${transaction.details}`,
      senderName,
      timestamp: new Date()
    });
    
    await skipTransaction.save();
    
    // Lấy thông tin giao dịch gần đây sau khi skip
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId);
    
    // Tạo response JSON
    const configCurrency = await Config.findOne({ key: 'CURRENCY_UNIT' });
    const currencyUnit = configCurrency ? configCurrency.value : 'USDT';
    
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(group.rate) + "%",
      exchangeRate: formatRateValue(group.exchangeRate),
      totalAmount: formatSmart(group.totalVND),
      totalUSDT: formatSmart(group.totalUSDT),
      paidUSDT: formatSmart(group.usdtPaid),
      remainingUSDT: formatSmart(group.remainingUSDT),
      currencyUnit,
      cards: cardSummary
    };
    
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(chatId);
    const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
    
    bot.sendMessage(chatId, `✅ 成功删除ID为 ${id}${isPaymentId ? '!' : ''} 的交易记录。`, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handleSkipCommand:', error);
    bot.sendMessage(msg.chat.id, "处理删除命令时出错。请稍后再试。");
  }
};

module.exports = {
  handlePlusCommand,
  handleMinusCommand,
  handlePercentCommand,
  handleSkipCommand
}; 