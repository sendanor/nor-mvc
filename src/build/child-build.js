/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

require('ejs');
var _Q = require('q');
var debug = require('nor-debug');
var BUILD = require('./build.js');

process.on('message', function(job) {
	_Q.fcall(function() {
		debug.assert(job).is('object');
		debug.assert(job.entry_file).is('string');
		debug.assert(job.opts).is('object');
		return BUILD(job.entry_file, job.opts).then(function(build) {
			process.send({
				'type': 'build',
				'id': job.id,
				'resolved': true,
				'body': build
			});
		});
	}).fail(function(err) {
		debug.error(err);
		process.send({
			'type': 'build',
			'id': job.id,
			'resolved': false,
			'body': err
		});
	}).done();
});

/* EOF */
