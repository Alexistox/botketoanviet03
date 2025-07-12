const { parseNumberWithUnits } = require('./formatter');

/**
 * Parse thông tin từ tin nhắn thông báo chuyển tiền ngân hàng
 * @param {String} message - Nội dung tin nhắn
 * @returns {Object|null} - Object chứa thông tin hoặc null nếu không parse được
 */
const parseBankTransferMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  // Các pattern để match format thông báo chuyển tiền
  const patterns = [
    // Pattern 1: Format ví dụ trong yêu cầu
    // - Tiền vào: +7,834,351 đ
    // - Tài khoản: 20991331 tại ACB TRAN VAN DUONG
    // - Lúc: 2025-07-12 12:57:48
    // - Nội dung CK: ACB;20991331;NGUYEN MINH TAM chuyen tien GD 477795-071225 12:57:48
    {
      name: 'standard_format',
      regex: /(?:tiền vào|tiền ra|số tiền):\s*[+\-]?([0-9,\.]+(?:[kmtr]+\d*)?)\s*(?:đ|vnd|vnđ|d)/i,
      description: 'Standard bank notification format'
    },
    
    // Pattern 2: Các format khác có thể gặp
    // +7,834,351 VND
    // Số tiền: 1,500,000 đ
    // Amount: 2,500,000 VND
    {
      name: 'amount_format',
      regex: /(?:amount|số tiền|money):\s*[+\-]?([0-9,\.]+(?:[kmtr]+\d*)?)\s*(?:đ|vnd|vnđ|d)/i,
      description: 'Amount format'
    },
    
    // Pattern 3: Format đơn giản chỉ có số và đơn vị
    // 7,834,351 đ
    // +1.5tr VND
    {
      name: 'simple_format',
      regex: /^[+\-]?([0-9,\.]+(?:[kmtr]+\d*)?)\s*(?:đ|vnd|vnđ|d)\s*$/i,
      description: 'Simple amount format'
    }
  ];

  // Thử từng pattern
  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match && match[1]) {
      const amountString = match[1].trim();
      
      // Parse số tiền sử dụng hàm parseNumberWithUnits
      const amount = parseNumberWithUnits(amountString);
      
      if (!isNaN(amount) && amount > 0) {
        return {
          amount: amount,
          amountString: amountString,
          pattern: pattern.name,
          originalMessage: message
        };
      }
    }
  }

  return null;
};

/**
 * Kiểm tra xem tin nhắn có phải là thông báo chuyển tiền ngân hàng không
 * @param {String} message - Nội dung tin nhắn
 * @returns {Boolean} - true nếu là thông báo ngân hàng
 */
const isBankTransferMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return false;
  }

  // Các keyword thường xuất hiện trong thông báo ngân hàng
  const bankKeywords = [
    'tiền vào',
    'tiền ra', 
    'chuyển tiền',
    'tài khoản',
    'nội dung ck',
    'acb', 'vcb', 'tcb', 'mb', 'vib', 'tpb', 'scb', // Mã ngân hàng
    'balance',
    'transfer',
    'account'
  ];

  const lowerMessage = message.toLowerCase();
  
  // Kiểm tra có ít nhất 2 keyword và có số tiền
  const keywordCount = bankKeywords.filter(keyword => 
    lowerMessage.includes(keyword)
  ).length;

  const hasAmount = /\d+[,\.]?\d*\s*(?:đ|vnd|vnđ|d)/i.test(message);

  return keywordCount >= 2 && hasAmount;
};

module.exports = {
  parseBankTransferMessage,
  isBankTransferMessage
}; 