/**
 * /r/AllHail Sidebar Updater
 *
 * This script updates the /r/AllHail sidebar with new information from various
 * sources.
 */
'use strict';

const Axios = require('axios');
const moment = require('moment');
const Snoocore = require('snoocore');
const Xml2js = require('xml2js');

// script configuration
const config = {
  // contains reddit authentication data
  reddit: {
    subreddit: process.env.SIDEBAR_UPDATER_SUBREDDIT,
    template: process.env.SIDEBAR_UPDATER_TEMPLATE,
    // only change the version number in the user agent
    userAgent: 'AllHail_Bot-sidebar-updater / v0.1.0 (by /u/AllHail_Bot)',
  },
  gameSchedule: {
    // game calendar url
    url: 'http://gocards.com/calendar.ashx/calendar.rss',
    placeholder: /{{game_schedule}}/g,
    filter: {
      // each element is a case-sensitive regex
      sports: [
        /[bB]aseball/,
        /[bB]asketball/,
        /[fF]ootball/,
        /[sS]occer/,
        /[vV]olleyball/,
      ],
      // show events within this range, first is the start, second is the end
      dateBetween: [moment().subtract({weeks: 1}), moment().add({weeks: 2})],
    },
    // contains options regarding the markdown output
    markdown: {
      columns: ['sport', 'isHomeTeam', 'opponent', 'result', 'date', 'time', 'tv'],
      headers: {
        sport: 'Sport',
        opponent: 'Opponent',
        result: 'Result',
        date: 'Date',
        time: 'Time',
        tv: 'TV',
      },
      // changes the value of the specific
      formatters: {
        default(value) { return value; },
        date(date) { return date.format('M/D'); },
        isHomeTeam(isHomeTeam) { return isHomeTeam ? 'vs' : '@'; },
        result(result, game) { return game.score ? `${result} ${game.score}` : result; },
        sport(sport) { return abbreviateSport(sport); },
        time(time) { return time.format('h:mmA'); },
      },
    },
  },
};

function abbreviateSport(sport) {
  switch (sport.toLowerCase()) {
    case 'baseball':
      return 'BB';
    case 'cross country':
      return 'XC';
    case 'field hockey':
      return 'FH';
    case 'football':
      return 'FB';
    case 'men\'s basketball':
      return 'MBB';
    case 'men\'s golf':
      return 'MGOLF';
    case 'men\'s soccer':
      return 'MSOC';
    case 'men\'s tennis':
      return 'MTEN';
    case 'softball':
      return 'SFTBL';
    case 'swimming & diving':
      return 'SWIM';
    case 'track & field':
      return 'TRACK';
    case 'women\'s basketball':
      return 'WBB';
    case 'women\'s golf':
      return 'WGOLF';
    case 'women\'s lacrosse':
      return 'WLAX';
    case 'women\'s rowing':
      return 'WROW';
    case 'women\'s soccer':
      return 'WSOC';
    case 'women\'s tennis':
      return 'WTEN';
    case 'women\'s volleyball':
      return 'WVB'
    default:
      return sport;
  }
}

//----------------------DO NOT ALTER CODE BELOW THIS LINE----------------------

const reddit = new Snoocore({
  userAgent: config.reddit.userAgent,
  oauth: {
    type: 'script',
    key: process.env.SIDEBAR_UPDATER_CLIENT_ID,
    secret: process.env.SIDEBAR_UPDATER_CLIENT_SECRET,
    username: process.env.SIDEBAR_UPDATER_USERNAME,
    password: process.env.SIDEBAR_UPDATER_PASSWORD,
    scope: ['modconfig', 'wikiread'],
    requestTimeout: 10000,
    retryAttempts: 0,
  }
});
const gameScheduleSidebarReplaceRegex = /{{game_schedule}}/ig;
const gameScheduleSportsRegex = new RegExp(config.gameSchedule.filter.sports.map(r => r.source).join('|'));
const gameScheduleDateRegex = /^\d{4}-\d{2}-\d{2}/;
const gameScheduleSummaryRegex = /(?:\[[lLnNtTwW]\]\s*)?(.*?)\s*(at|vs)?\s{2}(.*)/;
const gameScheduleSupplementaryRegex = /(.+?):\s*(.*)/;
const gameScheduleResultScoreRegex = /([lLnNtTwW])\s*(\d+-\d+)/;
const gameDefaults = {
  audio: null,
  date: null,
  time: null,
  datetime: null,
  isHomeTeam: false,
  link: null,
  location: null,
  opponent: null,
  opponentLogo: null,
  result: null,
  score: null,
  sport: null,
  tickets: null,
  tv: null,
  video: null,
};

/**
 * Entry point for the script. Fetches the RSS feed for University of Louisville
 * sports games, parses them, and updates the sidebar for /r/AllHail.
 */
