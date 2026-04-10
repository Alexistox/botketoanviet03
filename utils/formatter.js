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
 * @param {String} numberFormat - Định dạng số ('default' hoặc 'comma'; mặc định: 'comma' = format A)
 * @returns {String} - Chuỗi đã định dạng
 */
const formatSmart = (num, numberFormat = 'comma') => {
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
  // Cập nhật regex để hỗ trợ k, tr, m, và dấu phẩy
  const mathRegex = /^[0-9+\-*/().\s,kmtr]+$/;
  
  // Kiểm tra xem có match pattern cơ bản không
  if (!mathRegex.test(msg)) {
    return false;
  }
  
  // Bỏ qua những ký tự đơn lẻ không có ý nghĩa
  const trimmed = msg.trim();
  if (trimmed.length === 1 && /[+\-*/.()]/.test(trimmed)) {
    return false;
  }
  
  // Phải chứa ít nhất một số hoặc đơn vị viết tắt
  const hasNumber = /\d/.test(trimmed);
  const hasUnit = /[kmtr]/.test(trimmed);
  
  return hasNumber || hasUnit;
};

/**
 * Tiền xử lý biểu thức toán học để chuyển đổi định dạng viết tắt thành số thường
 * @param {String} expression - Biểu thức toán học cần xử lý
 * @returns {String} - Biểu thức đã được chuyển đổi
 */
const preprocessMathExpression = (expression) => {
  if (!expression || typeof expression !== 'string') {
    return expression;
  }
  
  let result = expression;
  
  // Tìm tất cả các số có đơn vị viết tắt trong biểu thức
  // Sử dụng regex để tìm các pattern cụ thể
  // Regex phải có thứ tự ưu tiên: từ phức tạp đến đơn giản
  
  // Pattern 1: Mixed units (4m2k, 5tr3k) - phải xử lý TRƯỚC
  const mixedUnitsRegex = /\d+(?:\.\d+)?(m|tr)\d+(?:\.\d+)?k\b/g;
  result = result.replace(mixedUnitsRegex, (match) => {
    const parsedNumber = parseNumberWithUnits(match);
    return !isNaN(parsedNumber) ? parsedNumber.toString() : match;
  });
  
  // Pattern 2: Combined formats (2tr543k, 3tr4, 2tr238, 3k12, etc.)
  const combinedRegex = /\d+(?:\.\d+)?(tr|m|k)\d+\b/g;
  result = result.replace(combinedRegex, (match) => {
    const parsedNumber = parseNumberWithUnits(match);
    return !isNaN(parsedNumber) ? parsedNumber.toString() : match;
  });
  
  // Pattern 3: Single units (2k, 1tr, 3m)
  const singleUnitsRegex = /\d+(?:\.\d+)?(k|tr|m)\b/g;
  result = result.replace(singleUnitsRegex, (match) => {
    const parsedNumber = parseNumberWithUnits(match);
    return !isNaN(parsedNumber) ? parsedNumber.toString() : match;
  });
  
  // Pattern 4: Comma-separated numbers (1,000,000, 123,456.78) - chỉ match những số có dấu phẩy
  const commaNumbersRegex = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;
  result = result.replace(commaNumbersRegex, (match) => {
    const parsedNumber = parseNumberWithUnits(match);
    return !isNaN(parsedNumber) ? parsedNumber.toString() : match;
  });
  
  return result;
};

/**
 * Chuyển đổi chuỗi số có đơn vị viết tắt thành số thực
 * @param {String} str - Chuỗi cần chuyển đổi (ví dụ: "1tr", "2k", "2tr543k", "500m", "7,834,351")
 * @returns {Number} - Số thực đã chuyển đổi, hoặc NaN nếu không hợp lệ
 */
