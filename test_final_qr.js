const { parseTransferInfo, generateQRResponse } = require('./utils/qrGenerator');

console.log('=== TEST FINAL QR FORMATS ===\n');

const tests = [
  // Format mới - withdrawal name + card number
  {
    name: 'Format mới - 提款姓名 + 卡号',
    input: `提款姓名：LE TANG BAO TRAN
银行：VietinBank
卡号：107871315321
6.090.038`
  },
  
  // Format trước - 名字 + account number
  {
    name: 'Format trước - 名字 + account number',
    input: `名字：Phạm Văn Giáo
银行：Vcb
1024088941
2.614.800`
  },
  
  // Format cũ - standard
  {
    name: 'Format cũ - standard',
    input: `452242005
Trang Kim Bình
MB Bank
2.612.800`
  },
  
  // Format với prefix khác
  {
    name: 'Format với prefix khác',
    input: `Name: John Doe
Bank: VCB
Card No: 1111111111
1.000.000`
  },
  
  // Format 3 dòng
  {
    name: 'Format 3 dòng',
    input: `Tên: Nguyễn Văn A
VTB
987654321
500.000`
  },

  // Nhãn ZH + dấu ； (semicolon fullwidth) + 下发
  {
    name: 'KV tiếng Trung — dấu ； + 下发',
    input: `银行；VietinBank
名字；NGUYEN THI YEN
账号；100873099874
下发；8693750vnd`
  },

  // Nhãn ZH + số tiền có VND (plan)
  {
    name: 'KV tiếng Trung — 账号 / 金额',
    input: `账号 : 0336157167
银行名称 : VietinBank
持卡人姓名 : NGUYEN VAN A
金额 : 810,000 vnd`
  },

  // KV đủ STK + bank + tên, không số tiền → amount 0, URL không gắn amount
  {
    name: 'KV thiếu amount',
    input: `stk: 0123456789
ngân hàng: VCB
tên: TRAN THI TEST`
  },

  // Nhãn cách khoảng (không dấu :) — tránh nhầm STK với dòng số tiền dài hơn
  {
    name: 'stk / ten / bank + số dòng — không đảo STK và tiền',
    input: `stk 2349785
ten Ha van tien
bidv
12000000
5623`
  },

  // Một dòng: số tiền + nội dung (không được làm amount=0 vì replace chữ n trong câu)
  {
    name: 'Số tiền ghép nội dung trên cùng dòng',
    input: `stk 103006887134
ten HA THI PHO RIN
nh VietinBank
798.000 vnd HTTH chuyen tien`
  },

  // Dòng đầu "1" bỏ qua; STK trước; số tiền là dòng số dưới STK
  {
    name: 'Format số thứ tự + STK + bank + tiền dưới STK',
    input: `1
Tran Hoai Chau
060937320889
Sacombank
335223504`
  }
];

tests.forEach((test, i) => {
  console.log(`${i + 1}. ${test.name}:`);
  console.log('Input:', test.input.replace(/\n/g, ' | '));
  
  const result = parseTransferInfo(test.input);
  
  if (result) {
    console.log('✅ PARSE SUCCESS');
    console.log('  - Account:', result.accountNumber);
    console.log('  - Name:', result.accountName);
    console.log('  - Bank:', result.bankName, `(${result.bankCode})`);
    console.log('  - Amount:', result.amount.toLocaleString());
    
    // Test QR generation
    const qr = generateQRResponse(result);
    console.log('  - QR Generated:', qr.photo ? '✅ YES' : '❌ NO');
    
  } else {
    console.log('❌ PARSE FAILED');
  }
  
  console.log('');
});

console.log('=== KẾT THÚC TEST ==='); 