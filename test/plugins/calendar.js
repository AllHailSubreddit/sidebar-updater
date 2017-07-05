const fs = require('fs');
const path = require('path');
const moment = require('moment');
const nock = require('nock');
const test = require('ava');
const plugin = require('../../plugins/calendar.js');

const gocardsUrl = 'http://gocards.com';
const gocardsMock = nock(gocardsUrl);
const gocardsRssPath = `/calendar.ashx/calendar.rss`;
const rss = fs.readFileSync(path.join(__dirname, '../fixtures/plugins/calendar/calendar.rss'));

test('plugin | calendar | game basics regular expression matches valid strings', t => {
  const tests = [
    {
      input: '[L] University of Louisville Men\'s Basketball vs  Duke',
      expected: ['[L]', 'Men\'s', 'Basketball', 'vs', 'Duke'],
    },
    {
      input: 'University of Louisville Swimming & Diving vs  NCAA Diving Zones',
      expected: [undefined, undefined, 'Swimming & Diving', 'vs', 'NCAA Diving Zones'],
    },
    {
      input: '[L] University of Louisville Women\'s Tennis at  Clemson',
      expected: ['[L]', 'Women\'s', 'Tennis', 'at', 'Clemson'],
    },
    {
      input: '[N] University of Louisville Track & Field vs  NCAA Indoor Championships',
      expected: ['[N]', undefined, 'Track & Field', 'vs', 'NCAA Indoor Championships'],
    },
    {
      input: '[W] University of Louisville Baseball vs  PITTSBURGH',
      expected: ['[W]', undefined, 'Baseball', 'vs', 'PITTSBURGH'],
    },
    {
      input: '[W] University of Louisville Softball vs  OHIO',
      expected: ['[W]', undefined, 'Softball', 'vs', 'OHIO'],
    },
    {
      input: '[N] University of Louisville Women\'s Rowing  Oak Ridge Cardinal Invitational',
      expected: ['[N]', 'Women\'s', 'Rowing', undefined, 'Oak Ridge Cardinal Invitational'],
    },
    {
      input: 'CANCELLED University of Louisville Softball vs  NORTHERN IOWA',
      expected: ['CANCELLED', undefined, 'Softball', 'vs', 'NORTHERN IOWA'],
    },
    {
      input: '[W] University of Louisville Men\'s Tennis  NOTRE DAME',
      expected: ['[W]', 'Men\'s', 'Tennis', undefined, 'NOTRE DAME'],
    },
  ];

  tests.forEach(v => {
    t.true(plugin.gameBasicsRegex.test(v.input));
    t.deepEqual(plugin.gameBasicsRegex.exec(v.input).slice(1, v.expected.length + 1), v.expected);
  });
});

test('plugin | calendar | game result regular expression matches valid strings', t => {
  const tests = [
    {
      input: 'N -',
      expected: ['N', undefined, undefined],
    },
    {
      input: 'W 3-0',
      expected: ['W', '3', '0'],
    },
    {
      input: 'W 7-6 (10)',
      expected: ['W', '7', '6'],
    },
    {
      input: 'L 81-77',
      expected: ['L', '81', '77'],
    },
    {
      input: 'W 82-62',
      expected: ['W', '82', '62'],
    },
    {
      input: 'N - 3 Wins',
      expected: ['N', '3', undefined],
    },
    {
      input: 'N - 1st of 22 teams',
      expected: ['N', '1st', undefined],
    },
    {
      input: 'N - 2nd of 22 teams',
      expected: ['N', '2nd', undefined],
    },
    {
      input: 'N - 3rd of 22 teams',
      expected: ['N', '3rd', undefined],
    },
    {
      input: 'N - 4th of 22 teams',
      expected: ['N', '4th', undefined],
    },
    {
      input: 'N - t-5th of 22 teams',
      expected: ['N', 't-5th', undefined],
    },
  ];

  tests.forEach(v => {
    t.true(plugin.gameResultRegex.test(v.input));
    t.deepEqual(plugin.gameResultRegex.exec(v.input).slice(1, v.expected.length + 1), v.expected);
  });
});

test('plugin | calendar | game result regular expression doesn\'t match invalid strings', t => {
  const tests = [
    'Radio: WXVW 1450 AM/96.1 FM',
  ];

  tests.forEach(v => {
    t.false(plugin.gameResultRegex.test(v));
  });
});

