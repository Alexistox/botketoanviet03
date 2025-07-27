const { parseNumberWithUnits } = require('./formatter');

/**
 * Mapping tên ngân hàng Việt Nam - từ tên đầy đủ/viết tắt sang mã code
 */
const BANK_MAPPING = {
  // Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam
  'VCB': 'VCB',
  'VIETCOMBANK': 'VCB',
  'VIET COM BANK': 'VCB',
  'NGOAI THUONG': 'VCB',
  
  // Ngân hàng Thương mại Cổ phần Đầu tư và Phát triển Việt Nam
  'BIDV': 'BIDV',
  'DAU TU PHAT TRIEN': 'BIDV',
  
  // Ngân hàng Thương mại Cổ phần Công thương Việt Nam
  'VTB': 'VTB',
  'VIETINBANK': 'VTB',
  'VIETIN BANK': 'VTB',
  'VIETTIN': 'VTB',
  'CONG THUONG': 'VTB',
  
  // Ngân hàng Thương mại Cổ phần Quốc tế Việt Nam
  'VIB': 'VIB',
  'VIET INTERNATIONAL': 'VIB',
  'QUOC TE': 'VIB',
  
  // Ngân hàng Thương mại Cổ phần Á Châu
  'ACB': 'ACB',
  'A CHAU': 'ACB',
  'ASIA COMMERCIAL': 'ACB',
  
  // Ngân hàng Thương mại Cổ phần Kỹ thương Việt Nam
  'TCB': 'TCB',
  'TECHCOMBANK': 'TCB',
  'TECH COM BANK': 'TCB',
  'KY THUONG': 'TCB',
  
  // Ngân hàng Thương mại Cổ phần Sài Gòn Thương Tín
  'STB': 'STB',
  'SACOMBANK': 'STB',
  'SAI GON THUONG TIN': 'STB',
  
  // Ngân hàng Thương mại Cổ phần Sài Gòn
  'SGB': 'SGB',
  'SGBANK': 'SGB',
  'SAI GON': 'SGB',
  
  // Ngân hàng Thương mại Cổ phần Hàng Hải Việt Nam
  'MSB': 'MSB',
  'MARITIME BANK': 'MSB',
  'HANG HAI': 'MSB',
  
  // Ngân hàng Thương mại Cổ phần Quân đội
  'MB': 'MB',
  'MBBANK': 'MB',
  'MB BANK': 'MB',
  'QUAN DOI': 'MB',
  'MILITARY': 'MB',
  
  // Ngân hàng Thương mại Cổ phần Tiên Phong
  'TPB': 'TPB',
  'TPBANK': 'TPB',
  'TP BANK': 'TPB',
  'TIEN PHONG': 'TPB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'VPB': 'VPB',
  'VPBANK': 'VPB',
  'THINH VUONG': 'VPB',
  
  // Ngân hàng Thương mại Cổ phần Bắc Á
  'BAB': 'BAB',
  'NORTH ASIA': 'BAB',
  'BAC A': 'BAB',
  
  // Ngân hàng Thương mại Cổ phần Đông Nam Á
  'SEAB': 'SEAB',
  'DONG NAM A': 'SEAB',
  'SOUTHEAST ASIA': 'SEAB',
  
  // Ngân hàng Thương mại Cổ phần Phương Đông
  'OCB': 'OCB',
  'ORIENT COMMERCIAL': 'OCB',
  'PHUONG DONG': 'OCB',
  
  // Ngân hàng Thương mại Cổ phần An Bình
  'ABB': 'ABB',
  'AN BINH': 'ABB',
  'ANBINH': 'ABB',
  
  // Ngân hàng Thương mại Cổ phần Xuất Nhập khẩu Việt Nam
  'EIB': 'EIB',
  'EXIM': 'EIB',
  'XUAT NHAP KHAU': 'EIB',
  
  // Ngân hàng Thương mại Cổ phần Việt Á
  'VAB': 'VAB',
  'VIET A': 'VAB',
  'VIETABANK': 'VAB',
  
  // Ngân hàng Thương mại Cổ phần Nam Á
  'NAB': 'NAB',
  'NAM A': 'NAB',
  'NAMABANK': 'NAB',
  
  // Ngân hàng Thương mại Cổ phần Sài Gòn - Hà Nội
  'SHB': 'SHB',
  'SAI GON HA NOI': 'SHB',
  'SAHABANK': 'SHB',
  
  // Ngân hàng Thương mại Cổ phần Liên Việt
  'LVB': 'LVB',
  'LIENVIETBANK': 'LVB',
  'LIEN VIET': 'LVB',
  
  // Ngân hàng Thương mại Cổ phần Bản Việt
  'VCCB': 'VCCB',
  'BAN VIET': 'VCCB',
  'BANVIET': 'VCCB',
  
  // Ngân hàng Thương mại Cổ phần Đại Chúng Việt Nam
  'PVB': 'PVB',
  'PVCOMBANK': 'PVB',
  'DAI CHUNG': 'PVB',
  
  // Ngân hàng Thương mại Cổ phần Kiên Long
  'KLB': 'KLB',
  'KIEN LONG': 'KLB',
  'KIENLONGBANK': 'KLB',
  
  // Ngân hàng Thương mại Cổ phần Đại Dương
  'OCEANBANK': 'OCEANBANK',
  'DAI DUONG': 'OCEANBANK',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thương Tín
  'VIETBANK': 'VIETBANK',
  'THUONG TIN': 'VIETBANK',
  
  // Ngân hàng Thương mại Cổ phần Bưu điện Liên Việt
  'LPB': 'LPB',
  'LIEN VIET POST': 'LPB',
  'BUU DIEN LIEN VIET': 'LPB',
  
  // Ngân hàng Thương mại Cổ phần Đông Á
  'DONG A': 'DONGABANK',
  'DONGABANK': 'DONGABANK',
  'EAST ASIA': 'DONGABANK',
  
  // Ngân hàng Thương mại Cổ phần Sài Gòn Công Thương
  'SGICB': 'SGICB',
  'SAI GON CONG THUONG': 'SGICB',
  'SAIGONBANK': 'SGICB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Nhật Bản
  'VJB': 'VJB',
  'VIET NHAT': 'VJB',
  'VIETNAM JAPAN': 'VJB',
  
  // Ngân hàng Thương mại Cổ phần Bắc Hà
  'BAC HA': 'BAOVIETBANK',
  'BAOVIETBANK': 'BAOVIETBANK',
  'BAO VIET': 'BAOVIETBANK',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'VRB': 'VRB',
  'VIET RUNG': 'VRB',
  'VIETBANK': 'VRB',
  
  // Ngân hàng Thương mại Cổ phần Đại Tín
  'TRUST': 'TRUSTBANK',
  'TRUSTBANK': 'TRUSTBANK',
  'DAI TIN': 'TRUSTBANK',
  
  // Ngân hàng Thương mại Cổ phần Kỹ Thương
  'TECHBANK': 'TECHBANK',
  'KY THUONG': 'TECHBANK',
  
  // Ngân hàng Thương mại Cổ phần Hóa Chất
  'HDB': 'HDB',
  'HOA CHAT': 'HDB',
  'HD BANK': 'HDB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'OJB': 'OJB',
  'OJBANK': 'OJB',
  'OCEAN JAPAN': 'OJB',
  
  // Ngân hàng Thương mại Cổ phần Bảo Việt
  'BVB': 'BVB',
  'BAOVIET': 'BVB',
  'BAO VIET': 'BVB',
  
  // Ngân hàng Thương mại Cổ phần Đại Á
  'UOB': 'UOB',
  'UNITED OVERSEAS': 'UOB',
  'DAI A': 'UOB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'VIETBANK': 'VIETBANK',
  'THUONG TIN': 'VIETBANK',
  
  // Ngân hàng Thương mại Cổ phần Xây dựng
  'CBB': 'CBB',
  'CONSTRUCTION': 'CBB',
  'XAY DUNG': 'CBB',
  
  // Ngân hàng Thương mại Cổ phần Đại Chúng
  'PGB': 'PGB',
  'PGBANK': 'PGB',
  'PETROLIMEX': 'PGB',
  
  // Ngân hàng Thương mại Cổ phần Thái Bình Dương
  'PACIFIC': 'PACIFIC',
  'THAI BINH DUONG': 'PACIFIC',
  'PCBANK': 'PACIFIC',
  
  // Ngân hàng Thương mại Cổ phần Tài Chính Công Nghiệp Việt Nam
  'IVB': 'IVB',
  'INDOVINA': 'IVB',
  'CONG NGHIEP': 'IVB',
  
  // Ngân hàng Thương mại Cổ phần An Giang
  'AGB': 'AGB',
  'AN GIANG': 'AGB',
  'AGBANK': 'AGB',
  
  // Ngân hàng Thương mại Cổ phần Bình Minh
  'BDB': 'BDB',
  'BINH MINH': 'BDB',
  'BINH DINH': 'BDB',
  
  // Ngân hàng Thương mại Cổ phần Kinh Doanh
  'BEB': 'BEB',
  'KINH DOANH': 'BEB',
  'BUSINESS': 'BEB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'WVB': 'WVB',
  'WOORI': 'WVB',
  'WOORI VIETNAM': 'WVB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'SCB': 'SCB',
  'STANDARD CHARTERED': 'SCB',
  'TIEU CHUAN': 'SCB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'HSBC': 'HSBC',
  'HONG KONG SHANGHAI': 'HSBC',
  'HONG KONG': 'HSBC',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'CITI': 'CITI',
  'CITIBANK': 'CITI',
  'CITY': 'CITI',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'ANZ': 'ANZ',
  'AUSTRALIA NEW ZEALAND': 'ANZ',
  'UC': 'ANZ',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'SHBVN': 'SHBVN',
  'SHINHAN': 'SHBVN',
  'SHIN HAN': 'SHBVN',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'PUBLICBANK': 'PUBLICBANK',
  'PUBLIC': 'PUBLICBANK',
  'CONG CONG': 'PUBLICBANK',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'CIMB': 'CIMB',
  'CIMB VIETNAM': 'CIMB',
  'MALAYSIA': 'CIMB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'VBSP': 'VBSP',
  'CHINH SACH XA HOI': 'VBSP',
  'SOCIAL POLICY': 'VBSP',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'VBARD': 'VBARD',
  'PHAT TRIEN NONG NGHIEP': 'VBARD',
  'AGRICULTURE': 'VBARD',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'GPB': 'GPB',
  'GOVERNMENT': 'GPB',
  'CHINH PHU': 'GPB',
  
  // Ngân hàng Thương mại Cổ phần Việt Nam Thịnh Vượng
  'COOPBANK': 'COOPBANK',
  'COOPERATIVE': 'COOPBANK',
  'HOP TAC XA': 'COOPBANK'
};

