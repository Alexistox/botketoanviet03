const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const Config = require('../models/Config');
const { formatSmart, formatRateValue, formatTelegramMessage, isTrc20Address, formatDateUS, getNumberFormat, preprocessMathExpression } = require('../utils/formatter');
const { getDepositHistory, getPaymentHistory, getCardSummary } = require('./groupCommands');
const { getButtonsStatus, getInlineKeyboard } = require('./userCommands');
const messages = require('../src/messages/vi');
const { getCurrencyForGroup } = require('../utils/permissions');

/**
 * Xử lý lệnh định dạng số (/format)
 */
const handleFormatCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text.trim();
    
    // Tìm hoặc tạo group
    let group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      group = new Group({
        chatId: chatId.toString(),
        numberFormat: 'comma'
      });
      await group.save();
    }
    
    // Kiểm tra định dạng lệnh
    if (messageText === '/format') {
      // Quay lại format không dấu phẩy (khác mặc định format A)
      group.numberFormat = 'default';
      await group.save();
      bot.sendMessage(chatId, "✅ Đã chuyển sang định dạng không dấu phẩy. Gửi `/format A` để về mặc định có dấu phẩy.");
    } else if (messageText.toLowerCase() === '/format a') {
      // Format A — mặc định của bot (dấu phẩy phân cách hàng nghìn)
      group.numberFormat = 'comma';
      await group.save();
      bot.sendMessage(chatId, "✅ Đã bật định dạng A (có dấu phẩy phân cách hàng nghìn) — đây là định dạng mặc định");
    } else {
      // Lệnh không hợp lệ
      bot.sendMessage(chatId, "❌ Cú pháp không hợp lệ.\n\n📝 Cách sử dụng:\n• `/format A` — Định dạng mặc định (có dấu phẩy)\n• `/format` — Định dạng không dấu phẩy");
    }
    
  } catch (error) {
    console.error('Error in handleFormatCommand:', error);
    bot.sendMessage(msg.chat.id, "❌ Xử lý lệnh định dạng số bị lỗi. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh tính toán USDT (/t)
 */
const handleCalculateUsdtCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    // Phân tích tin nhắn
    const parts = messageText.split('/t ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /t 1000000");
      return;
    }
    
    // Lấy số tiền VND
    const amount = parseFloat(parts[1].trim().replace(/,/g, ''));
    if (isNaN(amount)) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    // Tìm group
    const group = await Group.findOne({ chatId: chatId.toString() });
    
    // Tính toán
    const xValue = group.rate;
    const yValue = group.exchangeRate;
    const usdtValue = (amount / yValue) * (1 - xValue / 100);
    
    // Lấy đơn vị tiền tệ cho nhóm
    const currencyUnit = await getCurrencyForGroup(chatId);
    
    // Gửi kết quả
    bot.sendMessage(
      chatId,
      ` ${formatSmart(amount)} =  ${formatSmart(usdtValue)} ${currencyUnit}\n`
    );
  } catch (error) {
    console.error('Error in handleCalculateUsdtCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingMessage);
  }
};

/**
 * Xử lý lệnh tính toán VND (/v)
 */
const handleCalculateVndCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    // Phân tích tin nhắn
    const parts = messageText.split('/v ');
    if (parts.length !== 2) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /v 100");
      return;
    }
    
    // Lấy số tiền USDT
    const amount = parseFloat(parts[1].trim());
    if (isNaN(amount)) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    // Tìm group
    const group = await Group.findOne({ chatId: chatId.toString() });
    // Tính toán
    const xValue = group.rate;
    const yValue = group.exchangeRate;
    const vndValue = (amount / (1 - xValue / 100)) * yValue;
    
    // Lấy đơn vị tiền tệ cho nhóm
    const currencyUnit = await getCurrencyForGroup(chatId);
    
    // Gửi kết quả
    bot.sendMessage(
      chatId,
      ` ${currencyUnit} ${formatSmart(amount)} = ${formatSmart(vndValue)}\n`
    );
  } catch (error) {
    console.error('Error in handleCalculateVndCommand:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingMessage);
  }
};

/**
 * Xử lý biểu thức toán học
 */
