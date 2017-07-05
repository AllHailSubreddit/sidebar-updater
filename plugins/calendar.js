'use strict';

const axios = require('axios');
const moment = require('moment');
const xml = require('../lib/xml');

const parseXml = xml.createParser({
  valueProcessors: [parseDate],
});
const gameBasicsRegex = /^(?:(cancelled|\[[lntw]\])\s+)?university of louisville\s(?:(men's|women's)\s)?(baseball|basketball|cross country|field hockey|football|golf|lacrosse|rowing|soccer|softball|swimming & diving|tennis|track & field|volleyball)(?:\s+(?:(at|vs)\s+)?(.*))?$/i;
const gameResultRegex = /^([lntw])\s+(?:-\s+)?(?:((?:t-)?\d{1,3}(?:st|nd|rd|th)?)(?:-(\d{1,3}))?)?/i
const gameDefaults = {
  audio: null,
  gender: null,
  id: null,
  isCancelled: false,
  isHome: false,
  location: null,
  opponent: null,
  opponentScore: null,
  promoName: null,
  radio: null,
  result: null,
  score: null,
  sport: null,
  start: null,
  tickets: null,
  tv: null,
  url: null,
  video: null,
};

module.exports = {
  create,
  gameBasicsRegex,
  gameResultRegex,
  requestGames,
  filterBySports,
  filterByDateRange,
  parseItemDescription,
  parseItem,
  formatGamesForDisplay,
};

/**
 * Creates a new plugin function that retrieves an RSS feed and transforms the
 * RSS data into a markdown table with the specified parameters.
 *
 * @param    {Object}  config  Configuration options for the plugin function.
 *
 * @returns  {Function}        Plugin function.
 */
function create(config) {
  validateConfig(config);

  return function calendar(sidebar) {
    return requestGames(config.url)
      .then(filterBySports(config.sports))
      .then(filterByDateRange(config.start, config.end))
      .then(items => items.map(parseItem))
      .then(formatGamesForDisplay)
      .then(md => sidebar.replace(/{{\s*calendar\s*}}/ig, md));
  };
};

/**
 * Parses an RSS string and retrieves the items from the feed.
 *
 * @param    {String}  data  The RSS data.
 *
 * @returns  {Promise}       Items from the RSS feed.
 */
function requestGames(url) {
  return axios.get(url)
    .then(response => parseXml(response.data))
    .then(xml => xml.channel.item);
};

/**
 * Creates a filter function that tests item titles against an array of sport
 * names.
 *
 * @param    {Array}  sports  Sport names.
 *
 * @returns  {Function}       Function for filtering by sport names.
 */
function filterBySports(sports) {
  const regex = new RegExp(sports.join('|'), 'i');

  return function sportsFilter(items) {
    if (sports.length === 0) {
      return [];
    }

    return items.filter(item => {
      return regex.test(item.title);
    });
  };
};

/**
 * Creates a filter function that tests item start and end dates to see if they
 * fit within the provided date range.
 *
 * @param    {Moment}  start  The start date.
 * @param    {Moment}  end    The end date.
 *
 * @returns  {Function}       Function for filtering by date.
 */
function filterByDateRange(start, end) {
  return function dateRangeFilter(items) {
    if (end.isBefore(start)) {
      return [];
    }

    return items.filter(item => {
      return moment.isMoment(item.localstartdate) &&
        item.localstartdate.isValid() &&
        item.localstartdate.isSame(start) ||
        item.localstartdate.isSame(end) ||
        item.localstartdate.isBetween(start, end);
    });
  };
};

/**
 * Pulls information from a game description string and converts that
 * information into an object.
 *
 * @param    {String}  description  The description to parse.
 *
 * @returns  {Object}               The parsed description.
 */
function parseItemDescription(description) {
  if (description === undefined || typeof description !== 'string') {
    return {};
  }

  return description.split(/(\n|\\n)/)
    .map(v => v.trim())
    .reduce((a, v) => {
      if (gameBasicsRegex.test(v)) {
        const [, result, gender, sport, atOrVs, opponent] = gameBasicsRegex.exec(v);
        return Object.assign(a, {
          isCancelled: result !== undefined && result.toLowerCase() === 'cancelled',
          isHome: atOrVs !== undefined && atOrVs.toLowerCase() === 'vs',
          gender: gender || null,
          opponent: opponent || null,
          sport: sport || null,
        });
      } else if (gameResultRegex.test(v)) {
        const [, result, score, opponentScore] = gameResultRegex.exec(v);
        return Object.assign(a, {
          opponentScore: opponentScore || null,
          result: result || null,
          score: score || null,
        });
      } else {
        const [key, value] = v.split(/:\s*(.*)/).map(e => e.trim());
        switch (key.toLowerCase()) {
          case 'radio':
            return Object.assign(a, {radio: value || null});
          case 'streaming audio':
            return Object.assign(a, {audio: value || null});
          case 'streaming video':
            return Object.assign(a, {video: value || null});
          case 'tickets':
            return Object.assign(a, {tickets: value || null});
          case 'tv':
            return Object.assign(a, {tv: value || null});
          default:
            break;
        }
      }

      return a;
    }, {});
};

