const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const Config = require('../models/Config');
const { formatSmart, formatRateValue, formatTelegramMessage, isSingleNumber, formatDateUS, formatTimeString, getNumberFormat, parseNumberWithUnits, preprocessMathExpression } = require('../utils/formatter');
const { getDepositHistory, getPaymentHistory, getCardSummary } = require('./groupCommands');
const { getButtonsStatus, getInlineKeyboard } = require('./userCommands');
const { getCurrencyForGroup } = require('../utils/permissions');

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
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: +số hoặc +số [mã thẻ] [hạn mức]");
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
        // Tiền xử lý biểu thức để chuyển đổi định dạng viết tắt
        const preprocessedExpr = preprocessMathExpression(expr);
        amountVND = eval(preprocessedExpr);
      } catch(err) {
        bot.sendMessage(chatId, "Thử lại đi, sai rồi.");
        return;
      }
    } else {
      // Sử dụng parseNumberWithUnits để xử lý cả số thường và số có đơn vị viết tắt
      amountVND = parseNumberWithUnits(expr);
    }
    
    if (isNaN(amountVND)) {
      bot.sendMessage(chatId, "Hãy nhập đúng.");
      return;
    }

    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "Cài đặt phí và tỷ giá");
      return;
    }
    // Kiểm tra tỷ giá
    if (!group.exchangeRate) {
      bot.sendMessage(chatId, "Cài đặt phí và tỷ giá");
      return;
    }
    // Lấy đơn vị tiền tệ cho nhóm và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);

    // Bỏ qua giao dịch +0
    if (amountVND === 0) {
      // Chỉ hiển thị thông tin hiện tại mà không ghi nhận giao dịch
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
        exchangeRate: formatRateValue(group.exchangeRate),
        totalAmount: formatSmart(group.totalVNDPlus, numberFormat),
        currencyUnit,
        numberFormat,
        cards: cardSummary
      };

      // Kiểm tra có thiết lập wrate/wexchangeRate hay không để hiển thị thông tin phù hợp
      if ((group.wrate > 0 || group.wexchangeRate > 0) && group.wrate !== undefined && group.wexchangeRate !== undefined) {
        // Hiển thị thông tin mới khi đã có /d2
        const totalUSDTGross = group.totalUSDTPlus - group.totalUSDTMinus;
        const remainingUSDTOwed = totalUSDTGross - group.usdtPaid;
        responseData.wrate = formatRateValue(group.wrate) + "%";
        responseData.wexchangeRate = formatRateValue(group.wexchangeRate);
        responseData.totalVNDMinus = formatSmart(group.totalVNDMinus, numberFormat);
        responseData.totalUSDTPlus = formatSmart(group.totalUSDTPlus, numberFormat);
        responseData.totalUSDTMinus = formatSmart(group.totalUSDTMinus, numberFormat);
        responseData.totalUSDTGross = formatSmart(totalUSDTGross, numberFormat);
        responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
        responseData.remainingUSDTOwed = formatSmart(remainingUSDTOwed, numberFormat);
      } else {
        // Hiển thị thông tin cũ khi chưa có /d2
        responseData.totalUSDT = formatSmart(group.totalUSDT, numberFormat);
        responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
        responseData.remainingUSDT = formatSmart(group.remainingUSDT, numberFormat);
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
    group.totalVNDPlus += amountVND;
    group.totalUSDTPlus += newUSDT;
    // Cập nhật totalUSDT để tương thích ngược (nếu chưa có wrate/wexchangeRate)
    group.totalUSDT += newUSDT;
    group.remainingUSDT = group.totalUSDT - group.usdtPaid;
    await group.save();
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      if (xValue === 0 && yValue === 1) {
        // Không hiển thị phần tính toán khi rate = 0 và exchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}* (${cardCode}) ${senderName}`;
      } else if (xValue === 0 && yValue !== 1) {
        // Khi rate = 0 và exchangeRate khác 1: chỉ hiển thị phần /${yValue}, bỏ phần *${rateFactor}
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*/${yValue} = *${formatSmart(newUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      } else if (xValue !== 0 && yValue === 1) {
        // Không hiển thị phần /${yValue} khi exchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*\\*${rateFactor} = *${formatSmart(newUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      } else {
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*\\*${rateFactor}/${yValue} = *${formatSmart(newUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      }
    } else {
      if (xValue === 0 && yValue === 1) {
        // Không hiển thị phần tính toán khi rate = 0 và exchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}* ${senderName}`;
      } else if (xValue === 0 && yValue !== 1) {
        // Khi rate = 0 và exchangeRate khác 1: chỉ hiển thị phần /${yValue}, bỏ phần *${rateFactor}
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*/${yValue} = *${formatSmart(newUSDT, numberFormat)}* ${senderName}`;
      } else if (xValue !== 0 && yValue === 1) {
        // Không hiển thị phần /${yValue} khi exchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*\\*${rateFactor} = *${formatSmart(newUSDT, numberFormat)}* ${senderName}`;
      } else {
        details = `\`${formatTimeString(new Date())}\` *${formatSmart(amountVND, numberFormat)}*\\*${rateFactor}/${yValue} = *${formatSmart(newUSDT, numberFormat)}* ${senderName}`;
      }
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
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(xValue) + "%",
      exchangeRate: formatRateValue(yValue),
      totalAmount: formatSmart(group.totalVNDPlus, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };

    // Kiểm tra có thiết lập wrate/wexchangeRate hay không để hiển thị thông tin phù hợp
    if ((group.wrate > 0 || group.wexchangeRate > 0) && group.wrate !== undefined && group.wexchangeRate !== undefined) {
      // Hiển thị thông tin mới khi đã có /d2
      const totalUSDTGross = group.totalUSDTPlus - group.totalUSDTMinus;
      const remainingUSDTOwed = totalUSDTGross - group.usdtPaid;
      responseData.wrate = formatRateValue(group.wrate) + "%";
      responseData.wexchangeRate = formatRateValue(group.wexchangeRate);
      responseData.totalVNDMinus = formatSmart(group.totalVNDMinus, numberFormat);
      responseData.totalUSDTPlus = formatSmart(group.totalUSDTPlus, numberFormat);
      responseData.totalUSDTMinus = formatSmart(group.totalUSDTMinus, numberFormat);
      responseData.totalUSDTGross = formatSmart(totalUSDTGross, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDTOwed = formatSmart(remainingUSDTOwed, numberFormat);
    } else {
      // Hiển thị thông tin cũ khi chưa có /d2
      responseData.totalUSDT = formatSmart(group.totalUSDT, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDT = formatSmart(group.remainingUSDT, numberFormat);
    }
    
    // Thêm ví dụ nếu cần
    if (exampleValue !== null) {
      responseData.example = formatSmart(exampleValue, numberFormat);
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
    bot.sendMessage(msg.chat.id, "Xử lý lệnh nạp tiền bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh rút tiền (-) với logic mới sử dụng wrate và wexchangeRate
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
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: -số hoặc -số [mã thẻ]");
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
        // Tiền xử lý biểu thức để chuyển đổi định dạng viết tắt
        const preprocessedExpr = preprocessMathExpression(expr);
        amountVND = eval(preprocessedExpr);
      } catch(err) {
        bot.sendMessage(chatId, "Thử lại đi, sai rồi.");
        return;
      }
    } else {
      // Sử dụng parseNumberWithUnits để xử lý cả số thường và số có đơn vị viết tắt
      amountVND = parseNumberWithUnits(expr);
    }
    
    if (isNaN(amountVND)) {
      bot.sendMessage(chatId, "Hãy nhập đúng.");
      return;
    }
   
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "Cài đặt phí và tỷ giá");
      return;
    }
    
    // Kiểm tra wrate và wexchangeRate (cần có /d2 trước)
    if (!group.wrate && group.wrate !== 0) {
      bot.sendMessage(chatId, "Cần thiết lập wrate và wexchangeRate trước bằng lệnh /d2");
      return;
    }
    if (!group.wexchangeRate) {
      bot.sendMessage(chatId, "Cần thiết lập wrate và wexchangeRate trước bằng lệnh /d2");
      return;
    }
    
    // Tính toán giá trị USDT với công thức mới: (amountVND / wexchangeRate) * (1 + wrate/100)
    const wRateValue = group.wrate;
    const wExchangeValue = group.wexchangeRate;
    const minusUSDT = (amountVND / wExchangeValue) * (1 + wRateValue / 100);
    
    // Tính toán phần (1+(wrate/100))
    const wRateFactor = (1 + wRateValue / 100).toFixed(2);
    
    // Cập nhật group với logic mới
    group.totalVND -= amountVND;
    group.totalVNDMinus += amountVND;
    group.totalUSDTMinus += minusUSDT;
    
    // Tính toán lại các chỉ số
    const totalUSDTGross = group.totalUSDTPlus - group.totalUSDTMinus;
    const remainingUSDTOwed = totalUSDTGross - group.usdtPaid;
    
    await group.save();
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      if (wRateValue === 0 && wExchangeValue === 1) {
        // Không hiển thị phần tính toán khi wrate = 0 và wexchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}* (${cardCode}) ${senderName}`;
      } else if (wRateValue === 0 && wExchangeValue !== 1) {
        // Khi wrate = 0 và wexchangeRate khác 1: chỉ hiển thị phần /${wExchangeValue}
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*/${wExchangeValue} = *-${formatSmart(minusUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      } else if (wRateValue !== 0 && wExchangeValue === 1) {
        // Không hiển thị phần /${wExchangeValue} khi wexchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*\\*${wRateFactor} = *-${formatSmart(minusUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      } else {
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*\\*${wRateFactor}/${wExchangeValue} = *-${formatSmart(minusUSDT, numberFormat)}* (${cardCode}) ${senderName}`;
      }
    } else {
      if (wRateValue === 0 && wExchangeValue === 1) {
        // Không hiển thị phần tính toán khi wrate = 0 và wexchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}* ${senderName}`;
      } else if (wRateValue === 0 && wExchangeValue !== 1) {
        // Khi wrate = 0 và wexchangeRate khác 1: chỉ hiển thị phần /${wExchangeValue}
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*/${wExchangeValue} = *-${formatSmart(minusUSDT, numberFormat)}* ${senderName}`;
      } else if (wRateValue !== 0 && wExchangeValue === 1) {
        // Không hiển thị phần /${wExchangeValue} khi wexchangeRate = 1
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*\\*${wRateFactor} = *-${formatSmart(minusUSDT, numberFormat)}* ${senderName}`;
      } else {
        details = `\`${formatTimeString(new Date())}\` -*${formatSmart(amountVND, numberFormat)}*\\*${wRateFactor}/${wExchangeValue} = *-${formatSmart(minusUSDT, numberFormat)}* ${senderName}`;
      }
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
      rate: wRateValue,
      exchangeRate: wExchangeValue,
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
    
    // Lấy thông tin giao dịch gần đây
    const todayDate = new Date();
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON với các chỉ số mới
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(group.rate) + "%",
      exchangeRate: formatRateValue(group.exchangeRate),
      wrate: formatRateValue(wRateValue) + "%",
      wexchangeRate: formatRateValue(wExchangeValue),
      totalAmount: formatSmart(group.totalVNDPlus, numberFormat),
      totalVNDMinus: formatSmart(group.totalVNDMinus, numberFormat),
      totalUSDTPlus: formatSmart(group.totalUSDTPlus, numberFormat),
      totalUSDTMinus: formatSmart(group.totalUSDTMinus, numberFormat),
      totalUSDTGross: formatSmart(totalUSDTGross, numberFormat),
      paidUSDT: formatSmart(group.usdtPaid, numberFormat),
      remainingUSDTOwed: formatSmart(remainingUSDTOwed, numberFormat),
      currencyUnit,
      numberFormat,
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
    
  } catch (error) {
    console.error('Error in handleMinusCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh rút tiền bị lỗi. Vui lòng thử lại sau.");
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
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: xuống số (USDT) hoặc %số (USDT) hoặc xuống số [mã thẻ] hoặc %số [mã thẻ]");
      return;
    }
    
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: xuống số (USDT) hoặc %số (USDT) hoặc xuống số [mã thẻ] hoặc %số [mã thẻ]");
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
        // Tiền xử lý biểu thức để chuyển đổi định dạng viết tắt
        const preprocessedExpr = preprocessMathExpression(expr);
        payUSDT = eval(preprocessedExpr);
      } catch(err) {
        bot.sendMessage(chatId, "Thử lại đi, sai rồi.");
        return;
      }
    } else {
      // Sử dụng parseNumberWithUnits để xử lý cả số thường và số có đơn vị viết tắt
      payUSDT = parseNumberWithUnits(expr);
    }
    
    if (isNaN(payUSDT)) {
      bot.sendMessage(chatId, "Hãy nhập đúng.");
      return;
    }
    
    // Ignore zero-value transactions
    if (payUSDT === 0) {
      bot.sendMessage(chatId, "Số tiền bằng 0, không xử lý.");
      return;
    }
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "Cài đặt phí và tỷ giá");
      return;
    }
    
    // Kiểm tra tỷ giá
    if (!group.exchangeRate) {
      bot.sendMessage(chatId, "Cài đặt phí và tỷ giá");
      return;
    }
    
    // Lấy đơn vị tiền tệ và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Cập nhật group
    group.usdtPaid += payUSDT;
    group.remainingUSDT = group.totalUSDT - group.usdtPaid;
    await group.save();
    
    // Tạo chi tiết giao dịch
    let details;
    if (cardCode) {
      details = `\`${formatTimeString(new Date())}\`    [${formatSmart(payUSDT, numberFormat)}](https://t.me/@id7590104666)  ${currencyUnit} (${cardCode}) ${senderName}`;
    } else {
      details = `\`${formatTimeString(new Date())}\`    [${formatSmart(payUSDT, numberFormat)}](https://t.me/@id7590104666)  ${currencyUnit} ${senderName}`;
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
        bot.sendMessage(chatId, `Mã thẻ ${cardCode} không tồn tại.`);
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
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: formatRateValue(group.rate) + "%",
      exchangeRate: formatRateValue(group.exchangeRate),
      totalAmount: formatSmart(group.totalVNDPlus, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };

    // Kiểm tra có thiết lập wrate/wexchangeRate hay không để hiển thị thông tin phù hợp
    if ((group.wrate > 0 || group.wexchangeRate > 0) && group.wrate !== undefined && group.wexchangeRate !== undefined) {
      // Hiển thị thông tin mới khi đã có /d2
      const totalUSDTGross = group.totalUSDTPlus - group.totalUSDTMinus;
      const remainingUSDTOwed = totalUSDTGross - group.usdtPaid;
      responseData.wrate = formatRateValue(group.wrate) + "%";
      responseData.wexchangeRate = formatRateValue(group.wexchangeRate);
      responseData.totalVNDMinus = formatSmart(group.totalVNDMinus, numberFormat);
      responseData.totalUSDTPlus = formatSmart(group.totalUSDTPlus, numberFormat);
      responseData.totalUSDTMinus = formatSmart(group.totalUSDTMinus, numberFormat);
      responseData.totalUSDTGross = formatSmart(totalUSDTGross, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDTOwed = formatSmart(remainingUSDTOwed, numberFormat);
    } else {
      // Hiển thị thông tin cũ khi chưa có /d2
      responseData.totalUSDT = formatSmart(group.totalUSDT, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDT = formatSmart(group.remainingUSDT, numberFormat);
    }
    
    // Thêm ví dụ nếu cần
    if (exampleValue !== null) {
      responseData.example = formatSmart(exampleValue, numberFormat);
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
    bot.sendMessage(msg.chat.id, "Xử lý lệnh thanh toán bị lỗi. Vui lòng thử lại sau.");
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
      bot.sendMessage(chatId, "Lệnh không hợp lệ. Định dạng: /skip [ID] Ví dụ: /skip 3 hoặc /skip !2");
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
      bot.sendMessage(chatId, "ID không hợp lệ. Phải là số nguyên dương.");
      return;
    }
    
    // Tìm nhóm
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "Không tìm thấy thông tin nhóm.");
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
    
    // Kiểm tra xem có giao dịch nào không
    if (!transactions || transactions.length === 0) {
      bot.sendMessage(chatId, `Không có giao dịch nào để skip trong bản ghi ${isPaymentId ? 'thanh toán' : 'nạp/rút tiền'}.`);
      return;
    }
    // Kiểm tra xem ID có hợp lệ không
    if (id > transactions.length) {
      bot.sendMessage(chatId, `ID không hợp lệ. Chỉ có ${transactions.length} mục trong bản ghi ${isPaymentId ? 'thanh toán' : 'nạp/rút tiền'}.`);
      return;
    }
    
    // Lấy giao dịch cần skip - vì ID là số thứ tự trong mảng (bắt đầu từ 1), nên cần trừ 1
    const transaction = transactions[id - 1];
    if (!transaction) {
      bot.sendMessage(chatId, "Không tìm thấy giao dịch cần skip.");
      return;
    }
    // Kiểm tra kiểu dữ liệu các trường số
    if (typeof group.totalVND !== 'number') group.totalVND = 0;
    if (typeof group.totalUSDT !== 'number') group.totalUSDT = 0;
    if (typeof group.usdtPaid !== 'number') group.usdtPaid = 0;
    if (typeof group.remainingUSDT !== 'number') group.remainingUSDT = 0;
    if (typeof transaction.amount !== 'number') transaction.amount = 0;
    if (typeof transaction.usdtAmount !== 'number') transaction.usdtAmount = 0;
    // Bắt đầu xử lý skip dựa trên loại giao dịch
    if (transaction.type === 'deposit') {
      // Revert deposit: trừ VND và USDT
      group.totalVND -= transaction.amount;
      group.totalVNDPlus -= transaction.amount;
      group.totalUSDT -= transaction.usdtAmount;
      group.totalUSDTPlus -= transaction.usdtAmount;
      group.remainingUSDT = group.totalUSDT - group.usdtPaid;
      // Nếu có mã thẻ, cập nhật thẻ
      if (transaction.cardCode) {
        const card = await Card.findOne({ chatId: chatId.toString(), cardCode: transaction.cardCode });
        if (card) {
          card.total -= transaction.amount;
          await card.save();
        } else {
          console.warn(`Không tìm thấy thẻ với mã ${transaction.cardCode} khi revert deposit.`);
        }
      }
    } else if (transaction.type === 'withdraw') {
      // Revert withdraw: cộng VND và USDT
      group.totalVND += Math.abs(transaction.amount);
      group.totalVNDMinus -= Math.abs(transaction.amount);
      group.totalUSDT += Math.abs(transaction.usdtAmount);
      group.totalUSDTMinus -= Math.abs(transaction.usdtAmount);
      group.remainingUSDT = group.totalUSDT - group.usdtPaid;
      // Nếu có mã thẻ, cập nhật thẻ
      if (transaction.cardCode) {
        const card = await Card.findOne({ chatId: chatId.toString(), cardCode: transaction.cardCode });
        if (card) {
          card.total += Math.abs(transaction.amount);
          await card.save();
        } else {
          console.warn(`Không tìm thấy thẻ với mã ${transaction.cardCode} khi revert withdraw.`);
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
        } else {
          console.warn(`Không tìm thấy thẻ với mã ${transaction.cardCode} khi revert payment.`);
        }
      }
    } else {
      bot.sendMessage(chatId, `Loại giao dịch không hợp lệ: ${transaction.type}`);
      return;
    }
    // Lưu thay đổi vào group
    await group.save();
    // Đánh dấu giao dịch là đã skip
    transaction.skipped = true;
    transaction.skipReason = `Skipped by ${senderName} at ${(new Date()).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
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
    // Lấy numberFormat và currencyUnit trước khi gọi các hàm phụ thuộc
    const numberFormat = await getNumberFormat(chatId);
    const currencyUnit = await getCurrencyForGroup(chatId);
    const depositData = await getDepositHistory(chatId);
    const paymentData = await getPaymentHistory(chatId);
    const cardSummary = await getCardSummary(chatId, numberFormat);
    // Tạo response JSON
    const responseData = {
      date: formatDateUS(todayDate),
      depositData,
      paymentData,
      rate: group.rate !== undefined ? formatRateValue(group.rate) + "%" : '',
      exchangeRate: group.exchangeRate !== undefined ? formatRateValue(group.exchangeRate) : '',
      totalAmount: formatSmart(group.totalVNDPlus, numberFormat),
      currencyUnit,
      numberFormat,
      cards: cardSummary
    };

    // Kiểm tra có thiết lập wrate/wexchangeRate hay không để hiển thị thông tin phù hợp
    if ((group.wrate > 0 || group.wexchangeRate > 0) && group.wrate !== undefined && group.wexchangeRate !== undefined) {
      // Hiển thị thông tin mới khi đã có /d2
      const totalUSDTGross = group.totalUSDTPlus - group.totalUSDTMinus;
      const remainingUSDTOwed = totalUSDTGross - group.usdtPaid;
      responseData.wrate = formatRateValue(group.wrate) + "%";
      responseData.wexchangeRate = formatRateValue(group.wexchangeRate);
      responseData.totalVNDMinus = formatSmart(group.totalVNDMinus, numberFormat);
      responseData.totalUSDTPlus = formatSmart(group.totalUSDTPlus, numberFormat);
      responseData.totalUSDTMinus = formatSmart(group.totalUSDTMinus, numberFormat);
      responseData.totalUSDTGross = formatSmart(totalUSDTGross, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDTOwed = formatSmart(remainingUSDTOwed, numberFormat);
    } else {
      // Hiển thị thông tin cũ khi chưa có /d2
      responseData.totalUSDT = formatSmart(group.totalUSDT, numberFormat);
      responseData.paidUSDT = formatSmart(group.usdtPaid, numberFormat);
      responseData.remainingUSDT = formatSmart(group.remainingUSDT, numberFormat);
    }
    // Format và gửi tin nhắn
    const response = formatTelegramMessage(responseData);
    // Kiểm tra trạng thái hiển thị buttons
    const showButtons = await getButtonsStatus(chatId);
    const keyboard = showButtons ? await getInlineKeyboard(chatId) : null;
    await bot.sendMessage(chatId, `✅ Đã xóa thành công bản ghi giao dịch có ID ${id}${isPaymentId ? '!' : ''}.`, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    await bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Error in handleSkipCommand:', error);
    bot.sendMessage(msg.chat.id, "Xử lý lệnh xóa bị lỗi. Vui lòng thử lại sau.");
  }
};

module.exports = {
  handlePlusCommand,
  handleMinusCommand,
  handlePercentCommand,
  handleSkipCommand
}; 