const handleMathExpression = async (bot, chatId, expression, senderName) => {
  try {
    // Tiền xử lý biểu thức để chuyển đổi định dạng viết tắt
    const preprocessedExpression = preprocessMathExpression(expression);
    
    // Tính toán kết quả
    let result;
    try {
      result = eval(preprocessedExpression);
    } catch (error) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    if (isNaN(result)) {
      bot.sendMessage(chatId, "");
      return;
    }
    
    // Gửi kết quả
    bot.sendMessage(
      chatId,
      `${expression} = ${formatSmart(result)}`
    );
  } catch (error) {
    console.error('Error in handleMathExpression:', error);
    bot.sendMessage(chatId, messages.errorProcessingMessage);
  }
};

/**
 * Xử lý địa chỉ TRC20
 */
const handleTrc20Address = async (bot, chatId, address, senderName) => {
  try {
    // Gửi kết quả
    bot.sendMessage(
      chatId,
      `🔍 Địa chỉ USDT-TRC20:\n\`${address}\``
    );
  } catch (error) {
    console.error('Error in handleTrc20Address:', error);
    bot.sendMessage(chatId, messages.errorProcessingMessage);
  }
};

/**
 * Xử lý lệnh báo cáo (/report hoặc 结束)
 */
const handleReportCommand = async (bot, chatId, senderName) => {
  try {
    // Tìm group
    const group = await Group.findOne({ chatId: chatId.toString() });
    if (!group) {
      bot.sendMessage(chatId, "Không có dữ liệu khả dụng.");
      return;
    }
    
    // Lấy đơn vị tiền tệ cho nhóm và định dạng số
    const currencyUnit = await getCurrencyForGroup(chatId);
    const numberFormat = await getNumberFormat(chatId);
    
    // Lấy thông tin tất cả các giao dịch trong ngày
    const todayDate = new Date();
    const lastClearDate = group.lastClearDate;
    
    // Lấy tất cả các giao dịch deposit/withdraw
    const depositTransactions = await Transaction.find({
      chatId: chatId.toString(),
      type: { $in: ['deposit', 'withdraw'] },
      timestamp: { $gt: lastClearDate },
      skipped: { $ne: true }
    }).sort({ timestamp: 1 });
    
    // Lấy tất cả các giao dịch payment
    const paymentTransactions = await Transaction.find({
      chatId: chatId.toString(),
      type: 'payment',
      timestamp: { $gt: lastClearDate },
      skipped: { $ne: true }
    }).sort({ timestamp: 1 });
    
    // Format dữ liệu giao dịch deposit
    const depositEntries = depositTransactions.map((t, index) => {
      return {
        id: index + 1,
        details: t.details,
        messageId: t.messageId || null,
        chatLink: t.messageId ? `https://t.me/c/${chatId.toString().replace('-100', '')}/${t.messageId}` : null,
        timestamp: t.timestamp,
        senderName: t.senderName || ''
      };
    });
    
    // Format dữ liệu giao dịch payment
    const paymentEntries = paymentTransactions.map((t, index) => {
      return {
        id: index + 1,
        details: t.details,
        messageId: t.messageId || null,
        chatLink: t.messageId ? `https://t.me/c/${chatId.toString().replace('-100', '')}/${t.messageId}` : null,
        timestamp: t.timestamp,
        senderName: t.senderName || ''
      };
    });
    
    // Lấy thông tin thẻ
    const cardSummary = await getCardSummary(chatId, numberFormat);
    
    // Tạo response JSON với tất cả giao dịch
    const responseData = {
      date: formatDateUS(todayDate),
      depositData: { 
        entries: depositEntries, 
        totalCount: depositEntries.length 
      },
      paymentData: { 
        entries: paymentEntries, 
        totalCount: paymentEntries.length 
      },
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
    
  } catch (error) {
    console.error('Error in handleReportCommand:', error);
    bot.sendMessage(chatId, messages.errorProcessingMessage);
  }
};

/**
 * Xử lý lệnh trợ giúp (/help)
 */
const handleHelpCommand = async (bot, chatId) => {
  try {
    const helpMessage = `
*Hướng dẫn sử dụng Bot*

*Lệnh cơ bản:*
/start - Bắt đầu sử dụng bot
/help - Hiển thị hướng dẫn này
/off - Kết thúc phiên làm việc
Start - xóa hết lịch sử giao dịch và thẻ để ghi lại từ đầu.(bắt đầu phiên làm việc mới)

*Lệnh chuyển đổi tiền tệ:*
/t [số] - Chuyển đổi VND sang USDT
/v [số] - Chuyển đổi USDT sang VND

*Lệnh subscription USDT (TRC20):*
/plan hoặc /goi - Xem gói ngày/tháng/năm
/subscribe day|month|year - Đăng ký và thanh toán USDT
/mysub - Xem gói hiện tại và ngày hết hạn

*Lệnh định dạng số:*
/format A - Định dạng mặc định: có dấu phẩy (ví dụ: 1,000,000)
/format - Định dạng không dấu phẩy (ví dụ: 1000000)

*Lệnh quản lý:*
/m [đơn vị] - Đặt đơn vị tiền tệ cho nhóm này (VND/USDT)
/d [% vào tiền]/[Giá vào tiền] - Đặt tỷ lệ và tỷ giá
/d2 [% rút tiền]/[Giá xuất tiền]
+[số tiền] (nạp tiền) nếu sau số tiền có kí tự thì bot sẽ tính riêng theo số tiền vào từng thẻ.
%[số tiền] (thanh toán) nếu sau số tiền có kí tự thì bot sẽ tính riêng theo số tiền vào từng thẻ.
-[số tiền] (rút tiền) nếu sau số tiền có kí tự thì bot sẽ tính riêng theo số tiền vào từng thẻ.
/x [ID] - Ẩn thẻ
/sx [ID] - Hiện thẻ
/hiddenCards - Xem danh sách thẻ ẩn
/delete [ID] - Xóa thẻ
/skip [ID] - Bỏ qua thẻ khi ấn lệnh nhầm hoặc sai

*Lệnh quản trị:*
/op [username] - Thêm người điều hành (cần gói subscription hoặc Admin)
/removeop [username] - Xóa người điều hành (cần gói subscription hoặc Admin)
/ops - Xem danh sách người điều hành
/usdt2 [địa chỉ] - Đặt ví USDT nhận thanh toán gói (chỉ Owner)

*Lệnh khác:*
/u - Xem địa chỉ USDT (kế toán nhóm)
/report - Xem báo cáo
/repeat [text] - Lặp lại text (ví dụ: /repeat Hello World)


*Lệnh QR Code:*
/qr on - Bật tạo QR code tự động cho tin nhắn chuyển khoản VN
/qr off - Tắt tạo QR code tự động

*Lệnh xử lý ảnh bill:*
/pic on - Bật chế độ xử lý ảnh bill tự động
/pic off - Tắt chế độ xử lý ảnh bill tự động
• Reply "1" vào ảnh bill → Lệnh +[số tiền] (nạp tiền)
• Reply "2" vào ảnh bill → Lệnh %[số tiền] (thanh toán)
• Reply "3" vào ảnh bill → Lệnh -[số tiền] (rút tiền)
`;
    bot.sendMessage(chatId, helpMessage.trim());
  } catch (error) {
    console.error('Error in handleHelpCommand:', error);
    bot.sendMessage(chatId, messages.errorDisplayHelp);
  }
};

const handleStartCommand = async (bot, chatId) => {
  try {
    const startMessage = `Chào mừng sử dụng bot kế toán!

Bắt đầu hóa đơn mới / 上课
Ghi nợ▫️+10000 hoặc +số [mã thẻ] [hạn mức]
Rút tiền▫️-10000 (cần /d2 trước)
Hủy▫️撤回id
Phát hành▫️下发 100 hoặc %số [mã thẻ] [hạn mức]
Thiết lập tỷ lệ▫️设置汇率1600 hoặc | giá tỷ lệ/tỷ giá
Thiết lập W-tỷ lệ▫️/d2 wrate/wexchangerate hoặc /d2 off
Thiết lập người điều hành▫️@thành viên (thành viên phải gửi tin nhắn trước khi thiết lập)
Xóa người điều hành▫️@thành viên (thành viên phải gửi tin nhắn trước khi xóa)
Danh sách người điều hành ▫️ xem danh sách người được ủy quyền

+0▫️
Kết thúc| /report`;
    bot.sendMessage(chatId, startMessage);
  } catch (error) {
    console.error('Error in handleStartCommand:', error);
    bot.sendMessage(chatId, messages.errorProcessingMessage);
  }
};

module.exports = {
  handleCalculateUsdtCommand,
  handleCalculateVndCommand,
  handleMathExpression,
  handleTrc20Address,
  handleReportCommand,
  handleHelpCommand,
  handleStartCommand,
  handleFormatCommand
}; 
