/* Model-View-Controller */
"use strict";
require('ejs');
var Q = require('q');
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');

/* Function that does nothing */
function noop() {}

/** The constructor */
function MVC (opts) {
	opts = opts || {};
	debug.assert(opts).is('object');
	debug.assert(opts.model).ignore(undefined).is('function');
	debug.assert(opts.layout).ignore(undefined).is('function');
	debug.assert(opts.view).ignore(undefined).is('function');
	debug.assert(opts.routes).ignore(undefined).is('string');
	debug.assert(opts.filename).is('string');

	this.filename = opts.filename;

	if(!opts.dirname) {
		this.dirname = PATH.dirname(opts.filename);
	}

	this.model = opts.model || noop;
	this.layout = opts.layout || require('./mvc.layout.ejs');
	this.routes = opts.routes;
	this.view = opts.view || noop;
}

module.exports = MVC;

/** Returns MVC module */
MVC.create = function mvc_create(opts) {
	return new MVC(opts);
};

/** Returns our nor-express style `function(req, res)` implementation which returns promises */
MVC.render = function mvc_render(mvc, params) {
	mvc = mvc || {};
	debug.assert(mvc).is('object').instanceOf(MVC);
	debug.assert(mvc.model).is('function');
	debug.assert(mvc.layout).is('function');
	debug.assert(mvc.view).is('function');
	debug.assert(mvc.dirname).is('string');

	var model;
	params = params || {};

	debug.assert(params).is('object');

	return Q(mvc.model(params)).then(function(m) {
		model = m;
		if(!is.obj(model)) {
			model = {};
		}
		return mvc.view({'$': model});
	}).then(function(body) {
		return mvc.layout({'$': model, 'body':body});
	});
};

/** Returns our nor-express style `function(req, res)` implementation which returns promises */
MVC.toNorExpress = function to_nor_express(mvc, opts) {
	mvc = mvc || {};
	debug.assert(mvc).is('object').instanceOf(MVC);
	debug.assert(mvc.model).is('function');
	debug.assert(mvc.layout).is('function');
	debug.assert(mvc.view).is('function');

	return function handle_request(req, res) {
		var url = require('url').parse(req.url, true);
		var params = url.query || {};
		return MVC.render(mvc, params);
	};
};

/** Returns Node.js style `function(req, res, next)` */
MVC.prototype.toNorExpress = function(opts) {
	return MVC.toNorExpress(this, opts);
};

/** Returns our nor-express style route object */
MVC.prototype.toRoutes = function to_routes() {
	var self = this;

	debug.log('toRoutes() for ', self.filename);

	var routes = {'GET': self.toNorExpress()};

	if(is.undef(self.routes)) {
		self.routes = '.';
	}

	if(is.string(self.routes)) {

		if( PATH.basename(self.filename, '.js') !== 'index' ) {
			return routes;
		}

		debug.log('loading routes at toRoutes() for ', self.filename);

	    return require('nor-express').routes.load( PATH.resolve(self.dirname, self.routes), {
	        'ignore': function(filename) {
	            return false;
	        },
	        'accept': function(filename, state) {
				if(state.directory) { return true; }
	            return ( (filename.length >= 4) && filename.substr(filename.length - '.js'.length) === '.js') ? true : false;
	        },
			'routes': routes
    	});
	}

	if(is.func(self.routes)) {
		return self.routes();
	}

	if(is.obj(self.routes)) {
		return self.routes;
	}

	throw new TypeError("Unsupported type for self.routes: " +  (typeof self.routes));
};


/* EOF */
