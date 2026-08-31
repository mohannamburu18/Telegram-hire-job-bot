const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegram_id: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  email_verified: {
    type: Boolean,
    default: false,
  },
  phone: {
    type: String,
    trim: true,
  },
  resume_text: {
    type: String,
  },
  resume_pdf_base64: {
    type: String,
  },
  skills: [{
    type: String,
    trim: true,
  }],
  state: {
    type: String,
    default: 'ASK_TYPE',
  },
  temp_name: {
    type: String,
  },
  temp_email: {
    type: String,
  },
  temp_phone: {
    type: String,
  },
  temp_skills: [{
    type: String,
  }],
  temp_otp: {
    type: String,
  },
  temp_otp_expiry: {
    type: Date,
  },
  profile_token: {
    type: String,
    index: true,
  },
  profile_token_expiry: {
    type: Date,
  },
  profile_completed: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    trim: true,
  },
  location: {
    type: String,
    trim: true,
  },
  experience_years: {
    type: String,
    default: '0-1',
    trim: true,
  },
  current_location: {
    type: String,
    trim: true,
  },
  preferred_locations: [{
    type: String,
    trim: true,
  }],
  education: {
    type: String,
    trim: true,
  },
  notice_period: {
    type: String,
    trim: true,
  },
  expected_salary: {
    type: String,
    trim: true,
  },
  expected_ctc: {
    type: String,
    trim: true,
  },
  linkedin: {
    type: String,
    trim: true,
  },
  github: {
    type: String,
    trim: true,
  },
  trial_applications_used: {
    type: Number,
    default: 0,
  },
  trial_links_used: {
    type: Number,
    default: 0,
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'popular', 'power'],
    default: 'free',
  },
  is_paid: {
    type: Boolean,
    default: false,
  },
  plan_expiry: {
    type: Date,
  },
  // Chrome Extension License & Activation
  extension_license_key: {
    type: String,
    sparse: true,
    index: true,
  },
  extension_activated: {
    type: Boolean,
    default: false,
  },
  daily_fills_count: {
    type: Number,
    default: 0,
  },
  daily_fills_date: {
    type: String,
  },
  // Referral system
  referral_code: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  referred_by: {
    type: String,
    trim: true,
  },
  referrals_count: {
    type: Number,
    default: 0,
  },
  referral_earnings: {
    type: Number,
    default: 0,
  },
  bonus_auto_quota: {
    type: Number,
    default: 0,
  },
  bonus_manual_quota: {
    type: Number,
    default: 0,
  },
  // Add-ons store purchases
  addons: [{
    name: {
      type: String,
      required: true,
    },
    purchased_at: {
      type: Date,
      default: Date.now,
    },
    expiry: {
      type: Date,
    },
  }],
  // Admin ban flag
  is_banned: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', UserSchema);