const parseNumberWithUnits = (str) => {
  if (!str || typeof str !== 'string') {
    return NaN;
  }
  
  // Loại bỏ khoảng trắng và chuyển thành chữ thường
  let cleanStr = str.trim().toLowerCase();
  
  // Kiểm tra xem có phải là số thuần túy không (trước khi loại bỏ dấu phẩy)
  if (/^-?\d+(\.\d+)?$/.test(cleanStr)) {
    return parseFloat(cleanStr);
  }
  
  // Kiểm tra và xử lý định dạng số có dấu phẩy hợp lệ
  // Định dạng hợp lệ: 1,234 hoặc 1,234,567 hoặc 1,234,567.89
  const commaNumberRegex = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
  if (commaNumberRegex.test(cleanStr)) {
    // Loại bỏ dấu phẩy và chuyển thành số
    const numberStr = cleanStr.replace(/,/g, '');
    return parseFloat(numberStr);
  }
  
  // Loại bỏ dấu phẩy để xử lý các trường hợp khác (như 1tr, 2k)
  cleanStr = cleanStr.replace(/,/g, '');
  
  // Kiểm tra xem chuỗi có chứa ít nhất một đơn vị không
  if (!/[kmtr]/.test(cleanStr)) {
    return NaN;
  }
  
  // Kiểm tra xem chuỗi có chứa ký tự không hợp lệ không
  if (!/^[\d.kmtr]+$/.test(cleanStr)) {
    return NaN;
  }
  
  let result = 0;
  let processedStr = cleanStr;
  
  // Xử lý kết hợp các đơn vị khác nhau TRƯỚC (như 4m2k, 5tr3k)
  const mixedRegex = /(\d+(?:\.\d+)?)(m|tr)(\d+(?:\.\d+)?)k/g;
  let mixedMatch;
  while ((mixedMatch = mixedRegex.exec(processedStr)) !== null) {
    const mainValue = parseFloat(mixedMatch[1]);
    const mainUnit = mixedMatch[2];
    const kValue = parseFloat(mixedMatch[3]);
    
    if (!isNaN(mainValue) && !isNaN(kValue)) {
      // Xử lý phần chính (triệu)
      result += mainValue * 1000000;
      // Xử lý phần k (nghìn)
      result += kValue * 1000;
    }
  }
  // Loại bỏ phần đã xử lý kết hợp TRƯỚC
  processedStr = processedStr.replace(/\d+(?:\.\d+)?(m|tr)\d+(?:\.\d+)?k/g, '');
  
  // Xử lý triệu (tr) với số theo sau (như 3tr4, 2tr238)
  const trWithNumberRegex = /(\d+(?:\.\d+)?)tr(\d+)/g;
  let trWithNumberMatch;
  while ((trWithNumberMatch = trWithNumberRegex.exec(processedStr)) !== null) {
    const mainValue = parseFloat(trWithNumberMatch[1]);
    const followingValue = parseFloat(trWithNumberMatch[2]);
    if (!isNaN(mainValue) && !isNaN(followingValue)) {
      // Xử lý phần chính (triệu)
      result += mainValue * 1000000;
      // Xử lý phần theo sau
      if (followingValue < 10) {
        // Nếu là 1 chữ số: 3tr4 = 3,400,000 (4 * 100,000)
        result += followingValue * 100000;
      } else if (followingValue < 100) {
        // Nếu là 2 chữ số: 5tr35 = 5,350,000 (35 * 10,000)
        result += followingValue * 10000;
      } else if (followingValue < 1000) {
        // Nếu là 3 chữ số: 2tr238 = 2,238,000 (238 * 1,000)
        result += followingValue * 1000;
      } else {
        result += followingValue;
      }
    }
  }
  // Loại bỏ phần đã xử lý tr với số theo sau
  processedStr = processedStr.replace(/\d+(?:\.\d+)?tr\d+/g, '');
  
  // Xử lý triệu (m) với số theo sau (như 3m4, 2m238)
  const mWithNumberRegex = /(\d+(?:\.\d+)?)m(\d+)/g;
  let mWithNumberMatch;
  while ((mWithNumberMatch = mWithNumberRegex.exec(processedStr)) !== null) {
    const mainValue = parseFloat(mWithNumberMatch[1]);
    const followingValue = parseFloat(mWithNumberMatch[2]);
    if (!isNaN(mainValue) && !isNaN(followingValue)) {
      // Xử lý phần chính (triệu)
      result += mainValue * 1000000;
      // Xử lý phần theo sau
      if (followingValue < 10) {
        // Nếu là 1 chữ số: 3m4 = 3,400,000 (4 * 100,000)
        result += followingValue * 100000;
      } else if (followingValue < 100) {
        // Nếu là 2 chữ số: 5m35 = 5,350,000 (35 * 10,000)
        result += followingValue * 10000;
      } else if (followingValue < 1000) {
        // Nếu là 3 chữ số: 2m238 = 2,238,000 (238 * 1,000)
        result += followingValue * 1000;
      } else {
        result += followingValue;
      }
    }
  }
  // Loại bỏ phần đã xử lý m với số theo sau
  processedStr = processedStr.replace(/\d+(?:\.\d+)?m\d+/g, '');
  
  // Xử lý nghìn (k) với số theo sau (như 3k1, 3k12)
  const kWithNumberRegex = /(\d+(?:\.\d+)?)k(\d+)/g;
  let kWithNumberMatch;
  while ((kWithNumberMatch = kWithNumberRegex.exec(processedStr)) !== null) {
    const mainValue = parseFloat(kWithNumberMatch[1]);
    const followingValue = parseFloat(kWithNumberMatch[2]);
    if (!isNaN(mainValue) && !isNaN(followingValue)) {
      // Xử lý phần chính (nghìn)
      result += mainValue * 1000;
      // Xử lý phần theo sau
      if (followingValue < 10) {
        // Nếu là 1 chữ số: 3k1 = 3,100 (1 * 100)
        result += followingValue * 100;
      } else if (followingValue < 100) {
        // Nếu là 2 chữ số: 3k12 = 3,120 (12 * 10)
        result += followingValue * 10;
      } else {
        // Nếu là 3+ chữ số: 7k123 = 7,123 (123 * 1)
        result += followingValue;
      }
    }
  }
  // Loại bỏ phần đã xử lý k với số theo sau
  processedStr = processedStr.replace(/\d+(?:\.\d+)?k\d+/g, '');
  
  // Xử lý triệu (tr) đơn giản (không có số theo sau)
  const trRegex = /(\d+(?:\.\d+)?)tr/g;
  let trMatch;
  while ((trMatch = trRegex.exec(processedStr)) !== null) {
    const value = parseFloat(trMatch[1]);
    if (!isNaN(value)) {
      result += value * 1000000;
    }
  }
  // Loại bỏ phần đã xử lý tr
  processedStr = processedStr.replace(/\d+(?:\.\d+)?tr/g, '');
  
  // Xử lý triệu (m) đơn giản (không có số theo sau)
  const mRegex = /(\d+(?:\.\d+)?)m/g;
  let mMatch;
  while ((mMatch = mRegex.exec(processedStr)) !== null) {
    const value = parseFloat(mMatch[1]);
    if (!isNaN(value)) {
      result += value * 1000000;
    }
  }
  // Loại bỏ phần đã xử lý m
  processedStr = processedStr.replace(/\d+(?:\.\d+)?m/g, '');
  
  // Xử lý nghìn (k) đơn giản (không có số theo sau)
  const thousandRegex = /(\d+(?:\.\d+)?)k/g;
  let thousandMatch;
  while ((thousandMatch = thousandRegex.exec(processedStr)) !== null) {
    const value = parseFloat(thousandMatch[1]);
    if (!isNaN(value)) {
      result += value * 1000;
    }
  }
  
  // Nếu không có kết quả nào, trả về NaN
  if (result === 0) {
    return NaN;
  }
  
  return result;
};

