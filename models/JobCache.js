const mongoose = require('mongoose');

const JobCacheSchema = new mongoose.Schema({
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    default: 'Remote / Hybrid',
  },
  url: {
    type: String,
    required: true,
  },
  source: {
    type: String,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
    index: true,
  },
  isLive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('JobCache', JobCacheSchema);
