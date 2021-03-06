/* nor-mvc -- Model-View-Controller -- mvc.js */
"use strict";
require('ejs');
var Q = require('q');
var debug = require('nor-debug');
var is = require('nor-is');
var ARRAY = require('nor-array');
var PATH = require('path');
//var FS = require('nor-fs');
var copy2 = require('nor-data').copy2;
var require_browserify = require('./require-browserify.js');

var SEARCH = require('./search-and-require.js');
var search_and_require = SEARCH.search_and_require;
var search_and_collect = SEARCH.search_and_collect;

var default_layout = require('./mvc.layout.ejs');

/* Function that does nothing */
function noop() {}

/** Copy context object */
function copy_context(orig_context, params, mvc, query_params) {
	debug.assert(orig_context).is('object');
	debug.assert(params).ignore(undefined).is('object');

	var context = {};
	ARRAY(Object.keys(orig_context)).filter(function(key) {
		return !!( (key !== 'context') && (key !== 'node') && (key !== 'self') );
	}).forEach(function(key) {
		context[key] = copy2(orig_context[key]);
	});

	context.context = context;

	if(!is.obj(context.$)) {
		context.$ = {};
	}

	if(is.obj(params)) {
		ARRAY(Object.keys(params)).forEach(function(key) {
			context.$[key] = copy2(params[key]);
		});
	}

	if( (!context.node) && orig_context.node) {
		context.node = orig_context.node;
	}

	if( (!context.self) && mvc) {
		context.self = mvc;
	}

	if( (!context.params) && query_params) {
		context.params = query_params;
	}

	debug.assert(context).is('object');
	debug.assert(context.self).is('object');
	debug.assert(context.context).is('object');
	debug.assert(context.$).is('object');

	return context;
}