/**
 * Kiểm tra xem chuỗi có phải là một số đơn giản hoặc có đơn vị viết tắt không
 * @param {String} msg - Chuỗi cần kiểm tra
 * @returns {Boolean} - true nếu là số đơn giản hoặc có đơn vị viết tắt
 */
const isSingleNumber = (msg) => {
  const cleanMsg = msg.trim();
  
  // Kiểm tra số thuần túy (không có dấu phẩy)
  const numberRegex = /^-?\d+(\.\d+)?$/;
  if (numberRegex.test(cleanMsg)) {
    return true;
  }
  
  // Kiểm tra định dạng số có dấu phẩy hợp lệ
  const commaNumberRegex = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
  if (commaNumberRegex.test(cleanMsg)) {
    return true;
  }
  
  // Loại bỏ dấu phẩy để kiểm tra các trường hợp khác
  const noCommaMsg = cleanMsg.replace(/,/g, '');
  
  // Kiểm tra định dạng với đơn vị viết tắt (như 1tr, 2k, 2tr543k, 500m, 3tr4, 3k12)
  const unitRegex = /^-?\d*\.?\d*[kmtr]+(\d*\.?\d*[kmtr]*)*$/i;
  if (unitRegex.test(noCommaMsg)) {
    return !isNaN(parseNumberWithUnits(cleanMsg));
  }
  
  return false;
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
 * Tên người gửi dạng Markdown: bấm vào mở chat/profile Telegram.
 */
const formatSenderMarkdown = (senderName, userId) => {
  const name = (senderName != null && senderName !== '') ? String(senderName) : '';
  if (userId == null || userId === '') return name;
  const safeLabel = name.replace(/\]/g, '');
  return `[${safeLabel}](tg://user?id=${String(userId)})`;
};