/**
 * Hàm parse số tiền hỗ trợ nhiều định dạng Việt Nam
 * @param {string} amountStr - Chuỗi số tiền cần parse
 * @returns {number} - Số tiền đã parse hoặc NaN nếu không hợp lệ
 */
const parseVietnameseAmount = (amountStr) => {
  if (!amountStr || typeof amountStr !== 'string') {
    return NaN;
  }
  
  let cleanStr = amountStr.trim().toLowerCase();
  
  // Xóa các ký tự không cần thiết
  cleanStr = cleanStr.replace(/[vnđdongvnd]/g, '');
  cleanStr = cleanStr.replace(/\s+/g, '');
  
  // Kiểm tra số thuần túy (không có phân cách)
  if (/^\d+$/.test(cleanStr)) {
    return parseFloat(cleanStr);
  }
  
  // Kiểu Việt Nam: Dấu chấm phân cách hàng nghìn (55.000 = 55000)
  const vietnameseFormatRegex = /^\d{1,3}(\.\d{3})+$/;
  if (vietnameseFormatRegex.test(cleanStr)) {
    const numberStr = cleanStr.replace(/\./g, '');
    return parseFloat(numberStr);
  }
  
  // Kiểu Mỹ: Dấu phẩy phân cách hàng nghìn (1,234,567)
  const commaFormatRegex = /^\d{1,3}(,\d{3})*(\.\d+)?$/;
  if (commaFormatRegex.test(cleanStr)) {
    const numberStr = cleanStr.replace(/,/g, '');
    return parseFloat(numberStr);
  }
  
  // Kiểu châu Âu: Dấu chấm phân cách hàng nghìn + phần thập phân với phẩy (1.234.567,89)
  const europeanFormatRegex = /^\d{1,3}(\.\d{3})*,\d+$/;
  if (europeanFormatRegex.test(cleanStr)) {
    const numberStr = cleanStr.replace(/\./g, '').replace(',', '.');
    return parseFloat(numberStr);
  }
  
  // Kiểu số thập phân thuần túy (123456.78) - chỉ khi có ít hơn 3 chữ số sau dấu chấm
  if (/^\d+\.\d{1,2}$/.test(cleanStr)) {
    return parseFloat(cleanStr);
  }
  
  // Sử dụng parseNumberWithUnits cho các trường hợp có đơn vị (2tr, 500k, v.v.)
  const unitAmount = parseNumberWithUnits(amountStr);
  if (!isNaN(unitAmount)) {
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

/**
 * Phân tích thông tin chuyển khoản từ tin nhắn
 * Format linh hoạt:
 * - Có thể 3 hoặc 4 dòng
 * - Số tiền luôn là dòng cuối cùng
 * - Hỗ trợ nhiều format số tiền: 2.612.800, 2,612,800, 2tr6, v.v.
 * 
 * @param {string} message - Tin nhắn cần phân tích
 * @returns {Object|null} - Thông tin chuyển khoản hoặc null nếu không hợp lệ
 */
const parseTransferInfo = (message) => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  // Tách tin nhắn thành các dòng và loại bỏ dòng trống
  const lines = message.trim().split('\n').filter(line => line.trim());
  
  if (lines.length < 3) {
    return null;
  }

  // Số tiền luôn là dòng cuối cùng
  const amountStr = lines[lines.length - 1].trim();
  const amount = parseVietnameseAmount(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    return null;
  }

  let accountNumber, accountName, bankName, bankCode;

  if (lines.length === 3) {
    // Format 3 dòng: Tên + Ngân hàng + Số tài khoản hoặc Số tài khoản + Tên + Ngân hàng
    // Tìm dòng nào là số tài khoản
    let accountLineIndex = -1;
    for (let i = 0; i < 2; i++) {
      let cleanLine = lines[i].trim();
      // Xóa prefix nếu có
      cleanLine = cleanLine.replace(/^(卡号：|卡号:|Card No:|card no:|Account:|account:)/i, '').trim();
      cleanLine = cleanLine.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanLine)) {
        accountLineIndex = i;
        accountNumber = cleanLine;
        break;
      }
    }
    
    if (accountLineIndex === -1) {
      return null;
    }
    
    // Các dòng còn lại là tên và ngân hàng
    const remainingLines = lines.slice(0, 2).filter((_, index) => index !== accountLineIndex);
    
    // Tìm dòng nào là ngân hàng
    let bankLineIndex = -1;
    for (let i = 0; i < remainingLines.length; i++) {
      const normalizedLine = normalizeName(remainingLines[i]);
      if (BANK_MAPPING[normalizedLine]) {
        bankLineIndex = i;
        break;
      }
    }
    
    if (bankLineIndex === -1) {
      return null;
    }
    
    bankName = remainingLines[bankLineIndex].trim();
    bankCode = BANK_MAPPING[normalizeName(bankName)];
    
    // Dòng còn lại là tên - xóa prefix nếu có
    accountName = remainingLines.filter((_, index) => index !== bankLineIndex)[0]?.trim();
    if (accountName) {
      accountName = accountName.replace(/^(提款姓名：|提款姓名:|名字：|名字:|Tên:|tên:|Name:|name:)/i, '').trim();
    }
    
  } else if (lines.length === 4) {
    // Format 4 dòng: Linh hoạt - tự động detect thứ tự
    // Bỏ qua dòng cuối (số tiền)
    const infoLines = lines.slice(0, 3);
    
    // Tìm dòng số tài khoản
    let accountLineIndex = -1;
    for (let i = 0; i < infoLines.length; i++) {
      let cleanLine = infoLines[i].trim();
      // Xóa prefix nếu có
      cleanLine = cleanLine.replace(/^(卡号：|卡号:|Card No:|card no:|Account:|account:)/i, '').trim();
      cleanLine = cleanLine.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanLine)) {
        accountLineIndex = i;
        accountNumber = cleanLine;
        break;
      }
    }
    
    if (accountLineIndex === -1) {
      return null;
    }
    
    // Tìm dòng ngân hàng trong các dòng còn lại
    const remainingLines = infoLines.filter((_, index) => index !== accountLineIndex);
    let bankLineIndex = -1;
    
    for (let i = 0; i < remainingLines.length; i++) {
      let cleanBankName = remainingLines[i].trim();
      
      // Xóa các prefix phổ biến
      cleanBankName = cleanBankName.replace(/^(银行：|银行:|Bank:|bank:|ngân hàng:|Ngân hàng:)/i, '').trim();
      
      const normalizedBank = normalizeName(cleanBankName);
      if (BANK_MAPPING[normalizedBank]) {
        bankLineIndex = i;
        bankName = cleanBankName;
        bankCode = BANK_MAPPING[normalizedBank];
        break;
      }
    }
    
    if (bankLineIndex === -1) {
      return null;
    }
    
    // Dòng còn lại là tên - xóa prefix nếu có
    accountName = remainingLines.filter((_, index) => index !== bankLineIndex)[0]?.trim();
    if (accountName) {
      accountName = accountName.replace(/^(提款姓名：|提款姓名:|名字：|名字:|Tên:|tên:|Name:|name:)/i, '').trim();
    }
    
  } else {
    // Format khác không được hỗ trợ
    return null;
  }

  // Validate tên chủ tài khoản
  if (!accountName || accountName.length < 2) {
    return null;
  }

  // Validate tên chỉ chứa chữ cái, dấu cách và một số ký tự đặc biệt
  if (!/^[a-zA-ZÀ-ỹ\s\.-]+$/.test(accountName)) {
    return null;
  }

  return {
    accountNumber,
    accountName,
    bankName,
    bankCode,
    amount
  };
};

