# CacheBox.js

CacheBox is a simple way to cache objects (e.g., HTTP request results). Basically, you setup the CacheBox,
then you attempt to make a withdrawal by passing in the params of the query. If a record exists, it is returned and you use that payload.
If it's new, then you continue to do your computation and "deposit" the result for next time. Geospatial support is provided so you can find
results that are near a previous result (this is good for location-based searches where a slight deviation in location doesn't have much
effect on the results).

----

## Install

npm install cachebox

## Setup

### Create Connection

CacheBox has two initialization parameters:
* dburi - a path to a mongodb (e.g., mongodb://user:pass@localhost:port/databaseName)
* config - options for setup

#### Config Options
* timeToExpire {Number} - milliseconds until a cached object is purged, default: 1 day
* auto_reconnect {Boolean} - if should autoreconnect to mongodb, default: true
* maxDist {Number} - maxDist to pull from cache if using geospatial
* distUnit {String} - 'm' or 'ft' as unit for geospatial 
* collectionName {String} - name of collection for cache, default: cachebox

#### Create Cachebox

```javascript

var mongodbUri = 'mongodb://user:pass@localhost:port/databaseName';

var cbConfig = {
		  'timeToExpire' : 24 * 60 * 60 * 1000
		, 'auto_reconnect': true
		, 'maxDist' : 50
		, 'distUnit': 'ft'
		, 'collectionName': 'cachebox'
	};
	
var cachebox = new (require('cachebox')).CacheBox(mongodbUri, cbConfig);

```    

## Use it!

Attempt to make a withdraw.
If no results, execute request/computation/etc. Then, deposit it for next time.

```javascript

var params = { 'distance': 1000, 'query': 'tacos' };
params.lonlat = [-73.983049, 40.75532];

// Try to withdraw from cache
cachebox.withdraw(params, function(err, results) {
	if (err){ throw new Error(err); }
	else { 
		if (results) { callback(null, results); }
		else { 
		
			// Nothing in cache, so...
			// Do something complicated, like call a remote API
			// ... -> Gives us 'data'
			
			// Deposit the result so we don't need to waste time again
			// Here we return the data after making the deposit
			// But really you could return the data before making the deposit
			cachebox.deposit(params, data, function(err) {
				if (err) { throw new Error(err); }
				else { callback(null, data); }
			});	
			
		} 
	}
});


					
```

## Geospatial Hotness!

**Note that for geospatial to work, you must have maxDist and distUnit defined in your CacheBox config!**

When data is geospatial, sometimes we don't need to re-execute a query if the location change is small. CacheBox (and mongo) make this easy.
Just define maxDist and distUnit, then pass 'lonlat' as one of your params.

**Note: lonlat must be an array with 2 numbers, and in the format [ longitude, latitude ].**
While most people write it as latitude/longitude, Mongo follows the lon/lat spec. 

Now when you make a withdraw you'll get results within "maxDist" that match the rest of the params. Hot!

