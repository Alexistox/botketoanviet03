const axios = require('axios');
const { Readable } = require('stream');

/**
 * Trích xuất thông tin ngân hàng từ ảnh sử dụng OpenAI API
 * @param {Buffer} imageBuffer - Buffer chứa dữ liệu ảnh
 * @returns {Object|null} - Thông tin ngân hàng trích xuất được hoặc null nếu thất bại
 */
const extractBankInfoFromImage = async (imageBuffer) => {
  try {
    // Chuyển đổi buffer ảnh thành base64
    const base64Image = imageBuffer.toString('base64');
    const base64Url = `data:image/jpeg;base64,${base64Image}`;
    
    // Chuẩn bị prompt để gửi đến OpenAI
    const prompt = "Trích xuất thông tin tài khoản ngân hàng từ hình ảnh này. Hãy xác định: tên ngân hàng (ngôn ngữ gốc), tên ngân hàng bằng tiếng Anh, số tài khoản, và tên chủ tài khoản. Trả về kết quả dưới dạng JSON với các trường: bankName, bankNameEnglish, accountNumber, accountName. Nếu không tìm thấy thông tin, hãy trả về trường đó là null.";
    
    // Tạo yêu cầu gửi đến OpenAI API
    const openAiUrl = "https://api.openai.com/v1/chat/completions";
    const requestBody = {
      "model": "gpt-4o", // Sử dụng GPT-4 Vision
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": prompt},
            {
              "type": "image_url",
              "image_url": {
                "url": base64Url
              }
            }
          ]
        }
      ],
      "max_tokens": 300
    };
    
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };
    
    // Gửi yêu cầu đến OpenAI API
    const response = await axios.post(openAiUrl, requestBody, options);
    
    // Kiểm tra phản hồi từ API
    if (!response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Invalid response from OpenAI API');
      return null;
    }
    
    // Phân tích kết quả từ OpenAI
    const content = response.data.choices[0].message.content;
    
    try {
      // Tìm đoạn JSON trong phản hồi
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const bankInfo = JSON.parse(jsonStr);
        return bankInfo;
      } else {
        // Nếu không tìm thấy JSON, tạo đối tượng và trích xuất thông tin bằng cách phân tích văn bản
        const bankInfo = {
          bankName: null,
          bankNameEnglish: null,
          accountNumber: null,
          accountName: null
        };
        
        // Kiểm tra nếu nội dung có chứa thông tin ngân hàng
        if (content.includes("ngân hàng") || content.includes("bank")) {
          // Xử lý thông tin ngân hàng
          const bankMatch = content.match(/(?:ngân hàng|bank)[:\s]+([^\n.,]+)/i);
          if (bankMatch) bankInfo.bankName = bankMatch[1].trim();
        }
        
        // Kiểm tra nếu nội dung có chứa thông tin tiếng Anh
        if (content.includes("tiếng Anh") || content.includes("English")) {
          // Xử lý thông tin tiếng Anh
          const bankEnglishMatch = content.match(/(?:tiếng Anh|English)[:\s]+([^\n.,]+)/i);
          if (bankEnglishMatch) bankInfo.bankNameEnglish = bankEnglishMatch[1].trim();
        }
        
        // Tìm số tài khoản
        const accountMatch = content.match(/(?:số tài khoản|số tk|account number|account no)[:\s]+([0-9\s-]+)/i);
        if (accountMatch) bankInfo.accountNumber = accountMatch[1].replace(/\s+/g, '').trim();
        
        // Tìm tên chủ tài khoản
        const nameMatch = content.match(/(?:tên|chủ tài khoản|tên tk|account name|beneficiary)[:\s]+([^\n.,]+)/i);
        if (nameMatch) bankInfo.accountName = nameMatch[1].trim();
        
        return bankInfo;
      }
    } catch (error) {
      console.error('Error parsing OpenAI response:', error.message);
      return null;
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    return null;
  }
};

/**
 * Trích xuất số tiền từ ảnh bill/hóa đơn sử dụng OpenAI API
 * @param {Buffer} imageBuffer - Buffer chứa dữ liệu ảnh
 * @returns {Object|null} - Thông tin số tiền trích xuất được hoặc null nếu thất bại
 */
const extractAmountFromBill = async (imageBuffer) => {
  try {
    // Chuyển đổi buffer ảnh thành base64
    const base64Image = imageBuffer.toString('base64');
    const base64Url = `data:image/jpeg;base64,${base64Image}`;
    
    // Chuẩn bị prompt để gửi đến OpenAI
    const prompt = `Phân tích ảnh hóa đơn/bill/biên lai này và trích xuất số tiền chính (số tiền giao dịch). 
    Hãy tìm số tiền lớn nhất, số tiền cuối cùng, hoặc số tiền được đánh dấu rõ ràng nhất trong ảnh.
    Trả về kết quả dưới dạng JSON với các trường:
    - amount: số tiền (chỉ số, không có đơn vị)
    - currency: đơn vị tiền tệ (VND, USD, etc.)
    - formattedAmount: số tiền đã được format (ví dụ: 100,000,000)
    - confidence: độ tin cậy (high/medium/low)
    
    Lưu ý: Nếu có nhiều số tiền, hãy chọn số tiền giao dịch chính (thường là số lớn nhất hoặc được highlight).
    Nếu không tìm thấy thông tin, hãy trả về null cho các trường đó.`;
    
    // Tạo yêu cầu gửi đến OpenAI API
    const openAiUrl = "https://api.openai.com/v1/chat/completions";
    const requestBody = {
      "model": "gpt-4o",
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": prompt},
            {
              "type": "image_url",
              "image_url": {
                "url": base64Url
              }
            }
          ]
        }
      ],
      "max_tokens": 300
    };
    
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };
    
    // Gửi yêu cầu đến OpenAI API
    const response = await axios.post(openAiUrl, requestBody, options);
    
    // Kiểm tra phản hồi từ API
    if (!response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Invalid response from OpenAI API');
      return null;
    }
    
    // Phân tích kết quả từ OpenAI
    const content = response.data.choices[0].message.content;
    
    try {
      // Tìm đoạn JSON trong phản hồi
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const billInfo = JSON.parse(jsonStr);
        return billInfo;
      } else {
        // Nếu không tìm thấy JSON, tạo đối tượng và trích xuất thông tin bằng cách phân tích văn bản
        const billInfo = {
          amount: null,
          currency: null,
          formattedAmount: null,
          confidence: 'low'
        };
        
        // Tìm số tiền trong phản hồi
        const amountPatterns = [
          /(?:số tiền|amount|total|tổng)[:\s]+([0-9,.\s]+)/gi,
          /([0-9,.\s]+)\s*(?:VND|đ|USD|\$)/gi,
          /([0-9,.\s]{3,})/g
        ];
        
        for (const pattern of amountPatterns) {
          const match = content.match(pattern);
          if (match) {
            const extractedAmount = match[1] || match[0];
            const cleanAmount = extractedAmount.replace(/[^\d,.\s]/g, '').trim();
            if (cleanAmount) {
              billInfo.amount = cleanAmount.replace(/[,.\s]/g, '');
              billInfo.formattedAmount = extractedAmount;
              billInfo.currency = 'VND';
              billInfo.confidence = 'medium';
              break;
            }
          }
        }
        
        return billInfo;
      }
    } catch (error) {
      console.error('Error parsing OpenAI response:', error.message);
      return null;
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    return null;
  }
};

module.exports = {
  extractBankInfoFromImage,
  extractAmountFromBill
}; 