/**
 * Tạo URL VietQR
 * @param {Object} transferInfo - Thông tin chuyển khoản
 * @param {string} transferInfo.bankCode - Mã ngân hàng
 * @param {string} transferInfo.accountNumber - Số tài khoản
 * @param {string} transferInfo.accountName - Tên chủ tài khoản
 * @param {number} transferInfo.amount - Số tiền
 * @param {string} [remark=''] - Ghi chú chuyển khoản
 * @returns {string} - URL VietQR
 */
const generateVietQRUrl = (transferInfo, remark = '') => {
  const { bankCode, accountNumber, accountName, amount } = transferInfo;
  
  // Encode tên chủ tài khoản để tránh lỗi URL
  const encodedAccountName = encodeURIComponent(accountName);
  const encodedRemark = encodeURIComponent(remark);
  
  // Tạo URL VietQR
  const baseUrl = 'https://img.vietqr.io/image';
  const url = `${baseUrl}/${bankCode}-${accountNumber}-compact2.jpg?amount=${amount}&addInfo=${encodedRemark}&accountName=${encodedAccountName}`;
  
  return url;
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
 * @param {string} [remark=''] - Ghi chú chuyển khoản
 * @returns {Object} - Object chứa URL ảnh và caption
 */
const generateQRResponse = (transferInfo, remark = '') => {
  const { accountNumber, accountName, bankName, amount } = transferInfo;
  const qrUrl = generateVietQRUrl(transferInfo, remark);
  
  // Format số tiền với dấu phẩy
  const formattedAmount = amount.toLocaleString('vi-VN');
  
  const caption = `🏦 **Thông tin chuyển khoản**
  
📋 **Số tài khoản:** ${accountNumber}
👤 **Tên chủ tài khoản:** ${accountName}
🏛️ **Ngân hàng:** ${bankName}
💰 **Số tiền:** ${formattedAmount} VNĐ
${remark ? `📝 **Ghi chú:** ${remark}` : ''}

📱 **QR Code chuyển khoản**`;

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