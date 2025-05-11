const Settings = require('../models/Settings');

const handleUserManagement = async (chatId, message, bot) => {
  try {
    if (message.startsWith('加操作人')) {
      const inputText = message.substring(4).trim();
      if (!inputText) {
        await bot.sendMessage(chatId, "语法无效。例如: 加操作人 @username1 @username2...");
        return;
      }

      const parts = inputText.split(' ');
      const added = [];

      for (const part of parts) {
        const newUser = part.replace('@', '').toLowerCase();
        if (newUser) {
          await addAllowedUsername(newUser);
          added.push('@' + newUser);
        }
      }

      if (added.length > 0) {
        await bot.sendMessage(chatId, `成功添加用户: ${added.join(', ')}`);
      } else {
        await bot.sendMessage(chatId, "没有有效的用户名添加。");
      }
    } else if (message.startsWith('移除操作人')) {
      const inputText = message.substring(5).trim();
      if (!inputText) {
        await bot.sendMessage(chatId, "语法无效。例如: 移除操作人 @username1 @username2...");
        return;
      }

      const parts = inputText.split(' ');
      const removed = [];

      for (const part of parts) {
        const user = part.replace('@', '').toLowerCase();
        if (user && await removeAllowedUsername(user)) {
          removed.push('@' + user);
        }
      }

      if (removed.length > 0) {
        await bot.sendMessage(chatId, `成功移除用户: ${removed.join(', ')}`);
      } else {
        await bot.sendMessage(chatId, "没有找到要移除的用户。");
      }
    } else if (message === '/users') {
      const users = await getAllowedUsernames();
      const ownerInfo = `Owner: ID ${await getOwnerId()}`;

      if (users.length > 0) {
        const usersList = users.map(u => '@' + u).join(', ');
        await bot.sendMessage(chatId, `${ownerInfo}\n被授权的用户列表: ${usersList}`);
      } else {
        await bot.sendMessage(chatId, `${ownerInfo}\n尚未有用户被添加到列表中。`);
      }
    }
  } catch (error) {
    console.error('Error handling user management:', error);
    await bot.sendMessage(chatId, "处理用户管理时出错，请重试。");
  }
};

const handleCardManagement = async (chatId, message, bot) => {
  try {
    if (message.startsWith('/x ')) {
      const cardCode = message.substring(3).trim().toUpperCase();

      if (cardCode === 'ALL') {
        // Hide all cards
        const transactions = await Transaction.find({
          chatId,
          timestamp: { $gte: moment().startOf('day').toDate() }
        });

        const uniqueCards = [...new Set(transactions
          .filter(tx => tx.cardCode)
          .map(tx => tx.cardCode))];

        for (const card of uniqueCards) {
          await addHiddenCard(card);
        }

        if (uniqueCards.length > 0) {
          await bot.sendMessage(chatId, `已隐藏所有卡密 ${uniqueCards.length} : ${uniqueCards.join(', ')}`);
        } else {
          await bot.sendMessage(chatId, "没有找到任何卡密。");
        }
      } else {
        await addHiddenCard(cardCode);
        await bot.sendMessage(chatId, `已隐藏卡密: ${cardCode}`);
      }
    } else if (message.startsWith('/sx ')) {
      const cardCode = message.substring(4).trim().toUpperCase();

      if (cardCode === 'ALL') {
        await setHiddenCards([]);
        await bot.sendMessage(chatId, "已重新显示所有卡密。");
      } else {
        if (await isCardHidden(cardCode)) {
          await removeHiddenCard(cardCode);
          await bot.sendMessage(chatId, `已重新显示卡密: ${cardCode}`);
        } else {
          await bot.sendMessage(chatId, `卡密 ${cardCode} 未被隐藏。`);
        }
      }
    } else if (message === '/hiddenCards') {
      const hiddenCards = await getHiddenCards();
      if (hiddenCards.length > 0) {
        await bot.sendMessage(chatId, `当前隐藏的卡密列表: ${hiddenCards.join(', ')}`);
      } else {
        await bot.sendMessage(chatId, "当前没有隐藏的卡密。");
      }
    }
  } catch (error) {
    console.error('Error handling card management:', error);
    await bot.sendMessage(chatId, "处理卡密管理时出错，请重试。");
  }
};

// Helper functions
const getOwnerId = async () => {
  const setting = await Settings.findOne({ key: 'BOT_OWNER_ID' });
  return setting ? setting.value : null;
};

const getAllowedUsernames = async () => {
  const setting = await Settings.findOne({ key: 'ALLOWED_USERNAMES' });
  if (!setting) return [];
  return setting.value.split(',').map(u => u.trim()).filter(Boolean);
};

const addAllowedUsername = async (username) => {
  const usernames = await getAllowedUsernames();
  if (!usernames.includes(username)) {
    usernames.push(username);
    await Settings.findOneAndUpdate(
      { key: 'ALLOWED_USERNAMES' },
      { value: usernames.join(',') },
      { upsert: true }
    );
  }
};

const removeAllowedUsername = async (username) => {
  const usernames = await getAllowedUsernames();
  const index = usernames.indexOf(username);
  if (index !== -1) {
    usernames.splice(index, 1);
    await Settings.findOneAndUpdate(
      { key: 'ALLOWED_USERNAMES' },
      { value: usernames.join(',') },
      { upsert: true }
    );
    return true;
  }
  return false;
};

const getHiddenCards = async () => {
  const setting = await Settings.findOne({ key: 'HIDDEN_CARDS' });
  if (!setting) return [];
  return setting.value.split(',').map(c => c.trim()).filter(Boolean);
};

const setHiddenCards = async (cards) => {
  await Settings.findOneAndUpdate(
    { key: 'HIDDEN_CARDS' },
    { value: cards.join(',') },
    { upsert: true }
  );
};

const addHiddenCard = async (cardCode) => {
  const cards = await getHiddenCards();
  if (!cards.includes(cardCode)) {
    cards.push(cardCode);
    await setHiddenCards(cards);
  }
};

const removeHiddenCard = async (cardCode) => {
  const cards = await getHiddenCards();
  const index = cards.indexOf(cardCode);
  if (index !== -1) {
    cards.splice(index, 1);
    await setHiddenCards(cards);
  }
};

const isCardHidden = async (cardCode) => {
  const cards = await getHiddenCards();
  return cards.includes(cardCode.toUpperCase());
};

module.exports = {
  handleUserManagement,
  handleCardManagement,
  getOwnerId,
  getAllowedUsernames,
  isUsernameAllowed: async (username) => {
    const usernames = await getAllowedUsernames();
    return usernames.includes(username.toLowerCase());
  }
}; 