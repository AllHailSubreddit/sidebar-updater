'use strict';

const Snoocore = require('snoocore');
const config = {
  userAgent: 'AllHail_Bot-sidebar-updater / v0.1.0 (by /u/AllHail_Bot)',
  oauth: {
    type: 'script',
    key: process.env.REDDIT_CLIENT_ID,
    secret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
    scope: ['wikiread', 'wikiedit'],
  },
  requestTimeout: 10000,
  retryAttempts: 0,
};

module.exports = new Snoocore(config);
