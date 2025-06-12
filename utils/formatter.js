/**
 * Định dạng số với dấu phẩy phân cách hàng nghìn
 * @param {Number} num - Số cần định dạng
 * @returns {String} - Chuỗi đã định dạng với dấu phẩy
 */
const formatWithComma = (num) => {
  const floorVal = Math.floor(Math.abs(num));
  const fraction = Math.abs(num) - floorVal;
  
  if (fraction < 1e-9) {
    // Số nguyên: thêm dấu phẩy phân cách hàng nghìn
    const formatted = Math.round(num).toLocaleString('en-US');
    return formatted;
  } else {
    // Số thập phân: hiển thị với 2 chữ số sau dấu chấm và dấu phẩy phân cách
    const formatted = num.toFixed(2);
    const parts = formatted.split('.');
    parts[0] = parseInt(parts[0]).toLocaleString('en-US');
    return parts.join('.');
  }
};

/**
 * Định dạng số thông minh dựa trên numberFormat của nhóm
 * @param {Number} num - Số cần định dạng
 * @param {String} numberFormat - Định dạng số ('default' hoặc 'comma')
 * @returns {String} - Chuỗi đã định dạng
 */
const formatSmart = (num, numberFormat = 'default') => {
  if (numberFormat === 'comma') {
    return formatWithComma(num);
  }
  
  // Default format (giữ nguyên logic cũ)
  const floorVal = Math.floor(Math.abs(num));
  const fraction = Math.abs(num) - floorVal;
  
  if (fraction < 1e-9) {
    // Số nguyên: chỉ hiển thị số không có định dạng
    return Math.round(num).toString();
  } else {
    // Số thập phân: hiển thị với 2 chữ số sau dấu chấm
    return num.toFixed(2);
  }
};

/**
 * Định dạng giá trị tỷ lệ (rate)
 * @param {Number} num - Số cần định dạng
 * @returns {String} - Chuỗi đã định dạng
 */
const formatRateValue = (num) => {
  // Đảm bảo num là số
  num = parseFloat(num);
  if (isNaN(num)) {
    return "0";
  }
  
  // Nếu là số nguyên, trả về không có số thập phân
  if (Number.isInteger(num)) {
    return num.toString();
  }
  
  // Nếu là số thập phân, loại bỏ các số 0 ở cuối
  return num.toString().replace(/\.?0+$/, '');
};

/**
 * Kiểm tra xem chuỗi có phải biểu thức toán học hợp lệ không
 * @param {String} msg - Chuỗi cần kiểm tra
 * @returns {Boolean} - true nếu là biểu thức toán học
 */
const isMathExpression = (msg) => {
  const mathRegex = /^[0-9+\-*/().\s]+$/;
  return mathRegex.test(msg);
};

/**
 * Kiểm tra xem chuỗi có phải là một số đơn giản không
 * @param {String} msg - Chuỗi cần kiểm tra
 * @returns {Boolean} - true nếu là số đơn giản
 */
const isSingleNumber = (msg) => {
  const numberRegex = /^-?\d+(\.\d+)?$/;
  return numberRegex.test(msg.trim());
};

/**
 * Kiểm tra xem chuỗi có phải là địa chỉ TRC20 hợp lệ không
 * @param {String} str - Chuỗi cần kiểm tra
 * @returns {Boolean} - true nếu là địa chỉ TRC20 hợp lệ
 */
const isTrc20Address = (str) => {
  const re = /^T[1-9A-Za-z]{33}$/;
  return re.test(str);
};

/**
 * Format date in US style (MM/DD/YYYY)
 * @param {Date} date - Date to format
 * @returns {String} - Formatted date string
 */
