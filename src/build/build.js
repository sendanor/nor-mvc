/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

/*var ejs = */require('ejs');
var debug = require('nor-debug');
var crypto = require('crypto');
var _Q = require('q');
var PATH = require('path');
var ARRAY = require('nor-array');

var FS = require('nor-fs');

var build_opts = require('./build-opts.js');
var build_bundle = require('./build-bundle.js');

var build_disc;
if(build_opts.use_disc) {
	build_disc = require('./build-disc.js');
}

var mktempdir = _Q.denodeify(require('temp').mkdir);

/** Returns build features as string */
function get_build_features() {
	var features = {};
	if(build_opts.is_production_build) {
		features.mode = 'production';
	} else {
		features.mode = 'development';
	}
	if(build_opts.enable_source_maps) {
		features.source_maps = true;
	}
	if(build_opts.minimize_bundle) {
		features.minimize = true;
	}
	if(build_opts.use_disc) {
		features.disc = true;
	}
	return ARRAY(Object.keys(features)).map(function(key) {
		return key + '=' + features[key];
	}).join(', ');
}

/** Calculate shasum */
function get_shasum(data) {
	debug.assert(data).is('string');
	debug.log('data.length = ', data.length);
	var shasum = crypto.createHash('sha1');
	shasum.update(data, 'utf8');
	return shasum.digest('hex');
}

/** Clear result files and directory */
function clean_result(result) {
	return _Q.fcall(function() {
		if(result.files && result.files.bundle) {
			return FS.unlinkIfExists(result.files.bundle);
		}
	}).then(function() {
		if(result.files && result.files.disc) {
			return FS.unlinkIfExists(result.files.disc);
		}
	}).then(function() {
		if(result.dir) {
			return FS.rmdirIfExists(result.dir);
		}
	});
}

/** Save bundle into filesystem */
function save_build(build) {

	var result = {
		'entry_file': build.entry_file,
		'opts': build.opts,
		'features': build.features,
		'shasums': build.shasums,
		'files': {}
	};

	return mktempdir('nor-mvc-browserify-build-').then(function(dir) {
		debug.assert(dir).is('string');
		result.dir = dir;
		result.files.bundle = PATH.resolve(dir, 'bundle.js');
		result.files.disc = build.disc ? PATH.resolve(dir, 'disc.html') : undefined;
		return FS.writeFile(result.files.bundle, build.bundle, {'encoding': 'utf8'});
	}).then(function() {
		if(result.files.disc && build.disc) {
			return FS.writeFile(result.files.disc, build.disc, {'encoding': 'utf8'});
		}
	}).then(function() {
		debug.log('result = ', result);
		return result;
	}).fail(function(err) {
		clean_result(result);
		return err;
	});
}

/** Returns a predicate function for testing path extensions */
var BUILD = module.exports = function build(entry_file, opts) {
	var promises = [];
	var bundle = build_bundle(entry_file, opts);
	promises.push( bundle );

	if(build_disc) {
		promises.push( bundle.then(function(body) {
			//console.log(body);
			return build_disc([body]);
		}) );
	}

	return _Q.all(promises).spread(function(bundle_, disc_) {

		debug.assert(bundle_).is('string');
		debug.assert(disc_).ignore(undefined).is('string');

		var shasums = {
			'bundle': get_shasum(bundle_),
			'disc': disc_ ? get_shasum(disc_) : undefined
		};

		return {
			'entry_file': entry_file,
			'opts': build_opts,
			'features': get_build_features(),
			'bundle': bundle_,
			'disc': disc_,
			'shasums': shasums
		};
	}).then(function(build_) {
		return save_build(build_);
	});
};

BUILD.clean = clean_result;

/* EOF */
