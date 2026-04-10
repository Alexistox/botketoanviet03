const { parseNumberWithUnits } = require('./formatter');
const { findBankCode, BANK_MAPPING } = require('./bankMapping');
const { matchLabelToField, matchSpaceSeparatedLine } = require('./qrBankKeywords');

// Removed Sepay integration - only using VietQR now

/**
 * Parse phần số đã gộp khoảng trắng (chỉ chữ số và dấu phân tách), không chứa chữ.
 */
const parseCompactAmountDigits = (cleanStr) => {
  if (!cleanStr) return NaN;
  if (/^\d+$/.test(cleanStr)) {
    return parseFloat(cleanStr);
  }
  const vietnameseFormatRegex = /^\d{1,3}(\.\d{3})+$/;
  if (vietnameseFormatRegex.test(cleanStr)) {
    return parseFloat(cleanStr.replace(/\./g, ''));
  }
  const commaFormatRegex = /^\d{1,3}(,\d{3})*(\.\d+)?$/;
  if (commaFormatRegex.test(cleanStr)) {
    return parseFloat(cleanStr.replace(/,/g, ''));
  }
  const europeanFormatRegex = /^\d{1,3}(\.\d{3})*,\d+$/;
  if (europeanFormatRegex.test(cleanStr)) {
    return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d+\.\d{1,2}$/.test(cleanStr)) {
    return parseFloat(cleanStr);
  }
  return NaN;
};

/**
 * Chuẩn hóa một đoạn có thể chỉ là số tiền (có/không hậu tố vnd/đ), không quét chữ trên cả dòng.
 */
const tryParseSingleAmountChunk = (chunk) => {
  if (!chunk || typeof chunk !== 'string') return NaN;
  let s = chunk.trim().toLowerCase();
  s = s.replace(/^đ+\s*/g, '');
  s = s.replace(/\s*(vnd|vnđ|đồng|dong)\s*$/gi, '');
  s = s.replace(/\s*đ\s*$/g, '');
  s = s.replace(/\s+/g, '');
  const n = parseCompactAmountDigits(s);
  if (!isNaN(n)) return n;
  return parseNumberWithUnits(chunk.trim());
};

/**
 * Hàm parse số tiền hỗ trợ nhiều định dạng Việt Nam.
 * Hỗ trợ dòng ghép nội dung (vd. "798.000 vnd HTTH chuyen tien") — không dùng replace global [vnđ…]
 * vì sẽ xóa chữ n trong "chuyen" và trả NaN → QR amount=0.
 *
 * @param {string} amountStr - Chuỗi số tiền cần parse
 * @returns {number} - Số tiền đã parse hoặc NaN nếu không hợp lệ
 */
const parseVietnameseAmount = (amountStr) => {
  if (!amountStr || typeof amountStr !== 'string') {
    return NaN;
  }

  const trimmed = amountStr.trim();
  let n = tryParseSingleAmountChunk(trimmed);
  if (!isNaN(n) && n > 0) return n;

  const leadDot = trimmed.match(/^(\d{1,3}(?:\.\d{3})+)(?:\s*(?:vnd|vnđ|đồng|dong|đ))?\b/i);
  if (leadDot) {
    n = tryParseSingleAmountChunk(leadDot[0]);
    if (!isNaN(n) && n > 0) return n;
  }
  const leadComma = trimmed.match(/^(\d{1,3}(?:,\d{3})+)(?:\s*(?:vnd|vnđ|đồng|dong|đ))?\b/i);
  if (leadComma) {
    n = tryParseSingleAmountChunk(leadComma[0]);
    if (!isNaN(n) && n > 0) return n;
  }

  const tailDot = trimmed.match(/(\d{1,3}(?:\.\d{3})+)(?:\s*(?:vnd|vnđ|đồng|dong|đ))?\s*$/i);
  if (tailDot) {
    n = tryParseSingleAmountChunk(tailDot[0]);
    if (!isNaN(n) && n > 0) return n;
  }
  const tailComma = trimmed.match(/(\d{1,3}(?:,\d{3})+)(?:\s*(?:vnd|vnđ|đồng|dong|đ))?\s*$/i);
  if (tailComma) {
    n = tryParseSingleAmountChunk(tailComma[0]);
    if (!isNaN(n) && n > 0) return n;
  }

  const unitAmount = parseNumberWithUnits(trimmed);
  if (!isNaN(unitAmount) && unitAmount > 0) {
    return unitAmount;
  }

  return NaN;
};

/**
 * Normalize tên để so sánh (bỏ dấu, viết hoa, loại bỏ khoảng trắng thừa)
 * @param {string} name - Tên cần normalize
 * @returns {string} - Tên đã normalize
 */
