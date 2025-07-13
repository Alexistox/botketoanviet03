const mongoose = require('mongoose');

const MessageLogSchema = new mongoose.Schema({
  groupName: {
    type: String,
    default: ''
  },
  chatId: {
    type: String,
    required: true
  },
  senderId: {
    type: String,
    default: ''
  },
  senderName: {
    type: String,
    default: ''
  },
  username: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  content: {
    type: String,
    default: ''
  },
  photoUrl: {
    type: String,
    default: ''
  },
  videoUrl: {
    type: String,
    default: ''
  },
  voiceUrl: {
    type: String,
    default: ''
  },
  documentUrl: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('MessageLog', MessageLogSchema); 