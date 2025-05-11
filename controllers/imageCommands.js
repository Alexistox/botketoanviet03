const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { extractBankInfoFromImage } = require('../utils/openai');
const { getDownloadLink } = require('../utils/telegramUtils');
const messages = require('../src/messages/vi');

/**
 * Xử lý lệnh trích xuất thông tin ngân hàng từ ảnh
 */
const handleImageBankInfo = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Thông báo cho người dùng biết đang xử lý
    bot.sendMessage(chatId, messages.bankInfoProcessing);
    
    // Lấy ảnh có độ phân giải cao nhất
    const photos = msg.photo;
    const photoFileId = photos[photos.length - 1].file_id;
    
    // Lấy đường dẫn tải ảnh
    const downloadUrl = await getDownloadLink(photoFileId, process.env.TELEGRAM_BOT_TOKEN);
    
    if (!downloadUrl) {
      bot.sendMessage(chatId, "❌ Không thể lấy thông tin file ảnh.");
      return;
    }
    
    // Tải ảnh
    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);
    
    // Trích xuất thông tin ngân hàng từ ảnh
    const bankInfo = await extractBankInfoFromImage(imageBuffer);
    
    if (bankInfo) {
      const currentDate = new Date().toLocaleDateString('vi-VN');
      
      // Tạo mã theo định dạng yêu cầu: 1 chữ cái + 2 số
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      const randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 00-99
      const uniqueCode = randomLetter + randomNumber;
      
      // Tạo tin nhắn
      const formattedMessage = 
        `${uniqueCode} - ${currentDate}\n` +
        `${bankInfo.bankName || "[Không tìm thấy]"}\n` +
        `${bankInfo.bankNameEnglish || "[Không tìm thấy]"}\n` +
        `${bankInfo.accountNumber || "[Không tìm thấy]"}\n` +
        `${bankInfo.accountName || "[Không tìm thấy]"}`;
      
      bot.sendMessage(chatId, formattedMessage);
    } else {
      bot.sendMessage(chatId, messages.bankInfoNotFound);
    }
  } catch (error) {
    console.error('Error in handleImageBankInfo:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingImage);
  }
};

/**
 * Xử lý lệnh trích xuất thông tin ngân hàng từ ảnh được reply
 */
const handleReplyImageBankInfo = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Kiểm tra nếu tin nhắn được reply có chứa ảnh
    if (!msg.reply_to_message || !msg.reply_to_message.photo) {
      bot.sendMessage(chatId, "❌ Vui lòng reply vào tin nhắn có chứa ảnh.");
      return;
    }
    
    // Thông báo cho người dùng biết đang xử lý
    bot.sendMessage(chatId, messages.bankInfoProcessing);
    
    // Lấy ảnh có độ phân giải cao nhất từ tin nhắn được reply
    const photos = msg.reply_to_message.photo;
    const photoFileId = photos[photos.length - 1].file_id;
    
    // Lấy đường dẫn tải ảnh
    const downloadUrl = await getDownloadLink(photoFileId, process.env.TELEGRAM_BOT_TOKEN);
    
    if (!downloadUrl) {
      bot.sendMessage(chatId, "❌ Không thể lấy thông tin file ảnh.");
      return;
    }
    
    // Tải ảnh
    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);
    
    // Trích xuất thông tin ngân hàng từ ảnh
    const bankInfo = await extractBankInfoFromImage(imageBuffer);
    
    if (bankInfo) {
      const currentDate = new Date().toLocaleDateString('vi-VN');
      
      // Tạo mã theo định dạng yêu cầu: 1 chữ cái + 2 số
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      const randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 00-99
      const uniqueCode = randomLetter + randomNumber;
      
      // Tạo tin nhắn
      const formattedMessage = 
        `${uniqueCode} - ${currentDate}\n` +
        `${bankInfo.bankName || "[Không tìm thấy]"}\n` +
        `${bankInfo.bankNameEnglish || "[Không tìm thấy]"}\n` +
        `${bankInfo.accountNumber || "[Không tìm thấy]"}\n` +
        `${bankInfo.accountName || "[Không tìm thấy]"}`;
      
      bot.sendMessage(chatId, formattedMessage);
    } else {
      bot.sendMessage(chatId, messages.bankInfoNotFound);
    }
  } catch (error) {
    console.error('Error in handleReplyImageBankInfo:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessingImage);
  }
};

module.exports = {
  handleImageBankInfo,
  handleReplyImageBankInfo
}; 