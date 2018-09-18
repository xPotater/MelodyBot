# Apiseeds | Lyrics

Is a simple module that provides lyrics from https://apiseeds.com/ directly into your js file in JSON format.

## Requeriments
* FREE Api key from https://apiseeds.com/

## Method

**getLyric**

### Params 

* **apikey** (String) [Required]
* **artist** (String) [Required]
* **track** (String) [Required]
* **callback** (response,headers) (Function) [Required]

## Installation
```Bash
# Local installation
npm install -s apiseeds-lyrics

# Global installation
npm install -g apiseeds-lyrics

```
## Example #1

```Javascript
'use strict';

var lyrics = require("apiseeds-lyrics");

const apikey = 'YOUR-API-KEY'; // Get it here => https://apiseeds.com/

lyrics.getLyric(apikey,"The Beatles","Yesterday",function(response,headers){
    console.log("Header", headers);
    console.log("Response",response);
});
```

## Example #2
```Javascript
'use strict';

var lyrics = require("apiseeds-lyrics");

const apikey = 'YOUR-API-KEY'; // Get it here => https://apiseeds.com/


var processLiryc = function (response, headers) {
    console.log("Header", headers);
    console.log("Response", response);
}

lyrics.getLyric(apikey, "The Beatles","Hey Jude",processLiryc);
```

## Important 

Rate limit and credits are in the header response

## Api Documentation 

https://apiseeds.com/documentation/lyrics