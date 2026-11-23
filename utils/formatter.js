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
 * Định dạng thành phần tỷ lệ x/y (giữ số lẻ nhỏ, không cắt còn 2 chữ số).
 */
const formatRatioPart = (num) => {
  num = parseFloat(num);
  if (isNaN(num)) {
    return "0";
  }
  if (Math.abs(num - Math.round(num)) < 1e-12) {
    return String(Math.round(num));
  }
  return num.toFixed(12).replace(/\.?0+$/, '');
};

/**
 * Kiểm tra xem chuỗi có phải biểu thức toán học hợp lệ không
 * @param {String} msg - Chuỗi cần kiểm tra
 * @returns {Boolean} - true nếu là biểu thức toán học
 */
const isMathExpression = (msg) => {
  // Số, đơn vị k/m/tr, dấu phẩy, toán tử, và tên biến a-zA-Z_
  const mathRegex = /^[0-9a-zA-Z_+\-*/().\s,]+$/;

  if (!mathRegex.test(msg)) {
    return false;
  }

  const trimmed = msg.trim();
  if (trimmed.length === 1 && /[+\-*/.()]/.test(trimmed)) {
    return false;
  }

  const hasNumber = /\d/.test(trimmed);
  const hasIdent = /[a-zA-Z_]/.test(trimmed);

  return hasNumber || hasIdent;
};

/**
 * Lấy tên biến trong biểu thức (bỏ số và đơn vị k/m/tr).
 */
const extractMathIdentifiers = (expression) => {
  if (!expression || typeof expression !== 'string') {
    return [];
  }

  let s = expression;
  s = s.replace(/\d+(?:\.\d+)?[eE][+\-]?\d+/g, ' ');
  s = s.replace(/\d+(?:\.\d+)?(m|tr)\d+(?:\.\d+)?k\b/gi, ' ');
  s = s.replace(/\d+(?:\.\d+)?(tr|m|k)\d+\b/gi, ' ');
  s = s.replace(/\d+(?:\.\d+)?(k|tr|m)\b/gi, ' ');
  s = s.replace(/\d+(?:\.\d+)?/g, ' ');

  const names = s.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  return [...new Set(names)];
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
 * Định dạng thời gian 24h HH:mm:ss (timezone sổ cái Asia/Phnom_Penh).
 * Dùng en-GB + hour/minute/second cố định — tránh locale AM/PM.
 */
const formatTimeString = (date) => {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const coerceReportNumber = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).replace(/,/g, '').trim();
  if (s === '') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const escapeHtml = (text) =>
  String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Telegram Date Formatting (HTML).
 * format r | w?[dD]?[tT]? — hoặc '' để hiện đúng fallback 24h (tránh client AM/PM).
 */
const formatTelegramDateTimeHtml = (date, format = '', fallbackText = '') => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return escapeHtml(fallbackText || '');
  }
  const unix = Math.floor(d.getTime() / 1000);
  const fallback =
    fallbackText ||
    (format === 'd' || format === 'D' || format === 'w' || /^w?[dD]$/.test(format)
      ? formatDateUS(d)
      : formatTimeString(d));
  const formatAttr = format ? ` format="${escapeHtml(format)}"` : '';
  return `<tg-time unix="${unix}"${formatAttr}>${escapeHtml(fallback)}</tg-time>`;
};

