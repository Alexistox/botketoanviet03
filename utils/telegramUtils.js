const axios = require('axios');
const NodeCache = require('node-cache');

const fileCache = new NodeCache({ stdTTL: 21600 });

const getDownloadLink = async (fileId, botToken) => {
  try {
    const cachedUrl = fileCache.get(fileId);
    if (cachedUrl) return cachedUrl;

    const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const response = await axios.get(fileInfoUrl);

    if (response.data && response.data.ok && response.data.result.file_path) {
      const filePath = response.data.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      fileCache.set(fileId, downloadUrl);
      return downloadUrl;
    }

    throw new Error('Invalid response from Telegram API');
  } catch (error) {
    console.error('Error getting download link:', error.message);
    return '';
  }
};

const logMessage = async (msg, botToken, MessageLog) => {
  try {
    if (!msg) return;

    const chat = msg.chat || {};
    const from = msg.from || {};

    const messageLog = new MessageLog({
      groupName: chat.title || (chat.type === 'private' ? 'Private' : ''),
      chatId: chat.id ? chat.id.toString() : '',
      chatType: chat.type || '',
      senderId: from.id ? from.id.toString() : '',
      senderName: `${from.first_name || ''} ${from.last_name || ''}`.trim(),
      username: from.username || '',
      timestamp: msg.date ? new Date(msg.date * 1000) : new Date(),
      content: msg.text || msg.caption || ''
    });

    if (msg.photo && msg.photo.length > 0) {
      const photoFileId = msg.photo[msg.photo.length - 1].file_id;
      messageLog.photoFileId = photoFileId;
      messageLog.photoUrl = await getDownloadLink(photoFileId, botToken);
    }

    if (msg.video) {
      messageLog.videoFileId = msg.video.file_id;
      messageLog.videoUrl = await getDownloadLink(msg.video.file_id, botToken);
    }

    if (msg.voice) {
      messageLog.voiceFileId = msg.voice.file_id;
      messageLog.voiceUrl = await getDownloadLink(msg.voice.file_id, botToken);
    } else if (msg.audio) {
      messageLog.voiceFileId = msg.audio.file_id;
      messageLog.voiceUrl = await getDownloadLink(msg.audio.file_id, botToken);
    }

    if (msg.document) {
      messageLog.documentFileId = msg.document.file_id;
      messageLog.documentUrl = await getDownloadLink(msg.document.file_id, botToken);
    }

    await messageLog.save();
  } catch (error) {
    console.error('Error logging message:', error);
  }
};

module.exports = {
  getDownloadLink,
  logMessage
};
