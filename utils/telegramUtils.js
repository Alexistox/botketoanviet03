const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for file URLs (6 hours lifespan)
const fileCache = new NodeCache({ stdTTL: 21600 });

/**
 * Get direct download link for a file from Telegram
 * @param {string} fileId - Telegram file ID
 * @param {string} botToken - Telegram bot token
 * @returns {Promise<string>} - Direct download URL
 */
const getDownloadLink = async (fileId, botToken) => {
  try {
    // Check cache first
    const cachedUrl = fileCache.get(fileId);
    if (cachedUrl) return cachedUrl;
    
    // Get file path from Telegram
    const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const response = await axios.get(fileInfoUrl);
    
    if (response.data && response.data.ok && response.data.result.file_path) {
      const filePath = response.data.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      
      // Cache the URL
      fileCache.set(fileId, downloadUrl);
      
      return downloadUrl;
    }
    
    throw new Error('Invalid response from Telegram API');
  } catch (error) {
    console.error('Error getting download link:', error.message);
    return '';
  }
};

/**
 * Log message to database
 * @param {Object} msg - Telegram message object
 * @param {string} botToken - Telegram bot token
 * @param {Object} MessageLog - Mongoose model for message logs
 */
const logMessage = async (msg, botToken, MessageLog) => {
  try {
    if (!msg) return;
    
    // Extract basic message info
    const chat = msg.chat || {};
    const from = msg.from || {};
    
    const messageLog = new MessageLog({
      groupName: chat.title || '',
      chatId: chat.id ? chat.id.toString() : '',
      senderId: from.id ? from.id.toString() : '',
      senderName: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
      username: from.username || '',
      timestamp: msg.date ? new Date(msg.date * 1000) : new Date(),
      content: msg.text || ''
    });
    
    // Handle photo
    if (msg.photo && msg.photo.length > 0) {
      const photoFileId = msg.photo[msg.photo.length - 1].file_id;
      messageLog.photoUrl = await getDownloadLink(photoFileId, botToken);
    }
    
    // Handle video
    if (msg.video) {
      messageLog.videoUrl = await getDownloadLink(msg.video.file_id, botToken);
    }
    
    // Handle voice
    if (msg.voice) {
      messageLog.voiceUrl = await getDownloadLink(msg.voice.file_id, botToken);
    }
    
    // Handle document
    if (msg.document) {
      messageLog.documentUrl = await getDownloadLink(msg.document.file_id, botToken);
    }
    
    // Save to database
    await messageLog.save();
  } catch (error) {
    console.error('Error logging message:', error);
  }
};

module.exports = {
  getDownloadLink,
  logMessage
}; 