/** Bỏ 📌 sau khối giờ; nếu isNewest thì chèn 📌 một lần sau giờ (chỉ dòng giao dịch mới nhất). */
const formatTransactionDetailLine = (details, isNewest) => {
  if (!details || typeof details !== 'string') return details || '';
  let d = details.replace(/(`[^`]+`)\s*📌\s*/g, '$1 ');
  if (isNewest) {
    d = d.replace(/^(`[^`]+`)\s*/, '$1 📌 ');
  }
  return d;
};

/**
 * Tạo tin nhắn telegram không sử dụng markdown
 * @param {Object} jsonData - Dữ liệu cần format
 * @returns {String} - Chuỗi đã định dạng
 */
const formatTelegramMessage = (jsonData) => {
  let output = '';
  
  // Lấy định dạng số từ jsonData hoặc sử dụng default
  const numberFormat = jsonData.numberFormat || 'comma';
  
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
    
    // Sắp xếp entries theo timestamp giảm dần (mới nhất ở đầu)
    const sortedDepositEntries = [...jsonData.depositData.entries].sort((a, b) => {
      const timestampA = new Date(a.timestamp || 0);
      const timestampB = new Date(b.timestamp || 0);
      return timestampB - timestampA; // Sắp xếp giảm dần (mới nhất trước)
    });
    
    // Format giao dịch với ID và link - sử dụng ID từ groupCommands.js
    sortedDepositEntries.forEach((entry, index) => {
      // Sử dụng ID từ entry (đã được tính từ groupCommands.js)
      const id = entry.id;
      if (entry.messageId && entry.chatLink) {
        const line = formatTransactionDetailLine(entry.details, index === 0);
        output += `${line} ([${id}](${entry.chatLink}))\n`;
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
    
    // Sắp xếp entries theo timestamp giảm dần (mới nhất ở đầu)
    const sortedPaymentEntries = [...jsonData.paymentData.entries].sort((a, b) => {
      const timestampA = new Date(a.timestamp || 0);
      const timestampB = new Date(b.timestamp || 0);
      return timestampB - timestampA; // Sắp xếp giảm dần (mới nhất trước)
    });
    
    // Format giao dịch với ID và link - sử dụng ID từ groupCommands.js
    sortedPaymentEntries.forEach((entry, index) => {
      // Sử dụng ID từ entry (đã được tính từ groupCommands.js)
      const id = `!${entry.id}`;
      if (entry.messageId && entry.chatLink) {
        const line = formatTransactionDetailLine(entry.details, index === 0);
        output += `${line} ([${id}](${entry.chatLink}))\n`;
      }
    });
    output += '\n';
  } else {
    output += "*Đã thanh toán* ([0](https://t.me/@id7590104666) Đơn):\n\n";
  }
  // Rate information - hiển thị khác nhau dựa trên có wrate/wexchangeRate hay không
  if ((jsonData.wrate > 0 || jsonData.wexchangeRate > 0) && jsonData.wrate !== undefined && jsonData.wexchangeRate !== undefined) {
    // Hiển thị đầy đủ khi có wrate/wexchangeRate
    output += `*Tổng tiền nạp💰*: ${jsonData.totalAmount}  |  ${jsonData.totalUSDTPlus} ${jsonData.currencyUnit || 'USDT'}\n`;
    output += `*Tổng tiền rút*: ${jsonData.totalVNDMinus || '0'} |   ${jsonData.totalUSDTMinus} ${jsonData.currencyUnit || 'USDT'}\n`;
    
    const rateInfo = `Phí: [${jsonData.rate}](https://t.me/@id7590104666)|  Tỷ giá: [${jsonData.exchangeRate}](https://t.me/@id7590104666)\n`;
    const wrateInfo = `W-Phí: [${jsonData.wrate}](https://t.me/@id7590104666)|  W-Tỷ giá: [${jsonData.wexchangeRate}](https://t.me/@id7590104666)\n`;
    
    output += `${rateInfo}${wrateInfo}\n`;
    
    // Summary section với thông tin mới
    output += `*USDT đã thanh toán (%)*: ${jsonData.paidUSDT} ${jsonData.currencyUnit || 'USDT'}\n`;
    output += `*Tổng USDT phải trả*: ${jsonData.totalUSDTGross} ${jsonData.currencyUnit || 'USDT'}\n`;
    output += `*USDT phải trả còn lại*: ${jsonData.remainingUSDTOwed} ${jsonData.currencyUnit || 'USDT'}\n`;
  } else {
    // Hiển thị theo cách cũ khi chưa có wrate/wexchangeRate
    const rateInfo = `Phí: [${jsonData.rate}](https://t.me/@id7590104666)|  Tỷ giá: [${jsonData.exchangeRate}](https://t.me/@id7590104666)\n`;
    
    // Thêm ví dụ nếu có
    let rateInfoWithExample = rateInfo;
    if (jsonData.example) {
      rateInfoWithExample += `\nVD: 100000 = [${jsonData.example}](https://t.me/@id7590104666) ${jsonData.currencyUnit || 'USDT'}`;
    }
    
    output += `${rateInfoWithExample}\n`;
    
    // Summary section cũ
    output += `*Tổng tiền nạp💰*: ${jsonData.totalAmount}\n`;
    output += `*Tiền phải trả*: ${jsonData.totalUSDT} ${jsonData.currencyUnit || 'USDT'}\n`;
    output += `*Tiền đã trả*: ${jsonData.paidUSDT} ${jsonData.currencyUnit || 'USDT'}\n`;
    output += `*Tiền còn lại*: ${jsonData.remainingUSDT} ${jsonData.currencyUnit || 'USDT'}\n`;
  }
  
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
    return formatSmart(num, 'comma');
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
    return group && group.numberFormat ? group.numberFormat : 'comma';
  } catch (error) {
    console.error('Error in getNumberFormat:', error);
    return 'comma';
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
  formatSenderMarkdown,
  getNumberFormat,
  parseNumberWithUnits,
  preprocessMathExpression
}; 