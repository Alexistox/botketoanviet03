const mongoose = require('mongoose');

const CardSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    ref: 'Group'
  },
  cardCode: {
    type: String,
    required: true
  },
  total: {
    type: Number,
    default: 0
  },
  paid: {
    type: Number,
    default: 0
  },
  limit: {
    type: Number,
    default: 0
  },
  hidden: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Composite unique index for chatId and cardCode
CardSchema.index({ chatId: 1, cardCode: 1 }, { unique: true });

module.exports = mongoose.model('Card', CardSchema); 