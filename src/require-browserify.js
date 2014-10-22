/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";
/*var ejs = */require('ejs');
var _Q = require('q');
var ARRAY = require('nor-array');
var copy = require('nor-data').copy;
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');
var FS = require('nor-fs');
var browserify = require('browserify');

/** Hash-map for promises of different files */
var _build_promises = {};

/** Returns a promise of when a specific file is ready */
function get_promise_of_build_success(entryfile) {
	debug.assert(entryfile).is('string');
	entryfile = PATH.resolve(entryfile);
	var p = _build_promises.hasOwnProperty(entryfile) ? _build_promises[entryfile] : undefined;
	debug.assert(p).is('object');
	debug.assert(p.then).is('function');
	return p.then(function() { return true; }).fail(function() { return false; });
}

/** Simply builds a bundle and returns it */
function do_browserify_bundle(b, opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('step 3');
	}
	opts = opts || {};
	debug.assert(b).is('object');
	debug.assert(opts).is('object');

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

/** Save times  */
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

/** Returns a stream from a object for browserify */
/*
function get_object_as_stream(obj) {
	function wrap(data) {
		debug.assert(data).is('string');
		return 'module.exports=' + data + ';';
	}

	var Stream = require('stream');
	var stream = new Stream();
	stream.pipe = function(dest) {
		var data = JSON.stringify(obj);
		dest.write(wrap(data));
	};
	return stream;
}
*/

/**
 * Function that returns promise of a temporary directory
 */
var mktempdir = _Q.denodeify(require('temp').mkdir);

/** Returns a promise of an object with a property `file` pointing to temporary file containing the object `obj` and method `.clean()` to clean it.
 * FIXME: Convert sync methods into async
 */
function get_object_as_temp_file(obj, basedir) {

	debug.assert(obj).is('object');
	debug.assert(basedir).is('string');

	/*
	function wrap_ejs(template) {
		return '(function() {var t = ' + template + '; return function(l) { return t(l) }}())';
	}
	*/

	function wrap(data) {
		debug.assert(data).is('object');
		//if(process.env.DEBUG_MVC) {
			//debug.log('data = ', data);
		//}
		var mod = copy(data);
		mod.browser = true;
		delete mod.filename;
		delete mod.dirname;
		if(!mod.views) {
			mod.views = {};
		}
		var code = [
			//'"use strict";',
			//'require("ejs");',
			'var mod = module.exports = ' + JSON.stringify(mod) + ';'
		];
		ARRAY(Object.keys(data.views)).forEach(function(view) {
			var file = data.views[view].file;
			//code.push('mod.views[' + JSON.stringify(view) + "] = require(" + JSON.stringify( '.' + PATH.sep + PATH.relative(basedir, data.views[view].file)) + ");");
			code.push('mod.views[' + JSON.stringify(view) + "] = require(" + JSON.stringify(file) + ");");
/*			code.push('mod.views[' + JSON.stringify(view) + "] = " + wrap_ejs(ejs.compile(FS.sync.readFile(file, {'encoding':'utf8'}), {
				client: true,
				compileDebug: false,
				filename: file})) + ";");
*/
		});
		return code.join('\n');
	}

	var result = {
		'clean': function() {
			return FS.rmdirIfExists(result.dir).unlinkIfExists(result.file);
		}
	};

	return mktempdir('nor-mvc-build').then(function(dir) {
		debug.assert(dir).is('string');
		result.dir = dir;
		var data = wrap(obj);
		debug.assert(data).is('string');
		result.file = PATH.resolve(dir, 'mvc.js');
		return FS.writeFile(result.file, data, {'encoding': 'utf8'});
	}).then(function() {
		return result;
	}).fail(function(err) {
		result.clean();
		throw err;
	});
}

/** Build browserify bundle */
function build_bundle(entry_file, opts) {

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

		_b = browserify(opts);

		_b.add(entry_file);

		_b.ignore("ansi"); // nor-debug uses this on node side
		_b.ignore("temp");
		_b.ignore("nor-fs");
		_b.ignore("nor-express");
		_b.ignore("browserify");
		_b.ignore("search-and-require.js");
		_b.ignore("require-browserify.js");
		_b.ignore("./search-and-require.js");
		_b.ignore("./require-browserify.js");
		_b.ignore(__filename);

		// Ignore node files
		if(opts.mvc && opts.mvc._node_files) {
			debug.assert(opts.mvc._node_files).is('array');

			if(process.env.DEBUG_MVC) {
				debug.log( 'node_files =', opts.mvc._node_files );
			}

			ARRAY(opts.mvc._node_files).forEach(function(found) {
				_b.ignore( found.file );
			});
		}

		//_b.transform({ global: true }, 'browserify-shim');
		_b.transform({ global: true }, 'browserify-ejs');
		_b.transform({ global: true }, 'envify');

		if(process.env.NODE_ENV === 'production') {
			_b.transform({ global: true }, 'uglifyify');
			//_b.transform('uglifyify');
		}

		if(process.env.DEBUG_MVC) {
			debug.log('step 2');
		}

		_tmpfile = {'clean': function() {}};

		if(!opts.mvc) { return; }

		// 
		return get_object_as_temp_file(opts.mvc, opts.basedir).then(function(result) {
			_tmpfile = result;
			//_b.add(result.file);
			_b.require(result.file, {'expose':'nor-mvc-self'});
		});

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
			'debug': debug.isDevelopment()
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
		_tmpfile.clean();
	});

	_build_promises[entry_file] = ret_p;

	return ret_p;
}

/** Returns a predicate function for testing path extensions */
var require_browserify = module.exports = function require_browserify(entry_file, opts) {
	var bundle = build_bundle(entry_file, opts);

	function step_2(req, res) {
		return bundle.then(function(body) {
			/* Please note: application/javascript would be 'right' but apparently IE6-8 do not support it. Not tested, though. Let's test it. */
			res.header('content-type', 'application/javascript; charset=UTF-8');
			res.send(body);
		});
	}

	return {
		'USE': step_2
	};
};

// Export
require_browserify.readiness = get_promise_of_build_success;

/* EOF */