/** Đổi fragment Markdown legacy trong dòng details sang HTML an toàn. */
const markdownFragmentToHtml = (fragment) => {
  if (!fragment) return '';
  let s = String(fragment);
  s = s.replace(/\\\*/g, '\u0001');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|tg:\/\/[^)\s]+)\)/g, (_, label, url) => {
    return `\u0002${encodeURIComponent(label)}\u0003${encodeURIComponent(url)}\u0004`;
  });
  s = s.replace(/`([^`]+)`/g, (_, code) => `\u0005${encodeURIComponent(code)}\u0006`);
  s = s.replace(/\*([^*]+)\*/g, (_, bold) => `\u0007${encodeURIComponent(bold)}\u0008`);
  s = escapeHtml(s);
  s = s.replace(/\u0001/g, '*');
  s = s.replace(/\u0002([^\u0003]+)\u0003([^\u0004]+)\u0004/g, (_, label, url) => {
    return `<a href="${decodeURIComponent(url)}">${escapeHtml(decodeURIComponent(label))}</a>`;
  });
  s = s.replace(/\u0005([^\u0006]+)\u0006/g, (_, code) => `<code>${escapeHtml(decodeURIComponent(code))}</code>`);
  s = s.replace(/\u0007([^\u0008]+)\u0008/g, (_, bold) => `<b>${escapeHtml(decodeURIComponent(bold))}</b>`);
  return s;
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

const newestEntryMarker = (isNewest) => (isNewest ? '<b>📌</b> ' : '');

/**
 * Render dòng giao dịch: giờ dùng Date Formatting, phần còn lại Markdown → HTML.
 */
const formatReportEntryLineHtml = (entry, markerHtml, idLabel, idPrefixed = false) => {
  const details = entry?.details || '';
  const ts = entry?.timestamp ? new Date(entry.timestamp) : null;
  const timeMatch = details.match(/^`([^`]+)`(\s*)/);
  let rest = details;
  let timeHtml = '';

  if (ts && !Number.isNaN(ts.getTime())) {
    timeHtml = formatTelegramDateTimeHtml(ts, '', formatTimeString(ts));
    rest = timeMatch ? details.slice(timeMatch[0].length) : details.replace(/^\S+\s*/, '');
  } else if (timeMatch) {
    timeHtml = `<code>${escapeHtml(timeMatch[1])}</code>`;
    rest = details.slice(timeMatch[0].length);
  }

  const restHtml = markdownFragmentToHtml(rest);
  let line = `${timeHtml}${timeMatch && timeMatch[2] ? timeMatch[2] : ' '}${markerHtml || ''}${restHtml}`;

  if (entry?.messageId && entry?.chatLink) {
    const safeHref = escapeHtml(entry.chatLink);
    const safeId = escapeHtml(String(idLabel));
    if (idPrefixed) {
      line += ` (<a href="${safeHref}">${safeId}</a>)`;
    } else {
      line += ` (<a href="${safeHref}">${safeId}</a>)`;
    }
  }
  return line;
};

/** Bỏ 📌 sau khối giờ; nếu isNewest thì chèn 📌 (Markdown legacy / tương thích). */
const formatTransactionDetailLine = (details, isNewest) => {
  if (!details || typeof details !== 'string') return details || '';
  let d = details.replace(/(`[^`]+`)\s*📌\s*/g, '$1 ');
  if (isNewest) {
    d = d.replace(/^(`[^`]+`)\s*/, '$1 📌 ');
  }
  return d;
};

/**
 * Báo cáo Telegram (HTML + Date Formatting 24h).
 * Giữ nhãn tiếng Việt + nhánh wrate/d2 của botketoanviet03.
 */
