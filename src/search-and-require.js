/* Model-View-Controller */
"use strict";
require('ejs');
var Q = require('q');
var debug = require('nor-debug');
var is = require('nor-is');
var PATH = require('path');
var FS = require('nor-fs');
var require_browserify; 
var require_browserify = require('./require-browserify.js');
var default_layout = require('./mvc.layout.ejs');

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

/** Constructor for matched files */
function FoundFile(file) {
	this.file = file;
}

/** Returns always `false` */
function nul() { return false; }

/** Search and collect all files from path
 * @param opts.files {object|files} Save `FoundFile` objects into this object or array
 * @returns {object} All matching files from path
 */
function search_and_collect(path, opts) {
	if(process.env.DEBUG_MVC) {
		debug.log('search_and_collect(', path, ',', opts, ')');
	}
	opts = opts || {};
	debug.assert(path).is('string');
	debug.assert(opts).is('object');

	var primary_ext = opts.extension || '.js';
	var sub_ext = opts.sub_extension;
	var parent_name = opts.parent_name;

	debug.assert(primary_ext).is('string');
	debug.assert(sub_ext).ignore(undefined).is('string');

	// opts.require_sub_extension
	debug.assert(opts.require_sub_extension).ignore(undefined).is('boolean');
	if(opts.require_sub_extension === undefined) {
		opts.require_sub_extension = false;
	}

	// 
	function collect_file(file) {
		if(is.array(opts.files)) {
			opts.files.push(file);
		} else if(is.obj(opts.files)) {
			opts.files[file.file] = file;
		}
		return file;
	}

	// 
	if(!is_directory(path)) {
		return collect_file(new FoundFile(path));
	}

	var result_files = [];
	var result = opts.result || {};

	debug.assert(result).is('object');

	var files = FS.sync.readdir(path).map(function join_path(file) {
		return PATH.join(path, file);
	});

	// Handle files
	var logic = opts.require_sub_extension ? and : or;
	files.filter(logic(has_extension(primary_ext), sub_ext ? has_sub_extension(sub_ext) : nul )).forEach(function each(file) {
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
		result[name] = collect_file(new FoundFile(file));
	});

	// Handle sub directories
	files.filter(is_directory).forEach(function each_2(dir) {
		var name = PATH.basename(dir);
		if(parent_name) {
			name = [parent_name, name].join('.');
		}
		if(result[name] !== undefined) {
			debug.warn('Multiple files conflicted for ', name, ' -- directory takes preference: ', dir);
		}
		search_and_collect(dir, {
			'extension': primary_ext,
			'sub_extension': sub_ext,
			'require_sub_extension': opts.require_sub_extension,
			'parent_name': name,
			'result': result,
			'files': opts.files
		});
	});

	return result;
}

/** Search and 
require all files from path
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

	// opts.require_sub_extension
	debug.assert(opts.require_sub_extension).ignore(undefined).is('boolean');
	if(opts.require_sub_extension === undefined) {
		opts.require_sub_extension = false;
	}

	// 
	if(! is_directory(path) ) {
		return require(path);
	}

	var result = opts.result || {};

	debug.assert(result).is('object');

	var files = FS.sync.readdir(path).map(function join_path(file) {
		return PATH.join(path, file);
	});

	var logic = opts.require_sub_extension ? and : or;
	files.filter(logic(has_extension(primary_ext), sub_ext ? has_sub_extension(sub_ext) : nul )).forEach(function each(file) {
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
		result[name].file = file;
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
			'require_sub_extension': opts.require_sub_extension,
			'parent_name': name,
			'result': result
		});
	});

	return result;
}

// Exports
module.exports = {
	search_and_require: search_and_require,
	search_and_collect: search_and_collect
};

/* EOF */
