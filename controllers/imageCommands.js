const axios = require('axios');
const { extractBankInfoFromImage } = require('../utils/openai');
const { getDownloadLink, runWithChatAction } = require('../utils/telegramUtils');
const messages = require('../src/messages/vi');

const formatBankInfoReply = (bankInfo) => {
  const currentDate = new Date().toLocaleDateString('vi-VN');
  const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const randomNumber = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const uniqueCode = randomLetter + randomNumber;

  return (
    `${uniqueCode} - ${currentDate}\n` +
    `${bankInfo.bankName || '[Không tìm thấy]'}\n` +
    `${bankInfo.bankNameEnglish || '[Không tìm thấy]'}\n` +
    `${bankInfo.accountNumber || '[Không tìm thấy]'}\n` +
    `${bankInfo.accountName || '[Không tìm thấy]'}`
  );
};

const extractBankInfoFromPhotoFileId = async (photoFileId) => {
  const downloadUrl = await getDownloadLink(photoFileId, process.env.TELEGRAM_BOT_TOKEN);
  if (!downloadUrl) {
    return { error: '❌ Không thể lấy thông tin file ảnh.' };
  }

  const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data);
  const bankInfo = await extractBankInfoFromImage(imageBuffer);
  return { bankInfo };
};

/**
 * Xử lý lệnh trích xuất thông tin ngân hàng từ ảnh
 */
const handleImageBankInfo = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const photos = msg.photo;
    const photoFileId = photos[photos.length - 1].file_id;

    const result = await runWithChatAction(bot, chatId, () =>
      extractBankInfoFromPhotoFileId(photoFileId)
    );

    if (result.error) {
      bot.sendMessage(chatId, result.error);
      return;
    }

    if (result.bankInfo) {
      bot.sendMessage(chatId, formatBankInfoReply(result.bankInfo));
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

    if (!msg.reply_to_message || !msg.reply_to_message.photo) {
      bot.sendMessage(chatId, '❌ Vui lòng reply vào tin nhắn có chứa ảnh.');
      return;
    }

    const photos = msg.reply_to_message.photo;
    const photoFileId = photos[photos.length - 1].file_id;

    const result = await runWithChatAction(bot, chatId, () =>
      extractBankInfoFromPhotoFileId(photoFileId)
    );

    if (result.error) {
      bot.sendMessage(chatId, result.error);
      return;
    }

    if (result.bankInfo) {
      bot.sendMessage(chatId, formatBankInfoReply(result.bankInfo));
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
