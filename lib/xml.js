'use strict';

const moment = require('moment');
const xml2js = require('xml2js');
const defaults = {
  emptyTag: null,
  explicitArray: false,
  explicitRoot: false,
  ignoreAttrs: true,
  includeWhiteChars: false,
  normalizeTags: true,
  trim: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
  valueProcessors: [parseDate],
};
const dateRegex = /^\d{4}-\d{2}-\d{2}/;

function parseDate(value) {
  if (typeof value === 'string' && dateRegex.test(value)) {
    value = moment(value);
  }

  return value;
}

function createParser(options) {
  const settings = Object.assign({}, defaults, options || {});
  return function (data) {
    const parser = new xml2js.Parser(settings);
    return new Promise((resolve, reject) => {
      parser.parseString(data, (error, data) => {
        if (error) {
          return reject(error);
        }

        return resolve(data);
      });
    });
  }
}

module.exports = {
  createParser: createParser,
};
