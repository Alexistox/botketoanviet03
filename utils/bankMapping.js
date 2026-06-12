/**
 * Mapping tên ngân hàng → mã bin VietQR + tra cứu có chuẩn hóa dấu/khoảng/lỗi gõ.
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
  'VIET IN BANK': '970415',
  'VIETIN-BANK': '970415',
  'VIETINBANK VN': '970415',
  'NH VIETINBANK': '970415',
  
  // Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - 970436
  'VCB': '970436',
  'VIETCOMBANK': '970436',
  'VIET COM BANK': '970436',
  'VIETCOM': '970436',
  'NGOAI THUONG': '970436',
  'VIETCOM BANK': '970436',
  'VCBANK': '970436',
  'VIETCOMBANK VN': '970436',
  'NH NGOAI THUONG': '970436',
  
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
  'MB BANK VN': '970422',
  'QUAN DOI BANK': '970422',
  
  // Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank) - 970407
  'TCB': '970407',
  'TECHCOMBANK': '970407',
  'TECH COM BANK': '970407',
  'TECH': '970407',
  'KY THUONG': '970407',
  'TECHCOM BANK': '970407',
  'TC BANK': '970407',
  
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
  'BVB': '970454',
  
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

/**
 * Chuẩn hóa tên ngân hàng: bỏ dấu tiếng Việt, in hoa, gộp khoảng trắng.
 */
const normalizeBankName = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .trim()
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


/** Alias lỗi chính tả / viết tắt lạ → mã VietQR (key đã normalize: không dấu, space đơn) */
const BANK_EXTRA_ALIASES = {
  'BVBANK': '970454',
  'BANVIETBANK': '970454',
  'VIETCOMBAN': '970436',
  'VIETCOMM': '970436',
  'VCBNK': '970436',
  'VIETINBNK': '970415',
  'VIETTINBANK': '970415',
  'TECHCOMBNK': '970407',
  'TECkCOM': '970407',
  'TECKCOMbank': '970407',
  'TECHCOMBANKK': '970407',
  'MBBANKK': '970422',
  'MBANK': '970422',
  'SACOMB': '970403',
  'SACOMBANKK': '970403',
  'AGRIB': '970405',
  'BIDVBANK': '970418',
  'TPBANKK': '970423',
  'HDBANKK': '970437',
  'ACBBANK': '970416',
  'VPBANKK': '970432',
  'EXIMBANKK': '970431',
  'SHBBANK': '970443',
  'SEABANKK': '970440',
  'PVCOMBANKK': '970412',
  'ABBANKK': '970425',
  'NAMABANKK': '970428',
  'KIENLONGBANKK': '970452',
  'LPBANKK': '970449',
  'LIENVIET': '970449',
  'WOORIBANK': '970457',
  'SHINHANBANKK': '970424',
  'STANDARDCHARTERED': '970410',
  'STANCHART': '970410',
  'UOBANK': '970458',
  'CITIBANKK': '533948',
  'HONGLEONG': '970442',
  'PUBLICBANKK': '970439'
};

const compactNoSpace = (s) => s.replace(/\s+/g, '');

/**
 * Tra mã ngân hàng VietQR: chuẩn hóa dấu/khoảng, khớp key có/không space, alias lỗi gõ.
 * @returns {{ bankCode: string, matchedKey: string } | null}
 */
const findBankCode = (rawInput) => {
  if (rawInput == null || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const tryKeys = (normKey) => {
    if (!normKey) return null;
    if (BANK_MAPPING[normKey]) return { bankCode: BANK_MAPPING[normKey], matchedKey: normKey };
    if (BANK_EXTRA_ALIASES[normKey]) return { bankCode: BANK_EXTRA_ALIASES[normKey], matchedKey: normKey };
    const c = compactNoSpace(normKey);
    if (BANK_MAPPING[c]) return { bankCode: BANK_MAPPING[c], matchedKey: c };
    if (BANK_EXTRA_ALIASES[c]) return { bankCode: BANK_EXTRA_ALIASES[c], matchedKey: c };
    for (const [k, code] of Object.entries(BANK_MAPPING)) {
      if (compactNoSpace(k) === c) return { bankCode: code, matchedKey: k };
    }
    return null;
  };

  const norm = normalizeBankName(trimmed);
  let hit = tryKeys(norm);
  if (hit) return hit;

  const punctNorm = normalizeBankName(trimmed.replace(/[.\-_/]+/g, ' '));
  if (punctNorm !== norm) {
    hit = tryKeys(punctNorm);
    if (hit) return hit;
  }

  const compIn = compactNoSpace(norm);
  if (compIn.length >= 6) {
    let best = null;
    let bestKeyLen = 0;
    for (const [k, code] of Object.entries(BANK_MAPPING)) {
      const ck = compactNoSpace(normalizeBankName(k));
      if (ck.length < 6) continue;
      if (compIn.includes(ck) && ck.length > bestKeyLen) {
        best = { bankCode: code, matchedKey: k };
        bestKeyLen = ck.length;
      }
    }
    if (best) return best;
  }

  return null;
};

module.exports = {
  BANK_MAPPING,
  BANK_EXTRA_ALIASES,
  normalizeBankName,
  findBankCode
};
