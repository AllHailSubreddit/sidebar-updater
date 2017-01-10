var Axios = require('axios');
var moment = require('moment');
var Snoocore = require('snoocore');
var Xml2js = require('xml2js');
var pkg = require('./package');
// var reddit = new Snoocore({
//   userAgent: 'AllHail_Bot-sidebar-updater / v' + pkg.version + ' (by /u/AllHail_Bot)',
//   oauth: {
//     type: 'script',
//     key: getEnvironmentVariable('REDDIT_CLIENT_ID'),
//     secret: getEnvironmentVariable('REDDIT_CLIENT_SECRET'),
//     username: getEnvironmentVariable('REDDIT_USERNAME'),
//     password: getEnvironmentVariable('REDDIT_PASSWORD'),
//     scope: ['*'],
//   }
// });
var dateRegex = /^\d{4}-\d{2}-\d{2}/;
var sportHomeAndOpponentRegex = /(.*?)\s*(at|vs)?\s{2}(.*)/;
var coverageRegex = /(.+?):\s*(.*)/;
var sportFilters = ['mbb', 'wbb',];
var upcomingOpponentTableHeader = 'Sport||Opponent|Date|Time|TV\n' +
                                  ':-:|:-:|:-:|:-:|:-:|:-:\n';

/**
 * Entry point for the script. Fetches the RSS feed for University of Louisville
 * sports games, parses them, and updates the sidebar for /r/AllHail.
 */
function main() {
  var url = getEnvironmentVariable('CALENDAR_URL');

  Axios.get(url)
    .then(function (response) {
      if (response.status !== 200) {
        throw new Error('Unsuccessful request to "' + url + '".');
      }

      // parse the response data as XML
      return parseXml(response.data);
    })
    // grab the items from the parsed xml
    .then(function (data) { return data.channel.item; })
    // filter and map the items to objects we need
    .then(function (items) {
      var dateRangeStart = moment();
      var dateRangeEnd = moment().add({months: 1});

      // remove items that are in the past or more than a month away
      return items.filter(function (item) {
          return moment.isMoment(item.localstartdate) &&
                 item.localstartdate.isValid() &&
                 item.localstartdate.isBetween(dateRangeStart, dateRangeEnd);
        })
        // transform the items so they contain all of the information we need
        .map(function (item) {
          var newItem = {
            coverage: {},
            datetime: item.localstartdate,
            isHomeGame: false,
            link: item.link || null,
            location: item.location || null,
            opponent: null,
            opponentLogo: item.opponentLogo || null,
            sport: null,
            tickets: null,
          };

          // parse the description for more information
          item.description
            .split('\\n')
            .map(function (value) { return value.trim(); })
            .forEach(function (value, index, array) {
              if (index === (array.length - 1)) {
                return;
              } else if (index === 0) {
                var matches = sportHomeAndOpponentRegex.exec(value);

                if (!matches) {
                  return [];
                }

                var sport = matches[1];
                var opponent = matches[3];
                var isHomeGame = matches[2] ? matches[2].toLowerCase() === 'vs' : false;

                newItem.sport = abbreviateSport(sport);
                newItem.opponent = opponent;
                newItem.isHomeGame = isHomeGame;
              } else {
                var matches = coverageRegex.exec(value);
                var coverageType = matches ? matches[1].toLowerCase() : null;
                var coverageValue = matches ? matches[2] : null;

                if (!matches) {
                  return;
                }

                switch (coverageType) {
                  case 'tv':
                    newItem.coverage.tv = coverageValue;
                    return;
                  case 'streaming audio':
                    newItem.coverage.audio = coverageValue;
                    return;
                  case 'streaming video':
                    newItem.coverage.video = coverageValue;
                    return;
                  case 'tickets':
                    newItem.tickets = coverageValue;
                    return;
                  default:
                    return;
                }
              }
            });

          return newItem;
        })
        .filter(function (item) {
          return item.sport && sportFilters.indexOf(item.sport.toLowerCase()) !== -1;
        })
        .reduce(function (previous, item, index, array) {
          var row = [
            item.sport,
            item.isHomeGame ? 'vs' : '@',
            item.opponent,
            item.datetime.format('M/D'),
            item.datetime.format('h:mmA'),
            item.coverage.tv ? item.coverage.tv : ''
          ].join('|')
          var end = index !== (array.length - 1) ? '\n' : '';
          return previous + row + end;
        }, upcomingOpponentTableHeader);
    })
    // update the subreddit sidebar
    .then(function (markdown) {
      console.log(markdown);
    })
    .catch(function (error) {
      console.log(error);
      throw error;
    });
}

function getEnvironmentVariable(key) {
  var value = process.env[key];

  if (value === void 0) {
    throw new Error('Missing required environment variable "' + key + '".');
  }

  return value;
}

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

function parseDateValueProcessor(value) {
  if (dateRegex.test(value)) {
    value = moment(value);
  }

  return value;
}

function abbreviateSport(sport) {
  switch (sport.toLowerCase()) {
    case 'men\'s basketball':
      return 'MBB';
    case 'women\'s basketball':
      return 'WBB';
    default:
      return sport;
  }
}

// module.exports = main;
main();