test('plugin | calendar | create() throws when given an invalid config argument', t => {
  let error;

  // check if there is a config object at all
  error = t.throws(() => plugin.create(), TypeError);
  t.is(error.message, '"config" is not an object');

  // check if config.end exists as a moment object
  error = t.throws(() => plugin.create({}), TypeError);
  t.is(error.message, '"config.end" is not an instance of moment');

  // check if config.sports exists as an array
  error = t.throws(() => plugin.create({
    end: moment(),
  }), TypeError);
  t.is(error.message, '"config.sports" is not an array');

  // check if config.start exists as a moment object
  error = t.throws(() => plugin.create({
    end: moment(),
    sports: [],
  }), TypeError);
  t.is(error.message, '"config.start" is not an instance of moment');

  // check if config.url exists as a string
  error = t.throws(() => plugin.create({
    end: moment(),
    sports: [],
    start: moment(),
  }), TypeError);
  t.is(error.message, '"config.url" is not a string');
});

test('plugin | calendar | create() returns a function', t => {
  t.not(plugin.create, undefined);
  t.is(typeof plugin.create({
    end: moment(),
    sports: [],
    start: moment(),
    url: '',
  }), 'function');
});

test('plugin | calendar | create() returns a function that returns valid markdown', t => {
  const expected = `\
Sport|Home Team|Score|Visiting Team|Score|Time|TV
-|-|-|-|-|-|-
Women's Rowing|Double Dual (Indiana, Iowa, Kansas)||Louisville|7|Final|
Women's Rowing|Clemson Invitational||Louisville||Final|
Women's Rowing|Michigan||Louisville||Final|`;
  // const expected = [
  //   'Game|Time|TV|Result',
  //   ':-:|:-:|:-:|-:',
  //   'WROW @ _Double Dual (Indiana, Iowa, Kansas)_|4/1 12:00AM||N 7',
  //   'WROW @ _Clemson Invitational_|4/22 12:00AM||',
  //   'WROW @ _Michigan_|4/29 12:00AM||',
  // ].join('\n');

  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.create({
      end: moment('2017-04-30T23:59:59.0000000'),
      sports: ['rowing'],
      start: moment('2017-04-01T00:00:00.0000000'),
      url: gocardsUrl + gocardsRssPath,
    })('{{calendar}}')
    .then(md => t.is(md, expected));
});

test('plugin | calendar | requestGames() returns an array of 239 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 239);
    });
});

test('plugin | calendar | filterBySports() returns a function', t => {
  t.is(typeof plugin.filterBySports([]), 'function');
});

test('plugin | calendar | createSportFilter() returns a filter function for 0 sports and returns an array of 0 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterBySports([]))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 0)
    });
});

test('plugin | calendar | filterBySports() returns a filter function for 1 sport and returns an array of 6 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterBySports(['basketball']))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 6)
    });
});

test('plugin | calendar | filterBySports() returns a filter function for 2 sports and returns an array of 54 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterBySports(['baseball', 'basketball']))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 54)
    });
});

test('plugin | calendar | filterBySports() returns a filter function for all sports and returns an array of 238 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterBySports([
      'baseball',
      'cross country',
      'field hockey',
      'football',
      'men\'s basketball',
      'men\'s golf',
      'men\'s soccer',
      'men\'s tennis',
      'softball',
      'swimming & diving',
      'track & field',
      'women\'s basketball',
      'women\'s golf',
      'women\'s lacrosse',
      'women\'s rowing',
      'women\'s soccer',
      'women\'s tennis',
      'women\'s volleyball',
    ]))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 238)
    });
});

test('plugin | calendar | filterByDateRange() returns a function', t => {
  t.is(typeof plugin.filterByDateRange(moment(), moment()), 'function');
});

test('plugin | calendar | filterByDateRange() returns a filter function for an invalidate date range and returns an array of 0 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterByDateRange(
      moment(),
      moment().subtract({days: 1}),
    ))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 0);
    });
});

test('plugin | calendar | filterByDateRange() returns a filter function for a valid date range and returns an array of 91 items', t => {
  // mock the rss http response
  gocardsMock.get(gocardsRssPath)
    .reply(200, rss);

  return plugin.requestGames(gocardsUrl + gocardsRssPath)
    .then(plugin.filterByDateRange(
      moment('2017-04-01T00:00:00.0000000'),
      moment('2017-04-30T23:59:59.0000000'),
    ))
    .then(items => {
      t.true(Array.isArray(items));
      t.is(items.length, 91)
    });
});

