const PLANS = {
  free: {
    name: "FREE",
    auto: 3,
    manual: 10,
    days: 9999,
    price: 0,
    label: "FREE - ₹0 • 3 Auto + 10 Links Lifetime",
    resume_rewrite: false,
    priority_apply: false,
  },
  starter: {
    name: "Starter",
    auto: 20,
    manual: 100,
    days: 30,
    price: 249,
    label: "Starter - ₹249 / 30 days • 20 Auto + 100 Links (~7/day)",
    resume_rewrite: false,
    priority_apply: false,
  },
  popular: {
    name: "Popular",
    auto: 100,
    manual: 1000,
    days: 60,
    price: 471,
    label: "Popular ⭐ - ₹471 / 60 days • 100 Auto + 1000 Links (~20/day) + Resume Rewrite",
    resume_rewrite: true,
    priority_apply: true,
  },
  power: {
    name: "Power",
    auto: 250,
    manual: 2500,
    days: 90,
    price: 1179,
    label: "Power - ₹1179 / 90 days • 250 Auto + 2500 Links (~28/day) + Resume + Priority",
    resume_rewrite: true,
    priority_apply: true,
  },
};

const ADDONS = {
  resume_rewrite: {
    id: "resume_rewrite",
    name: "Resume Rewrite ATS 90%",
    price: 99,
    type: "one-time",
    included_in: ["popular", "power"],
    desc: "AI rewrite resume to ATS-friendly, 90% score, free in Popular & Power",
  },
  priority_apply: {
    id: "priority_apply",
    name: "Priority Apply",
    price: 79,
    type: "monthly",
    included_in: ["starter", "popular", "power"],
    desc: "Your applications go first at 9:00 AM before free users at 9:30 AM. Included in all paid plans. Add-on 79/month extra priority (8:30 AM).",
  },
  country_pack: {
    id: "country_pack",
    name: "Country Pack - Remote US/EU Filter",
    price: 200,
    type: "one-time",
    included_in: ["power"],
    desc: "Unlock Remote US/EU/Worldwide filter using RemoteOK + Arbeitnow + Greenhouse Remote. Adds location filter.",
  },
};

/**
 * Returns formatted paywall message
 */
function getPaywallMessage() {
  return `🎉 *WhatsHire Plans - Real Live Jobs Only!*

🆓 *FREE - ₹0*
• 3 Auto-applies (we apply for you)
• 10 Live Job Links
• Lifetime free

1️⃣ *STARTER - ₹249 / 30 days*
• 20 Auto-applies
• 100 Manual Live Links
• ~7 fresh jobs/day

2️⃣ *POPULAR ⭐ BEST VALUE - ₹471 / 60 days*
• 100 Auto-applies
• 1,000 Manual Live Links
• ~20 fresh jobs/day
• ✅ FREE Resume Rewrite worth ₹99 included
• ✅ Priority Apply included

3️⃣ *POWER - ₹1,179 / 90 days*
• 250 Auto-applies
• 2,500 Manual Live Links
• ~28 fresh jobs/day
• ✅ Resume Rewrite + Priority Apply included

_All jobs LIVE verified HEAD 200 from Greenhouse/Lever/Ashby/RemoteOK/Arbeitnow._

Reply *1*, *2*, *3* to upgrade. For demo type 'paid' + plan name e.g. \`paid popular\` to activate instantly.`;
}

/**
 * Returns formatted Add-ons store message
 */
function getAddonsMessage() {
  return `🛒 *WhatsHire Add-Ons:*

1️⃣ *Resume Rewrite* - ₹99 _(FREE in Popular & Power)_
ATS 90% rewrite, 3 optimized versions & keyword boost.

2️⃣ *Priority Apply* - ₹79/month
Apply at 9 AM first batch. Included in Starter/Popular/Power as basic priority, this add-on gives super priority 8:30 AM.

3️⃣ *Country Pack* - ₹200 _(FREE in Power)_
Unlock Remote filter: US, EU, Worldwide live jobs. Filter by 'Remote US', 'Remote EU', etc.

👉 *To purchase, reply:* \`buy resume\`, \`buy priority\`, \`buy country\`
_(For instant demo type 'bought {name}' e.g. \`bought country\`)_`;
}

/**
 * Check if a user has access to an add-on (via active purchase or plan inclusion)
 */
function hasAddonAccess(user, addonKey) {
  if (!user) return false;
  
  // 1. Check if included in current plan
  const plan = user.plan || 'free';
  const addon = ADDONS[addonKey];
  if (addon && addon.included_in && addon.included_in.includes(plan)) {
    return true;
  }

  // 2. Check purchased add-ons
  if (Array.isArray(user.addons)) {
    const purchased = user.addons.find(a => a.name === addonKey || a.name === addon?.name);
    if (purchased) {
      if (!purchased.expiry || new Date() <= new Date(purchased.expiry)) {
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  PLANS,
  ADDONS,
  getPaywallMessage,
  getAddonsMessage,
  hasAddonAccess,
};