/**
 * Parses an item and converts it into a useable object for output.
 *
 * @param    {Object}  item  The item to parse and convert.
 *
 * @returns  {Object}        The parsed and converted item.
 */
function parseItem(item) {
  return Object.assign({}, gameDefaults, parseItemDescription(item.description), {
    end: item.localenddate,
    id: item.gameid || null,
    location: item.location || null,
    promoName: item.gamepromoname || null,
    start: item.localstartdate,
    url: item.link || null,
  });
};


function formatGamesForDisplay(games) {
  if (!games.length) {
    return '[](#calendar/empty)';
  }

  return games.reduce((a, v) => {
      if (!v.sport || !v.opponent) {
        return a;
      }

      // a.push([
      //   v.sport && v.opponent ? `${formatSportForDisplay(v.sport, v.gender)} ${v.isHome ? 'vs' : '@'} _${v.opponent}_` : '',
      //   v.start ? v.start.format('M/D h:mmA') : '',
      //   v.tv ? formatTvForDisplay(v.tv) : '',
      //   v.result && v.score ? `${v.result} ${formatScoresForDisplay(v.score, v.opponentScore)}` : '',
      // ].join('|'));

      const isAfterEnd = v.end.isBefore(moment());
      const louisville = v.result && v.result.toLowerCase() === 'w' ? '[Louisville](#calendar/winner)' : 'Louisville';
      const opponent = v.result && v.result.toLowerCase() === 'l' ? `[${v.opponent}](#calendar/winner)` : v.opponent;

      a.push([
        (v.gender ? `${v.gender} ` : '') + v.sport,
        v.isHome ? louisville : opponent,
        v.isHome ? v.score : v.opponentScore,
        v.isHome ? opponent : louisville,
        v.isHome ? v.opponentScore : v.score,
        isAfterEnd ? 'Final' : v.start.format('M/D h:mmA'),
        isAfterEnd ? '' : formatTvForDisplay(v.tv)
      ].join('|'));

      return a;
    }, [
      'Sport|Home Team|Score|Visiting Team|Score|Time|TV',
      '-|-|-|-|-|-|-'
    ])
    .join('\n');
}

function formatSportForDisplay(sport, gender) {
  if (typeof sport !== 'string') {
    return '';
  }

  const transforms = {
    'baseball': 'BB',
    'basketball': 'BB',
    'cross country': 'XC',
    'field hockey': 'FH',
    'football': 'FB',
    'golf': 'GOLF',
    'lacrosse': 'LAX',
    'rowing': 'ROW',
    'soccer': 'SOC',
    'softball': 'SFTBL',
    'swimming & diving': 'SWIM',
    'tennis': 'TEN',
    'track & field': 'TRACK',
    'volleyball': 'VB',
    'men\'s': 'M',
    'women\'s': 'W',
  };
  let display = transforms[sport.toLowerCase()] || '';

  if (typeof gender === 'string') {
    display = (transforms[gender.toLowerCase()] || '') + display;
  }

  return display;
}

function formatScoresForDisplay(score, opponentScore) {
  return score + (opponentScore ? `-${opponentScore}` : '');
}

function formatTvForDisplay(tv) {
  if (!tv) {
    return '';
  }

  return tv.toLowerCase()
    .replace('/',                 ' ')
    .replace('abc',               '[](#i/abc)')
    .replace('acc network',       '[](#i/acc-network)')
    .replace('acc network extra', '[](#i/acc-network-extra)')
    .replace('big ten network',   '[](#i/big-ten-network)')
    .replace('cbs',               '[](#i/cbs)')
    .replace('cbs sports',        '[](#i/cbs-sports)')
    .replace('espn',              '[](#i/espn)')
    .replace('espn2',             '[](#i/espn2)')
    .replace('espn3',             '[](#i/espn3)')
    .replace('espnu',             '[](#i/espnu)')
    .replace('fox',               '[](#i/fox)')
    .replace('fox sports',        '[](#i/fox-sports)')
    .replace('fs1',               '[](#i/fs1)')
    .replace('longhorn network',  '[](#i/longhorn-network)')
    .replace('nbc',               '[](#i/nbc)')
    .replace('nbc sports',        '[](#i/nbc-sports)')
    .replace('pac12',             '[](#i/pac12-network)')
    .replace('rsn',               '[](#i/rsn)')
    .replace('sec network',       '[](#i/sec-network)')
    .replace('tbs',               '[](#i/tbs)')
    .replace('tnt',               '[](#i/tnt)')
    .replace('tru tv',            '[](#i/tru-tv)');
}

function parseDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    value = moment(value);
  }

  return value;
}

function validateConfig(config) {
  if (typeof config !== 'object') {
    throw new TypeError('"config" is not an object');
  }

  if (!moment.isMoment(config.end)) {
    throw new TypeError('"config.end" is not an instance of moment');
  }

  if (!Array.isArray(config.sports)) {
    throw new TypeError('"config.sports" is not an array');
  }

  if (!moment.isMoment(config.start)) {
    throw new TypeError('"config.start" is not an instance of moment');
  }

  if (typeof config.url !== 'string') {
    throw new TypeError('"config.url" is not a string');
  }
}
