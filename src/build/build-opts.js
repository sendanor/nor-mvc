/* nor-mvc -- Model-View-Controller -- require-browserify.js */
"use strict";

// Make sure there is environment and this file is not included to browserify
if(process.browser) {
	throw new TypeError("This file (nor-mvc:require-browserify.js) should not be in the bundle.");
}

/*var ejs = */require('ejs');
var ARRAY = require('nor-array');

/** Environment options */
var build_opts = module.exports = {};
var env_opts = build_opts.env = {};
ARRAY((process.env.NOR_MVC_OPTS||'').split(/ +/)).forEach(function(key) {

	var defvalue = true;

	if(key[0] === '+') {
		key = key.substr(1);
	}

	if(key[0] === '-') {
		key = key.substr(1);
		defvalue = false;
	}

	key = key.replace(/[^a-zA-Z0-9]+/, "_").toLowerCase();

	if(key[0] === '+') {
		key = key.substr(1);
	}

	if(key[0] === '-') {
		key = key.substr(1);
		defvalue = false;
	}

	env_opts[key] = defvalue;
});

//debug.log('env_opts = ', env_opts);

/* */
build_opts.node_env_production = process.env.NODE_ENV === 'production';
//var node_env_development = process.env.NODE_ENV === 'development';

/** Is this production build? */
build_opts.is_production_build = build_opts.node_env_production;
if(env_opts.production === true) {
	build_opts.is_production_build = true;
} else if(env_opts.production === false) {
	build_opts.is_production_build = false;
}

/** Is this development build? */
build_opts.is_development_build = !build_opts.is_production_build;
if(env_opts.development === true) {
	build_opts.is_development_build = true;
	build_opts.is_production_build = false;
} else if(env_opts.development === false) {
	build_opts.is_development_build = false;
	build_opts.is_production_build = true;
}


/** Should we enable source maps? */
build_opts.enable_source_maps = build_opts.is_development_build;
if(env_opts.source_maps === true) {
	build_opts.enable_source_maps = true;
} else if(env_opts.source_maps === false) {
	build_opts.enable_source_maps = false;
}


/** Should we use uglifyify to minimize the bundle? */
build_opts.minimize_bundle = build_opts.is_production_build;
if(env_opts.minimize === true) {
	build_opts.minimize_bundle = true;
} else if(env_opts.minimize === false) {
	build_opts.minimize_bundle = false;
}

/** Enable support for disc? https://www.npmjs.org/package/disc */
build_opts.use_disc = build_opts.is_development_build;
if(env_opts.use_disc === true) {
	build_opts.use_disc = true;
} else if(env_opts.use_disc === false) {
	build_opts.use_disc = false;
}

/* EOF */
