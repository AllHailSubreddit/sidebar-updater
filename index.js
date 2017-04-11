/**
 * /r/AllHail Sidebar Updater
 *
 * This script updates the /r/AllHail sidebar on a regular basis.
 */
'use strict';

const moment = require('moment');
const reddit = require('./lib/reddit');
const plugins = {
  calendar: require('./plugins/calendar'),
};

exports.handler = function handler() {
  return reddit('/r/$subreddit/wiki/$template').get({
      $subreddit: process.env.REDDIT_SUBREDDIT,
      $template: process.env.REDDIT_TEMPLATE,
    })
    .then(response => response.data.content_md)
    .then(plugins.calendar.create({
      url: process.env.GAMESCHEDULE_URL,
      start: moment().subtract({days: 7}),
      end: moment().add({days: 14}),
      sports: [
        'baseball',
        'basketball',
        'football',
        'soccer',
        'volleyball',
      ],
    }))
    .then(markdown => {
      return reddit('/r/$subreddit/api/wiki/edit').post({
        $subreddit: process.env.REDDIT_SUBREDDIT,
        content: markdown,
        page: 'config/sidebar',
        reason: `[${moment().utc().format()}] AllHail_Bot-sidebar-updater`
      });
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      console.error(`Stacktrace:\n${error.stack}`);
      process.exit(1);
    });
};

if (!module.parent) {
  exports.handler();
}
