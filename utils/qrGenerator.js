const { parseNumberWithUnits } = require('./formatter');

/**
 * Mapping tên ngân hàng Việt Nam - từ tên đầy đủ/viết tắt sang mã code VietQR
 * Cập nhật theo danh sách chính thức từ VietQR API
 */
const BANK_MAPPING = {
  // Ngân hàng TMCP Công thương Việt Nam (VietinBank) - 970415
  'ICB': '970415',
  'VIETINBANK': '970415',
  'VIETIN BANK': '970415',
  'VIETIN': '970415',
  'VIETTIN': '970415',
  'CONG THUONG': '970415',
  'VTB': '970415',
  
  // Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - 970436
  'VCB': '970436',
  'VIETCOMBANK': '970436',
  'VIET COM BANK': '970436',
  'VIETCOM': '970436',
  'NGOAI THUONG': '970436',
  
  // Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) - 970418
  'BIDV': '970418',
  'BID': '970418',
  'DAU TU PHAT TRIEN': '970418',
  
  // Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam (Agribank) - 970405
  'VBA': '970405',
  'AGRIBANK': '970405',
  'AGRI BANK': '970405',
  'AGRI': '970405',
  'NONG NGHIEP PHAT TRIEN NONG THON': '970405',
  
  // Ngân hàng TMCP Phương Đông (OCB) - 970448
  'OCB': '970448',
  'ORIENT COMMERCIAL': '970448',
  'PHUONG DONG': '970448',
  
  // Ngân hàng TMCP Quân đội (MBBank) - 970422
  'MB': '970422',
  'MBBANK': '970422',
  'MB BANK': '970422',
  'MBB': '970422',
  'QUAN DOI': '970422',
  'MILITARY': '970422',
  
  // Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank) - 970407
  'TCB': '970407',
  'TECHCOMBANK': '970407',
  'TECH COM BANK': '970407',
  'TECH': '970407',
  'KY THUONG': '970407',
  
  // Ngân hàng TMCP Á Châu (ACB) - 970416
  'ACB': '970416',
  'A CHAU': '970416',
  'ASIA COMMERCIAL': '970416',
  
  // Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank) - 970432
  'VPB': '970432',
  'VPBANK': '970432',
  'VP BANK': '970432',
  'VP': '970432',
  'THINH VUONG': '970432',
  
  // Ngân hàng TMCP Tiên Phong (TPBank) - 970423
  'TPB': '970423',
  'TPBANK': '970423',
  'TP BANK': '970423',
  'TP': '970423',
  'TIEN PHONG': '970423',
  
  // Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank) - 970403
  'STB': '970403',
  'SACOMBANK': '970403',
  'SACOM BANK': '970403',
  'SACOM': '970403',
  'SAI GON THUONG TIN': '970403',
  
  // Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh (HDBank) - 970437
  'HDB': '970437',
  'HDBANK': '970437',
  'HD BANK': '970437',
  'HD': '970437',
  'HOA CHAT': '970437',
  
  // Ngân hàng TMCP Bản Việt (VietCapitalBank) - 970454
  'VCCB': '970454',
  'BAN VIET': '970454',
  'BANVIET': '970454',
  'VIETCAPITALBANK': '970454',
  'BVBank': '970454',
  
  // Ngân hàng TMCP Sài Gòn (SCB) - 970429
  'SCB': '970429',
  'SAI GON': '970429',  
  'SGBANK': '970429',
  'SGB': '970429',
  // Ngân hàng TMCP Quốc tế Việt Nam (VIB) - 970441
  'VIB': '970441',
  'VIET INTERNATIONAL': '970441',
  'QUOC TE': '970441',
  
  // Ngân hàng TMCP Sài Gòn - Hà Nội (SHB) - 970443
  'SHB': '970443',
  'SAI GON HA NOI': '970443',
  'SAHABANK': '970443',
  
  // Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (Eximbank) - 970431
  'EIB': '970431',
  'EXIM': '970431',
  'XUAT NHAP KHAU': '970431',
  'EXIMBANK': '970431',
  
  // Ngân hàng TMCP Hàng Hải (MSB) - 970426
  'MSB': '970426',
  'MARITIME BANK': '970426',
  'HANG HAI': '970426',
  
  // TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank - 546034
  'CAKE': '546034',
  'CAKE BANK': '546034',
  'CAKE DIGITAL': '546034',
  'CAKE DIGITAL BANK': '546034',
  'CAKE BY VPBANK': '546034',
  
  // TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank - 546035
  'UBANK': '546035',
  'U BANK': '546035',
  'UBANK DIGITAL': '546035',
  'UBANK BY VPBANK': '546035',
  
  // Ngân hàng số Timo by Ban Viet Bank - 963388
  'TIMO': '963388',
  'TIMO DIGITAL': '963388',
  'TIMO DIGITAL BANK': '963388',
  'TIMO BANK': '963388',
  
  // Tổng Công ty Dịch vụ số Viettel - 971005
  'VIETTELMONEY': '971005',
  'VIETTEL MONEY': '971005',
  'VIETTEL': '971005',
  
  // VNPT Money - 971011
  'VNPTMONEY': '971011',
  'VNPT MONEY': '971011',
  'VNPT': '971011',
  
  // Ngân hàng TMCP Sài Gòn Công Thương (SaigonBank) - 970400
  'SGICB': '970400',
  'SAI GON CONG THUONG': '970400',
  'SAIGONBANK': '970400',
  
  // Ngân hàng TMCP Bắc Á (BacABank) - 970409
  'BAB': '970409',
  'NORTH ASIA': '970409',
  'BAC A': '970409',
  'BACABANK': '970409',
  
  // Ngân hàng TMCP Đại Chúng Việt Nam (PVcomBank) - 970412
  'PVCB': '970412',
  'PVCOMBANK': '970412',
  'DAI CHUNG': '970412',
  'PVB': '970412',
  
  // Ngân hàng Thương mại TNHH MTV Đại Dương (Oceanbank) - 970414
  'OCEANBANK': '970414',
  'DAI DUONG': '970414',
  
  // Ngân hàng TMCP Quốc Dân (NCB) - 970419
  'NCB': '970419',
  'QUOC DAN': '970419',
  
  // Ngân hàng TNHH MTV Shinhan Việt Nam (ShinhanBank) - 970424
  'SHBVN': '970424',
  'SHINHAN': '970424',
  'SHIN HAN': '970424',
  'SHINHANBANK': '970424',
  
  // Ngân hàng TMCP An Bình (ABBANK) - 970425
  'ABB': '970425',
  'ABBANK': '970425',
  'AB BANK': '970425',
  'AN BINH': '970425',
  'ANBINH': '970425',
  
  // Ngân hàng TMCP Việt Á (VietABank) - 970427
  'VAB': '970427',
  'VIET A': '970427',
  'VIETABANK': '970427',
  
  // Ngân hàng TMCP Nam Á (NamABank) - 970428
  'NAB': '970428',
  'NAM A': '970428',
  'NAMABANK': '970428',
  
  // Ngân hàng TMCP Xăng dầu Petrolimex (PGBank) - 970430
  'PGB': '970430',
  'PGBANK': '970430',
  'PETROLIMEX': '970430',
  
  // Ngân hàng TMCP Việt Nam Thương Tín (VietBank) - 970433
  'VIETBANK': '970433',
  'THUONG TIN': '970433',
  
  // Ngân hàng TMCP Bảo Việt (BaoVietBank) - 970438
  'BVB': '970438',
  'BAOVIET': '970438',
  'BAO VIET': '970438',
  'BAOVIETBANK': '970438',
  
  // Ngân hàng TMCP Đông Nam Á (SeABank) - 970440
  'SEAB': '970440',
  'DONG NAM A': '970440',
  'SOUTHEAST ASIA': '970440',
  'SEABANK': '970440',
  
  // Ngân hàng Hợp tác xã Việt Nam (COOPBANK) - 970446
  'COOPBANK': '970446',
  'COOPERATIVE': '970446',
  'HOP TAC XA': '970446',
  
  // Ngân hàng TMCP Bưu Điện Liên Việt (LienVietPostBank) - 970449
  'LPB': '970449',
  'LPBANK': '970449',
  'LP BANK': '970449',
  'LIEN VIET POST': '970449',
  'LIEN VIET POST BANK': '970449',
  'LIENVIETPOSTBANK': '970449',
  'BUU DIEN LIEN VIET': '970449',
  
  // Ngân hàng TMCP Kiên Long (KienLongBank) - 970452
  'KLB': '970452',
  'KIEN LONG': '970452',
  'KIENLONGBANK': '970452',
  
  // Ngân hàng Đại chúng TNHH Kasikornbank (KBank) - 668888
  'KBANK': '668888',
  'KASIKORNBANK': '668888',
  'KASIKORN': '668888',
  
  // Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh (UnitedOverseas) - 970458
  'UOB': '970458',
  'UNITED OVERSEAS': '970458',
  'DAI A': '970458',
  
  // Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam (StandardChartered) - 970410
  'SCVN': '970410',
  'STANDARD CHARTERED': '970410',
  'TIEU CHUAN': '970410',
  
  // Ngân hàng TNHH MTV Public Việt Nam (PublicBank) - 970439
  'PBVN': '970439',
  'PUBLIC': '970439',
  'CONG CONG': '970439',
  'PUBLICBANK': '970439',
  
  // Ngân hàng Nonghyup - Chi nhánh Hà Nội (Nonghyup) - 801011
  'NHB': '801011',
  'NONGHYUP': '801011',
  'NONG HYUP': '801011',
  
  // Ngân hàng TNHH Indovina (IndovinaBank) - 970434
  'IVB': '970434',
  'INDOVINA': '970434',
  'CONG NGHIEP': '970434',
  'INDOVINABANK': '970434',
  
  // Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh TP. Hồ Chí Minh (IBKHCM) - 970456
  'IBKHCM': '970456',
  'IBK HCM': '970456',
  'INDUSTRIAL BANK KOREA HCM': '970456',
  
  // Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội (IBKHN) - 970455
  'IBKHN': '970455',
  'IBK HN': '970455',
  'INDUSTRIAL BANK KOREA HN': '970455',
  
  // Ngân hàng Liên doanh Việt - Nga (VRB) - 970421
  'VRB': '970421',
  'VIET RUNG': '970421',
  'VIET RUSSIA': '970421',
  
  // Ngân hàng TNHH MTV Woori Việt Nam (Woori) - 970457
  'WVN': '970457',
  'WOORI': '970457',
  'WOORI VIETNAM': '970457',
  
  // Ngân hàng Kookmin - Chi nhánh Hà Nội (KookminHN) - 970462
  'KBHN': '970462',
  'KOOKMIN HN': '970462',
  'KOOKMIN HANOI': '970462',
  
  // Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh (KookminHCM) - 970463
  'KBHCM': '970463',
  'KOOKMIN HCM': '970463',
  'KOOKMIN HO CHI MINH': '970463',
  
  // Ngân hàng TNHH MTV HSBC (Việt Nam) (HSBC) - 458761
  'HSBC': '458761',
  'HONG KONG SHANGHAI': '458761',
  'HONG KONG': '458761',
  
  // Ngân hàng TNHH MTV Hong Leong Việt Nam (HongLeong) - 970442
  'HLBVN': '970442',
  'HONG LEONG': '970442',
  'HONG LEONG VIETNAM': '970442',
  
  // Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu (GPBank) - 970408
  'GPB': '970408',
  'GOVERNMENT': '970408',
  'CHINH PHU': '970408',
  'DAU KHI TOAN CAU': '970408',
  
  // Ngân hàng TMCP Đông Á (DongABank) - 970406
  'DOB': '970406',
  'DONG A': '970406',
  'DONGABANK': '970406',
  'EAST ASIA': '970406',
  
  // DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh (DBSBank) - 796500
  'DBS': '796500',
  'DBS BANK': '796500',
  'DEVELOPMENT BANK SINGAPORE': '796500',
  
  // Ngân hàng TNHH MTV CIMB Việt Nam (CIMB) - 422589
  'CIMB': '422589',
  'CIMB VIETNAM': '422589',
  'MALAYSIA': '422589',
  
  // Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam (CBBank) - 970444
  'CBB': '970444',
  'CONSTRUCTION': '970444',
  'XAY DUNG': '970444',
  'CBBANK': '970444',
  
  // Ngân hàng Citibank, N.A. - Chi nhánh Hà Nội (Citibank) - 533948
  'CITIBANK': '533948',
  'CITI': '533948',
  'CITY': '533948',
  
  // Ngân hàng KEB Hana – Chi nhánh Thành phố Hồ Chí Minh (KEBHanaHCM) - 970466
  'KEBHANAHCM': '970466',
  'KEB HANA HCM': '970466',
  'KEB HANA HO CHI MINH': '970466',
  
  // Ngân hàng KEB Hana – Chi nhánh Hà Nội (KEBHANAHN) - 970467
  'KEBHANAHN': '970467',
  'KEB HANA HN': '970467',
  'KEB HANA HANOI': '970467',
  
  // Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam) (MAFC) - 977777
  'MAFC': '977777',
  'MIRAE ASSET': '977777',
  'MIRAE ASSET FINANCE': '977777',
  
  // Ngân hàng Chính sách Xã hội (VBSP) - 999888
  'VBSP': '999888',
  'CHINH SACH XA HOI': '999888',
  'SOCIAL POLICY': '999888',
  
  // Ngân hàng TNHH MTV Số Vikki (Vikki) - 970406
  'VIKKI': '970406',
  'VIKKI DIGITAL': '970406',
  'VIKKI DIGITAL BANK': '970406',
  'VIKKI BANK': '970406'
};

