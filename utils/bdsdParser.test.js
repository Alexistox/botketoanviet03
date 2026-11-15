const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseBdsdProfile,
  redactBdsdContent,
  commandsFromCsv,
  commandsFromNotificationText,
  transactionsFromVision,
  buildBdsdCommands
} = require('./bdsdParser');

const profile = parseBdsdProfile('/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321');

const csvHeader = 'ID,Ngân hàng,Tài khoản,Chủ tài khoản,Tài khoản ảo,Thời gian,Loại giao dịch,Tiền,Luỹ kế,Nội dung,Mã thanh toán,Mã tham chiếu,Người chuyển';

test('parse profile giữ tên nhiều chữ', () => {
  assert.deepEqual(profile, {
    phone: '0363392845',
    password: 'Abc112112@',
    name: 'DO DUY NHUAN',
    stk: '26754321'
  });
});

test('che mật khẩu trong nội dung /bdsd', () => {
  assert.equal(
    redactBdsdContent('/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321'),
    '/bdsd 0363392845 *** DO DUY NHUAN 26754321'
  );
  assert.equal(redactBdsdContent('/bdsd'), '/bdsd');
});

test('CSV tiền vào gắn đủ ngày giờ phút giây', () => {
  const csv = [
    csvHeader,
    '1,ACB,28733921,VU VAN LONG,,15/11/2026 10:56:38,Tiền vào,15000,0,IB LUONG VAN NAM CHUYEN KHOAN,,2571,28830381'
  ].join('\n');

  assert.deepEqual(commandsFromCsv(profile, `\uFEFF${csv}`), [
    '/bdsd 0363392845 Abc112112@ VU VAN LONG 28733921 15000 GD: IB LUONG VAN NAM CHUYEN KHOAN 151126-10:56:38'
  ]);
});

test('CSV tiền ra không có người nhận thì dùng tên và STK đã nhập', () => {
  const csv = [
    csvHeader,
    '1,ACB,28733921,VU VAN LONG,,15/11/2026 10:57:21,Tiền ra,50000,0,IB VU VAN LONG CHUYEN KHOAN,,2572,28733921'
  ].join('\n');

  assert.deepEqual(commandsFromCsv(profile, csv), [
    '/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321 50000 GD: IB VU VAN LONG CHUYEN KHOAN 151126-10:57:21'
  ]);
});

test('CSV giữ nội dung có dấu phẩy và không gắn thêm mốc giờ đã có sẵn', () => {
  const csv = [
    csvHeader,
    '1,ACB,28733921,VU VAN LONG,,15/11/2026 10:30:50,Tiền vào,10020000,0,"chuyen tien QR hoan tra mua ho GD 6319TPBVI2ZNVL9W 151126-10:30:49",,2568,11665158888'
  ].join('\n');

  assert.deepEqual(commandsFromCsv(profile, csv), [
    '/bdsd 0363392845 Abc112112@ VU VAN LONG 28733921 10020000 GD: chuyen tien QR hoan tra mua ho GD 6319TPBVI2ZNVL9W 151126-10:30:49'
  ]);
});

test('ảnh thông báo: tiền ra đổi sang người nhận, tiền vào lấy chủ TK cùng số tài khoản', () => {
  const text = [
    '18:25 - 14/11/2026',
    'Thong bao thay doi so du tai khoan',
    'ACB: TK 28733921(VND) - 55,000,000 luc',
    '18:25 14/11/2026. So du 4,018,775. GD: CK',
    'cho TK 26754321_DO DUY NHUAN, IB VU VAN',
    'LONG CHUYEN KHOAN TRA TT',
    '18:23 - 14/11/2026',
    'Thong bao thay doi so du tai khoan',
    'ACB: TK 28733921(VND) + 49,600,000 luc',
    '18:23 14/11/2026. So du 59,018,775. GD: Le',
    'Trung Son chuyen tien GD 6318IBT1fJ8FYUPK',
    '141126-18:23:28',
    '18:20 - 14/11/2026',
    'Thong bao thay doi so du tai khoan'
  ].join('\n');

  assert.deepEqual(buildBdsdCommands(profile, transactionsFromVision([
    {
      direction: 'out',
      amount: '55,000,000',
      accountNumber: '28733921(VND)',
      accountName: null,
      content: 'CK cho TK 26754321_DO DUY NHUAN, IB VU VAN LONG CHUYEN KHOAN TRA TT',
      recipientName: 'DO DUY NHUAN',
      recipientAccount: '26754321',
      datetime: '14/11/2026 18:25'
    }
  ])), [
    '/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321 55000000 GD: CK cho TK 26754321_DO DUY NHUAN, IB VU VAN LONG CHUYEN KHOAN TRA TT 141126-18:25:00'
  ]);

  assert.deepEqual(commandsFromNotificationText(profile, text), [
    '/bdsd 0363392845 Abc112112@ DO DUY NHUAN 26754321 55000000 GD: CK cho TK 26754321_DO DUY NHUAN, IB VU VAN LONG CHUYEN KHOAN TRA TT 141126-18:25:00',
    '/bdsd 0363392845 Abc112112@ VU VAN LONG 28733921 49600000 GD: Le Trung Son chuyen tien GD 6318IBT1fJ8FYUPK 141126-18:23:28'
  ]);
});
