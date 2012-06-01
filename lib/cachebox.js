/**********************************************************
*
* CacheBox - Database Cacher
* Authors: David DeRemer
*  Utility to pull from DB Cache controller
*  or add to it with new request params
*
**********************************************************/

// Set module imports
var url = require('url'),
		async = require('async'),
		_u = require('underscore');
		
		// Create mongodb variables
		Db = require('mongodb').Db,
  	Connection = require('mongodb').Connection,
  	Server = require('mongodb').Server;



var constants = {
			'earthRadiusKm' 			: 6367.5						//Source: WolframAlpha
		, 'radiusOfEarthInM' 		: 6367.5 * 1000
		, 'radiusOfEarthInMi' 	: 3956.6
		, 'radiusOfEarthInFt' 	: 3956.6 * 5280
};

/********************************************************************************************************************
* CacheBox (cache initilizer)
*
* @param {String} dburi - uri to mongodb for cache (e.g., mongodb://user:pass@localhost:port/databaseName)
* @param {Object} config - optional config parameters
*		:timeToExpire {Number} - milliseconds until a cached object is purged, default: 1 day
*		:auto_reconnect {Boolean} - if should autoreconnect to mongodb, default: true
*		:maxDist {Number} - maxDist to pull from cache if using geospatial
*		:distUnit {String} - 'm' or 'ft' as unit for geospatial 
*		:collectionName {String} - name of collection for cache, default: cachebox
*********************************************************************************************************************/

