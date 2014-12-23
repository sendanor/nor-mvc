/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

/*var ejs = */require('ejs');
var debug = require('nor-debug');
var PATH = require('path');

/** Hash-map for promises of different files */
var _build_promises = {};

var BUILD_PROMISES = module.exports = {};

/** Returns a promise of when a specific file is ready */
BUILD_PROMISES.get = function get_promise_of_build_success(entryfile) {
	debug.assert(entryfile).is('string');
	entryfile = PATH.resolve(entryfile);
	var p = _build_promises.hasOwnProperty(entryfile) ? _build_promises[entryfile] : undefined;
	debug.assert(p).is('object');
	debug.assert(p.then).is('function');
	return p.then(function() { return true; }).fail(function() { return false; });
};

/** Set promise for specific file */
BUILD_PROMISES.set = function set_promise_entry(entry_file, p) {
	_build_promises[entry_file] = p;
};

/** EOF */
