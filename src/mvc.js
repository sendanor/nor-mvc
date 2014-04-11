/* Model-View-Controller */
"use strict";
require('ejs');
var Q = require('q');
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');
var FS = require('nor-fs');

/** Returns a predicate function for testing path extensions */
function has_extension(e) {
	if(process.env.DEBUG_MVC) {
		debug.log('has_extension(', e, ')');
	}
	debug.assert(e).is('string');
	return function has_extension_2(p) {
		return PATH.extname(p) === e;
	};
}

/** Returns a predicate function for testing sub extensions */
function has_sub_extension(e) {
	if(process.env.DEBUG_MVC) {
		debug.log('has_sub_extension(', e, ')');
	}
	debug.assert(e).is('string');
	return function has_sub_extension_2(p) {
		var name = PATH.basename(p, PATH.extname(p));
		return PATH.extname(name) === e;
	};
}

/** Returns a predicate `function(path)` that will return `true` if path is a directory */
function is_directory(p) {
	if(process.env.DEBUG_MVC) {
		debug.log('is_directory(', p, ')');
	}
	var stats = FS.sync.stat(p);
	return stats.isDirectory() ? true : false;
}

/** Returns a predicate `function(path)` that will return `true` if result of `f(p)` was `false`, otherwise returns `false`. */
function is_not(f) {
	if(process.env.DEBUG_MVC) {
		debug.log('is_not(', f, ')');
	}
	debug.assert(f).is('function');
	return function is_not_2(p) {
		return f(p) ? false : true;
	};
}

/** Returns a predicate `function(path)` that will return `true` if result of `f1(p)` and `f2(p)` was `true`, otherwise returns `false`. */
function and(f1, f2) {
	if(process.env.DEBUG_MVC) {
		debug.log('and(', f1, ',', f2, ')');
	}
	debug.assert(f1).is('function');
	debug.assert(f2).is('function');
	return function and_2(p) {
		return (f1(p) && f2(p)) ? true : false;
	};
}

/** Returns a predicate `function(path)` that will return `true` if result of `f1(p)` or `f2(p)` was `true`, otherwise returns `false`. */
function or(f1, f2) {
	if(process.env.DEBUG_MVC) {
		debug.log('or(', f1, ',', f2, ')');
	}
	debug.assert(f1).is('function');
	debug.assert(f2).is('function');
	return function or_2(p) {
		return (f1(p) || f2(p)) ? true : false;
	};
}

/** Search and require all files from path
 * @returns {object} All files in an object using `require()` by basenames
 */
function search_and_require(path, opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('search_and_require(', path, ',', opts, ')');
	}
	opts = opts || {};
	debug.assert(path).is('string');
	debug.assert(opts).is('object');

	var primary_ext = opts.extension || '.js';
	var sub_ext = opts.sub_extension;
	var parent_name = opts.parent_name;

	debug.assert(primary_ext).is('string');
	debug.assert(sub_ext).ignore(undefined).is('string');

	if(! is_directory(path) ) {
		return require(path);
	}

	var result = opts.result || {};

	debug.assert(result).is('object');

	var files = FS.sync.readdir(path).map(function join_path(file) {
		return PATH.join(path, file);
	});

	files.filter(or(has_extension(primary_ext), sub_ext ? has_sub_extension(sub_ext) : function nul() { return false; } )).forEach(function each(file) {
		var name = PATH.basename(file, PATH.extname(file));
		if( sub_ext && has_extension(sub_ext)(name) ) {
			name = PATH.basename(name, sub_ext);
		}
		if(parent_name) {
			name = [parent_name, name].join('.');
		}
		if(result[name] !== undefined) {
			debug.warn('Multiple files conflicted for ', name, ' -- later takes preference: ', file );
		}
		result[name] = require( file );
	});

	files.filter(is_directory).forEach(function each_2(dir) {
		var name = PATH.basename(dir);
		if(parent_name) {
			name = [parent_name, name].join('.');
		}
		if(result[name] !== undefined) {
			debug.warn('Multiple files conflicted for ', name, ' -- directory takes preference: ', dir);
		}
		search_and_require(dir, {
			'extension': primary_ext,
			'sub_extension': sub_ext,
			'parent_name': name,
			'result': result
		});
	});

	return result;
}

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
	self.layout = opts.layout || require('./mvc.layout.ejs');
	self.routes = opts.routes;
	self.index = opts.index || noop;
	//self.view = opts.view || PATH.basename(self.filename, PATH.extname(self.filename));

	if(!self.views) {
		self.views = search_and_require(self.dirname, {'extension':'.ejs', 'sub_extension': '.view'});
		debug.info('views (from ', self.dirname,') detected: ', self.views);
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

/** Returns Node.js style `function(req, res, next)` */
MVC.prototype.toNorExpress = function to_nor_express_method(opts) {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.toNorExpress(', opts, ')');
	}
	return MVC.toNorExpress(self, opts);
};

/** Returns our nor-express style route object */
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
			debug.log('MVC{', self.filename,'} routes = ', routes);
			return routes;
		}

		debug.log('MVC{', self.filename,'} loading routes from ', self.dirname);

	    routes = require('nor-express').routes.load( PATH.resolve(self.dirname, self.routes), {
	        'ignore': function ignore(filename) {
	            return false;
	        },
	        'accept': function accept(filename, state) {
				//debug.log('filename = ', filename);
				if(state.directory) { return true; }
	            if( (PATH.basename(filename) === 'browser.js') || ((filename.length >= ('.browser.js'.length +1)) && filename.substr(filename.length - '.browser.js'.length) === '.browser.js') ) {
					return false;
				}
	            return ( (filename.length >= 4) && filename.substr(filename.length - '.js'.length) === '.js') ? true : false;
	        },
			'routes': routes
    	});
		debug.log('MVC{', self.filename,'} routes = ', routes);
		return routes;
	}

	if(is.func(self.routes)) {
		routes = self.routes();
		debug.log('MVC{', self.filename,'} routes = ', routes);
		return routes;
	}

	if(is.obj(self.routes)) {
		debug.log('MVC{', self.filename,'} routes = ', self.routes);
		return self.routes;
	}

	throw new TypeError("Unsupported type for self.routes: " +  (typeof self.routes));
};

/** Get a view function by name */
MVC.prototype.view = function mvc_view_method(name) {
	var self = this;
	if(process.env.DEBUG_MVC) {
		debug.log('MVC{', self.filename,'}.view(', name,')');
	}
	var view = self.views[name];
	debug.assert(view).is('function');
	return function mvc_view_method_2(params) {
		return view({'$':params, 'self':self});
	};
};

/* EOF */
