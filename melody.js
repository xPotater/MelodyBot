// Discord
const Discord = require("discord.js");
const client = new Discord.Client();

// Config and Data JSON files
var cfg = require("./config.json");
var data = require("./data.json");

// File system related libraries
const fs = require("fs");
const decache = require("decache");

// Youtube libraries
const ytsearch = require("youtube-search");
const ytdl = require("ytdl-core");
const ytkey = cfg.ytkey;
const apiseedskey = cfg.apiseedsKey;

// Lyric libraries
var Genius = require("genius-api");
var geniusClient = new Genius(cfg.geniusToken);
var apiseeds = require("apiseeds-lyrics");
var fetch = require("node-fetch");
var cheerio = require("cheerio");

// Time related variables
var time;
var uptime;
var month;
var timeTag;

var globalQueue = [];
var lastCmd;

// Login to the Discord API
client.login(cfg.token);

// Meant to be automatically called every second
function tick()
{
    // Update the time
    updateTime();
        
    // Add 1 to the uptime
    uptime += 1;

    // Throw out old cfg file and re-require it
    decache("./config.json");
    cfg = require("./config.json");

    // Throw out old data file and re-require it
    decache("./data.json");
    data = require("./data.json");
}

// Updates the time (called every second by setInterval)
function updateTime()
{
    time = new Date();
}

// Makes sure an output variable is not too long to be sent
// Param space is the amount of chars that still need to be added
function trimStr(str, space)
{
    if(typeof space === "undefined") space = 0;
    
    if(str.length > 2000-space)
    {
        str = str.substring(0, 1996-space);
        str += "...";
    }
    return str;
}

// Splits a string into mant limit-sized pieces and returns them in an array
function splitStr(str, limit)
{
    if(typeof limit === "undefined") limit = 2000;
    else limit = parseInt(limit);
    
    str = str.split("\n");
    var result = [];
    var tempData = "";

    str.forEach(x => {
        
        if(x.length + tempData.length < limit)
        {
            tempData += x + "\n";
        }
        else
        {
            result.push(tempData);
            tempData = x + "\n";
        }
    })

    if(tempData !== "") result.push(tempData);

    return result;
}

// Logs something to the logChannel
function logEvent(str, hl)
{
    // param hl is optional, default = false
    if(typeof hl === "undefined") hl = false;

    var output = "";

    output += timeTag + "\r\n";
    output += "```";
    if(hl) output += "fix";
    output += "\r\n";
    output += str;

    output = trimStr(output, 4);

    output += "\r\n```"

    console.log(timeTag + " " + str);
    logChannel.send(output);
}

// Checks if the bot has permissions to speak in a channel a message
// was sent in
function canSpeak(msg)
{
    var botMember = msg.guild.member(client.user);
    if(msg.channel.permissionsFor(botMember).has("SEND_MESSAGES"))
    {
        return true;
    }
    else
    {
        msg.author.send("I do not have permission to speak in that channel").catch(() => {
            console.log("Failed to message a user.");
        });
        return false;
    }
}

// Writes data to the data JSON file
function writeData(data)
{
    fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
}

// Sets or changes a guild's prefix in the data file
function setPrefix(guild, prefix)
{
    var workingdata = data;
    var prefixObj;

    prefixObj = workingdata.prefixes.find(x => x.guildID === guild.id);

    if(typeof prefixObj === "undefined")
    {
        workingdata.push(
            {
                "guildName": guild.name,
                "guildID": guild.id,
                "prefix": prefix
            }
        )
    }
    else
    {
        prefixObj.prefix = prefix;
    }

    writeData(workingdata);
}

function findQueue(guild)
{
    return globalQueue.find(x => x.guildID === guild.id);
}

function initQueue(guild, conn, firstRequestor, firstQuery)
{
    globalQueue.push(
        {
            guildName: guild.name,
            guildID: guild.id,
            connection: conn,
            dispatcher: null,
            looping: false,
            currentTitle: null,
            currentRequestor: null,
            currentQuery: null,
            currentLink: null,
            seek: 0,
            queue: [
                {requestor: firstRequestor, query: firstQuery}
            ],
            cmdHistory: [

            ]
        }
    );

    return globalQueue.find(x => x.guildID === guild.id);
}