var CacheBox = function (dburi, config) {
	
	var uri, auth, maxDist;
	this.host;
	this.port;
	this.databaseName;
	this.user
	this.pass;
	this.timeToExpire;
	this.auto_reconnect;
	this.geospatial;
	this.collectionName;
	this.db;
	this.client;
	this.collection;

	if (!_u.isString(dburi)) { throw new Error('CacheBox: Must pass dburi as a string to a mongodb'); }
	else {
		uri = url.parse(dburi);
		this.host = uri.hostname || 'localhost';
		this.port = Number(uri.port) || 27017;
		this.databaseName = uri.pathname && uri.pathname.replace(/\//g, '');
		
		if (uri.auth) {
			auth = uri.auth.split(':'),
			this.user = auth[0],
			this.pass = auth[1];
		}
	}
	
	if (_u.isObject(config)) {
		if (!_u.isNaN(Number(config.timeToExpire))) { this.timeToExpire = Number(config.timeToExpire); } else { this.timeToExpire = 24 * 60 * 60 * 1000; }
		if (_u.isBoolean(config.auto_reconnect)) { this.auto_reconnect = config.auto_reconnect; } else { this.auto_reconnect = true; }
		
		// If maxDist and distUnit are present, then cache uses geospatial
		if (!_u.isNaN(Number(config.maxDist)) && (config.distUnit == 'm' || config.distUnit == 'ft')) {
			this.geospatial = {};
			if (config.distUnit == 'm') { this.geospatial.maxDist = config.maxDist / constants.radiusOfEarthInM; }
			else { this.geospatial.maxDist = config.maxDist / constants.radiusOfEarthInFt; }	
		}
		
		if (_u.isString(config.collectionName)) { this.collectionName = config.collectionName; } else { this.collectionName = 'cachebox'; }
	}

	this.initialize(function(err) {
		if (err) { throw new Error(err); }
		else { console.log('CacheBox!'); }
	});
};


/**********************************************************
* initialize (sets up a cachebox db connetion and collection)
*
* @param {Function} callback
**********************************************************/

CacheBox.prototype.initialize = function(callback) {
	var self = this;
	
	async.series([
		function(next) {
			// Create and open db connection
			self.db = new Db(self.databaseName, new Server(self.host, self.port, {'auto_reconnect': self.auto_reconnect}, {}));
			self.db.open(function(err, client) {
				if (err) { next(err); }
				else { 
					self.client = client;
				  console.log('CacheBox DB connection opened on: ' + self.host + ':' + self.port);
				  // Authenticate if necessary, then store client
				  if (self.user && self.pass) {
				  	self.db.authenticate(self.user, self.pass, function(err, result) { 
				  		if (err) { next(err); }
				  		else { 
				  			console.log('CacheBox DB authenticated for user: ' + result);
					    	next();
				  		}
					  }); 
				  } else { next(); }  
				}  
			});
		}, 
		function(next) {
			self.client.createCollection(self.collectionName, function(err, collection) {
				if (err) { next(err); }
				else {
					console.log('CacheBox DB created or opened collection: ' + self.collectionName);
					
					async.series([
						function(n) {
							if (_u.isObject(self.geospatial)) {
								collection.ensureIndex([{'params.lonlat':'2d'}], {}, function(err, res) {
									if (err) { n(err); }
									else {
										console.log('CacheBox DB geospatial index ensured');
										n();
									}
								});
							} else { n(); }
							
						},
						
						function(n) {
							collection.ensureIndex([{'params': 1}], {'unique':true, 'sparse': true}, function(err, res) {
								if (err) { n(err); }
								else {
									console.log('CacheBox DB params index ensured');
									n();
								}
							});
						}
					
					], function(err) {
						if (err) { next(err); }
						else {
							self.collection = collection; 
							next();
						}
					});	
				}
			});
		}
	], function(err, results) {
		if (err) { callback(err); }
		else { callback(); }
	});
};


/**********************************************************
* deposit (deposits data in cachbox)
*
* @param {Object} params - the parameteres associated with the operation
*			Note: if geospatial, params should include lonlat
* @param {Object} payload - the object to be cached
* @param {Function} callback
**********************************************************/

CacheBox.prototype.deposit = function (params, payload, callback) {
	var self = this;
	if (_u.isNull(params) || _u.isUndefined(params) || _u.isNull(payload) || _u.isUndefined(payload)) {
		callback('Must provide params and payload to make CacheBox deposit'); 
	} else {
		var query = {};
		var record = {};
		
		if (_u.isObject(self.geospatial)) { 
			if (_u.isArray(params.lonlat) && !_u.isNaN(Number(params.lonlat[0])) && !_u.isNaN(Number(params.lonlat[1]))) {
				params.lonlat = [Number(params.lonlat[0]), Number(params.lonlat[1])];
			}
		}
		
		query.params = record.params = params;
		record.payload = payload;
		record.timestamp = new Date().valueOf();
		
		// Function to call after ensuring collection reference is established		
		var makeDeposit = function() {
			self.collection.update(query, record, {'safe': true, 'upsert': true}, function(err, obj) {
				if (err) { callback(err); }
				else { callback(); }
			});
		};
		
		// Ensure collection reference is established
		if (self.collection) { makeDeposit(); }
		else { 
			this.initialize(function(err) {
				if (err) { callback(err); }
				else { makeDeposit(); }
			});
		}
	}
};


/**********************************************************
* withdraw (pulls data from the cache)
*
* @param {Object} params - the parameteres associated with the operation
*			Note: if geospatial, params should include lonlat
* @param {Function} callback
**********************************************************/

CacheBox.prototype.withdraw = function (params, callback) {
	var self = this;
	
	// Purge on every withdraw
	self.purge(function(){});
	
	// If params are present, attempt to make withdrawal
	if (_u.isNull(params) || _u.isUndefined(params)) { callback('Must provide params to make CacheBox withdrawal'); }
	else {
		
		// Define query
		var query = {};
		
		for (var key in params) { if (key != 'lonlat') { query['params.'+key] = params[key]; } }
		
		// If geospatial, set nearSphere query
		if (_u.isObject(self.geospatial)) { 
			if (_u.isArray(params.lonlat) && !_u.isNaN(Number(params.lonlat[0])) && !_u.isNaN(Number(params.lonlat[1]))) {
				query['params.lonlat'] = { '$nearSphere': [Number(params.lonlat[0]), Number(params.lonlat[1])], '$maxDistance': self.geospatial.maxDist };
			}
		}
		
		// Function to call after ensuring collection reference is established		
		var makeWithdrawal = function() {
			self.collection.findOne(query, function(err, obj) {
				if (err) { callback(err); }
				else if (obj && obj.payload) { callback(null, obj.payload); }
				else { callback(); }
			});
		};
		
		// Ensure collection reference is established
		if (self.collection) { makeWithdrawal(); }
		else { 
			this.initialize(function(err) {
				if (err) { callback(err); }
				else { makeWithdrawal(); }
			});
		}	
	}	
};


/**********************************************************
* purge (purges cache of old records)
*
* @param {Function} callback
**********************************************************/

CacheBox.prototype.purge = function (callback) {
	var self = this;
	var now = Date.now().valueOf();
	
	var makePurge = function () {
		self.collection.remove({'timestamp': {'$lt': now - self.timeToExpire}}, function(err) {
			if (err) { callback(err); }
			else { callback(); }
		});
	};
	
	// Ensure collection reference is established
	if (self.collection) { makePurge(); }
	else { 
		this.initialize(function(err) {
			if (err) { callback(err); }
			else { makePurge(); }
		});
	}
};


/**********************************************************
* Exports.
**********************************************************/


exports.CacheBox = CacheBox;

