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
  },

  {
    name: 'Nhãn ghép Việt–Trung',
    input: `Ngân hàng 银行：MB bank
Số tài khoản 账号 ： 556789866666
Tên chủ tài khoản 姓名： Lưu Thị Thúy Thanh
出款金额： 39.483.000 VND
转账内容：  NAPAS 247`,
    expect: {
      accountNumber: '556789866666',
      accountName: 'LUU THI THUY THANH',
      bankCode: '970422',
      amount: 39483000,
      remark: 'NAPAS 247'
    }
  },

  {
    name: 'Nhãn ghép — đổi thứ tự dòng',
    input: `转账内容：NAPAS 247
出款金额：39.483.000 VND
Tên chủ tài khoản 姓名：Lưu Thị Thúy Thanh
Số tài khoản 账号：556789866666
Ngân hàng 银行：MB bank`,
    expect: {
      accountNumber: '556789866666',
      accountName: 'LUU THI THUY THANH',
      bankCode: '970422',
      amount: 39483000,
      remark: 'NAPAS 247'
    }
  },

  {
    name: 'Chỉ tiếng Trung — 出款金额 / 转账内容',
    input: `银行：MB bank
账号：556789866666
姓名：LUU THI THUY THANH
出款金额：39483000
转账内容：NAPAS 247`,
    expect: {
      accountNumber: '556789866666',
      accountName: 'LUU THI THUY THANH',
      bankCode: '970422',
      amount: 39483000,
      remark: 'NAPAS 247'
    }
  },

  {
    name: 'Nhãn ghép Bank 银行',
    input: `Bank 银行：MB bank
Account 账号：556789866666
Name 姓名：Luu Thi Thuy Thanh
Amount 金额：39.483.000 VND
Note 转账内容：NAPAS 247`,
    expect: {
      accountNumber: '556789866666',
      accountName: 'LUU THI THUY THANH',
      bankCode: '970422',
      amount: 39483000,
      remark: 'NAPAS 247'
    }
  }
];

let failed = false;

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
    console.log('  - Remark:', result.remark || '');
    
    const qr = generateQRResponse(result);
    console.log('  - QR Generated:', qr.photo ? '✅ YES' : '❌ NO');

    if (test.expect) {
      const mismatches = Object.entries(test.expect).filter(([key, value]) => result[key] !== value);
      if (mismatches.length) {
        console.log('❌ EXPECT MISMATCH', mismatches.map(([key, value]) => `${key}: got ${result[key]} want ${value}`).join('; '));
        failed = true;
      }
    }
  } else {
    console.log('❌ PARSE FAILED');
    failed = true;
  }
  
  console.log('');
});

console.log('=== KẾT THÚC TEST ===');
if (failed) process.exit(1); 