// Recursivesly play the next song in the queue object's queue list
function nextSong(queueObj, msg, respond)
{
    if(typeof respond === "undefined") respond = true;

    if(queueObj.queue.length > 0)
    {
        var request = queueObj.queue.shift();
        var linked = false;
        var title;
        var link;

        if(request.query.includes(".") && request.query.includes("/"))
        {
            title = "DIRECT LINKED VIDEO";
            link = request.query;
            linked = true
        }

        ytsearch(request.query, {part: "snippet", maxResults: 1, type:"video", key: ytkey}).then(result => {
            if(!linked)
            {
                var results = result.results[0];
                title = results.title;
                link = results.link;

                if(typeof results === "undefined")
                {
                    msg.channel.send("No results found for `" + request.query + "`");
                    return nextSong(queueObj, lastCmd, true);
                }

                title = results.title;
                link = results.link;
            }   

            var stream = ytdl(link, {filter:"audioonly"});

            var output = "Now Playing: `" + title + "` requested by `" + request.requestor.username + "`";
            if(queueObj.queue.length > 0)
            {
                output += "\n**Upcoming:**\n```ml\n"
                queueObj.queue.forEach((x, i) => {
                    output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
                });
                output += "```";
            }
            var guildSpecificPrefix = data.prefixes.find(x => x.guildID === msg.guild.id);
            if(typeof guildSpecificPrefix === "undefined") guildSpecificPrefix = cfg.prefix;
            else guildSpecificPrefix = guildSpecificPrefix.prefix;

            if(Math.random() > 0.75) output += `\n*Pro-Tip: Use the ${guildSpecificPrefix}lyrics command to get the lyrics for this song.*`;
            if(respond)
            {
                msg.channel.send(output);
            }

            queueObj.dispatcher = queueObj.connection.playStream(stream, {seek:queueObj.seek,volume:0.25});
            queueObj.currentTitle = title;
            queueObj.currentRequestor = request.requestor;
            queueObj.currentQuery = request.query;
            queueObj.currentLink = link;
            queueObj.dispatcher.on("end", () => {
                if(queueObj.looping)
                {
                    queueObj.queue.unshift({requestor: request.requestor, query: request.query})
                    return nextSong(queueObj, lastCmd, false);
                }
                if(queueObj.seek !== 0)
                {
                    return nextSong(queueObj, lastCmd, false);
                }
                else
                {
                    return nextSong(queueObj, lastCmd, true);
                }
            });
        });
    }
    else
    {
        msg.guild.member(client.user).voiceChannel.leave();
        globalQueue.splice(globalQueue.findIndex(x => x.guildID === queueObj.guildID), 1);
        return;
    }
}

function getArtist(songName)
{
    return geniusClient.search(songName).then(response => {
        if(response.hits.length === 0) return false;
        else return response.hits[0].result.primary_artist.name;
    }) 
}

function getExactSongName(songName)
{
    return geniusClient.search(songName).then(response => {
        if(response.hits.length === 0) return false;
        return response.hits[0].result.title;
    }) 
}

async function getLyrics(artistName, songName)
{
    return new Promise((resolve, reject) => {
        apiseeds.getLyric(apiseedskey, artistName, songName, (response) => {
            if(response.error) resolve(false);
            else resolve(response.result.track.text);
        });
    });
}


function getGeniusLyrics(query)
{
    return geniusClient.search(query).then(response => {
        if(response.hits.length === 0) return false;

        return fetch(response.hits[0].result.url).then(response => {
            return response.text().then(body => {
                const $ = cheerio.load(body);
                const lyrics = $('.lyrics').text()
                return lyrics;
            });
        });

    })
}

// Stop (and restart) the node.js process on any unhandled promise rejection
process.on("warning", (warn) =>
{
    if(warn.name === "UnhandledPromiseRejectionWarning")
    {
        console.log(warn);
        process.exit(1);
    }
});

client.on("guildCreate", guild => {
    logEvent("New Guild: " + guild.name + " <" + guild.id + ">");

    // Send an introduction message to the general channel where the bot has permissions
    // Otherwise, send it to a random channel where the bot has permissions
    var generalChannel = guild.channels.find(x => x.name.includes("general"));
    var botMember = guild.member(client.user);
    if(typeof generalChannel !== "undefined" && generalChannel.permissionsFor(botMember).has("SEND_MESSAGES")) 
    {
        generalChannel.send("Thank you for adding me to " + guild.name + "! To get started, just mention me!");
    }
    else
    {
        guild.channels.forEach(x => {
            if(x.type === "text" && x.permissionsFor(botMember).has("SEND_MESSAGES"))
            {
                x.send("Thank you for adding me to " + guild.name + "! To get started, just mention me!");
                return;
            }
        });
    }
});

