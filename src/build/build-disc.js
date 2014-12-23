/* nor-mvc -- Model-View-Controller -- build-disc.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

var _Q = require('q');
var debug = require('nor-debug');
var DISC = require('disc');

/** Build visualisation of bundle using disc */
module.exports = function build_disc(bundles) {

	if(process.env.DEBUG_MVC) {
		debug.info('Building HTML visualization for the bundle using disc...');
	}

	var defer = _Q.defer();
	function cb(err, html) {
		if(err) {
			defer.reject(err);
			return;
		}
		defer.resolve(html);
	}
	DISC.bundle(bundles, cb);

	return defer.promise.then(function(html) {
		if(!process.env.DISABLE_MVC_MESSAGES) {
			debug.info('HTML visualization for bundle (using disc) successful!');
		}
		return html;
	}).fail(function(err) {
		if(!process.env.DISABLE_MVC_ERRORS) {
			debug.error('HTML visualization for bundle (using disc) FAILED: ', err);
		}
		return _Q.reject(err);
	});
};

/* EOF */
