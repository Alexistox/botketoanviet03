const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema); 