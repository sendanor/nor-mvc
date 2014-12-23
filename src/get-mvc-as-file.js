/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

/*var ejs = */require('ejs');
var _Q = require('q');
var ARRAY = require('nor-array');
var copy = require('nor-data').copy;
var debug = require('nor-debug');
var PATH = require('path');
var FS = require('nor-fs');

/**
 * Function that returns promise of a temporary directory
 */
var mktempdir = _Q.denodeify(require('temp').mkdir);

/** Clean results */
function clean_result(result) {
	return _Q.fcall(function() {
		if(result && result.file) {
			return FS.unlinkIfExists(result.file);
		}
	}).then(function() {
		if(result && result.dir) {
			return FS.rmdirIfExists(result.dir);
		}
	});
}

/** Returns a promise of an object with a property `file` pointing to temporary file containing the object `mvc` and method `.clean()` to clean it.
 * FIXME: Convert sync methods into async
 */
var get_mvc_as_file = module.exports = function get_object_as_temp_file(mvc) {

	debug.assert(mvc).is('object');

	//debug.log("views: "+ Object.keys(mvc.views) );

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
			code.push('mod.views[' + JSON.stringify(view) + "] = require(" + JSON.stringify(file) + ");");
		});
		return code.join('\n');
	}

	var result = {};

	return mktempdir('nor-mvc-build-').then(function(dir) {
		debug.assert(dir).is('string');
		result.dir = dir;
		var data = wrap(mvc);
		debug.assert(data).is('string');
		result.file = PATH.resolve(dir, 'mvc.js');
		return FS.writeFile(result.file, data, {'encoding': 'utf8'});
	}).then(function() {
		return result;
	}).fail(function(err) {
		clean_result(result);
		throw err;
	});
};

get_mvc_as_file.clean = clean_result;

/* EOF */
