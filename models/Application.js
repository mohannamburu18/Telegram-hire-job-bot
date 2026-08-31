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
    enum: ['submitted', 'viewed_by_hr', 'shortlisted', 'rejected'],
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