const formatDateUS = (date) => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${year}/${month}/${day}`;
};

/**
 * Định dạng thời gian theo định dạng 24h (HH:mm:ss) theo múi giờ Campuchia (Asia/Phnom_Penh)
 * @param {Date} date - Đối tượng ngày cần định dạng
 * @returns {String} - Chuỗi thời gian đã định dạng (ví dụ: 14:05:00)
 */
const formatTimeString = (date) => {
  return date.toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh', hour12: false });
};

/**
 * Tạo tin nhắn telegram không sử dụng markdown
 * @param {Object} jsonData - Dữ liệu cần format
 * @returns {String} - Chuỗi đã định dạng
 */
const formatTelegramMessage = (jsonData) => {
  let output = '';
  
  // Lấy định dạng số từ jsonData hoặc sử dụng default
  const numberFormat = jsonData.numberFormat || 'default';
  
  // Helper function để format số với định dạng của nhóm
  const formatNumber = (num) => formatSmart(num, numberFormat);
  
  // Date header - using US format (MM/DD/YYYY)
  const currentDate = new Date();
  const formattedDate = formatDateUS(currentDate);
  output += `*Hôm nay ${formattedDate}*\n`;
  
  // Deposits section
  if (jsonData.depositData && jsonData.depositData.entries && jsonData.depositData.entries.length > 0) {
    const depositCount = jsonData.depositData.totalCount || jsonData.depositData.entries.length;
    output += `*Tiền đã nạp* ([${depositCount}](https://t.me/@id7590104666) Đơn):\n`;
    
    // Format giao dịch với ID và link
    jsonData.depositData.entries.forEach((entry) => {
      // Sử dụng ID từ entry thay vì tạo ID mới
      const id = entry.id || (entry.index + 1);
      if (entry.messageId && entry.chatLink) {
        // Tạo link đến tin nhắn gốc với ID là phần clickable
        output += `${entry.details} ([${id}](${entry.chatLink}))\n`;
      }
    });
    output += '\n';
  } else {
    output += "*Tiền đã nạp* ([0](https://t.me/@id7590104666) Đơn):\n\n";
  }
  
  // Payments section
  if (jsonData.paymentData && jsonData.paymentData.entries && jsonData.paymentData.entries.length > 0) {
    const paymentCount = jsonData.paymentData.totalCount || jsonData.paymentData.entries.length;
    output += `*Đã thanh toán* ([${paymentCount}](https://t.me/@id7590104666) Đơn):\n`;
    
    // Format giao dịch với ID và link
    jsonData.paymentData.entries.forEach((entry) => {
      // Dùng ký hiệu ! trước ID của payment
      // Sử dụng ID từ entry thay vì tạo ID mới
      const id = `!${entry.id || (entry.index + 1)}`;
      if (entry.messageId && entry.chatLink) {
        // Tạo link đến tin nhắn gốc với ID là phần clickable ok
        output += `${entry.details} ([${id}](${entry.chatLink}))\n`;
      }
    });
    output += '\n';
  } else {
    output += "*Đã thanh toán* ([0](https://t.me/@id7590104666) Đơn):\n\n";
  }
  output += `*Tổng tiền nạp💰*: [${jsonData.totalAmount}](https://t.me/@id7590104666)\n`;
  // Rate information
  const rateInfo = `Phí: [${jsonData.rate}](https://t.me/@id7590104666)|  Tỷ giá: [${jsonData.exchangeRate}](https://t.me/@id7590104666)\n`;
 
  // Thêm ví dụ nếu có
  let rateInfoWithExample = rateInfo;

  if (jsonData.example) {
    rateInfoWithExample += `\nVD: 100000 = [${jsonData.example}](https://t.me/@id7590104666) ${jsonData.currencyUnit || 'USDT'}`;
  }
  
  output += `${rateInfoWithExample}\n`;
 
  // Summary section
  output += `*Tiền phải trả*: [${jsonData.totalUSDT}](https://t.me/@id7590104666)   ${jsonData.currencyUnit || 'USDT'}\n`;
  output += `*Tiền đã trả*: [${jsonData.paidUSDT}](https://t.me/@id7590104666)   ${jsonData.currencyUnit || 'USDT'}\n`;
  output += `*Tiền còn lại*: [${jsonData.remainingUSDT}](https://t.me/@id7590104666)   ${jsonData.currencyUnit || 'USDT'}\n`;
  
   // Cards section (if present)
   if (jsonData.cards && jsonData.cards.length > 0) {
    output += `\n*Hạn mức thẻ 💳* :\n${jsonData.cards.join("\n")}`;
  }
  return output;
};

/**
 * Định dạng số thông minh với tự động lấy định dạng của nhóm
 * @param {Number} num - Số cần định dạng
 * @param {String} chatId - ID của chat/nhóm
 * @returns {Promise<String>} - Chuỗi đã định dạng
 */
const formatSmartWithGroup = async (num, chatId) => {
  try {
    const numberFormat = await getNumberFormat(chatId);
    return formatSmart(num, numberFormat);
  } catch (error) {
    console.error('Error in formatSmartWithGroup:', error);
    return formatSmart(num, 'default');
  }
};

/**
 * Lấy định dạng số của nhóm
 * @param {String} chatId - ID của chat/nhóm
 * @returns {Promise<String>} - Định dạng số của nhóm ('default' hoặc 'comma')
 */
const getNumberFormat = async (chatId) => {
  try {
    const Group = require('../models/Group');
    const group = await Group.findOne({ chatId: chatId.toString() });
    return group && group.numberFormat ? group.numberFormat : 'default';
  } catch (error) {
    console.error('Error in getNumberFormat:', error);
    return 'default';
  }
};

module.exports = {
  formatSmart,
  formatWithComma,
  formatSmartWithGroup,
  formatRateValue,
  isMathExpression,
  isSingleNumber,
  isTrc20Address,
  formatTelegramMessage,
  formatDateUS,
  formatTimeString,
  getNumberFormat
}; 