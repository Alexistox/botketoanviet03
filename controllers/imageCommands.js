const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { extractBankInfoFromImage } = require('../utils/openai');
const { getDownloadLink } = require('../utils/telegramUtils');

/**
 * Xử lý lệnh trích xuất thông tin ngân hàng từ ảnh
 */
const handleImageBankInfo = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Thông báo cho người dùng biết đang xử lý
    bot.sendMessage(chatId, "⏳ 正在获取银行账户信息…");
    
    // Lấy ảnh có độ phân giải cao nhất
    const photos = msg.photo;
    const photoFileId = photos[photos.length - 1].file_id;
    
    // Lấy đường dẫn tải ảnh
    const downloadUrl = await getDownloadLink(photoFileId, process.env.TELEGRAM_BOT_TOKEN);
    
    if (!downloadUrl) {
      bot.sendMessage(chatId, "❌ 无法获取图片文件信息.");
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
        `${bankInfo.bankName || "[未找到]"}\n` +
        `${bankInfo.bankNameEnglish || "[未找到]"}\n` +
        `${bankInfo.accountNumber || "[未找到]"}\n` +
        `${bankInfo.accountName || "[未找到]"}`;
      
      bot.sendMessage(chatId, formattedMessage);
    } else {
      bot.sendMessage(chatId, "❌ 无法从该图片识别出银行账户信息.");
    }
  } catch (error) {
    console.error('Error in handleImageBankInfo:', error);
    bot.sendMessage(msg.chat.id, "处理图片时出错，请重试。");
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
      bot.sendMessage(chatId, "❌ 请回复一条含有图片的消息。");
      return;
    }
    
    // Thông báo cho người dùng biết đang xử lý
    bot.sendMessage(chatId, "⏳ 正在获取银行账户信息…");
    
    // Lấy ảnh có độ phân giải cao nhất từ tin nhắn được reply
    const photos = msg.reply_to_message.photo;
    const photoFileId = photos[photos.length - 1].file_id;
    
    // Lấy đường dẫn tải ảnh
    const downloadUrl = await getDownloadLink(photoFileId, process.env.TELEGRAM_BOT_TOKEN);
    
    if (!downloadUrl) {
      bot.sendMessage(chatId, "❌ 无法获取图片文件信息.");
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
        `${bankInfo.bankName || "[未找到]"}\n` +
        `${bankInfo.bankNameEnglish || "[未找到]"}\n` +
        `${bankInfo.accountNumber || "[未找到]"}\n` +
        `${bankInfo.accountName || "[未找到]"}`;
      
      bot.sendMessage(chatId, formattedMessage);
    } else {
      bot.sendMessage(chatId, "❌ 无法从该图片识别出银行账户信息.");
    }
  } catch (error) {
    console.error('Error in handleReplyImageBankInfo:', error);
    bot.sendMessage(msg.chat.id, "处理图片时出错，请重试。");
  }
};

module.exports = {
  handleImageBankInfo,
  handleReplyImageBankInfo
}; 