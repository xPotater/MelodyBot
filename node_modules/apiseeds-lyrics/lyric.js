'use strict';

const https = require("https");

const url = 'https://orion.apiseeds.com/api/music/lyric/';

var getLyric = function (apikey,artist,track,callback){
    if(!apikey)
    {
        callback({ success:false,error: 'Api key no found, please set it using setApiKey method'},false);
        return false;
    }
    https.get(url+artist+"/"+track+"?apikey="+apikey, res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", data => {
            body += data;
        });
        res.on("end", () => {
            body = JSON.parse(body);
            callback(body, res.headers);
        });
        res.on("error", (e) => {
            callback(false);
        });
    });
}

module.exports = {
    getLyric
}