const normalizeName = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  return name.trim()
    .toUpperCase()
    .replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A')
    .replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E')
    .replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I')
    .replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O')
    .replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U')
    .replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ');
};

const ACCOUNT_LINE_PREFIX = /^(卡号|账号|帐号)[：:]|^Card No[.:]|^card no[.:]|^Account[.:]|^account[.:]/i;
const BANK_LINE_PREFIX = /^(银行名称|银行)[：:]|^Bank[.:]|^bank[.:]|^ngân hàng[：:]|^Ngân hàng[：:]/i;
const NAME_LINE_PREFIX = /^(提款姓名|持卡人姓名|名字|姓名|Tên|tên|ten|Name|name)([:：]|\s+)/i;

/** Lấy chuỗi số dài nhất (≥5) từ value nhãn STK — giữ số 0 đầu. */
const extractAccountDigitsFromValue = (value) => {
  if (!value || typeof value !== 'string') return null;
  const compact = value.replace(/[\s-]/g, '');
  const matches = compact.match(/\d{5,}/g);
  if (!matches || !matches.length) return null;
  return matches.reduce((a, b) => (a.length >= b.length ? a : b));
};

/**
 * Lớp 1: nhận dạng key : value (nhãn đa ngôn ngữ), thứ tự dòng tùy ý.
 * @returns {{ hadLabel: boolean, amountSeen: boolean, accountNumber, bankName, bankCode, accountName, amount, remark }}
 */
const extractLabeledFields = (message) => {
  const out = {
    hadLabel: false,
    amountSeen: false,
    accountNumber: null,
    bankName: null,
    bankCode: null,
    accountName: null,
    amount: undefined,
    remark: null
  };

  const lines = message.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const segments = line.split('|').map((s) => s.trim()).filter(Boolean);
    for (const part of segments) {
      const sep = part.search(/[:：]/);
      if (sep > 0) {
        const rawKey = part.slice(0, sep).trim();
        const value = part.slice(sep + 1).trim();
        if (!value) continue;

        const field = matchLabelToField(rawKey);
        if (!field) continue;
        out.hadLabel = true;

        switch (field) {
          case 'account': {
            const acct = extractAccountDigitsFromValue(value);
            if (acct) out.accountNumber = acct;
            break;
          }
          case 'bank': {
            const hit = findBankCode(value);
            if (hit) {
              out.bankName = value.trim();
              out.bankCode = hit.bankCode;
            }
            break;
          }
          case 'name':
            out.accountName = value.trim();
            break;
          case 'amount': {
            out.amountSeen = true;
            const a = parseVietnameseAmount(value);
            if (!isNaN(a) && a >= 0) out.amount = a;
            break;
          }
          case 'note':
            out.remark = value.trim();
            break;
          default:
            break;
        }
        continue;
      }

      const sp = matchSpaceSeparatedLine(part);
      if (sp) {
        out.hadLabel = true;
        switch (sp.field) {
          case 'account': {
            const acct = extractAccountDigitsFromValue(sp.value);
            if (acct) out.accountNumber = acct;
            break;
          }
          case 'bank': {
            const hit = findBankCode(sp.value);
            if (hit) {
              out.bankName = sp.value.trim();
              out.bankCode = hit.bankCode;
            }
            break;
          }
          case 'name':
            out.accountName = sp.value.trim();
            break;
          case 'amount': {
            out.amountSeen = true;
            const a = parseVietnameseAmount(sp.value);
            if (!isNaN(a) && a >= 0) out.amount = a;
            break;
          }
          case 'note':
            out.remark = sp.value.trim();
            break;
          default:
            break;
        }
        continue;
      }

      const bare = part.trim();
      if (!/^\d+$/.test(bare.replace(/\s+/g, ''))) {
        const hit = findBankCode(bare);
        if (hit) {
          out.hadLabel = true;
          out.bankName = bare;
          out.bankCode = hit.bankCode;
        }
      }
    }
  }
  return out;
};

/**
 * Dòng không phải nhãn đã biết — thử parse số tiền (tránh nhầm STK chỉ gồm chữ số).
 */
const scanUnlabeledAmountLine = (message, accountNumber) => {
  const lines = message.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const acctCompact = accountNumber ? String(accountNumber).replace(/\s+/g, '') : '';
  let bestDigit = null;

  for (const line of lines) {
    if (/[:：]/.test(line)) {
      const sep = line.search(/[:：]/);
      const key = line.slice(0, sep).trim();
      if (matchLabelToField(key)) continue;
    }
    if (matchSpaceSeparatedLine(line)) continue;

    const compact = line.replace(/\s+/g, '');
    if (acctCompact && compact === acctCompact) continue;

    if (/^\d+$/.test(compact)) {
      const v = parseFloat(compact);
      if (v > 0 && (bestDigit === null || v > bestDigit)) bestDigit = v;
      continue;
    }

    const p = parseVietnameseAmount(line);
    if (!isNaN(p) && p > 0) return p;
  }
  return bestDigit;
};