client.on("guildDelete", guild => {
    logEvent("Removed from " + guild.name + " <" + guild.id + ">");
});

client.on("ready", () => {
    updateTime();
    month = time.getMonth() + 1;
    timeTag = "[" + time.toString().substr(0,24) + "]";
    uptime = 0;

    // Set the home guild and log channel variables
    homeGuild = client.guilds.find(x => x.id === cfg.homeGuildID);
    logChannel = homeGuild.channels.find(x => x.name === cfg.logChannelName);

    // Set the msg highlighting rule to the home guild
    msghlRule = homeGuild.id;

    client.user.setActivity("@Melody#8390");

    client.guilds.forEach(x => {
        if(x.member(client.user).voiceChannel)
            x.member(client.user).voiceChannel.leave();
    });

    logEvent("Bot Ready!");

    setInterval(tick, 1000);
})


client.on("message", async msg => {

    // If the channel is not a Guild Text channel
    if(msg.channel.type !== "text") return;

    // If the channel appears to be a log channel
    if(msg.channel.name.includes("log")) return;

    // If the message was sent by a bot
    if(msg.author.bot) return;

    // Now get the prefix of the guild the message was sent in
    var guildSpecificPrefix = data.prefixes.find(x => x.guildID === msg.guild.id);
    // If the data file does not contain a prefix for this guild, use the default prefix
    if(typeof guildSpecificPrefix === "undefined") guildSpecificPrefix = cfg.prefix;
    else guildSpecificPrefix = guildSpecificPrefix.prefix;

    // Removes the prefix, leading/trailing whitespace, puts args into a string[]
    var args = msg.content.slice(guildSpecificPrefix.length).trim().split(/ +/g);
    // Puts the first argument aka the cmd into a separate string
    var command = args.shift().toLowerCase();

    // Tags for ease of use later on
    var authorTag = msg.author.username + "#" + msg.author.discriminator + " <" + msg.author.id + ">";
    var channelTag = msg.channel.name + " <" + msg.channel.id + ">";
    var guildTag = msg.guild.name + " <" + msg.guild.id + ">";
    
    var botMember = msg.guild.member(client.user);


    // Eval code
    if(msg.content.startsWith("//me") || msg.content.startsWith("// me"))
    {
        if(msg.author.id !== "172734241136836608") return;
        else
        {
			msg.channel.send("Executing Code:\n```js\n" + msg.content + "\n```").then(() => {

                try{eval(msg.content); }
                catch(e){ msg.channel.send(`\`${e.name}\` \`\`\`xl\n${e.message}\n\`\`\``); }
			});
        }
    }

    // If someone mentions the bot
    if(msg.content === "<@483102681666158623>")
    {
        if(canSpeak(msg))
        {
            logEvent(authorTag + " mentioned bot in " + channelTag + " @ " + guildTag);

            var output = "";
            output += "My prefix in " + msg.guild.name + " is `" + guildSpecificPrefix + "`.\n";
            output += "My help command is `" + guildSpecificPrefix + "melody`.";

            msg.channel.send(output);
        }
        else return;
    }
    

    // If the message does not start with a prefix, don't continue past this point
    if(!msg.content.startsWith(guildSpecificPrefix)) return;

    // All commands that are tracked and therefore logged
    var commands = [
        "help", "melody", "melodysetprefix", "play", "p", "playnext", "playnow", 
        "skip", "info", "song", "queue", "clear", "remove", "cancel", "pause", "resume", 
        "stop", "loop", "lyrics", "seek"
    ]

    // If the command given is a tracked command, check if it can!
    // be used in this chat, and if it can, log it
    if(commands.includes(command))
    {
        // If the bot has no permission to speak in the current channel, do nothing
        // further and let the command sender know
        if(canSpeak(msg))
        {
            logEvent(authorTag + " called " + command + " (" + args.toString() + ") in " + 
                 channelTag + " @ " + guildTag);
        }
        else return;

        if(command !== "help" && command !== "melody" && command !== "melodysetprefix")
            lastCmd = msg;
            queueObj = findQueue(msg.guild);
            if(typeof queueObj !== "undefined")
                queueObj.cmdHistory.unshift(command);
    }
    else return;

    // Help Command
    if(command === "help" || command === "melody")
    {
        logEvent(authorTag + " used help command in " + channelTag + " @ " + guildTag);

        var output = "";
        output += "```\n";
        output += "Melody is a music bot.\n";
        output += "The first element's index in the queue is 0.\n";
        output += "The text channel the bot sends music and queue information to is the last one to which a music command was sent.\n";
        output += `The ${guildSpecificPrefix}lyrics command is not 100% reliable. If you get weird results, try providing a title after the command.\n`;
        output += "\n";
        output += `${guildSpecificPrefix}help - Displays this help message.\n`;
        output += `${guildSpecificPrefix}melodysetprefix - Set's the bot's prefix.\n`;
        output += `${guildSpecificPrefix}play - Adds a youtube video to the queue.\n`;
        output += `${guildSpecificPrefix}p - Shorthand for ${guildSpecificPrefix}play, also appends " audio" to the end of your search query.\n`;
        output += `${guildSpecificPrefix}playnext - Adds a youtube video to the top of the queue.\n`;
        output += `${guildSpecificPrefix}playnow - Adds a youtube video to the top of the queue and skips the current song.\n`;
        output += `${guildSpecificPrefix}skip - Skips the current song.\n`;
        output += `${guildSpecificPrefix}info - Information about the song currently playing.\n`;
        output += `${guildSpecificPrefix}queue - Displays the current queue.\n`;
        output += `${guildSpecificPrefix}clear - Clears the queue.\n`;
        output += `${guildSpecificPrefix}remove - Removes an item from the queue.\n`;
        output += `${guildSpecificPrefix}pause - Pauses the music.\n`;
        output += `${guildSpecificPrefix}stop - Clears the queue and stops playing music.\n`;
        output += `${guildSpecificPrefix}resume - Resumes the music.\n`;
        output += `${guildSpecificPrefix}loop - Loop the current song.\n`;
        output += `${guildSpecificPrefix}lyrics - Get the lyrics of the current song.\n`;
        //output += `${guildSpecificPrefix}seek - Seek/rewind to a specific point in the song.\n`;
        output += "\n";
        output += "Bot created by Merlin#8474.\n";
        output += "\n```";

        msg.channel.send(output);
        return;
    }


    if(command === "melodysetprefix")
    {
        setPrefix(msg.guild, args[0]);
        msg.channel.send("Prefix set to `" + args[0] + "`");
        return;
    }

    else if(command === "lyrics")
    {
        if(typeof botMember.voiceChannel === "undefined" && typeof args[0] === "undefined")
        {
            msg.channel.send(`No song seems to be playing for me to find lyrics for. Provide a title for me to search for.`);
            return;
        }

        msg.channel.send("Fetching Lyrics...");

        var queueObj = findQueue(msg.guild);

        if(typeof queueObj !== "undefined") var query = queueObj.currentQuery;
        if(typeof args[0] !== "undefined") query = args.join(" ");
        if(query.includes("audio") && typeof queueObj !== "undefined") query = query.substring(0, query.length - 6);

        var artist = await getArtist(query);
        var exactTitle = await getExactSongName(query);
        
        var lyrics = "";
        var output = "";


        // If nothing is found for the query, and additional information about
        // the song is available, use the official title of the song as a search query
        // to find the exact title and artist in Genius' database
        if( (!artist || !exactTitle) && typeof queueObj !== "undefined")
        {
            var title = queueObj.currentTitle;
            artist = await getArtist(title);
            exactTitle = await getExactSongName(title);
        }

        
        lyrics = await getGeniusLyrics(query);

        if(!lyrics) lyrics = await getGeniusLyrics(title);

        

        if(!lyrics || !artist || !exactTitle)
        {
            lyrics = artist + " - " + exactTitle + " Lyrics\n\n" + lyrics;
            lyrics += "Lyrics not found for " + title;
        }

        lyrics = lyrics.trim();
        lyrics = artist + " - " + exactTitle + " Lyrics\n\n" + lyrics;
        lyrics = splitStr(lyrics, 1950);
        lyrics.forEach(x => {
            var output = "```\n" + x;
            output += "\n```";
            msg.channel.send(output);
        })

        return;
    }

    // ALL THE FOLLOWING COMMANDS REQUIRE THE USER TO BE IN THE SAME
    // CHANNEL AS THE BOT

    var channel = msg.member.voiceChannel;
    var botChannel = botMember.voiceChannel;

    // If either the user is not in a channel, or is in a channel that the bot is not in
    if( typeof channel === "undefined" || (channel !== botChannel && typeof botChannel !== "undefined") )
    {
        msg.channel.send("You must be in a voice channel with the bot to use this command.");
        return;
    }


    
    else if(command === "play" || command === "p")
    {
        if(typeof args[0] === "undefined")
        {
            msg.channel.send("Specify a song name to play.");
            return;
        }

        var query = args.join(" ");
        if(command === "p") query += " audio";

        // If the bot is not in a channel, then join one and create a queue object
        if(typeof botChannel === "undefined")
        {
            channel.join().then(conn => {
                var queueObj = initQueue(msg.guild, conn, msg.author, query);
                queueObj.cmdHistory.unshift(command);
                var output = "Request `" + query + "` added to queue by `" + msg.author.username + "` to position: `0`";
                if( command === "play" && (Math.random() > .9 || query.includes("lyrics") || query.includes("audio")) )
                    output += `\n*Pro-Tip: Use the ${guildSpecificPrefix}p command to add the lyric/audio version of a song to the queue.*`;
                msg.channel.send(output);
                nextSong(queueObj, msg)
            });
        }

        // If the bot is already in a channel, then it must already have a queue object for this guild.
        // Find it and push a new request object to the queue array in the queue object
        else
        {
            queueObj = findQueue(msg.guild)
            queueObj.queue.push({requestor: msg.author, query: query});

            var queuePos = queueObj.queue.length - 1;

            var output = "Request `" + query + "` added to queue by `" + msg.author.username + "` to position: `" + queuePos + "`\n"
            output += "**Upcoming:**\n```ml\n"
            queueObj.queue.forEach((x, i) => {
                output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
            });
            output += "```";
            if( command === "play" && (Math.random() > .9 || query.includes("lyrics") || query.includes("audio")) )
                output += `\n*Pro-Tip: Use the ${guildSpecificPrefix}p command to add the lyric/audio version of a song to the queue.*`;
            msg.channel.send(output);
        }
        return;
    }

    else if(command === "playnext")
    {
        if(typeof args[0] === "undefined")
        {
            msg.channel.send("Specify a song name to play.");
            return;
        }

        var queueObj = findQueue(msg.guild);
        var query = args.join(" ");

        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Use the ${guildSpecificPrefix}play command to request a song.`);
            return;
        }

        queueObj.queue.unshift({requestor: msg.author, query: query});

        var queuePos = queueObj.queue.length - 1;

        var output = "Request `" + query + "` added to beginning of queue by `" + msg.author.username + "`";
        output += "**Upcoming:**\n```ml\n"
        queueObj.queue.forEach((x, i) => {
            output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
        });
        output += "```";

        msg.channel.send(output);
        return;
    }

    else if(command === "playnow")
    {
        if(typeof args[0] === "undefined")
        {
            msg.channel.send("Specify a song name to play.");
            return;
        }

        var queueObj = findQueue(msg.guild);
        var query = args.join(" ");

        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Use the ${guildSpecificPrefix}play command to request a song.`);
            return;
        }

        queueObj.queue.unshift({requestor: msg.author, query: query});
        queueObj.dispatcher.end();
        return;
    }

    else if(command === "skip")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        

        var queueObj = findQueue(msg.guild);
        var output = "";
        if(queueObj.looping)
        {
            queueObj.looping = false;
            output += "Stopped looping and ";
        }
        output += "Skipped.\n";

        if(queueObj.queue.length > 0)
        {
            output += "**Upcoming:**\n```ml\n"
            queueObj.queue.forEach((x, i) => {
                output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
            });
            output += "```";
        }

        if( (queueObj.cmdHistory[1] === "play" || queueObj.cmdHistory[1] === "p") && (queueObj.cmdHistory[2] === "play" || queueObj.cmdHistory[2] === "p")) 
            output += `*Pro-Tip: Use the ${guildSpecificPrefix}playnow command to play a song now.*`;
        else if( (queueObj.cmdHistory[1] === "skip" && queueObj.cmdHistory[2] === "skip") )
            output += `*Pro-Tip: Use the ${guildSpecificPrefix}clear command to clear the queue, or ${guildSpecificPrefix}stop to stop.*`;

        queueObj.dispatcher.end();
        msg.channel.send(output);
        return;
    }

    else if(command === "info" || command === "song")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }
        var queueObj = findQueue(msg.guild);

        var output = "Now Playing: `" + queueObj.currentTitle + "` requested by `" + queueObj.currentRequestor.username + "`\n" + queueObj.currentLink;

        msg.channel.send(output);
        return;
    }

    else if(command === "queue")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }
        var queueObj = findQueue(msg.guild);
        if(queueObj.queue.length === 0)
        {
            msg.channel.send("The queue is empty.");
            return;
        }

        var output = "**Upcoming:**\n```ml\n"
        queueObj.queue.forEach((x, i) => {
            output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
        });
        output += "```";

        msg.channel.send(output);
        return;
    }

    else if(command === "clear")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }
        var queueObj = findQueue(msg.guild);
        queueObj.queue = [];

        msg.channel.send("Queue Cleared.");
        return;
    }

    else if(command === "remove" || command === "cancel")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var queueObj = findQueue(msg.guild);
        var queueHighestIndex = queueObj.queue.length - 1;

        if(isNaN(args[0]))
        {
            msg.channel.send("Invalid argument.");
            return;
        }

        var indexToRemove = parseInt(args[0]);

        if(indexToRemove < 0 || indexToRemove > queueHighestIndex)
        {
            msg.channel.send("Invalid queue index.");
            return;
        }

        queueObj.queue.splice(indexToRemove, 1);
        var queuePos = queueObj.queue.length - 1;

        var output = "Removed queue element `" + indexToRemove + "`\n"

        if(queueObj.queue.length > 0)
        {
            output += "**Upcoming:**\n```ml\n"
            queueObj.queue.forEach((x, i) => {
                output += i + ": \"" + x.query + "\" requested by \"" + x.requestor.username + "\"\n";
            });
            output += "```";
        }

        msg.channel.send(output);
        return;
    }

    else if(command === "pause")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var queueObj = findQueue(msg.guild);

        if(!queueObj.dispatcher.paused)
        {
            msg.channel.send(`Paused. ${guildSpecificPrefix}resume to resume playback.`);
            queueObj.dispatcher.pause();
        }
        else
        {
            msg.channel.send("Music is already paused.")
        }

        return;
    }

    else if(command === "resume" || command === "unpause")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var queueObj = findQueue(msg.guild);

        if(queueObj.dispatcher.paused)
        {
            msg.channel.send("Resumed.");
            queueObj.dispatcher.resume();
        }
        else
        {
            msg.channel.send("Music is not paused.")
        }

        return;
    }

    else if(command === "stop")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var queueObj = findQueue(msg.guild);
        queueObj.queue = [];
        queueObj.looping = false;
        queueObj.dispatcher.end();

        msg.channel.send("Stopped playing music.");;

        return;
    }
    
    else if(command === "loop")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var queueObj = findQueue(msg.guild);
        queueObj.looping = !queueObj.looping;

        if(queueObj.looping)
        {
            msg.channel.send("Now looping.");
        }
        else
        {
            msg.channel.send("No longer looping.");
        }
        return;
    }

    


    else if(command === "seek")
    {
        if(typeof botMember.voiceChannel === "undefined")
        {
            msg.channel.send(`Not currently playing anything.`);
            return;
        }

        var minutes;
        var seconds;
        var totalSeconds;

        if(isNaN(args[0]) && !args[0].includes(":"))
        {
            msg.channel.send("Invalid arguments. Acceptable formats: `0:24`, `1:24`, `24`, `84`")
            return;
        }
        else
        {
            if(args[0].includes(":"))
            {
                minutes = parseInt(  args[0].substring( 0, args[0].indexOf(":") )  );
                seconds = parseInt(  args[0].substring( args[0].indexOf(":")+1 )  );
                totalSeconds = parseInt(minutes * 60 + seconds);
                
            }
            else
            {
                totalSeconds = parseInt(args[0]);
            }
        }

        var queueObj = findQueue(msg.guild);
        queueObj.queue.unshift({requestor: queueObj.currentRequestor, query: queueObj.currentQuery});
        queueObj.seek = totalSeconds;
        queueObj.dispatcher.end();

        msg.channel.send("Seeking to `" + totalSeconds + "` seconds.");
        return;
    }
});