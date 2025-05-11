const Card = require('../models/Card');
const Config = require('../models/Config');

/**
 * Xử lý lệnh ẩn thẻ (/x)
 */
const handleHideCardCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    // Lấy mã thẻ từ lệnh
    const cardCode = messageText.substring(3).trim().toUpperCase();
    
    if (!cardCode) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /x ABC123");
      return;
    }
    
    if (cardCode === 'ALL') {
      // Lấy tất cả các thẻ của nhóm
      const cards = await Card.find({ chatId: chatId.toString() });
      
      if (cards.length === 0) {
        bot.sendMessage(chatId, "Không có thông tin thẻ nào.");
        return;
      }
      
      // Ẩn tất cả các thẻ
      const cardCodes = [];
      const updatePromises = cards.map(async (card) => {
        cardCodes.push(card.cardCode);
        card.hidden = true;
        return card.save();
      });
      
      await Promise.all(updatePromises);
      
      bot.sendMessage(chatId, `Đã ẩn tất cả ${cardCodes.length} thẻ: ${cardCodes.join(', ')}`);
    } else {
      // Tìm và ẩn thẻ cụ thể
      const card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      
      if (!card) {
        bot.sendMessage(chatId, `Không tìm thấy thẻ với mã ${cardCode}`);
        return;
      }
      
      card.hidden = true;
      await card.save();
      
      bot.sendMessage(chatId, `Đã ẩn thẻ: ${cardCode}`);
    }
  } catch (error) {
    console.error('Error in handleHideCardCommand:', error);
    bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh ẩn thẻ. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh hiển thị thẻ (/sx)
 */
const handleShowCardCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    // Lấy mã thẻ từ lệnh
    const cardCode = messageText.substring(4).trim().toUpperCase();
    
    if (!cardCode) {
      bot.sendMessage(chatId, "Cú pháp không hợp lệ. Ví dụ: /sx ABC123");
      return;
    }
    
    if (cardCode === 'ALL') {
      // Tìm tất cả các thẻ bị ẩn
      const hiddenCards = await Card.find({ chatId: chatId.toString(), hidden: true });
      
      if (hiddenCards.length === 0) {
        bot.sendMessage(chatId, "Không có thẻ nào bị ẩn.");
        return;
      }
      
      // Hiển thị lại tất cả
      const cardCodes = [];
      const updatePromises = hiddenCards.map(async (card) => {
        cardCodes.push(card.cardCode);
        card.hidden = false;
        return card.save();
      });
      
      await Promise.all(updatePromises);
      
      bot.sendMessage(chatId, `Đã hiển thị lại tất cả thẻ: ${cardCodes.join(', ')}`);
    } else {
      // Tìm và hiển thị thẻ cụ thể
      const card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      
      if (!card) {
        bot.sendMessage(chatId, `Không tìm thấy thẻ với mã ${cardCode}`);
        return;
      }
      
      if (!card.hidden) {
        bot.sendMessage(chatId, `Thẻ ${cardCode} đã ở trạng thái hiển thị.`);
        return;
      }
      
      card.hidden = false;
      await card.save();
      
      bot.sendMessage(chatId, `Đã hiển thị lại thẻ: ${cardCode}`);
    }
  } catch (error) {
    console.error('Error in handleShowCardCommand:', error);
    bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh hiển thị thẻ. Vui lòng thử lại sau.");
  }
};

/**
 * Xử lý lệnh liệt kê các thẻ bị ẩn (/hiddenCards)
 */
const handleListHiddenCardsCommand = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    // Tìm tất cả các thẻ bị ẩn
    const hiddenCards = await Card.find({ chatId: chatId.toString(), hidden: true });
    
    if (hiddenCards.length === 0) {
      bot.sendMessage(chatId, "Không có thẻ nào bị ẩn.");
      return;
    }
    
    const cardCodes = hiddenCards.map(card => card.cardCode);
    bot.sendMessage(chatId, `Các thẻ đang bị ẩn: ${cardCodes.join(', ')}`);
    
  } catch (error) {
    console.error('Error in handleListHiddenCardsCommand:', error);
    bot.sendMessage(msg.chat.id, "Đã xảy ra lỗi khi xử lý lệnh liệt kê thẻ ẩn. Vui lòng thử lại sau.");
  }
};

module.exports = {
  handleHideCardCommand,
  handleShowCardCommand,
  handleListHiddenCardsCommand
}; 