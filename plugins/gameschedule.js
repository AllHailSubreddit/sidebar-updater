'use strict';

const Axios = require('axios');
const moment = require('moment');
const Xml = require('../lib/xml');

const parseXml = Xml.createParser();
const summaryRegex = /(?:\[[lLnNtTwW]\]\s*)?(.*?)\s*(at|vs)?\s{2}(.*)/;
const supplementaryRegex = /(.+?):\s*(.*)/;
const resultRegex = /([lLnNtTwW])\s*(\d+-\d+)/;
const sportAbbreviations = {
  'baseball': 'BB',
  'cross country': 'XC',
  'field hockey': 'FH',
  'football': 'FB',
  'men\'s basketball': 'MBB',
  'men\'s golf': 'MGOLF',
  'men\'s soccer': 'MSOC',
  'men\'s tennis': 'MTEN',
  'softball': 'SFTBL',
  'swimming & diving': 'SWIM',
  'track & field': 'TRACK',
  'women\'s basketball': 'WBB',
  'women\'s golf': 'WGOLF',
  'women\'s lacrosse': 'WLAX',
  'women\'s rowing': 'WROW',
  'women\'s soccer': 'WSOC',
  'women\'s tennis': 'WTEN',
  'women\'s volleyball': 'WVB',
};
const gameDefaults = {
  audio: null,
  date: null,
  time: null,
  datetime: null,
  isHomeGame: false,
  link: null,
  location: null,
  opponent: null,
  result: null,
  score: null,
  sport: null,
  tickets: null,
  tv: null,
  video: null,
};

function sportTransform(sport) {
  if (sport) {
    sport = sportAbbreviations[sport.toLowerCase()] || sport;
  }

  return sport;
}

module.exports = function gameSchedule(config) {
  const sportsRegex = new RegExp(config.sports.join('|'), 'i');

  return function (sidebarMarkdown) {
    return Axios.get(config.url)
      // parse the xml response
      .then(response => parseXml(response.data))
      // get only the necessary portion of the xml
      .then(xml => xml.channel.item)
      // create game objects from each xml item
      .then(items => {
        return items.filter(item => {
            return moment.isMoment(item.localstartdate) &&
              item.localstartdate.isValid() &&
              item.localstartdate.isBetween(config.start, config.end)
          })
          .map(item => {
            const game = Object.assign({}, {
              date: item.localstartdate,
              time: item.localstartdate,
              datetime: item.localstartdate,
              link: item.link,
              location: item.location,
            });

            // parse the description
            item.description.split('\\n')
              .map(value => value.trim())
              .forEach((value, index, array) => {
                if (index === 0 && summaryRegex.test(value)) {
                  // get the game summary (sport, vs/at, opponent)
                  let match = summaryRegex.exec(value);
                  game.sport = match[1] || null;
                  game.isHomeGame = match[2] && match[2].toLowerCase() === 'vs';
                  game.opponent = match[3] || null;
                } else if (index !== (array.length - 1)) {
                  if (supplementaryRegex.test(value)) {
                    // get supplementary info
                    // (tv coverage, audio/video stream, tickets, etc.)
                    let match = supplementaryRegex.exec(value);

                    switch (match[1].toLowerCase()) {
                      case 'tv':
                        game.tv = match[2];
                        break;
                      case 'streaming audio':
                        game.audio = match[2];
                        break;
                      case 'straming video':
                        game.video = match[2];
                        break;
                      case 'tickets':
                        game.tickets = match[2];
                        break;
                      default:
                        break;
                    }
                  } else if (resultRegex.test(value)) {
                    // get the result of a past game (win/loss, score)
                    let match = resultRegex.exec(value);
                    game.result = match[1] || null;
                    game.score = match[2] || null;
                  }
                }
              });

            return game;
          })
          // filter games by those listed in the config
          .filter(game => game.sport && sportsRegex.test(game.sport))
          // reduce the games into markdown
          .reduce((lines, game, index, array) => {
            lines.push([
              game.sport && game.opponent ? `${sportTransform(game.sport)} ${game.isHomeGame ? 'vs' : '@'} _${game.opponent}_` : '',
              game.datetime ? game.datetime.format('M/D h:mmA') : '',
              game.tv ? game.tv : '',
              game.result && game.score ? `${game.result} ${game.score}` : '',
            ].join('|'));

            return lines;
          }, [
            // table headers and alignment
            'Game|Time|TV|Result',
            ':--:|:--:|:-:|----:',
          ])
          .join('\n');
      })
      // place the game schedule markdown into the sidebar markdown
      .then(gameScheduleMarkdown => sidebarMarkdown.replace(config.placeholder, gameScheduleMarkdown));
  }
};