const formatTelegramMessage = (jsonData) => {
  let output = '';
  const numberFormat = jsonData.numberFormat || 'comma';
  const unit = escapeHtml(jsonData.currencyUnit || 'USDT');
  const currentDate = new Date();

  output += `<b>Hôm nay ${formatTelegramDateTimeHtml(currentDate, 'd', formatDateUS(currentDate))}</b>\n`;

  if (jsonData.depositData && jsonData.depositData.entries && jsonData.depositData.entries.length > 0) {
    const depositCount = jsonData.depositData.totalCount || jsonData.depositData.entries.length;
    output += `<b>Tiền đã nạp</b> (${depositCount} Đơn):\n`;

    const sortedDepositEntries = [...jsonData.depositData.entries].sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    sortedDepositEntries.forEach((entry, index) => {
      if (!(entry.messageId && entry.chatLink)) return;
      output += `${formatReportEntryLineHtml(entry, newestEntryMarker(index === 0), entry.id, true)}\n`;
    });
    output += '\n';
  } else {
    output += '<b>Tiền đã nạp</b> (0 Đơn):\n\n';
  }

  if (jsonData.paymentData && jsonData.paymentData.entries && jsonData.paymentData.entries.length > 0) {
    const paymentCount = jsonData.paymentData.totalCount || jsonData.paymentData.entries.length;
    output += `<b>Đã thanh toán</b> (${paymentCount} Đơn):\n`;

    const sortedPaymentEntries = [...jsonData.paymentData.entries].sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    sortedPaymentEntries.forEach((entry, index) => {
      if (!(entry.messageId && entry.chatLink)) return;
      output += `${formatReportEntryLineHtml(entry, newestEntryMarker(index === 0), `!${entry.id}`, false)}\n`;
    });
    output += '\n';
  } else {
    output += '<b>Đã thanh toán</b> (0 Đơn):\n\n';
  }

  if ((jsonData.wrate > 0 || jsonData.wexchangeRate > 0) && jsonData.wrate !== undefined && jsonData.wexchangeRate !== undefined) {
    output += `<b>Tổng tiền nạp💰</b>: ${escapeHtml(String(jsonData.totalAmount))}  |  ${escapeHtml(String(jsonData.totalUSDTPlus))} ${unit}\n`;
    output += `<b>Tổng tiền rút</b>: ${escapeHtml(String(jsonData.totalVNDMinus || '0'))} |   ${escapeHtml(String(jsonData.totalUSDTMinus))} ${unit}\n`;
    output += `Phí: ${escapeHtml(String(jsonData.rate))} |  Tỷ giá: ${escapeHtml(String(jsonData.exchangeRate))}\n`;
    output += `W-Phí: ${escapeHtml(String(jsonData.wrate))} |  W-Tỷ giá: ${escapeHtml(String(jsonData.wexchangeRate))}\n\n`;
    output += `<b>USDT đã thanh toán (%)</b>: ${escapeHtml(String(jsonData.paidUSDT))} ${unit}\n`;
    output += `<b>Tổng USDT phải trả</b>: ${escapeHtml(String(jsonData.totalUSDTGross))} ${unit}\n`;
    output += `<b>USDT phải trả còn lại</b>: ${escapeHtml(String(jsonData.remainingUSDTOwed))} ${unit}\n`;
  } else {
    let rateInfo = `Phí: ${escapeHtml(String(jsonData.rate))} |  Tỷ giá: ${escapeHtml(String(jsonData.exchangeRate))}\n`;
    if (jsonData.example) {
      rateInfo += `\nVD: 100000 = ${escapeHtml(String(jsonData.example))} ${unit}`;
    }
    output += `${rateInfo}\n`;
    output += `<b>Tổng tiền nạp💰</b>: ${escapeHtml(String(jsonData.totalAmount))}\n`;
    output += `<b>Tiền phải trả</b>: ${escapeHtml(String(jsonData.totalUSDT))} ${unit}\n`;
    output += `<b>Tiền đã trả</b>: ${escapeHtml(String(jsonData.paidUSDT))} ${unit}\n`;
    output += `<b>Tiền còn lại</b>: ${escapeHtml(String(jsonData.remainingUSDT))} ${unit}\n`;
  }

  if (jsonData.cards && jsonData.cards.length > 0) {
    output += `\n<b>Hạn mức thẻ 💳</b> :\n${jsonData.cards.map((c) => markdownFragmentToHtml(String(c))).join('\n')}`;
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

/**
 * Hệ số *x: tối đa 3 chữ số thập phân (0.985 → "0.985", 0.98 → "0.98").
 */
const formatRateFactor = (num) => {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  const rounded3 = Math.round(n * 1000) / 1000;
  const with3 = rounded3.toFixed(3);
  if (with3.endsWith('0')) return rounded3.toFixed(2);
  return with3;
};

const isNeutralRateFactor = (rateFactorStr) => {
  const n = Number(rateFactorStr);
  return Number.isFinite(n) && Math.abs(n - 1) < 1e-9;
};

const isNeutralExchangeRate = (yValue) => {
  const n = Number(yValue);
  return Number.isFinite(n) && Math.abs(n - 1) < 1e-9;
};

/** Hậu tố *x/y — ẩn *1 và /1 */
const formatDepositRateSuffix = (rateFactor, yValue) => {
  const xNeutral = isNeutralRateFactor(rateFactor);
  const yNeutral = isNeutralExchangeRate(yValue);
  if (xNeutral && yNeutral) return '';
  if (xNeutral) return `/${yValue}`;
  if (yNeutral) return `\\*${rateFactor}`;
  return `\\*${rateFactor}/${yValue}`;
};

/**
 * Parse token sau +/− : amount*费率/汇率 (số sau * = % phí).
 * Dùng parseNumberWithUnits cho amount (1tr, 2k…).
 */
const parsePlusAmountRateExpr = (token) => {
  const raw = String(token || '').trim().replace(/\s*([*/])\s*/g, '$1');
  if (!raw) return { ok: false };

  const starIdx = raw.indexOf('*');
  const slashIdx = raw.indexOf('/');
  const rateMode = starIdx >= 0 || slashIdx >= 0;

  if (!rateMode) {
    const amount = parseNumberWithUnits(raw);
    if (Number.isNaN(amount)) {
      // fallback số thuần
      const n = parseFloat(raw);
      if (Number.isNaN(n)) return { ok: false };
      return { ok: true, rateMode: false, amount: n };
    }
    return { ok: true, rateMode: false, amount };
  }

  let amountStr;
  let xStr = null;
  let yStr = null;

  if (starIdx >= 0 && slashIdx > starIdx) {
    amountStr = raw.slice(0, starIdx);
    xStr = raw.slice(starIdx + 1, slashIdx);
    yStr = raw.slice(slashIdx + 1);
  } else if (starIdx >= 0 && slashIdx < 0) {
    amountStr = raw.slice(0, starIdx);
    xStr = raw.slice(starIdx + 1);
  } else if (slashIdx >= 0 && (starIdx < 0 || starIdx > slashIdx)) {
    amountStr = raw.slice(0, slashIdx);
    yStr = raw.slice(slashIdx + 1);
  } else {
    return { ok: false };
  }

  let amount = parseNumberWithUnits(amountStr);
  if (Number.isNaN(amount)) {
    amount = parseFloat(amountStr);
  }
  if (Number.isNaN(amount)) return { ok: false };

  let xLiteral = null;
  let yLiteral = null;
  let xIsPlaceholder = true;
  let yIsPlaceholder = true;

  if (xStr != null) {
    const xs = xStr.trim();
    if (!xs) return { ok: false };
    if (/^x$/i.test(xs)) {
      xIsPlaceholder = true;
    } else {
      const rateTok = xs.replace(/%$/u, '');
      xLiteral = parseFloat(rateTok);
      if (Number.isNaN(xLiteral)) return { ok: false };
      xIsPlaceholder = false;
    }
  }

  if (yStr != null) {
    const ys = yStr.trim();
    if (!ys) return { ok: false };
    if (/^y$/i.test(ys)) {
      yIsPlaceholder = true;
    } else {
      yLiteral = parseFloat(ys);
      if (Number.isNaN(yLiteral)) return { ok: false };
      yIsPlaceholder = false;
    }
  }

  return {
    ok: true,
    rateMode: true,
    amount,
    xLiteral,
    yLiteral,
    xIsPlaceholder,
    yIsPlaceholder
  };
};

/** + : literal *N = phí % → hệ số 1 - N/100; mặc định từ /d */
const resolvePlusXyDefaults = (parsed, group) => {
  const groupRate =
    group && group.rate != null && Number.isFinite(Number(group.rate))
      ? Number(group.rate)
      : null;
  const ex =
    group && group.exchangeRate != null && Number(group.exchangeRate) !== 0
      ? Number(group.exchangeRate)
      : null;

  const ratePercent = parsed.xIsPlaceholder
    ? (groupRate != null ? groupRate : 0)
    : Number(parsed.xLiteral);

  return {
    x: 1 - ratePercent / 100,
    y: parsed.yIsPlaceholder ? (ex != null ? ex : 1) : Number(parsed.yLiteral),
    ratePercent
  };
};

/** - : literal *N = wrate % → hệ số 1 + N/100; mặc định từ /d2 (wrate/wexchangeRate) */
const resolveMinusXyDefaults = (parsed, group) => {
  const hasD2 =
    group &&
    group.wrate != null &&
    group.wexchangeRate != null &&
    Number(group.wexchangeRate) !== 0;

  const groupRate = hasD2 ? Number(group.wrate) : null;
  const ex = hasD2 ? Number(group.wexchangeRate) : null;

  const ratePercent = parsed.xIsPlaceholder
    ? (groupRate != null ? groupRate : 0)
    : Number(parsed.xLiteral);

  return {
    x: 1 + ratePercent / 100,
    y: parsed.yIsPlaceholder ? (ex != null ? ex : 1) : Number(parsed.yLiteral),
    ratePercent,
    hasD2: !!hasD2
  };
};

module.exports = {
  formatSmart,
  formatWithComma,
  formatSmartWithGroup,
  formatRateValue,
  formatRatioPart,
  formatRateFactor,
  isNeutralRateFactor,
  isNeutralExchangeRate,
  formatDepositRateSuffix,
  parsePlusAmountRateExpr,
  resolvePlusXyDefaults,
  resolveMinusXyDefaults,
  isMathExpression,
  extractMathIdentifiers,
  isSingleNumber,
  isTrc20Address,
  formatTelegramMessage,
  formatDateUS,
  formatTimeString,
  formatTelegramDateTimeHtml,
  escapeHtml,
  coerceReportNumber,
  formatSenderMarkdown,
  getNumberFormat,
  parseNumberWithUnits,
  preprocessMathExpression
}; 