/** Các dòng chỉ gồm số khác STK và khác số tiền → gộp làm ghi chú (vd mã tham chiếu). */
const collectOrphanNumericRemarks = (message, accountNumber, amountNum) => {
  if (amountNum == null || isNaN(amountNum) || amountNum <= 0) return '';
  const lines = message.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const acct = accountNumber ? String(accountNumber).replace(/\s+/g, '') : '';
  const amtKey = String(Math.trunc(Number(amountNum)));
  const parts = [];
  for (const line of lines) {
    if (matchSpaceSeparatedLine(line)) continue;
    if (/[:：]/.test(line)) {
      const sep = line.search(/[:：]/);
      if (matchLabelToField(line.slice(0, sep).trim())) continue;
    }
    const c = line.replace(/\s+/g, '');
    if (!/^\d+$/.test(c)) continue;
    if (acct && c === acct) continue;
    if (c === amtKey) continue;
    parts.push(c);
  }
  return parts.join(' ');
};

/**
 * Lớp 2: heuristic theo dòng (tin không nhãn hoặc thiếu trường sau lớp KV).
 */
const parseTransferInfoHeuristic = (message) => {
  const lines = message.trim().split('\n').filter((line) => line.trim());
  if (lines.length < 3) {
    return null;
  }

  let accountNumber = null;
  let accountName = null;
  let bankName = null;
  let bankCode = null;
  let amount = null;
  let remark = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const sp = matchSpaceSeparatedLine(raw);
    if (sp && sp.field === 'account') {
      const acct = extractAccountDigitsFromValue(sp.value);
      if (acct) {
        accountNumber = acct;
        break;
      }
    }
  }

  if (!accountNumber) {
    for (let i = 0; i < lines.length; i++) {
      let cleanLine = lines[i].trim();
      cleanLine = cleanLine.replace(ACCOUNT_LINE_PREFIX, '').trim();
      cleanLine = cleanLine.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanLine)) {
        accountNumber = cleanLine;
        break;
      }
    }
  }

  if (!accountNumber) {
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    let cleanBankName = lines[i].trim();
    cleanBankName = cleanBankName.replace(BANK_LINE_PREFIX, '').trim();
    const hit = findBankCode(cleanBankName);
    if (hit) {
      bankName = cleanBankName;
      bankCode = hit.bankCode;
      break;
    }
  }

  if (!bankName || !bankCode) {
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const amountStr = lines[i].trim();
    if (
      amountStr.includes(',') ||
      amountStr.includes('.') ||
      /[trkkmb]/.test(amountStr.toLowerCase()) ||
      /[vnđdong]/i.test(amountStr)
    ) {
      const parsedAmount = parseVietnameseAmount(amountStr);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        amount = parsedAmount;
        break;
      }
    }
  }

  if (!amount) {
    const acctCmp = String(accountNumber).replace(/\s+/g, '');
    let bestPure = null;
    for (let i = 0; i < lines.length; i++) {
      const amountStr = lines[i].trim();
      const compact = amountStr.replace(/\s+/g, '');
      if (compact === acctCmp) continue;
      if (/^\d+$/.test(compact)) {
        const parsedAmount = parseFloat(compact);
        if (parsedAmount > 0 && (bestPure === null || parsedAmount > bestPure)) {
          bestPure = parsedAmount;
        }
      }
    }
    amount = bestPure;
  }

  if (!amount) {
    return null;
  }

  const looksLikeNameLine = (line) => {
    const stripped = line.replace(NAME_LINE_PREFIX, '').trim();
    if (stripped.length < 2) return null;
    if (!/[a-zA-ZÀ-ỹ\u3400-\u9FFF]/.test(stripped)) return null;
    if (findBankCode(stripped)) return null;
    return stripped;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === accountNumber || line === bankName) continue;
    const parsedAmount = parseVietnameseAmount(line);
    if (!isNaN(parsedAmount) && parsedAmount > 0) continue;
    const candidate = looksLikeNameLine(line);
    if (candidate) {
      accountName = candidate;
      break;
    }
  }

  if (!accountName) {
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === accountNumber || line === bankName || line === accountName) continue;
    const parsedAmount = parseVietnameseAmount(line);
    if (!isNaN(parsedAmount) && parsedAmount > 0) continue;
    if (line.length > 0) {
      remark = line;
      break;
    }
  }

  if (!remark.trim() && amount > 0) {
    const orphan = collectOrphanNumericRemarks(message, accountNumber, amount);
    if (orphan) remark = orphan;
  }

  return {
    accountNumber,
    accountName,
    bankName,
    bankCode,
    amount,
    remark
  };
};

