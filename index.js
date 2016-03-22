


var jsdom = require("jsdom");
var R = require('ramda');
var http = require('http');
var fs = require('fs');

var years = R.range(2000, 2016);
var root = "http://www.supremecourt.gov/oral_arguments/argument_transcript/";




R.forEach((year) => {
  var path = root + year;

  jsdom.env(
    path,
    ["http://code.jquery.com/jquery.js"],
    function(err, window) {
      var rows = window.$("tr");
      for (var i = 0; i < rows.length; i++) {
        var tds = window.$("td", rows[i]);
        // console.log(tds);
        if (tds.length != 2) continue;
        // var content = tds[0].innerHTML;
        var link = window.$("a", tds[0]);
        console.log(link);
        var code = link.text().trim();
        // var title = window.$("span", tds[0]).children[0].innerHTML;
        if (!code) continue;
        var title = window.$("span", tds[0]).text();
        // debugger;

        var pathToPDF = link.attr('href');
        var dateArgued = tds[1].innerHTML;
        console.log(code, title, dateArgued, pathToPDF);
      }
      // console.log("there have been", window.$("tr").length, "io.js releases!");
    }
  );
}, years);




