/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

require('ejs');
var _Q = require('q');
var ARRAY = require('nor-array');
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');
var FS = require('nor-fs');
var BUILD_PROMISES = require('./build-promises.js');
var browserify = require('browserify');
var build_opts = require('./build-opts.js');

var get_mvc_as_file = require('../get-mvc-as-file.js');

/** Simply builds a bundle and returns it */
function do_browserify_bundle(b, opts) {

	opts = opts || {};
	debug.assert(b).is('object');
	debug.assert(opts).is('object');

	if(process.env.DEBUG_MVC) {
		debug.log('step 3');
	}

	//if(arguments.length >= 2) {
	//	debug.warn('Browserify no longer accepts options in b.bundle()');
	//}

	//opts = opts || {};
	//debug.assert(b).is('object');
	//debug.assert(opts).is('object');

	var defer = _Q.defer();
	b.bundle(opts, function handle_result_from_bundle(err, src) {
		if(err) {
			defer.reject(err);
		} else {
			defer.resolve(src);
		}
	});
	return defer.promise;
}

/** Save times */
function get_times(files) {
	if(!is.array(files)) {
		return _Q([]);
	}

	var modified = ARRAY(files).map(function() {}).valueOf();
	return ARRAY(files).map(function(file, i) {
		if(!is.string(file)) {
			return;
		}

		return function() {
			return FS.stat(file).then(function(stats) {
				debug.assert(stats).is('object');
				modified[i] = stats.mtime.getTime();
				return stats;
			});
		};
	}).reduce(_Q.when, _Q()).then(function() {
		return modified;
	});
}

/** Build browserify bundle */
module.exports = function build_bundle(entry_file, opts) {

	entry_file = PATH.resolve(entry_file);

	if(process.env.DEBUG_MVC) {
		debug.info('Building using browserify: ', entry_file);
	}

	var _cache;
	var _b;
	var _tmpfile;

	var ret_p = _Q.fcall(function() {

		if(process.env.DEBUG_MVC) {
			debug.log('step 1');
		}

		debug.assert(entry_file).is('string');

		opts = opts || {};
		debug.assert(opts).is('object');

		_cache = {
			'modified': is.array(opts.entries) ? ARRAY(opts.entries).map(function() { }).valueOf() : [],
			'body': undefined
		};

		if(!opts.entries) {
			opts.entries = [];
		}

		if(build_opts.enable_source_maps) {
			opts.debug = true;
		}

		if(build_opts.use_disc) {
			opts.fullPaths = true;
		}

		_b = browserify(opts);

		_b.add(entry_file);

		_b.ignore("disc");
		_b.ignore("ansi"); // nor-debug uses this on node side
		_b.ignore("temp");
		_b.ignore("nor-fs");
		_b.ignore("nor-express");
		_b.ignore("browserify");

		_b.ignore("search-and-require.js");
		_b.ignore("require-browserify.js");

		_b.ignore("./search-and-require.js");
		_b.ignore("./require-browserify.js");

		_b.ignore( PATH.join(__dirname, "../search-and-require.js") );
		_b.ignore( PATH.join(__dirname, "../require-browserify.js") );

		_b.ignore( PATH.resolve(__dirname, "../search-and-require.js") );
		_b.ignore( PATH.resolve(__dirname, "../require-browserify.js") );

		_b.ignore( require.resolve("../search-and-require.js") );
		_b.ignore( require.resolve("../require-browserify.js") );

		_b.ignore(__filename);

		// Ignore node files
		if(opts.mvc_node_files) {
			debug.assert(opts.mvc_node_files).is('array');

			if(process.env.DEBUG_MVC) {
				debug.log( 'node_files =', opts.mvc_node_files );
			}

			ARRAY(opts.mvc_node_files).forEach(function(found) {
				_b.ignore( found.file );
			});
		}

		//_b.transform({ global: true }, 'browserify-shim');
		_b.transform({ global: true }, 'browserify-ejs');
		_b.transform({ global: true }, 'envify');
		//_b.transform({ global: true }, 'brfs');
		//_b.transform({ global: true }, 'ejsify');

		if(build_opts.minimize_bundle) {
			_b.transform({ global: true }, 'uglifyify');
		}

		if(process.env.DEBUG_MVC) {
			debug.log('step 2');
		}

		if(!opts.mvc) {
			return;
		}

		// 
		//return get_object_as_temp_file(opts.mvc).then(function(result) {
		//	_tmpfile = result;
		//	//_b.add(result.file);
		//	_b.require(result.file, {'expose':'nor-mvc-self'});
		//});

		_tmpfile = opts.mvc;
		//debug.log('opts.mvc.file = ', opts.mvc.file);
		_b.require(opts.mvc.file, {'expose':'nor-mvc-self'});

	}).then(function() {
		return get_times(opts.entries);
	}).then(function(modified) {
		if(process.env.DEBUG_MVC) {
			debug.log('modified = ', modified);
			debug.log('_cache = ', _cache);
		}

		var no_cached_bundle = _cache.body === undefined;

		var files_changed = !!(ARRAY(modified).map(function(d, i) {
			return d !== _cache.modified[i];
		}).some(function(x) {
			return x === true;
		}));

		var lets_build_bundle = !!( no_cached_bundle || files_changed );

		if(process.env.DEBUG_MVC) {
			debug.log('no_cached_bundle = ', no_cached_bundle);
			debug.log('files_changed = ', files_changed);
			debug.log('lets_build_bundle = ', lets_build_bundle);
		}

		if(!lets_build_bundle) {
			return _cache.body;
		}

		return do_browserify_bundle(_b, {
			'debug': build_opts.enable_source_maps,
			'fullPaths': build_opts.use_disc
		}).then(function(body) {
			_cache.modified = modified;
			_cache.body = body;
			return body;
		});

	}).then(function(body) {
		if(!process.env.DISABLE_MVC_MESSAGES) {
			debug.info('Browserify build successful for ', entry_file);
		}

		return body;
	}).fail(function(err) {
		if(!process.env.DISABLE_MVC_ERRORS) {
			debug.error('Browserify build FAILED for file ', entry_file, ': ', err);
		}
		return _Q.reject(err);
	}).fin(function() {
		return get_mvc_as_file.clean(_tmpfile);
	});

	BUILD_PROMISES.set(entry_file, ret_p);

	return ret_p;
};

/* EOF */