/** The constructor */
function MVC (opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('MVC(', opts, ')');
	}
	opts = opts || {};
	debug.assert(opts).is('object');
	debug.assert(opts.headers).ignore(undefined).is('object');
	debug.assert(opts.model).ignore(undefined).is('function');
	debug.assert(opts.layout).ignore(undefined).is('function');
	debug.assert(opts.index).ignore(undefined).is('function');
	debug.assert(opts.routes).ignore(undefined).is('string');
	debug.assert(opts.browser).ignore(undefined).is('object');
	debug.assert(opts.setup).ignore(undefined).is('function');
	debug.assert(opts.afterSetup).ignore(undefined).is('function');
	debug.assert(opts.exit).ignore(undefined).is('function');
	debug.assert(opts.filename).is('string');

	var self = this;

	self.timestamp = (new Date()).getTime();

	self.filename = opts.filename;

	if(!opts.dirname) {
		self.dirname = PATH.dirname(opts.filename);
	}

	if(!self.tmpdir) {
		self.tmpdir = PATH.join(process.cwd(), 'tmp');
	}

	self.settings = {};
	self.headers = is.obj(opts.headers) ? copy2(opts.headers) : undefined;
	self.context = copy2(opts.context) || {};
	self.model = opts.model || noop;
	self.layout = opts.layout || default_layout;
	self.routes = opts.routes;
	self.browser = opts.browser;
	self.setup = opts.setup;
	self.afterSetup = opts.afterSetup;
	self.exit = opts.exit;
	self.index = opts.index || noop;
	//self.view = opts.view || PATH.basename(self.filename, PATH.extname(self.filename));

	if(!self.views) {
		if(!process.browser) {
			self.views = search_and_require(self.dirname, {'extension':'.ejs', 'sub_extension': '.view'});
		} else {
			self.views = require('nor-mvc-self').views;
		}
	}

	if(!process.browser) {
		self._node_files = [];
		search_and_collect(self.dirname, {
			'extension':'.js',
			'sub_extension': '.node',
			'require_sub_extension': true,
			'files': self._node_files
		});
		if(process.env.DEBUG_MVC) {
			debug.info('node files (from ', self.dirname,') detected: ', self._node_files);
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

	if(opts.node && opts.node.disable_render) {
		return;
	}

	if(process.env.DEBUG_MVC) {
		debug.log('MVC.render(', mvc, ', ', params, ',', opts, ')');
	}
	mvc = mvc || {};
	debug.assert(mvc).is('object').instanceOf(MVC);
	debug.assert(mvc.model).is('function');
	debug.assert(mvc.layout).is('function');
	debug.assert(mvc.index).is('function');
	debug.assert(mvc.dirname).is('string');

	//var model;

	params = params || {};

	debug.assert(params).is('object');

	opts = opts || {};
	debug.assert(opts).is('object');

	var view = opts.view || mvc.index;
	debug.assert(view).is('function');

	var context = copy_context(opts.context || {}, undefined, mvc, params);
	debug.assert(context).is('object');

	if(process.env.DEBUG_MVC) {
		debug.log('context = ', context);
	}

	return Q.fcall(function() {
		if(context.node && context.node.disable_render) {
			return;
		}

		if(is.func(mvc.context)) {
			return mvc.context.call(mvc, context);
		}

		return mvc.context;
	}).then(function(c) {
		if(c.node && c.node.disable_render) {
			return;
		}

		if(process.env.DEBUG_MVC) {
			debug.log('c = ', c);
		}

		context = copy_context(c || {}, undefined, mvc, params);

		if(process.env.DEBUG_MVC) {
			debug.log('context = ', context);
		}

		return mvc.model.call(context, params);
	}).then(function set_model(m) {

		if(context.node && context.node.disable_render) {
			return;
		}

		if(process.env.DEBUG_MVC) {
			debug.log('m = ', m);
		}
		if(is.obj(m)) {
			context.$ = m;
		}
		return view(context);
	}).then(function get_layout(body) {
		if(context.node && context.node.disable_render) {
			return;
		}

		if(process.env.DEBUG_MVC) {
			debug.log('body = ', body);
		}
		context.content = body;
		return mvc.layout(context);
	});
};

/** Renders the view */
MVC.prototype.render = function(params, opts) {
	return MVC.render(this, params, opts);
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

		/* */
		var url = require('url').parse(req.url, true);
		var params = req.params || {};
		debug.assert(params).is('object');

		if(is.obj(mvc.headers)) {
			ARRAY(Object.keys(mvc.headers)).forEach(function(key) {
				res.setHeader(key, mvc.headers[key]);
			});
		}

		var context = {
			'method': req.method,
			'query': url.query,
			'node':{
				'request': req,
				'response': res
			}
		};

		if(req.body) {
			context.body = req.body;
		}

		/* Let's make sure that if the connection is closed the MVC will not render anything anymore. */
		res.on('finish', function() {
			context.node.disable_render = true;
		});

		res.on('close', function() {
			context.node.disable_render = true;
		});

		return MVC.render(mvc, params, {'context': context});
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

var nor_express;

/** Returns our nor-express style route object */
if(!process.browser) {
nor_express = require('nor-express');
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

		routes = nor_express.routes.load( PATH.resolve(self.dirname, self.routes), {
			/** Makes it possible to handle the require of accepted files (and enable support for other types) */
			'require': function require_wrapper(filename) {

				var dirname = PATH.dirname(filename);
				var basename = PATH.basename(filename);

				var match_browser_js = basename === 'browser.js';

				var match_versioned_browser_js = (basename.length >= 'browser..js'.length) &&
					(basename.substr(0, 'browser.'.length) === 'browser.') &&
					(basename.substr(-3) === '.js');

				if(!(match_browser_js || match_versioned_browser_js)) {
					return require(filename);
				}

				var basedir = PATH.dirname(filename);
				var mvc;
				if(self.dirname === basedir) {
					mvc = self;
				} else {
					mvc = require(PATH.resolve(basedir, 'index.js'));
				}

				if(match_versioned_browser_js) {
					filename = PATH.join(dirname, 'browser.js');
				}

				//debug.log("dirname = ", dirname);
				//debug.log("basedir = ", basedir);

				return require_browserify(filename, {
					'mvc': mvc,
					'basedir': basedir
				});
			},
			'ignore': function ignore(/* filename */) {
				return false;
			},
			'accept': function accept(filename, state) {
				if(process.env.DEBUG_MVC) {
					debug.log('filename = ', filename);
				}

				// Accept directories
				if(state.directory) { return true; }

				// Do not accept files like *.browser.js
				if( ((filename.length >= ('.browser.js'.length +1)) && filename.substr(filename.length - '.browser.js'.length) === '.browser.js') ) {
					return false;
				}

				// Do not accept files like *.node.js
				if( ((filename.length >= ('.node.js'.length +1)) && filename.substr(filename.length - '.node.js'.length) === '.node.js') ) {
					return false;
				}

				// Accept any other file like *.js
				return ( (filename.length >= 4) && filename.substr(filename.length - '.js'.length) === '.js') ? true : false;
			},
			'routes': routes
		});

		if(process.env.DEBUG_MVC) {
			debug.log('MVC{', self.filename,'} routes = ', routes);
		}

		if( (!routes.index) && is.func(routes.GET) ) {
			routes.index = {'GET': routes.GET};
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

	throw new TypeError("Unsupported type for self.routes: " + (typeof self.routes));
};
}

/** Get a view function by name */
MVC.prototype.view = function mvc_view_method(name) {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.view(', name,')');
	}
	var view = self.views[name];
	if(!is.func(view)) {
		throw new TypeError("No view named: " + name);
	}
	debug.assert(view).is('function');
	return function mvc_view_method_2(context, params) {
		debug.assert(context).is('object');
		debug.assert(params).ignore(undefined).is('object');
		context = copy_context(context, params, self);
		return view(context);
	};
};

/** Returns a promise of build status for browserify bundles */
MVC.browserify_readiness = require_browserify.readiness;

/* EOF */
