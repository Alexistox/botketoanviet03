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