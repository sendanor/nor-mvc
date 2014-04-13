/* Model-View-Controller */
"use strict";
require('ejs');
var Q = require('q');
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');
var FS = require('nor-fs');
var require_browserify = require('./require-browserify.js');
var search_and_require = require('./search-and-require.js');
var default_layout = require('./mvc.layout.ejs');

/* Function that does nothing */
function noop() {}

/** The constructor */
function MVC (opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('MVC(', opts, ')');
	}
	opts = opts || {};
	debug.assert(opts).is('object');
	debug.assert(opts.model).ignore(undefined).is('function');
	debug.assert(opts.layout).ignore(undefined).is('function');
	debug.assert(opts.index).ignore(undefined).is('function');
	debug.assert(opts.routes).ignore(undefined).is('string');
	debug.assert(opts.filename).is('string');

	var self = this;

	self.filename = opts.filename;

	if(!opts.dirname) {
		self.dirname = PATH.dirname(opts.filename);
	}

	self.model = opts.model || noop;
	self.layout = opts.layout || default_layout;
	self.routes = opts.routes;
	self.index = opts.index || noop;
	//self.view = opts.view || PATH.basename(self.filename, PATH.extname(self.filename));

	if(!self.views) {
		if(!process.browser) {
			self.views = search_and_require(self.dirname, {'extension':'.ejs', 'sub_extension': '.view'});
			if(process.env.DEBUG_MVC) {
				debug.info('views (from ', self.dirname,') detected: ', self.views);
			}
		} else {
			self.views = require('nor-mvc-self').views;
		}
	}

}

module.exports = MVC;

/** Returns MVC module */
MVC.create = function mvc_create(opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('MVC.create(', opts, ')');
	}
	return new MVC(opts);
};

/** Returns our nor-express style `function(req, res)` implementation which returns promises */
MVC.render = function mvc_render(mvc, params, opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('MVC.render(', mvc, ', ', params, ',', opts, ')');
	}
	mvc = mvc || {};
	debug.assert(mvc).is('object').instanceOf(MVC);
	debug.assert(mvc.model).is('function');
	debug.assert(mvc.layout).is('function');
	debug.assert(mvc.index).is('function');
	debug.assert(mvc.dirname).is('string');

	var model;
	params = params || {};

	debug.assert(params).is('object');

	opts = opts || {};
	debug.assert(opts).is('object');

	var view = opts.view || mvc.index;

	debug.assert(view).is('function');

	return Q(mvc.model(params)).then(function set_model(m) {
		model = m;
		if(!is.obj(model)) {
			model = {};
		}
		return view({'$': model, 'self': mvc});
	}).then(function get_layout(body) {
		return mvc.layout({'$': model, 'self': mvc, 'body':body});
	});
};

/** Returns our nor-express style `function(req, res)` implementation which returns promises */
if(!process.browser) {
MVC.toNorExpress = function to_nor_express(mvc, opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('MVC.toNorExpress(', mvc, ', ', opts, ')');
	}
	mvc = mvc || {};
	debug.assert(mvc).is('object');
	debug.assert(mvc.model).is('function');
	debug.assert(mvc.layout).is('function');
	debug.assert(mvc.index).is('function');

	return function handle_request(req, res) {
		var url = require('url').parse(req.url, true);
		var params = url.query || {};
		return MVC.render(mvc, params);
	};
};
}

/** Returns Node.js style `function(req, res, next)` */
if(!process.browser) {
MVC.prototype.toNorExpress = function to_nor_express_method(opts) {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.toNorExpress(', opts, ')');
	}
	return MVC.toNorExpress(self, opts);
};
}

/** Returns our nor-express style route object */
if(!process.browser) {
MVC.prototype.toRoutes = function to_routes() {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.toRoutes()');
	}

	var routes = {'GET': self.toNorExpress()};

	if(is.undef(self.routes)) {
		self.routes = '.';
	}

	if(is.string(self.routes)) {

		if( PATH.basename(self.filename, '.js') !== 'index' ) {
			if(process.env.DEBUG_MVC) {
				debug.log('MVC{', self.filename,'} routes = ', routes);
			}
			return routes;
		}

		if(process.env.DEBUG_MVC) {
			debug.log('MVC{', self.filename,'} loading routes from ', self.dirname);
		}

	    routes = require('nor-express').routes.load( PATH.resolve(self.dirname, self.routes), {
			/** Makes it possible to handle the require of accepted files (and enable support for other types) */
			'require': function require_wrapper(filename) {
				if(PATH.basename(filename) !== 'browser.js') {
					return require(filename);
				}

				var basedir = PATH.dirname(filename);
				var mvc;
				if(self.dirname === basedir) {
					mvc = self;
				} else {
					mvc = require(PATH.resolve(basedir, 'index.js'));
				}

				return require_browserify(filename, {
					'mvc': mvc,
					'basedir': basedir
				});
			},
	        'ignore': function ignore(filename) {
	            return false;
	        },
	        'accept': function accept(filename, state) {
				//debug.log('filename = ', filename);
				if(state.directory) { return true; }
	            if( /* (PATH.basename(filename) === 'browser.js') || */ ((filename.length >= ('.browser.js'.length +1)) && filename.substr(filename.length - '.browser.js'.length) === '.browser.js') ) {
					return false;
				}
	            return ( (filename.length >= 4) && filename.substr(filename.length - '.js'.length) === '.js') ? true : false;
	        },
			'routes': routes
    	});

		if(process.env.DEBUG_MVC) {
			debug.log('MVC{', self.filename,'} routes = ', routes);
		}
		return routes;
	}

	if(is.func(self.routes)) {
		routes = self.routes();
		if(process.env.DEBUG_MVC) {
			debug.log('MVC{', self.filename,'} routes = ', routes);
		}
		return routes;
	}

	if(is.obj(self.routes)) {
		if(process.env.DEBUG_MVC) {
			debug.log('MVC{', self.filename,'} routes = ', self.routes);
		}
		return self.routes;
	}

	throw new TypeError("Unsupported type for self.routes: " +  (typeof self.routes));
};
}

/** Get a view function by name */
MVC.prototype.view = function mvc_view_method(name) {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.view(', name,')');
	}
	var view = self.views[name];
	debug.assert(view).is('function');
	return function mvc_view_method_2(context, params) {
		context = context || {};
		debug.assert(context).is('object');
		debug.assert(params).ignore(undefined).is('object');
		if(!is.obj(context.$)) {
			context.$ = {};
		}
		if(is.obj(params)) {
			Object.keys(params).forEach(function(key) {
				context.$[key] = params[key];
			});
		}
		if(!context.self) {
			context.self = self;
		}
		//debug.log('context = ' , context);
		return view(context);
	};
};

/* EOF */