function main() {
  Axios.get(config.gameSchedule.url)
    .then(response => {
      if (response.status !== 200) {
        throw new Error(`Unsuccessful request to "${url}".`);
      }

      // parse the response data as XML
      return parseXml(response.data);
    })
    // grab the items from the parsed xml
    .then(data => data.channel.item)
    // filter and map the items to objects we need
    .then(items => {
      // remove items that are in the past or more than a month away
      return items.filter(item => {
          return moment.isMoment(item.localstartdate) &&
                 item.localstartdate.isValid() &&
                 item.localstartdate.isBetween(config.gameSchedule.filter.dateBetween[0], config.gameSchedule.filter.dateBetween[1]);
        })
        // transform the items so they contain all of the information we need
        .map(item => {
          const game = Object.assign({}, {
            date: item.localstartdate,
            time: item.localstartdate,
            datetime: item.localstartdate,
            link: item.link,
            location: item.location,
            opponentLogo: item.opponentLogo,
          });

          // retrieve data from the item description string
          item.description
            .split('\\n')
            .map(value => value.trim())
            .forEach((value, index, array) => {
              if (index === 0) {
                let match = gameScheduleSummaryRegex.exec(value);

                if (!match) {
                  return;
                }

                game.sport = match[1] || null;
                game.isHomeTeam = match[2] && match[2].toLowerCase() === 'vs';
                game.opponent = match[3] || null;
              } else if (index !== (array.length - 1)) {
                if (gameScheduleSupplementaryRegex.test(value)) {
                  let match = gameScheduleSupplementaryRegex.exec(value);

                  switch (match[1].toLowerCase()) {
                    case 'tv':
                      game.tv = match[2];
                      break;
                    case 'streaming audio':
                      game.audio = match[2];
                      break;
                    case 'streaming video':
                      game.video = match[2];
                      break;
                    case 'tickets':
                      game.tickets = match[2];
                      break;
                    default:
                      break;
                  }
                } else if (gameScheduleResultScoreRegex.test(value)) {
                  let match = gameScheduleResultScoreRegex.exec(value);
                  game.result = match[1] || null;
                  game.score = match[2] || null;
                }
              }
            });

          return game;
        })
        // only keep the games for sports we want to display
        .filter(game => game.sport && gameScheduleSportsRegex.test(game.sport))
        // create the markdown
        .reduce((lines, game, index, array) => {
          // if we're on the first game, create the header and alignment lines
          if (index === 0) {
            lines[0] = config.gameSchedule.markdown.columns
              .map(column => config.gameSchedule.markdown.headers[column] || '')
              .join('|');
            lines[1] = config.gameSchedule.markdown.columns
              .map(_ => ':-:')
              .join('|');
          }

          // format the game into a line of markdown based on the config
          lines[index + 2] = config.gameSchedule.markdown.columns
            .map(column => {
              const formatter = config.gameSchedule.markdown.formatters[column] || config.gameSchedule.markdown.formatters.default;
              const value = game[column];
              return value !== null && value !== void 0 ? formatter(value, game) : '';
            })
            .join('|');

            return lines;
        }, [])
        .join('\n');
    })
    // get the sidebar markdown, insert the game schedule, update the sidebar
    .then(gameSchedule => {
      const templateRequest = reddit('/r/$subreddit/wiki/$template').get({
        $subreddit: config.reddit.subreddit,
        $template: config.reddit.template,
      });
      const settingsRequest = reddit('/r/$subreddit/about/edit').get({
        $subreddit: config.reddit.subreddit,
      });

      return Promise.all([templateRequest, settingsRequest])
        .then(responses => {
          const template = responses[0].data.content_md;
          const sidebar = template.replace(config.gameSchedule.placeholder, gameSchedule);
          const settings = responses[1].data;
          const newSettings = {
            allow_images: settings.allow_images,
            allow_top: settings.allow_top,
            api_type: settings.api_type,
            collapse_deleted_comments: settings.collapse_deleted_comments,
            comment_score_hide_mins: settings.comment_score_hide_mins,
            description: sidebar,
            exclude_banned_modqueue: settings.exclude_banned_modqueue,
            'header-title': settings.header_hover_text,
            hide_ads: settings.hide_ads,
            lang: settings.language,
            link_type: settings.content_options,
            name: config.reddit.subreddit,
            over_18: settings.over_18,
            public_description: settings.public_description,
            public_traffic: settings.public_traffic,
            show_media: settings.show_media,
            show_media_preview: settings.show_media_preview,
            spam_comments: settings.spam_comments,
            spam_links: settings.spam_links,
            spam_selfposts: settings.spam_selfposts,
            sr: settings.subreddit_id,
            submit_link_label: settings.submit_link_label,
            submit_text: settings.submit_text,
            submit_text_label: settings.submit_text_label,
            suggested_comment_sort: settings.suggested_comment_sort,
            title: settings.title,
            type: settings.subreddit_type,
            wiki_edit_age: settings.wiki_edit_age,
            wiki_edit_karma: settings.wiki_edit_karma,
            wikimode: settings.wikimode,
          };

          return reddit('/api/site_admin').post(newSettings);
        });
    })
    .catch(function (error) {
      console.log(error.stack);
      process.exit(1);
    });
}

/**
 * Parses an XML string into an object.
 */
function parseXml(xml) {
  var parserOptions = {
    emptyTag: null,
    explicitArray: false,
    explicitRoot: false,
    ignoreAttrs: true,
    includeWhiteChars: false,
    normalizeTags: true,
    trim: true,
    tagNameProcessors: [Xml2js.processors.stripPrefix],
    valueProcessors: [parseDateValueProcessor],
  };
  var parser = new Xml2js.Parser(parserOptions);

  return new Promise(function (resolve, reject) {
    parser.parseString(xml, function (error, data) {
      if (error) {
        return reject(error);
      }

      return resolve(data);
    });
  });
}

/**
 * Transforms dates into instances of moment.
 */
function parseDateValueProcessor(value) {
  if (typeof value === 'string' && gameScheduleDateRegex.test(value)) {
    value = moment(value);
  }

  return value;
}

exports.handler = main;

if (!module.parent) {
  main();
}
