/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

/*var ejs = */require('ejs');
var _Q = require('q');
var debug = require('nor-debug');
var copy = require('nor-data').copy;
var PATH = require('path');
var FS = require('nor-fs');
var URL = require('url');
var child_process = require('child_process');
var child_builder = child_process.fork(PATH.join(__dirname, 'build/child-build.js'));
var UUID = require('node-uuid');
var get_mvc_as_file = require('./get-mvc-as-file.js');
var BUILD = require('./build/build.js');

/** Build browserify bundle in child process */
function child_build(entry_file, opts_) {
	var opts = copy(opts_);
	if(opts_.mvc._node_files) {
		opts.mvc_node_files = opts_.mvc._node_files;
	}
	return get_mvc_as_file(opts_.mvc).then(function(result) {
		opts.mvc = result;

		var defer = _Q.defer();
		var job_id = UUID.v4();

		function message_listener(m) {

			// Ignore if this is not for us
			if(!(m && (m.type === 'build') && (m.id === job_id))) {
				return;
			}

			if(m.resolved) {
				defer.resolve(m.body);
			} else {
				defer.reject(m.body);
			}

			child_builder.removeListener('message', message_listener);
		}

		child_builder.on('message', message_listener);

		child_builder.send({
			'id': job_id,
			'entry_file': entry_file,
			'opts': opts
		});

		return defer.promise.then(function(build) {
			var promises = [];
			if(build.files) {
				if(build.files.bundle) {
					promises.push( FS.readFile(build.files.bundle, {'encoding':'utf8'}) );
				}
				if(build.files.disc) {
					promises.push( FS.readFile(build.files.disc, {'encoding':'utf8'}) );
				}
			}
			return _Q.all(promises).spread(function(bundle_, disc_) {
				debug.assert(bundle_).is('string');
				debug.assert(disc_).ignore(undefined).is('string');
				build.bundle = bundle_;
				if(disc_) {
					build.disc = disc_;
				}

				return BUILD.clean(build);
			}).then(function() {
				return build;
			});
		});

	});
}

/** Object that contains all the builds by entry_file */
var _builds = {};

/** Returns a predicate function for testing path extensions */
var require_browserify = module.exports = function require_browserify(entry_file, opts) {

	var _build;
	if(_builds.hasOwnProperty(entry_file)) {
		_build = _builds[entry_file];
	} else {
		_build = child_build(entry_file, opts).then(function(build) {
			debug.info('Build features: ' + build.features );
			debug.log('shasums: ' + JSON.stringify(build.shasums, null, 2));
			return build;
		});
		_builds[entry_file] = _build;
	}

	function require_browserify_2(req, res) {
		return _build.then(function(build) {
			var url, extname;

			if(build.opts.use_disc) {
				url = URL.parse(req.url);
				extname = PATH.extname(url.path);
				if(extname === '.html') {
					res.header('content-type', 'text/html; charset=UTF-8');
					res.send(build.disc);
					return;
				}
			}

			/* FIXME: Please note: application/javascript would be 'right' but apparently IE6-8 do not support it. Not tested, though. */
			res.header('content-type', 'application/javascript; charset=UTF-8');
			res.send(build.bundle);
		});
	}

	return {
		'USE': require_browserify_2
	};
};

// Export
require_browserify.readiness = function(entry_file) {
	return _Q.fcall(function() {
		if(!_builds.hasOwnProperty(entry_file)) {
			throw new TypeError("No build started for " + entry_file);
		}
		return _builds[entry_file];
	});
};

/* EOF */
