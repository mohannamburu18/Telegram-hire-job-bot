const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
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
  application_id: {
    type: String,
    required: true,
    unique: true,
  },
  jobHash: {
    type: String,
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
  },
  job_url: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['queued', 'opening', 'filling', 'ready_for_manual_submit', 'submitted', 'viewed_by_hr', 'shortlisted', 'rejected', 'failed'],
    default: 'submitted',
  },
  applied_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Application', ApplicationSchema);