test('plugin | calendar | parseItemDescription() returns an object', t => {
  const tests = [
    {
      description: 'University of Louisville Swimming & Diving vs  NCAA Diving Zones\n http://gocards.com/calendar.aspx?id=13637',
      expected: {
        isCancelled: false,
        isHome: true,
        gender: null,
        opponent: 'NCAA Diving Zones',
        sport: 'Swimming & Diving',
      }
    },
    {
      description: '[N] University of Louisville Track & Field vs  NCAA Indoor Championships\nN -\n http://gocards.com/calendar.aspx?id=13833',
      expected: {
        isCancelled: false,
        isHome: true,
        gender: null,
        opponent: 'NCAA Indoor Championships',
        opponentScore: null,
        result: 'N',
        score: null,
        sport: 'Track & Field',
      },
    },
    {
      description: '[L] University of Louisville Men\'s Basketball vs  Duke\nL 81-77\nTV: ESPN/ACC Network\nStreaming Video: http://es.pn/2l4X8k0\nStreaming Audio: http://gocards.com/showcase?Live=609\n http://gocards.com/calendar.aspx?id=13548',
      expected: {
        audio: 'http://gocards.com/showcase?Live=609',
        isCancelled: false,
        isHome: true,
        gender: 'Men\'s',
        opponent: 'Duke',
        opponentScore: '77',
        result: 'L',
        score: '81',
        sport: 'Basketball',
        tv: 'ESPN/ACC Network',
        video: 'http://es.pn/2l4X8k0',
      },
    },
    {
      description: '[W] University of Louisville Baseball vs  PITTSBURGH\nW 3-0\nTV: ACC Network Extra\nRadio: TuneIn/93.9 The Ville\nStreaming Video: http://es.pn/2myA7ex\nStreaming Audio: http://gocards.com/showcase?Live=581\n http://gocards.com/calendar.aspx?id=13763',
      expected: {
        audio: 'http://gocards.com/showcase?Live=581',
        isCancelled: false,
        isHome: true,
        gender: null,
        opponent: 'PITTSBURGH',
        opponentScore: '0',
        radio: 'TuneIn/93.9 The Ville',
        result: 'W',
        score: '3',
        sport: 'Baseball',
        tv: 'ACC Network Extra',
        video: 'http://es.pn/2myA7ex',
      },
    },
    {
      description: 'CANCELLED University of Louisville Softball vs  NORTHERN IOWA\nTV: ACC Network Extra\nStreaming Video: http://www.watchespn.com/\n http://gocards.com/calendar.aspx?id=13757',
      expected: {
        isCancelled: true,
        isHome: true,
        gender: null,
        opponent: 'NORTHERN IOWA',
        sport: 'Softball',
        tv: 'ACC Network Extra',
        video: 'http://www.watchespn.com/',
      },
    },
    {
      description: '[N] University of Louisville Women\'s Rowing  Oak Ridge Cardinal Invitational\nN - 4 Wins\n http://gocards.com/calendar.aspx?id=13924',
      expected: {
        isCancelled: false,
        isHome: false,
        gender: 'Women\'s',
        opponent: 'Oak Ridge Cardinal Invitational',
        opponentScore: null,
        result: 'N',
        score: '4',
        sport: 'Rowing',
      },
    },
    {
      description: '[N] University of Louisville Men\'s Golf  Kingsmill Invitational\nN - 1st of 22 teams\n http://gocards.com/calendar.aspx?id=13427',
      expected: {
        isCancelled: false,
        isHome: false,
        gender: 'Men\'s',
        opponent: 'Kingsmill Invitational',
        opponentScore: null,
        result: 'N',
        score: '1st',
        sport: 'Golf',
      },
    },
  ];

  tests.forEach(v => {
    t.is(typeof plugin.parseItemDescription(v.description), 'object');
    t.deepEqual(plugin.parseItemDescription(v.description), v.expected);
  });
});

