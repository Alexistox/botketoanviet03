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
      bot.sendMessage(chatId, "语法无效。例如: /x ABC123");
      return;
    }
    
    if (cardCode === 'ALL') {
      // Lấy tất cả các thẻ của nhóm
      const cards = await Card.find({ chatId: chatId.toString() });
      
      if (cards.length === 0) {
        bot.sendMessage(chatId, "暂无任何卡片信息。");
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
      
      bot.sendMessage(chatId, `已隐藏所有卡密 ${cardCodes.length} 张: ${cardCodes.join(', ')}`);
    } else {
      // Tìm và ẩn thẻ cụ thể
      const card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      
      if (!card) {
        bot.sendMessage(chatId, `未找到卡号 ${cardCode}`);
        return;
      }
      
      card.hidden = true;
      await card.save();
      
      bot.sendMessage(chatId, `已隐藏卡密: ${cardCode}`);
    }
  } catch (error) {
    console.error('Error in handleHideCardCommand:', error);
    bot.sendMessage(msg.chat.id, "处理隐藏卡片命令时出错。请稍后再试。");
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
      bot.sendMessage(chatId, "语法无效。例如: /sx ABC123");
      return;
    }
    
    if (cardCode === 'ALL') {
      // Tìm tất cả các thẻ bị ẩn
      const hiddenCards = await Card.find({ chatId: chatId.toString(), hidden: true });
      
      if (hiddenCards.length === 0) {
        bot.sendMessage(chatId, "没有隐藏的卡片。");
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
      
      bot.sendMessage(chatId, `已重新显示所有卡密: ${cardCodes.join(', ')}`);
    } else {
      // Tìm và hiển thị thẻ cụ thể
      const card = await Card.findOne({ chatId: chatId.toString(), cardCode });
      
      if (!card) {
        bot.sendMessage(chatId, `未找到卡号 ${cardCode}`);
        return;
      }
      
      if (!card.hidden) {
        bot.sendMessage(chatId, `卡号 ${cardCode} 已经是可见状态。`);
        return;
      }
      
      card.hidden = false;
      await card.save();
      
      bot.sendMessage(chatId, `已重新显示卡密: ${cardCode}`);
    }
  } catch (error) {
    console.error('Error in handleShowCardCommand:', error);
    bot.sendMessage(msg.chat.id, "处理显示卡片命令时出错。请稍后再试。");
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
      bot.sendMessage(chatId, "没有隐藏的卡片。");
      return;
    }
    
    const cardCodes = hiddenCards.map(card => card.cardCode);
    bot.sendMessage(chatId, `当前隐藏的卡片: ${cardCodes.join(', ')}`);
    
  } catch (error) {
    console.error('Error in handleListHiddenCardsCommand:', error);
    bot.sendMessage(msg.chat.id, "处理列出隐藏卡片命令时出错。请稍后再试。");
  }
};

module.exports = {
  handleHideCardCommand,
  handleShowCardCommand,
  handleListHiddenCardsCommand
}; 