// Removed Sepay integration - only using VietQR now

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
 * - Hỗ trợ 3-5 dòng với thứ tự có thể đảo lộn
 * - Tự động nhận diện: số tài khoản, tên, ngân hàng, số tiền, ghi chú
 * - Hỗ trợ nhiều format số tiền: 7,437,793, 2.612.800, 2tr6, v.v.
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

  let accountNumber = null;
  let accountName = null;
  let bankName = null;
  let bankCode = null;
  let amount = null;
  let remark = '';

  // Bước 1: Tìm số tài khoản (chỉ chứa số)
  for (let i = 0; i < lines.length; i++) {
      let cleanLine = lines[i].trim();
      // Xóa prefix nếu có
      cleanLine = cleanLine.replace(/^(卡号：|卡号:|Card No:|card no:|Account:|account:)/i, '').trim();
      cleanLine = cleanLine.replace(/\s+/g, '');
      if (/^\d+$/.test(cleanLine)) {
        accountNumber = cleanLine;
        break;
      }
    }
    
  if (!accountNumber) {
      return null;
    }
    
  // Bước 2: Tìm ngân hàng
  for (let i = 0; i < lines.length; i++) {
    let cleanBankName = lines[i].trim();
    
    // Xóa các prefix phổ biến
    cleanBankName = cleanBankName.replace(/^(银行：|银行:|Bank:|bank:|ngân hàng:|Ngân hàng:)/i, '').trim();
    
    const normalizedBank = normalizeName(cleanBankName);
    if (BANK_MAPPING[normalizedBank]) {
      bankName = cleanBankName;
      bankCode = BANK_MAPPING[normalizedBank];
        break;
      }
    }
    
  if (!bankName || !bankCode) {
      return null;
    }
    
  // Bước 3: Tìm số tiền (ưu tiên dòng có dấu phân cách hoặc đơn vị)
  for (let i = 0; i < lines.length; i++) {
    const amountStr = lines[i].trim();
    
    // Kiểm tra xem có phải số tiền không (có dấu phẩy, chấm, hoặc đơn vị)
    if (amountStr.includes(',') || amountStr.includes('.') || 
        /[trkkmb]/.test(amountStr.toLowerCase()) || 
        /[vnđdong]/.test(amountStr.toLowerCase())) {
      const parsedAmount = parseVietnameseAmount(amountStr);
      
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        amount = parsedAmount;
        break;
      }
    }
  }
  
  // Nếu chưa tìm thấy số tiền, tìm dòng chỉ chứa số (nhưng không phải số tài khoản)
  if (!amount) {
    for (let i = 0; i < lines.length; i++) {
      const amountStr = lines[i].trim();
      
      // Bỏ qua nếu là số tài khoản
      if (amountStr === accountNumber) {
        continue;
      }
      
      // Kiểm tra xem có phải số thuần túy không
      if (/^\d+$/.test(amountStr)) {
        const parsedAmount = parseFloat(amountStr);
        if (parsedAmount > 0) {
          amount = parsedAmount;
          break;
        }
      }
    }
  }

  if (!amount) {
    return null;
  }

  // Bước 4: Tìm tên chủ tài khoản (dòng còn lại không phải số tài khoản, ngân hàng, số tiền)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Bỏ qua nếu là số tài khoản, ngân hàng, hoặc số tiền
    if (line === accountNumber || line === bankName) {
      continue;
    }
    
    // Kiểm tra xem có phải số tiền không
    const parsedAmount = parseVietnameseAmount(line);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      continue;
    }
    
    // Kiểm tra xem có phải tên hợp lệ không (chứa chữ cái)
    if (/^[a-zA-ZÀ-ỹ\s\.-]+$/.test(line) && line.length >= 2) {
      // Xóa prefix nếu có
      accountName = line.replace(/^(提款姓名：|提款姓名:|名字：|名字:|Tên:|tên:|Name:|name:)/i, '').trim();
        break;
      }
    }
    
  if (!accountName) {
      return null;
    }
    
  // Bước 5: Tìm ghi chú (nếu có) - dòng còn lại không phải các thông tin trên
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Bỏ qua nếu là thông tin đã xác định
    if (line === accountNumber || line === bankName || line === accountName) {
      continue;
    }
    
    // Kiểm tra xem có phải số tiền không
    const parsedAmount = parseVietnameseAmount(line);
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      continue;
    }
    
    // Nếu không phải thông tin đã xác định và không phải số tiền, có thể là ghi chú
    if (line.length > 0) {
      remark = line;
      break;
    }
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
  
  // Sử dụng VietQR API cho tất cả ngân hàng
    const encodedAccountName = encodeURIComponent(accountName);
    const encodedRemark = encodeURIComponent(remark);
    
    const baseUrl = 'https://img.vietqr.io/image';
    return `${baseUrl}/${bankCode}-${accountNumber}-compact2.jpg?amount=${amount}&addInfo=${encodedRemark}&accountName=${encodedAccountName}`;
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