test('plugin | calendar | parseItem() returns an object', t => {
  const item = {
    title: '3/9 2:00 PM [L] University of Louisville Men\'s Basketball vs  Duke',
    description: '[L] University of Louisville Men\'s Basketball vs  Duke\nL 81-77\nTV: ESPN/ACC Network\nStreaming Video: http://es.pn/2l4X8k0\nStreaming Audio: http://gocards.com/showcase?Live=609\n http://gocards.com/calendar.aspx?id=13548',
    link: 'http://gocards.com/calendar.aspx?id=13548',
    guid: 'http://gocards.com/calendar.aspx?id=13548',
    location: 'Brooklyn, NY (Barclays Center)',
    startdate: moment('2017-03-09T19:00:00.0000000Z'),
    enddate: moment('2017-03-09T21:00:00.0000000Z'),
    localstartdate: moment('2017-03-09T14:00:00.0000000'),
    localenddate: moment('2017-03-09T16:00:00.0000000'),
    teamlogo: 'http://gocards.com/images/logos/site/site.png',
    opponentlogo: 'http://gocards.com/images/logos/Duke_.png',
    gameid: '13548',
    gamepromoname: '',
  };
  const expected = {
    audio: 'http://gocards.com/showcase?Live=609',
    end: moment('2017-03-09T16:00:00.0000000'),
    gender: 'Men\'s',
    id: '13548',
    isCancelled: false,
    isHome: true,
    location: 'Brooklyn, NY (Barclays Center)',
    opponent: 'Duke',
    opponentScore: '77',
    promoName: null,
    radio: null,
    result: 'L',
    score: '81',
    sport: 'Basketball',
    start: moment('2017-03-09T14:00:00.0000000'),
    tickets: null,
    tv: 'ESPN/ACC Network',
    url: 'http://gocards.com/calendar.aspx?id=13548',
    video: 'http://es.pn/2l4X8k0',
  };

  t.is(typeof plugin.parseItem(item), 'object');
  t.deepEqual(plugin.parseItem(item), expected);
});

test('plugin | calendar | formatGamesForDisplay() returns correct markdown for a past game', t => {
  const games = [{
    audio: 'http://gocards.com/showcase?Live=609',
    end: moment('2017-03-09T16:00:00.0000000'),
    gender: 'Men\'s',
    id: '13548',
    isCancelled: false,
    isHome: true,
    location: 'Brooklyn, NY (Barclays Center)',
    opponent: 'Duke',
    opponentScore: '77',
    promoName: null,
    radio: null,
    result: 'W',
    score: '81',
    sport: 'Basketball',
    start: moment('2017-03-09T14:00:00.0000000'),
    tickets: null,
    tv: 'ESPN/ACC Network',
    url: 'http://gocards.com/calendar.aspx?id=13548',
    video: 'http://es.pn/2l4X8k0',
  }];
  // const expected = [
  //   'Game|Time|TV|Result',
  //   ':-:|:-:|:-:|-:',
  //   'MBB vs _Duke_|3/9 2:00PM|[](#i/espn) [](#i/acc-network)|L 81-77'
  // ].join('\n');
  const expected = `\
Sport|Home Team|Score|Visiting Team|Score|Time|TV
-|-|-|-|-|-|-
Men's Basketball|[Louisville](#calendar/winner)|81|Duke|77|Final|`;

  t.is(plugin.formatGamesForDisplay(games), expected);
});

test('plugin | calendar | formatGamesForDisplay() returns correct markdown for a future game', t => {
  const games = [{
    audio: 'http://gocards.com/showcase?Live=609',
    end: moment('2020-03-09T16:00:00.0000000'),
    gender: 'Men\'s',
    id: '13548',
    isCancelled: false,
    isHome: true,
    location: 'Brooklyn, NY (Barclays Center)',
    opponent: 'Duke',
    opponentScore: '77',
    promoName: null,
    radio: null,
    result: 'W',
    score: '81',
    sport: 'Basketball',
    start: moment('2020-03-09T14:00:00.0000000'),
    tickets: null,
    tv: 'ESPN/ACC Network',
    url: 'http://gocards.com/calendar.aspx?id=13548',
    video: 'http://es.pn/2l4X8k0',
  }];
  const expected = `\
Sport|Home Team|Score|Visiting Team|Score|Time|TV
-|-|-|-|-|-|-
Men's Basketball|[Louisville](#calendar/winner)|81|Duke|77|3/9 2:00PM|[](#i/espn) [](#i/acc-network)`;

  t.is(plugin.formatGamesForDisplay(games), expected);
});

test('plugin | calendar | formatGamesForDisplay() returns correct markdown for 0 games', t => {
  const games = [];
  const expected = '[](#calendar/empty)';

  t.is(plugin.formatGamesForDisplay(games), expected);
});