/**
 * Phân tích thông tin chuyển khoản từ tin nhắn
 * - Lớp 1: nhãn key : value (VI/EN/ZH), không phụ thuộc thứ tự; thiếu số tiền → 0.
 * - Lớp 2: heuristic theo dòng như trước (cần đủ STK, bank, tên, số tiền).
 *
 * @param {string} message - Tin nhắn cần phân tích
 * @returns {Object|null} - Thông tin chuyển khoản hoặc null nếu không hợp lệ
 */
const parseTransferInfo = (message) => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const labeled = extractLabeledFields(message);
  if (
    labeled.hadLabel &&
    labeled.accountNumber &&
    labeled.bankCode &&
    labeled.accountName
  ) {
    let amt =
      labeled.amount !== undefined && !isNaN(labeled.amount) ? labeled.amount : undefined;
    if (!labeled.amountSeen || amt === undefined) {
      const loose = scanUnlabeledAmountLine(message, labeled.accountNumber);
      if (loose != null && loose > 0) amt = loose;
    }
    if (amt === undefined || isNaN(amt)) amt = 0;
    let remark = labeled.remark || '';
    if (!remark.trim() && amt > 0) {
      const orphan = collectOrphanNumericRemarks(message, labeled.accountNumber, amt);
      if (orphan) remark = orphan;
    }
    return {
      accountNumber: labeled.accountNumber,
      accountName: labeled.accountName,
      bankName: labeled.bankName,
      bankCode: labeled.bankCode,
      amount: amt,
      remark
    };
  }

  return parseTransferInfoHeuristic(message);
};

/**
 * Tạo URL VietQR cho tất cả ngân hàng
 * @param {Object} transferInfo - Thông tin chuyển khoản
 * @param {string} transferInfo.bankCode - Mã ngân hàng (numeric code)
 * @param {string} transferInfo.accountNumber - Số tài khoản
 * @param {string} transferInfo.accountName - Tên chủ tài khoản
 * @param {number} transferInfo.amount - Số tiền
 * @param {string} [remark=''] - Ghi chú chuyển khoản
 * @returns {string} - URL QR code
 */
const generateVietQRUrl = (transferInfo, remark = '') => {
  const { bankCode, accountNumber, accountName, amount } = transferInfo;
  const encodedAccountName = encodeURIComponent(accountName || '');
  const encodedRemark = encodeURIComponent(remark || '');
  const baseUrl = 'https://img.vietqr.io/image';
  const path = `${baseUrl}/${bankCode}-${accountNumber}-compact2.jpg`;
  const n = Number(amount);
  if (!n || n <= 0) {
    return `${path}?addInfo=${encodedRemark}&accountName=${encodedAccountName}`;
  }
  return `${path}?amount=${n}&addInfo=${encodedRemark}&accountName=${encodedAccountName}`;
};

/**
 * Kiểm tra xem tin nhắn có phải là thông tin chuyển khoản không
 * @param {string} message - Tin nhắn cần kiểm tra
 * @returns {boolean} - true nếu là thông tin chuyển khoản
 */
const isTransferMessage = (message) => {
  return parseTransferInfo(message) !== null;
};

/**
 * Tạo thông tin QR code để gửi ảnh
 * @param {Object} transferInfo - Thông tin chuyển khoản
 * @param {string} [remark=''] - Ghi chú chuyển khoản (tùy chọn, có thể lấy từ transferInfo.remark)
 * @returns {Object} - Object chứa URL ảnh và caption
 */
const generateQRResponse = (transferInfo, remark = '') => {
  const { accountNumber, accountName, bankName, amount } = transferInfo;
  
  // Sử dụng ghi chú từ transferInfo nếu có, nếu không thì dùng tham số remark
  const finalRemark = transferInfo.remark || remark;
  const qrUrl = generateVietQRUrl(transferInfo, finalRemark);
  
  // Format số tiền với dấu phẩy
  const formattedAmount = amount.toLocaleString('vi-VN');
  
  const caption = `${finalRemark ? `📝 **Ghi chú:** ${finalRemark}` : ''}`;

  return {
    photo: qrUrl,
    caption: caption
  };
};

module.exports = {
  parseTransferInfo,
  generateVietQRUrl,
  isTransferMessage,
  generateQRResponse,
  parseVietnameseAmount,
  normalizeName,
  BANK_MAPPING
}; 