


var Promise = require('bluebird');
var jsdom = require("jsdom");
var R = require('ramda');
var http = Promise.promisifyAll(require("http"), { suffix: "Async" });
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
var requestAsync = Promise.promisify(require('request'));
var path = require('path');
var moment = require('moment');

const years = R.range(2000, 2016);
const root = "http://www.supremecourt.gov/oral_arguments/argument_transcript/";


const rowWork = (window, row) => {

  var tds = window.$("td", row);
  // console.log(tds);
  if (tds.length != 2) return false;
  // var content = tds[0].innerHTML;
  var link = window.$("a", tds[0]);
  // console.log(link);
  var code = link.text().trim();
  // var title = window.$("span", tds[0]).children[0].innerHTML;
  if (!code) return false;
  var title = window.$("span", tds[0]).text();
  // debugger;

  var pathToPDF = root + link.attr('href');
  var dateArgued = tds[1].innerHTML;
  var fullPath = root + pathToPDF;
  const date = moment(dateArgued, "MM/DD/YYYY").toISOString();
  const fileDate = moment(dateArgued, "MM/DD/YYYY").format('YYYY-MM-DD');
  const fixedTitle = title.replace(/\s+/g, '_').replace(/\\|\//g, '-');
  // console.log(fixedTitle);
  var fullFilename = 'data/' + fileDate + '.' + code + fixedTitle + '.pdf';
  // console.log(code, title, dateArgued, pathToPDF, fullFilename);
  // console.log(year, code, title, dateArgued, pathToPDF, fullFilename);

  const result = {
    code,
    title,
    date,
    pathToPDF,
    fullFilename
  };

  return fs.statAsync(fullFilename).then((stat) => {
    // console.log(fullFilename + ' already exists');
    return Promise.resolve(result);
  }).catch((err) => {
    // good case
    if (err.code != 'ENOENT') {
      console.error('Some other error: ', err.code);
      return Promise.resolve(false);
    }


    return requestAsync(pathToPDF, { encoding: null })
      .then((response) => {
        if (response.statusCode != 200) return Promise.resolve();
        return fs.writeFileAsync(fullFilename, response.body).catch((err) => {
          console.error('Unable to write to ', fullFilename, result);
        });
      })
      .then(() => {
        console.log('Written ' + fullFilename);
        return Promise.resolve(result);
      })

  });



}




const getFilesFromYear = (year) => {
  return new Promise(function(resolve, reject) {

    var path = root + year;
    jsdom.env(
      path,
      ["http://code.jquery.com/jquery.js"],
      function(err, window) {
        var rows = window.$("tr");
        // resolve(rows.length);
        var datas = [];
        for (var i = 0; i < rows.length; i++) {
          datas.push(rowWork(window, rows[i]));
        }
        // var cleanedData = R.filter(R.identity, datas);
        resolve(Promise.all(datas, { concurreny: 2 }));
      }
    );

  });
}


Promise.map(years, getFilesFromYear, { concurreny: 2 }).then((results) => {
  console.log(results.length);


  // return requestAsync("https://alpha.codex10.com/index.html", { encoding: null })
  //   .then((response) => {
  //     if (response.statusCode != 200) return Promise.resolve();
  //     console.log('body', response.body.toString());
  //     return fs.writeFileAsync("data/tmp.html", response.body);
  //   })
  //   .then(() => {
  //     console.log('Written ');
  //     return Promise.resolve(true);
  //   })

});





