const mongoose = require('mongoose');

const ApplicationQueueSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  telegram_id: {
    type: Number,
    required: true,
    index: true,
  },
  task_id: {
    type: String,
    required: true,
    unique: true,
  },
  job_url: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    required: true,
  },
  platform: {
    type: String,
    default: 'ATS',
  },
  status: {
    type: String,
    enum: ['QUEUED', 'OPENING', 'DETECTED', 'FILLING', 'READY_FOR_MANUAL_SUBMIT', 'SUBMITTED', 'MANUAL_REQUIRED', 'FAILED', 'SKIPPED'],
    default: 'QUEUED',
  },
  reason: {
    type: String,
  },
  fields_filled: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ApplicationQueue', ApplicationQueueSchema);

