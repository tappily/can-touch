
/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

/*!
 * jQuery JavaScript Library v2.0.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2013-07-03T13:30Z
 */
(function( window, undefined ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//
var
	// A central reference to the root jQuery(document)
	rootjQuery,

	// The deferred used on DOM ready
	readyList,

	// Support: IE9
	// For `typeof xmlNode.method` instead of `xmlNode.method !== undefined`
	core_strundefined = typeof undefined,

	// Use the correct document accordingly with window argument (sandbox)
	location = window.location,
	document = window.document,
	docElem = document.documentElement,

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$,

	// [[Class]] -> type pairs
	class2type = {},

	// List of deleted data cache ids, so we can reuse them
	core_deletedIds = [],

	core_version = "2.0.3",

	// Save a reference to some core methods
	core_concat = core_deletedIds.concat,
	core_push = core_deletedIds.push,
	core_slice = core_deletedIds.slice,
	core_indexOf = core_deletedIds.indexOf,
	core_toString = class2type.toString,
	core_hasOwn = class2type.hasOwnProperty,
	core_trim = core_version.trim,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		return new jQuery.fn.init( selector, context, rootjQuery );
	},

	// Used for matching numbers
	core_pnum = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,

	// Used for splitting on whitespace
	core_rnotwhite = /\S+/g,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	// Match a standalone tag
	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	},

	// The ready event handler and self cleanup method
	completed = function() {
		document.removeEventListener( "DOMContentLoaded", completed, false );
		window.removeEventListener( "load", completed, false );
		jQuery.ready();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: core_version,

	constructor: jQuery,
	init: function( selector, context, rootjQuery ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return rootjQuery.ready( selector );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return core_slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num == null ?

			// Return a 'clean' array
			this.toArray() :

			// Return just the object
			( num < 0 ? this[ this.length + num ] : this[ num ] );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	ready: function( fn ) {
		// Add the callback
		jQuery.ready.promise().done( fn );

		return this;
	},

	slice: function() {
		return this.pushStack( core_slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: core_push,
	sort: [].sort,
	splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( core_version + Math.random() ).replace( /\D/g, "" ),

	noConflict: function( deep ) {
		if ( window.$ === jQuery ) {
			window.$ = _$;
		}

		if ( deep && window.jQuery === jQuery ) {
			window.jQuery = _jQuery;
		}

		return jQuery;
	},

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray,

	isWindow: function( obj ) {
		return obj != null && obj === obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return String( obj );
		}
		// Support: Safari <= 5.1 (functionish RegExp)
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ core_toString.call(obj) ] || "object" :
			typeof obj;
	},

	isPlainObject: function( obj ) {
		// Not plain objects:
		// - Any object or value whose internal [[Class]] property is not "[object Object]"
		// - DOM nodes
		// - window
		if ( jQuery.type( obj ) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		// Support: Firefox <20
		// The try/catch suppresses exceptions thrown when attempting to access
		// the "constructor" property of certain host objects, ie. |window.location|
		// https://bugzilla.mozilla.org/show_bug.cgi?id=814622
		try {
			if ( obj.constructor &&
					!core_hasOwn.call( obj.constructor.prototype, "isPrototypeOf" ) ) {
				return false;
			}
		} catch ( e ) {
			return false;
		}

		// If the function hasn't returned already, we're confident that
		// |obj| is a plain object, created by {} or constructed with new Object
		return true;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	error: function( msg ) {
		throw new Error( msg );
	},

	// data: string of html
	// context (optional): If specified, the fragment will be created in this context, defaults to document
	// keepScripts (optional): If true, will include scripts passed in the html string
	parseHTML: function( data, context, keepScripts ) {
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		if ( typeof context === "boolean" ) {
			keepScripts = context;
			context = false;
		}
		context = context || document;

		var parsed = rsingleTag.exec( data ),
			scripts = !keepScripts && [];

		// Single tag
		if ( parsed ) {
			return [ context.createElement( parsed[1] ) ];
		}

		parsed = jQuery.buildFragment( [ data ], context, scripts );

		if ( scripts ) {
			jQuery( scripts ).remove();
		}

		return jQuery.merge( [], parsed.childNodes );
	},

	parseJSON: JSON.parse,

	// Cross-browser xml parsing
	parseXML: function( data ) {
		var xml, tmp;
		if ( !data || typeof data !== "string" ) {
			return null;
		}

		// Support: IE9
		try {
			tmp = new DOMParser();
			xml = tmp.parseFromString( data , "text/xml" );
		} catch ( e ) {
			xml = undefined;
		}

		if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
			jQuery.error( "Invalid XML: " + data );
		}
		return xml;
	},

	noop: function() {},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		var script,
				indirect = eval;

		code = jQuery.trim( code );

		if ( code ) {
			// If the code includes a valid, prologue position
			// strict mode pragma, execute code by injecting a
			// script tag into the document.
			if ( code.indexOf("use strict") === 1 ) {
				script = document.createElement("script");
				script.text = code;
				document.head.appendChild( script ).parentNode.removeChild( script );
			} else {
			// Otherwise, avoid the DOM node creation, insertion
			// and removal by using an indirect global eval
				indirect( code );
			}
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	trim: function( text ) {
		return text == null ? "" : core_trim.call( text );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				core_push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : core_indexOf.call( arr, elem, i );
	},

	merge: function( first, second ) {
		var l = second.length,
			i = first.length,
			j = 0;

		if ( typeof l === "number" ) {
			for ( ; j < l; j++ ) {
				first[ i++ ] = second[ j ];
			}
		} else {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, inv ) {
		var retVal,
			ret = [],
			i = 0,
			length = elems.length;
		inv = !!inv;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			retVal = !!callback( elems[ i ], i );
			if ( inv !== retVal ) {
				ret.push( elems[ i ] );
			}
		}

		return ret;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}
		}

		// Flatten any nested arrays
		return core_concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = core_slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( core_slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	// Multifunctional method to get and set values of a collection
	// The value/s can optionally be executed if it's a function
	access: function( elems, fn, key, value, chainable, emptyGet, raw ) {
		var i = 0,
			length = elems.length,
			bulk = key == null;

		// Sets many values
		if ( jQuery.type( key ) === "object" ) {
			chainable = true;
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
			}

		// Sets one value
		} else if ( value !== undefined ) {
			chainable = true;

			if ( !jQuery.isFunction( value ) ) {
				raw = true;
			}

			if ( bulk ) {
				// Bulk operations run against the entire set
				if ( raw ) {
					fn.call( elems, value );
					fn = null;

				// ...except when executing function values
				} else {
					bulk = fn;
					fn = function( elem, key, value ) {
						return bulk.call( jQuery( elem ), value );
					};
				}
			}

			if ( fn ) {
				for ( ; i < length; i++ ) {
					fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
				}
			}
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: Date.now,

	// A method for quickly swapping in/out CSS properties to get correct calculations.
	// Note: this method belongs to the css module but it's needed here for the support module.
	// If support gets modularized, this method should be moved back to the css module.
	swap: function( elem, options, callback, args ) {
		var ret, name,
			old = {};

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.apply( elem, args || [] );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		} else {

			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );
		}
	}
	return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || type !== "function" &&
		( length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj );
}

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
/*!
 * Sizzle CSS Selector Engine v1.9.4-pre
 * http://sizzlejs.com/
 *
 * Copyright 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2013-06-03
 */
(function( window, undefined ) {

var i,
	support,
	cachedruns,
	Expr,
	getText,
	isXML,
	compile,
	outermostContext,
	sortInput,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	hasDuplicate = false,
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}
		return 0;
	},

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:([*^$|!~]?=)" + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rsibling = new RegExp( whitespace + "*[+~]" ),
	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			// BMP codepoint
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( documentIsHTML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName && context.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && context.parentNode || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key += " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Detect xml
 * @param {Element|Object} elem An element or a document
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var doc = node ? node.ownerDocument || node : preferredDoc,
		parent = doc.defaultView;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsHTML = !isXML( doc );

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent.attachEvent && parent !== parent.top ) {
		parent.attachEvent( "onbeforeunload", function() {
			setDocument();
		});
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if getElementsByClassName can be trusted
	support.getElementsByClassName = assert(function( div ) {
		div.innerHTML = "<div class='a'></div><div class='a i'></div>";

		// Support: Safari<4
		// Catch class over-caching
		div.firstChild.className = "i";
		// Support: Opera<10
		// Catch gEBCN failure to find non-leading classes
		return div.getElementsByClassName("i").length === 2;
	});

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Support: Opera 10-12/IE8
			// ^= $= *= and empty values
			// Should not select anything
			// Support: Windows 8 Native Apps
			// The type attribute is restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "t", "" );

			if ( div.querySelectorAll("[t^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = rnative.test( docElem.contains ) || docElem.compareDocumentPosition ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var compare = b.compareDocumentPosition && a.compareDocumentPosition && a.compareDocumentPosition( b );

		if ( compare ) {
			// Disconnected nodes
			if ( compare & 1 ||
				(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

				// Choose the first element that is related to our preferred document
				if ( a === doc || contains(preferredDoc, a) ) {
					return -1;
				}
				if ( b === doc || contains(preferredDoc, b) ) {
					return 1;
				}

				// Maintain original order
				return sortInput ?
					( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
					0;
			}

			return compare & 4 ? -1 : 1;
		}

		// Not directly comparable, sort on existence of method
		return a.compareDocumentPosition ? -1 : 1;
	} :
	function( a, b ) {
		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Parentless nodes are either documents or disconnected
		} else if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val === undefined ?
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null :
		val;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (see #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] && match[4] !== undefined ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== strundefined && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeName > "@" || elem.nodeType === 3 || elem.nodeType === 4 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === elem.type );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( tokens = [] );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var data, cache, outerCache,
				dirkey = dirruns + " " + doneName;

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (cache = outerCache[ dir ]) && cache[0] === dirkey ) {
							if ( (data = cache[1]) === true || data === cachedruns ) {
								return data === true;
							}
						} else {
							cache = outerCache[ dir ] = [ dirkey ];
							cache[1] = matcher( elem, context, xml ) || cachedruns;
							if ( cache[1] === true ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	// A counter to specify which element is currently being matched
	var matcherCachedRuns = 0,
		bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, expandContext ) {
			var elem, j, matcher,
				setMatched = [],
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				outermost = expandContext != null,
				contextBackup = outermostContext,
				// We must always have either seed elements or context
				elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1);

			if ( outermost ) {
				outermostContext = context !== document && context;
				cachedruns = matcherCachedRuns;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			for ( ; (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
						cachedruns = ++matcherCachedRuns;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					support.getById && context.nodeType === 9 && documentIsHTML &&
					Expr.relative[ tokens[1].type ] ) {

				context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
				if ( !context ) {
					return results;
				}
				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && context.parentNode || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, seed );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector )
	);
	return results;
}

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome<14
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return (val = elem.getAttributeNode( name )) && val.specified ?
				val.value :
				elem[ name ] === true ? name.toLowerCase() : null;
		}
	});
}

jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( core_rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};
jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var action = tuple[ 0 ],
								fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ action + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = core_slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
					if( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});
jQuery.support = (function( support ) {
	var input = document.createElement("input"),
		fragment = document.createDocumentFragment(),
		div = document.createElement("div"),
		select = document.createElement("select"),
		opt = select.appendChild( document.createElement("option") );

	// Finish early in limited environments
	if ( !input.type ) {
		return support;
	}

	input.type = "checkbox";

	// Support: Safari 5.1, iOS 5.1, Android 4.x, Android 2.3
	// Check the default checkbox/radio value ("" on old WebKit; "on" elsewhere)
	support.checkOn = input.value !== "";

	// Must access the parent to make an option select properly
	// Support: IE9, IE10
	support.optSelected = opt.selected;

	// Will be defined later
	support.reliableMarginRight = true;
	support.boxSizingReliable = true;
	support.pixelPosition = false;

	// Make sure checked status is properly cloned
	// Support: IE9, IE10
	input.checked = true;
	support.noCloneChecked = input.cloneNode( true ).checked;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Check if an input maintains its value after becoming a radio
	// Support: IE9, IE10
	input = document.createElement("input");
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "checked", "t" );
	input.setAttribute( "name", "t" );

	fragment.appendChild( input );

	// Support: Safari 5.1, Android 4.x, Android 2.3
	// old WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: Firefox, Chrome, Safari
	// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP)
	support.focusinBubbles = "onfocusin" in window;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, marginDiv,
			// Support: Firefox, Android 2.3 (Prefixed box-sizing versions).
			divReset = "padding:0;margin:0;border:0;display:block;-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box",
			body = document.getElementsByTagName("body")[ 0 ];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		container = document.createElement("div");
		container.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px";

		// Check box-sizing and margin behavior.
		body.appendChild( container ).appendChild( div );
		div.innerHTML = "";
		// Support: Firefox, Android 2.3 (Prefixed box-sizing versions).
		div.style.cssText = "-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%";

		// Workaround failing boxSizing test due to offsetWidth returning wrong value
		// with some non-1 values of body zoom, ticket #13543
		jQuery.swap( body, body.style.zoom != null ? { zoom: 1 } : {}, function() {
			support.boxSizing = div.offsetWidth === 4;
		});

		// Use window.getComputedStyle because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Support: Android 2.3
			// Check if div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container. (#3333)
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			marginDiv = div.appendChild( document.createElement("div") );
			marginDiv.style.cssText = div.style.cssText = divReset;
			marginDiv.style.marginRight = marginDiv.style.width = "0";
			div.style.width = "1px";

			support.reliableMarginRight =
				!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
		}

		body.removeChild( container );
	});

	return support;
})( {} );

/*
	Implementation Summary

	1. Enforce API surface and semantic compatibility with 1.9.x branch
	2. Improve the module's maintainability by reducing the storage
		paths to a single mechanism.
	3. Use the same single mechanism to support "private" and "user" data.
	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
	5. Avoid exposing implementation details on user objects (eg. expando properties)
	6. Provide a clear path for implementation upgrade to WeakMap in 2014
*/
var data_user, data_priv,
	rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
	rmultiDash = /([A-Z])/g;

function Data() {
	// Support: Android < 4,
	// Old WebKit does not have Object.preventExtensions/freeze method,
	// return new empty object instead with no [[set]] accessor
	Object.defineProperty( this.cache = {}, 0, {
		get: function() {
			return {};
		}
	});

	this.expando = jQuery.expando + Math.random();
}

Data.uid = 1;

Data.accepts = function( owner ) {
	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType ?
		owner.nodeType === 1 || owner.nodeType === 9 : true;
};

Data.prototype = {
	key: function( owner ) {
		// We can accept data for non-element nodes in modern browsers,
		// but we should not, see #8335.
		// Always return the key for a frozen object.
		if ( !Data.accepts( owner ) ) {
			return 0;
		}

		var descriptor = {},
			// Check if the owner object already has a cache key
			unlock = owner[ this.expando ];

		// If not, create one
		if ( !unlock ) {
			unlock = Data.uid++;

			// Secure it in a non-enumerable, non-writable property
			try {
				descriptor[ this.expando ] = { value: unlock };
				Object.defineProperties( owner, descriptor );

			// Support: Android < 4
			// Fallback to a less secure definition
			} catch ( e ) {
				descriptor[ this.expando ] = unlock;
				jQuery.extend( owner, descriptor );
			}
		}

		// Ensure the cache object
		if ( !this.cache[ unlock ] ) {
			this.cache[ unlock ] = {};
		}

		return unlock;
	},
	set: function( owner, data, value ) {
		var prop,
			// There may be an unlock assigned to this node,
			// if there is no entry for this "owner", create one inline
			// and set the unlock as though an owner entry had always existed
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		// Handle: [ owner, key, value ] args
		if ( typeof data === "string" ) {
			cache[ data ] = value;

		// Handle: [ owner, { properties } ] args
		} else {
			// Fresh assignments by object are shallow copied
			if ( jQuery.isEmptyObject( cache ) ) {
				jQuery.extend( this.cache[ unlock ], data );
			// Otherwise, copy the properties one-by-one to the cache object
			} else {
				for ( prop in data ) {
					cache[ prop ] = data[ prop ];
				}
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		// Either a valid cache is found, or will be created.
		// New caches will be created and the unlock returned,
		// allowing direct access to the newly created
		// empty data object. A valid owner object must be provided.
		var cache = this.cache[ this.key( owner ) ];

		return key === undefined ?
			cache : cache[ key ];
	},
	access: function( owner, key, value ) {
		var stored;
		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				((key && typeof key === "string") && value === undefined) ) {

			stored = this.get( owner, key );

			return stored !== undefined ?
				stored : this.get( owner, jQuery.camelCase(key) );
		}

		// [*]When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i, name, camel,
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		if ( key === undefined ) {
			this.cache[ unlock ] = {};

		} else {
			// Support array or space separated string of keys
			if ( jQuery.isArray( key ) ) {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = key.concat( key.map( jQuery.camelCase ) );
			} else {
				camel = jQuery.camelCase( key );
				// Try the string as a key before any manipulation
				if ( key in cache ) {
					name = [ key, camel ];
				} else {
					// If a key with the spaces exists, use it.
					// Otherwise, create an array by matching non-whitespace
					name = camel;
					name = name in cache ?
						[ name ] : ( name.match( core_rnotwhite ) || [] );
				}
			}

			i = name.length;
			while ( i-- ) {
				delete cache[ name[ i ] ];
			}
		}
	},
	hasData: function( owner ) {
		return !jQuery.isEmptyObject(
			this.cache[ owner[ this.expando ] ] || {}
		);
	},
	discard: function( owner ) {
		if ( owner[ this.expando ] ) {
			delete this.cache[ owner[ this.expando ] ];
		}
	}
};

// These may be used throughout the jQuery core codebase
data_user = new Data();
data_priv = new Data();


jQuery.extend({
	acceptData: Data.accepts,

	hasData: function( elem ) {
		return data_user.hasData( elem ) || data_priv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return data_user.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		data_user.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to data_priv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return data_priv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		data_priv.remove( elem, name );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var attrs, name,
			elem = this[ 0 ],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = data_user.get( elem );

				if ( elem.nodeType === 1 && !data_priv.get( elem, "hasDataAttrs" ) ) {
					attrs = elem.attributes;
					for ( ; i < attrs.length; i++ ) {
						name = attrs[ i ].name;

						if ( name.indexOf( "data-" ) === 0 ) {
							name = jQuery.camelCase( name.slice(5) );
							dataAttr( elem, name, data[ name ] );
						}
					}
					data_priv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				data_user.set( this, key );
			});
		}

		return jQuery.access( this, function( value ) {
			var data,
				camelKey = jQuery.camelCase( key );

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {
				// Attempt to get data from the cache
				// with the key as-is
				data = data_user.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to get data from the cache
				// with the key camelized
				data = data_user.get( elem, camelKey );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, camelKey, undefined );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each(function() {
				// First, attempt to store a copy or reference of any
				// data that might've been store with a camelCased key.
				var data = data_user.get( this, camelKey );

				// For HTML5 data-* attribute interop, we have to
				// store property names with dashes in a camelCase form.
				// This might not apply to all properties...*
				data_user.set( this, camelKey, value );

				// *... In the case of properties that might _actually_
				// have dashes, we need to also store a copy of that
				// unchanged property.
				if ( key.indexOf("-") !== -1 && data !== undefined ) {
					data_user.set( this, key, value );
				}
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			data_user.remove( this, key );
		});
	}
});

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? JSON.parse( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			data_user.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}
jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = data_priv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray( data ) ) {
					queue = data_priv.access( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return data_priv.get( elem, key ) || data_priv.access( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				data_priv.remove( elem, [ type + "queue", key ] );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	// Based off of the plugin by Clint Helfers, with permission.
	// http://blindsignals.com/index.php/2009/07/jquery-delay/
	delay: function( time, type ) {
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while( i-- ) {
			tmp = data_priv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var nodeHook, boolHook,
	rclass = /[\t\r\n\f]/g,
	rreturn = /\r/g,
	rfocusable = /^(?:input|select|textarea|button)$/i;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each(function() {
			delete this[ jQuery.propFix[ name ] || name ];
		});
	},

	addClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}
					elem.className = jQuery.trim( cur );

				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( core_rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}
					elem.className = value ? jQuery.trim( cur ) : "";
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( core_rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === core_strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					data_priv.set( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : data_priv.get( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map(val, function ( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				// attributes.value is undefined in Blackberry 4.7 but
				// uses .value. See #6932
				var val = elem.attributes.value;
				return !val || val.specified ? elem.value : elem.text;
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// IE6-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];
					if ( (option.selected = jQuery.inArray( jQuery(option).val(), values ) >= 0) ) {
						optionSet = true;
					}
				}

				// force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	},

	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === core_strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( core_rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					elem[ propName ] = false;
				}

				elem.removeAttribute( name );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				return elem.hasAttribute( "tabindex" ) || rfocusable.test( elem.nodeName ) || elem.href ?
					elem.tabIndex :
					-1;
			}
		}
	}
});

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = jQuery.expr.attrHandle[ name ] || jQuery.find.attr;

	jQuery.expr.attrHandle[ name ] = function( elem, name, isXML ) {
		var fn = jQuery.expr.attrHandle[ name ],
			ret = isXML ?
				undefined :
				/* jshint eqeqeq: false */
				// Temporarily disable this handler to check existence
				(jQuery.expr.attrHandle[ name ] = undefined) !=
					getter( elem, name, isXML ) ?

					name.toLowerCase() :
					null;

		// Restore handler
		jQuery.expr.attrHandle[ name ] = fn;

		return ret;
	};
});

// Support: IE9+
// Selectedness for an option in an optgroup can be inaccurate
if ( !jQuery.support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !jQuery.support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			// Support: Webkit
			// "" is returned instead of "on" if a value isn't specified
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});
var rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== core_strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.hasData( elem ) && data_priv.get( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( core_rnotwhite ) || [""];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;
			data_priv.remove( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special,
			eventPath = [ elem || document ],
			type = core_hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = core_hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( data_priv.get( cur, "events" ) || {} )[ event.type ] && data_priv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && jQuery.isFunction( elem[ type ] ) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, j, ret, matched, handleObj,
			handlerQueue = [],
			args = core_slice.call( arguments ),
			handlers = ( data_priv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, matches, sel, handleObj,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: Cordova 2.5 (WebKit) (#13255)
		// All events should have a target; Cordova deviceready doesn't
		if ( !event.target ) {
			event.target = document;
		}

		// Support: Safari 6.0+, Chrome < 28
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && jQuery.nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, false );
	}
};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && e.preventDefault ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && e.stopPropagation ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
// Support: Chrome 15+
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// Create "bubbling" focus and blur events
// Support: Firefox, Chrome, Safari
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				if ( attaches++ === 0 ) {
					document.addEventListener( orig, handler, true );
				}
			},
			teardown: function() {
				if ( --attaches === 0 ) {
					document.removeEventListener( orig, handler, true );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});
var isSimple = /^.[^:#\[\.,]*$/,
	rparentsprev = /^(?:parents|prev(?:Until|All))/,
	rneedsContext = jQuery.expr.match.needsContext,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			ret = [],
			self = this,
			len = self.length;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},

	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter(function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},

	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},

	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = ( rneedsContext.test( selectors ) || typeof selectors !== "string" ) ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					cur = matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return core_indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return core_indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		var set = typeof selector === "string" ?
				jQuery( selector, context ) :
				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
			all = jQuery.merge( this.get(), set );

		return this.pushStack( jQuery.unique(all) );
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	while ( (cur = cur[dir]) && cur.nodeType !== 1 ) {}

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return elem.contentDocument || jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.unique( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
});

jQuery.extend({
	filter: function( expr, elems, not ) {
		var elem = elems[ 0 ];

		if ( not ) {
			expr = ":not(" + expr + ")";
		}

		return elems.length === 1 && elem.nodeType === 1 ?
			jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
			jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
				return elem.nodeType === 1;
			}));
	},

	dir: function( elem, dir, until ) {
		var matched = [],
			truncate = until !== undefined;

		while ( (elem = elem[ dir ]) && elem.nodeType !== 9 ) {
			if ( elem.nodeType === 1 ) {
				if ( truncate && jQuery( elem ).is( until ) ) {
					break;
				}
				matched.push( elem );
			}
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var matched = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				matched.push( n );
			}
		}

		return matched;
	}
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( isSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( core_indexOf.call( qualifier, elem ) >= 0 ) !== not;
	});
}
var rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	manipulation_rcheckableType = /^(?:checkbox|radio)$/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {

		// Support: IE 9
		option: [ 1, "<select multiple='multiple'>", "</select>" ],

		thead: [ 1, "<table>", "</table>" ],
		col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		_default: [ 0, "", "" ]
	};

// Support: IE 9
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[ 0 ] && this[ 0 ].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	// keepData is for internal use only--do not document
	remove: function( selector, keepData ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function () {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return jQuery.access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var
			// Snapshot the DOM in case .domManip sweeps something relevant into its fragment
			args = jQuery.map( this, function( elem ) {
				return [ elem.nextSibling, elem.parentNode ];
			}),
			i = 0;

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			var next = args[ i++ ],
				parent = args[ i++ ];

			if ( parent ) {
				// Don't use the snapshot next if it has moved (#13810)
				if ( next && next.parentNode !== parent ) {
					next = this.nextSibling;
				}
				jQuery( this ).remove();
				parent.insertBefore( elem, next );
			}
		// Allow new content to include elements from the context set
		}, true );

		// Force removal if there was no new content (e.g., from empty arguments)
		return i ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback, allowIntersection ) {

		// Flatten any nested arrays
		args = core_concat.apply( [], args );

		var fragment, first, scripts, hasScripts, node, doc,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[ 0 ],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction || !( l <= 1 || typeof value !== "string" || jQuery.support.checkClone || !rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[ 0 ] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback, allowIntersection );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, !allowIntersection && this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							// Support: QtWebKit
							// jQuery.merge because core_push.apply(_, arraylike) throws
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[ i ], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!data_priv.access( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Hope ajax is available...
								jQuery._evalUrl( node.src );
							} else {
								jQuery.globalEval( node.textContent.replace( rcleanScript, "" ) );
							}
						}
					}
				}
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: QtWebKit
			// .get() because core_push.apply(_, arraylike) throws
			core_push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Support: IE >= 9
		// Fix Cloning issues
		if ( !jQuery.support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) && !jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var elem, tmp, tag, wrap, contains, j,
			i = 0,
			l = elems.length,
			fragment = context.createDocumentFragment(),
			nodes = [];

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					// Support: QtWebKit
					// jQuery.merge because core_push.apply(_, arraylike) throws
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || fragment.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || ["", ""] )[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					tmp.innerHTML = wrap[ 1 ] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[ 2 ];

					// Descend through wrappers to the right content
					j = wrap[ 0 ];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Support: QtWebKit
					// jQuery.merge because core_push.apply(_, arraylike) throws
					jQuery.merge( nodes, tmp.childNodes );

					// Remember the top-level container
					tmp = fragment.firstChild;

					// Fixes #12346
					// Support: Webkit, IE
					tmp.textContent = "";
				}
			}
		}

		// Remove wrapper from fragment
		fragment.textContent = "";

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( fragment.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		return fragment;
	},

	cleanData: function( elems ) {
		var data, elem, events, type, key, j,
			special = jQuery.event.special,
			i = 0;

		for ( ; (elem = elems[ i ]) !== undefined; i++ ) {
			if ( Data.accepts( elem ) ) {
				key = elem[ data_priv.expando ];

				if ( key && (data = data_priv.cache[ key ]) ) {
					events = Object.keys( data.events || {} );
					if ( events.length ) {
						for ( j = 0; (type = events[j]) !== undefined; j++ ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}
					if ( data_priv.cache[ key ] ) {
						// Discard any remaining `private` data
						delete data_priv.cache[ key ];
					}
				}
			}
			// Discard any remaining `user` data
			delete data_user.cache[ elem[ data_user.expando ] ];
		}
	},

	_evalUrl: function( url ) {
		return jQuery.ajax({
			url: url,
			type: "GET",
			dataType: "script",
			async: false,
			global: false,
			"throws": true
		});
	}
});

// Support: 1.x compatibility
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType === 1 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );

	if ( match ) {
		elem.type = match[ 1 ];
	} else {
		elem.removeAttribute("type");
	}

	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var l = elems.length,
		i = 0;

	for ( ; i < l; i++ ) {
		data_priv.set(
			elems[ i ], "globalEval", !refElements || data_priv.get( refElements[ i ], "globalEval" )
		);
	}
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( data_priv.hasData( src ) ) {
		pdataOld = data_priv.access( src );
		pdataCur = data_priv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( data_user.hasData( src ) ) {
		udataOld = data_user.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		data_user.set( dest, udataCur );
	}
}


function getAll( context, tag ) {
	var ret = context.getElementsByTagName ? context.getElementsByTagName( tag || "*" ) :
			context.querySelectorAll ? context.querySelectorAll( tag || "*" ) :
			[];

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], ret ) :
		ret;
}

// Support: IE >= 9
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && manipulation_rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}
jQuery.fn.extend({
	wrapAll: function( html ) {
		var wrap;

		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapAll( html.call(this, i) );
			});
		}

		if ( this[ 0 ] ) {

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function( i ) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});
var curCSS, iframe,
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rmargin = /^margin/,
	rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
	rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + core_pnum + ")", "i" ),
	elemdisplay = { BODY: "block" },

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssExpand = [ "Top", "Right", "Bottom", "Left" ],
	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function isHidden( elem, el ) {
	// isHidden might be called from jQuery#filter function;
	// in that case, element will be second argument
	elem = el || elem;
	return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

// NOTE: we've included the "window" in window.getComputedStyle
// because jsdom on node.js will break without it.
function getStyles( elem ) {
	return window.getComputedStyle( elem, null );
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = data_priv.get( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = data_priv.access( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
			}
		} else {

			if ( !values[ index ] ) {
				hidden = isHidden( elem );

				if ( display && display !== "none" || !hidden ) {
					data_priv.set( elem, "olddisplay", hidden ? display : jQuery.css(elem, "display") );
				}
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.fn.extend({
	css: function( name, value ) {
		return jQuery.access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": "cssFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifying setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !jQuery.support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				style[ name ] = value;
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

curCSS = function( elem, name, _computed ) {
	var width, minWidth, maxWidth,
		computed = _computed || getStyles( elem ),

		// Support: IE9
		// getPropertyValue is only needed for .css('filter') in IE9, see #12537
		ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined,
		style = elem.style;

	if ( computed ) {

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// Support: Safari 5.1
		// A tribute to the "awesome hack by Dean Edwards"
		// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
		// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret;
};


function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {
			// Use the already-created iframe if possible
			iframe = ( iframe ||
				jQuery("<iframe frameborder='0' width='0' height='0'/>")
				.css( "cssText", "display:block !important" )
			).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[0].contentWindow || iframe[0].contentDocument ).document;
			doc.write("<!doctype html><html><body>");
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}

// Called ONLY from within css_defaultDisplay
function actualDisplay( name, doc ) {
	var elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),
		display = jQuery.css( elem[0], "display" );
	elem.remove();
	return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return elem.offsetWidth === 0 && rdisplayswap.test( jQuery.css( elem, "display" ) ) ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
	// Support: Android 2.3
	if ( !jQuery.support.reliableMarginRight ) {
		jQuery.cssHooks.marginRight = {
			get: function( elem, computed ) {
				if ( computed ) {
					// Support: Android 2.3
					// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
					// Work around by temporarily setting element display to inline-block
					return jQuery.swap( elem, { "display": "inline-block" },
						curCSS, [ elem, "marginRight" ] );
				}
			}
		};
	}

	// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
	// getComputedStyle returns percent when specified for top/left/bottom/right
	// rather than make the css module depend on the offset module, we just check for it here
	if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
		jQuery.each( [ "top", "left" ], function( i, prop ) {
			jQuery.cssHooks[ prop ] = {
				get: function( elem, computed ) {
					if ( computed ) {
						computed = curCSS( elem, prop );
						// if curCSS returns percentage, fallback to offset
						return rnumnonpx.test( computed ) ?
							jQuery( elem ).position()[ prop ] + "px" :
							computed;
					}
				}
			};
		});
	}

});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		// Support: Opera <= 12.12
		// Opera reports offsetWidths and offsetHeights less than zero on some elements
		return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});
var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function(){
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function(){
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !manipulation_rcheckableType.test( type ) );
		})
		.map(function( i, elem ){
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ){
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}
jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});
var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	ajax_nonce = jQuery.now(),

	ajax_rquery = /\?/,
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

	// Keep a copy of the old load method
	_load = jQuery.fn.load,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( core_rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ){
	jQuery.fn[ type ] = function( fn ){
		return this.on( type, fn );
	};
});

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,
			// URL without anti-cache param
			cacheURL,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" )
			.replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( core_rnotwhite ) || [""];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + ajax_nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( ajax_rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ajax_nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

		// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}
// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery("<script>").prop({
					async: true,
					charset: s.scriptCharset,
					src: s.url
				}).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});
var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( ajax_nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( ajax_rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});
jQuery.ajaxSettings.xhr = function() {
	try {
		return new XMLHttpRequest();
	} catch( e ) {}
};

var xhrSupported = jQuery.ajaxSettings.xhr(),
	xhrSuccessStatus = {
		// file protocol always yields status code 0, assume 200
		0: 200,
		// Support: IE9
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	// Support: IE9
	// We need to keep track of outbound xhr and abort them manually
	// because IE is not smart enough to do it all by itself
	xhrId = 0,
	xhrCallbacks = {};

if ( window.ActiveXObject ) {
	jQuery( window ).on( "unload", function() {
		for( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]();
		}
		xhrCallbacks = undefined;
	});
}

jQuery.support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
jQuery.support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport(function( options ) {
	var callback;
	// Cross domain only allowed if supported through XMLHttpRequest
	if ( jQuery.support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i, id,
					xhr = options.xhr();
				xhr.open( options.type, options.url, options.async, options.username, options.password );
				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}
				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}
				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers["X-Requested-With"] ) {
					headers["X-Requested-With"] = "XMLHttpRequest";
				}
				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}
				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							delete xhrCallbacks[ id ];
							callback = xhr.onload = xhr.onerror = null;
							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {
								complete(
									// file protocol always yields status 0, assume 404
									xhr.status || 404,
									xhr.statusText
								);
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,
									// Support: IE9
									// #11426: When requesting binary data, IE9 will throw an exception
									// on any attempt to access responseText
									typeof xhr.responseText === "string" ? {
										text: xhr.responseText
									} : undefined,
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};
				// Listen to events
				xhr.onload = callback();
				xhr.onerror = callback("error");
				// Create the abort callback
				callback = xhrCallbacks[( id = xhrId++ )] = callback("abort");
				// Do send the request
				// This may raise an exception which is actually
				// handled in jQuery.ajax (so no try/catch here)
				xhr.send( options.hasContent && options.data || null );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});
var fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*
					// Use a string for doubling factor so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur()
				// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		}]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// we're done with this property
			return tween;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = data_priv.get( elem, "fxshow" );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE9-10 do not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		if ( jQuery.css( elem, "display" ) === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			style.display = "inline-block";
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always(function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		});
	}


	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = data_priv.access( elem, "fxshow", {} );
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;

			data_priv.remove( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE9
// Panic based approach to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || data_priv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = data_priv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = data_priv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth? 1 : 0;
	for( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p*Math.PI ) / 2;
	}
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	if ( timer() && jQuery.timers.push( timer ) ) {
		jQuery.fx.start();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}
jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var docElem, win,
		elem = this[ 0 ],
		box = { top: 0, left: 0 },
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return;
	}

	docElem = doc.documentElement;

	// Make sure it's not a disconnected DOM node
	if ( !jQuery.contains( docElem, elem ) ) {
		return box;
	}

	// If we don't have gBCR, just use 0,0 rather than error
	// BlackBerry 5, iOS 3 (original iPhone)
	if ( typeof elem.getBoundingClientRect !== core_strundefined ) {
		box = elem.getBoundingClientRect();
	}
	win = getWindow( doc );
	return {
		top: box.top + win.pageYOffset - docElem.clientTop,
		left: box.left + win.pageXOffset - docElem.clientLeft
	};
};

jQuery.offset = {

	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) && ( curCSSTop + curCSSLeft ).indexOf("auto") > -1;

		// Need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};


jQuery.fn.extend({

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// Fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is it's only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// We assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();

		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position") === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || docElem;
		});
	}
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : window.pageXOffset,
					top ? val : window.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

function getWindow( elem ) {
	return jQuery.isWindow( elem ) ? elem : elem.nodeType === 9 && elem.defaultView;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return jQuery.access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});
// Limit scope pollution from any deprecated API
// (function() {

// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;

// })();
if ( typeof module === "object" && module && typeof module.exports === "object" ) {
	// Expose jQuery as module.exports in loaders that implement the Node
	// module pattern (including browserify). Do not create the global, since
	// the user will be storing it themselves locally, and globals are frowned
	// upon in the Node module world.
	module.exports = jQuery;
} else {
	// Register as a named AMD module, since jQuery can be concatenated with other
	// files that may use define, but not via a proper concatenation script that
	// understands anonymous AMD modules. A named AMD is safest and most robust
	// way to register. Lowercase jquery is used because AMD module names are
	// derived from file names, and jQuery is normally delivered in a lowercase
	// file name. Do this after creating the global so that if an AMD module wants
	// to call noConflict to hide this version of jQuery, it will work.
	if ( typeof define === "function" && define.amd ) {
		define( "jquery", [], function () { return jQuery; } );
	}
}

// If there is a window object, that at least has a document property,
// define jQuery and $ identifiers
if ( typeof window === "object" && typeof window.document === "object" ) {
	window.jQuery = window.$ = jQuery;
}

})( window );

/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/can',[],function(){
	var can = window.can || {};
	if(typeof GLOBALCAN === 'undefined' || GLOBALCAN !== false) {
		window.can = can;
	}

	can.isDeferred = function( obj ) {
		var isFunction = this.isFunction;
		// Returns `true` if something looks like a deferred.
		return obj && isFunction(obj.then) && isFunction(obj.pipe);
	};
	
	var cid = 0;
	can.cid = function(object, name){
		if(object._cid){
			return object._cid
		} else{
			return object._cid = (name ||"" ) + (++cid)
		}
	}
	can.VERSION = '2.0.4';
	
	can.simpleExtend = function(d, s){
		for(var prop in s){
			d[prop] = s[prop]
		}
		return d;
	}
	
	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/array/each',["can/util/can"], function (can) {
	can.each = function (elements, callback, context) {
		var i = 0, key;
		if (elements) {
			if (typeof elements.length === 'number' && elements.pop) {
				if ( elements.attr ) {
					elements.attr('length');
				}
				for (key = elements.length; i < key; i++) {
					if (callback.call(context || elements[i], elements[i], i, elements) === false) {
						break;
					}
				}
			} 
			else if(elements.hasOwnProperty) {
				if(can.Map && elements instanceof can.Map) {
					can.__reading && can.__reading(elements, '__keys');
					elements = elements.__get()
				}
				
				
				for (key in elements) {
					if(elements.hasOwnProperty(key)) {
						if (callback.call(context || elements[key], elements[key], key, elements) === false) {
							break;
						}
					}
				}
			}
		}
		return elements;
	};

	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/inserted',["can/util/can"], function (can) {
	// Given a list of elements, check if they are in the dom, if they 
	// are in the dom, trigger inserted on them.
	can.inserted = function(elems){
		// prevent mutations from changing the looping
		elems = can.makeArray(elems);
		var inDocument = false,
			checked = false,
			children;
		for ( var i = 0, elem; (elem = elems[i]) !== undefined; i++ ) {
			if( !inDocument ) {
				if( elem.getElementsByTagName ){
					if( can.has( can.$(document) , elem ).length ) {
						inDocument = true;
					} else {
						return;
					}
				} else {
					continue;
				}
			}
			
			if(inDocument && elem.getElementsByTagName){
				children = can.makeArray( elem.getElementsByTagName("*") );
				can.trigger(elem,"inserted",[],false);
				for ( var j = 0, child; (child = children[j]) !== undefined; j++ ) {
					// Trigger the destroyed event
					can.trigger(child,"inserted",[],false);
				}
			}
		}
	}
	
	
	can.appendChild = function(el, child){
		if(child.nodeType === 11){
			var children = can.makeArray(child.childNodes);
		} else {
			var children = [child]
		}
		el.appendChild(child);
		can.inserted(children)
	}
	can.insertBefore = function(el, child, ref){
		if(child.nodeType === 11){
			var children = can.makeArray(child.childNodes);
		} else {
			var children = [child];
		}
		el.insertBefore(child, ref);
		can.inserted(children)
	}
	
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/event',["can/util/can"], function(can){



	// event.js
	// ---------
	// _Basic event wrapper._
can.addEvent = function( event, fn ) {
	var allEvents = this.__bindEvents || (this.__bindEvents = {}),
		eventList = allEvents[event] || (allEvents[event] = []);
	
	eventList.push({
		handler: fn,
		name: event
	});
	return this;
};

// can.listenTo works without knowing how bind works
// the API was heavily influenced by BackboneJS: 
// http://backbonejs.org/
can.listenTo = function(other, event, handler){
	
	
	var idedEvents = this.__listenToEvents;
	if(!idedEvents){
		idedEvents = this.__listenToEvents = {};
	}
	var otherId = can.cid(other);
	var othersEvents = idedEvents[otherId];
	if(!othersEvents){
		othersEvents = idedEvents[otherId] = {
			obj: other,
			events: {}
		};
	}
	var eventsEvents = othersEvents.events[event]
	if(!eventsEvents){
		eventsEvents = othersEvents.events[event] = []
	}
	eventsEvents.push(handler);
	can.bind.call(other, event, handler);
}

can.stopListening = function(other, event, handler){
	var idedEvents = this.__listenToEvents,
		iterIdedEvents = idedEvents,
		i = 0;
	if(!idedEvents) {
		return this;
	}
	if( other ) {
		var othercid = can.cid(other);
		(iterIdedEvents = {})[othercid] = idedEvents[othercid];
		// you might be trying to listen to something that is not there
		if(!idedEvents[othercid]){
			return this;
		}
	}
	
	
	for(var cid in iterIdedEvents) {
		var othersEvents = iterIdedEvents[cid],
			eventsEvents;
		other = idedEvents[cid].obj;
		if( ! event ) {
			eventsEvents = othersEvents.events;
		} else {
			(eventsEvents = {})[event] = othersEvents.events[event]
		}
		for(var eventName in eventsEvents) {
			var handlers = eventsEvents[eventName] || [];
			i = 0;
			while(i < handlers.length){
				if( (handler && handler === handlers[i]) || (! handler ) ) {
					can.unbind.call(other, eventName, handlers[i])
					handlers.splice(i, 1);
					
				} else {
					i++;
				}
			}
			// no more handlers?
			if( !handlers.length ){
				delete othersEvents.events[eventName]
			}
		}
		if( can.isEmptyObject(othersEvents.events )){
			delete idedEvents[cid]
		}
	}
	return this;
}

can.removeEvent = function(event, fn){
	if(!this.__bindEvents){
		return this;
	}
	
	var events = this.__bindEvents[event] || [],
		i =0,
		ev,
		isFunction = typeof fn == 'function';
		
	while(i < events.length){
		ev = events[i]
		if( (isFunction && ev.handler === fn) || (!isFunction && ev.cid === fn ) ) {
			events.splice(i, 1);
		} else {
			i++;
		}
	}	
	
	
	return this;
};

can.dispatch = function(event, args){
	if(!this.__bindEvents){
		return;
	}
	if(typeof event == "string"){
		event = {type: event}
	}
	var eventName = event.type,
		handlers = (this.__bindEvents[eventName] || []).slice(0),
		args = [event].concat(args||[]),
		ev;
	
	for(var i =0, len = handlers.length; i < len; i++) {	
		ev = handlers[i];
		ev.handler.apply(this, args);
	}
}

return can;

});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/jquery',["jquery", "can/util/can", "can/util/array/each", "can/util/inserted", "can/util/event"], function($, can) {
	var isBindableElement = function(node){
		//console.log((node.nodeName && (node.nodeType == 1 || node.nodeType == 9) || node === window))
		return (node.nodeName && (node.nodeType == 1 || node.nodeType == 9) || node == window);
	};

	// _jQuery node list._
	$.extend( can, $, {
		trigger: function( obj, event, args ) {
			if(obj.nodeName || obj === window) {
				$.event.trigger( event, args, obj, true );
			} else if ( obj.trigger ) {
				obj.trigger( event, args );
			} else {
				if(typeof event === 'string'){
					event = {type: event}
				}
				event.target = event.target || obj;
				can.dispatch.call(obj, event, args);
			}
		},
		addEvent: can.addEvent,
		removeEvent: can.removeEvent,
		// jquery caches fragments, we always needs a new one
		buildFragment : function(elems, context){
			var oldFragment = $.buildFragment,
				ret;

			elems = [elems];
			// Set context per 1.8 logic
			context = context || document;
			context = !context.nodeType && context[0] || context;
			context = context.ownerDocument || context;

			ret = oldFragment.call( jQuery, elems, context);

			return ret.cacheable ? $.clone(ret.fragment) : ret.fragment || ret;
		},
		$: $,
		each: can.each,
		bind: function( ev, cb){
			// If we can bind to it...
			if(this.bind && this.bind !== can.bind){
				this.bind(ev, cb)
			} else if(isBindableElement(this)) {
				$.event.add(this, ev, cb);
			} else {
				// Make it bind-able...
				can.addEvent.call(this, ev, cb)
			}
			return this;
		},
		unbind: function(ev, cb){
			// If we can bind to it...
			if(this.unbind && this.unbind !== can.unbind){
				this.unbind(ev, cb)
			} else if(isBindableElement(this)) {
				$.event.remove(this, ev, cb);
			} else {
				// Make it bind-able...
				can.removeEvent.call(this, ev, cb)
			}
			return this;
		},
		delegate: function(selector, ev , cb){
			if(this.delegate) {
				this.delegate(selector, ev , cb)
			}
			 else if(isBindableElement(this)) {
				$(this).delegate(selector, ev, cb)
			} else {
				// make it bind-able ...
			}
			return this;
		},
		undelegate: function(selector, ev , cb){
			if(this.undelegate) {
				this.undelegate(selector, ev , cb)
			}
			 else if(isBindableElement(this)) {
				$(this).undelegate(selector, ev, cb)
			} else {
				// make it bind-able ...
	
			}
			return this;
		},
		proxy: function(fn, context){
			return function(){
				return fn.apply(context, arguments)
			}
		}
	});

	// Wrap binding functions.
	/*$.each(['bind','unbind','undelegate','delegate'],function(i,func){
		can[func] = function(){
			var t = this[func] ? this : $([this]);
			t[func].apply(t, arguments);
			return this;
		};
	});*/

	// Aliases
	can.on = can.bind;
	can.off = can.unbind;

	// Wrap modifier functions.
	$.each(["append","filter","addClass","remove","data","get","has"], function(i,name){
		can[name] = function(wrapped){
			return wrapped[name].apply(wrapped, can.makeArray(arguments).slice(1));
		};
	});

	// Memory safe destruction.
	var oldClean = $.cleanData;

	$.cleanData = function( elems ) {
		$.each( elems, function( i, elem ) {
			if ( elem ) {
				can.trigger(elem,"removed",[],false);
			}
		});
		oldClean(elems);
	};
	
	var oldDomManip = $.fn.domManip,
		cbIndex;
	
	// feature detect which domManip we are using
	$.fn.domManip = function(args, cb1, cb2){
		for(var i = 1; i< arguments.length; i++){
			if(typeof arguments[i] === "function"){
				cbIndex = i;
				break;
			}
		}
		return oldDomManip.apply(this, arguments)
	}
	$(document.createElement("div")).append(document.createElement("div"))
	
	$.fn.domManip = (cbIndex == 2 ? 
		function(args, table, callback){
			return oldDomManip.call(this,args,table, function(elem){
				if(elem.nodeType === 11){
					var elems = can.makeArray(elem.childNodes);
				}
				var ret = callback.apply(this, arguments);
				can.inserted(elems ? elems : [elem]);
				return ret;
			})
		} :
		function(args, callback){
			return oldDomManip.call(this,args,function(elem){
				if(elem.nodeType === 11){
					var elems = can.makeArray(elem.childNodes);
				}
				var ret = callback.apply(this, arguments);
				can.inserted(elems ? elems : [elem]);
				return ret;
			})
		})


	$.event.special.inserted = {};
	$.event.special.removed = {};

	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/library',["can/util/jquery"], function(can) {
	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/bind',["can/util/library"], function(can){
	
	/**
	 * @typedef {{bind:function():*,unbind:function():*}} can/util/bind
	 * 
	 * Provides mixin-able bind and unbind methods. `bind()` calls `this._bindsetup`
	 * when the first bind happens and.  `unbind()` calls `this._bindteardown` when there
	 * are no more event handlers.
	 * 
	 */
	// ## Bind helpers
	can.bindAndSetup = function() {
		// Add the event to this object
		can.addEvent.apply(this, arguments);
		// If not initializing, and the first binding
		// call bindsetup if the function exists.
		if(!this._init){
			if(!this._bindings ){
				this._bindings = 1;
				// setup live-binding
				this._bindsetup && this._bindsetup();
				
			} else {
				this._bindings++;
			}
			
		}
		
		return this;
	};

	can.unbindAndTeardown = function(ev, handler) {
		// Remove the event handler
		can.removeEvent.apply(this, arguments);

		if(this._bindings == null) {
			this._bindings = 0;
		} else {
			this._bindings--;
		}
		// If there are no longer any bindings and
		// there is a bindteardown method, call it.
		if(!this._bindings){
			this._bindteardown && this._bindteardown();
		}
		return this;
	}

	return can;

});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/string',["can/util/library"], function (can) {
	// ##string.js
	// _Miscellaneous string utility functions._  

	// Several of the methods in this plugin use code adapated from Prototype
	// Prototype JavaScript framework, version 1.6.0.1.
	// © 2005-2007 Sam Stephenson
	var strUndHash = /_|-/,
		strColons = /\=\=/,
		strWords = /([A-Z]+)([A-Z][a-z])/g,
		strLowUp = /([a-z\d])([A-Z])/g,
		strDash = /([a-z\d])([A-Z])/g,
		strReplacer = /\{([^\}]+)\}/g,
		strQuote = /"/g,
		strSingleQuote = /'/g,
		strHyphenMatch = /-+(.)?/g,
		strCamelMatch = /[a-z][A-Z]/g,
	// Returns the `prop` property from `obj`.
	// If `add` is true and `prop` doesn't exist in `obj`, create it as an
	// empty object.
		getNext = function (obj, prop, add) {
			var result = obj[prop];

			if (result === undefined && add === true) { result = obj[prop] = {} }
			return result
		},

	// Returns `true` if the object can have properties (no `null`s).
		isContainer = function (current) {
			return (/^f|^o/).test(typeof current);
		},
		convertBadValues = function(content) {
			// Convert bad values into empty strings
			var isInvalid = content === null || content === undefined || (isNaN(content) && ("" + content === 'NaN'));
			return ( "" + ( isInvalid ? '' : content ) )
		};

	can.extend(can, {
		// Escapes strings for HTML.
		esc: function (content) {
			return convertBadValues(content)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(strQuote, '&#34;')
				.replace(strSingleQuote, "&#39;");
		},

		getObject: function (name, roots, add) {

			// The parts of the name we are looking up
			// `['App','Models','Recipe']`
			var parts = name ? name.split('.') : [],
				length = parts.length,
				current,
				r = 0,
				i, container, rootsLength;

			// Make sure roots is an `array`.
			roots = can.isArray(roots) ? roots : [roots || window];

			rootsLength = roots.length

			if (!length) {
				return roots[0];
			}

			// For each root, mark it as current.
			for (r; r < rootsLength; r++) {
				current = roots[r];
				container = undefined;

				// Walk current to the 2nd to last object or until there
				// is not a container.
				for (i = 0; i < length && isContainer(current); i++) {
					container = current;
					current = getNext(container, parts[i]);
				}

				// If we found property break cycle
				if (container !== undefined && current !== undefined) {
					break
				}
			}

			// Remove property from found container
			if (add === false && current !== undefined) {
				delete container[parts[i - 1]]
			}

			// When adding property add it to the first root
			if (add === true && current === undefined) {
				current = roots[0]

				for (i = 0; i < length && isContainer(current); i++) {
					current = getNext(current, parts[i], true);
				}
			}

			return current;
		},
		// Capitalizes a string.
		/**
		 * @function can.capitalize
		 * @parent can.util
		 * @description Capitalize the first letter of a string.
		 * @signature `can.capitalize(str)`
		 * @param {String} str The string to capitalize.
		 * @return {String} The string with the first letter capitalized.
		 *
		 *        can.capitalize('candy is fun!'); //-> Returns: 'Candy is fun!'
		 *
		 */
		capitalize: function (s, cache) {
			// Used to make newId.
			return s.charAt(0).toUpperCase() + s.slice(1);
		},

		/**
		 * @function can.camelize
		 * @parent can.util
		 * @description Takes a hyphenated string and converts it to a camelCase string..
		 * @signature `can.camelize(str)`
		 * @param {String} str The string to camelCase.
		 * @return {String} The camelCased string.
		 *
		 *        can.camelize('array-count'); //-> 'arrayCount'
		 *
		 */
		camelize: function(str){ 
			return convertBadValues(str).replace(strHyphenMatch, function(match, chr){ 
				return chr ? chr.toUpperCase() : '' 
			}) 
		},

		/**
		 * @function can.hyphenate
		 * @parent can.util
		 * @description Hypenates a camelCase string, and makes it lower case.
		 * @signature `can.capitalize(str)`
		 * @param {String} str The camelCase string to hyphenate.
		 * @return {String} The hyphenated string.
		 *
		 *        can.hyphenate('fooBarBaz'); //-> 'foo-bar-baz'
		 *
		 */
		hyphenate: function(str) {
			return convertBadValues(str).replace(strCamelMatch, function(str, offset) {
				return str.charAt(0) + '-' + str.charAt(1).toLowerCase();
			});
		},

		// Underscores a string.
		underscore: function (s) {
			return s
				.replace(strColons, '/')
				.replace(strWords, '$1_$2')
				.replace(strLowUp, '$1_$2')
				.replace(strDash, '_')
				.toLowerCase();
		},
		// Micro-templating.
		/**
		 */
		sub: function (str, data, remove) {
			var obs = [];

			str = str || '';

			obs.push(str.replace(strReplacer, function (whole, inside) {

				// Convert inside to type.
				var ob = can.getObject(inside, data, remove === true ? false : undefined);

				if (ob === undefined || ob === null) {
					obs = null;
					return "";
				}

				// If a container, push into objs (which will return objects found).
				if (isContainer(ob) && obs) {
					obs.push(ob);
					return "";
				}

				return "" + ob;
			}));

			return obs === null ? obs : (obs.length <= 1 ? obs[0] : obs);
		},

		// These regex's are used throughout the rest of can, so let's make
		// them available.
		replacer: strReplacer,
		undHash: strUndHash
	});
	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/construct',["can/util/string"], function(can) {

	// ## construct.js
	// `can.Construct`  
	// _This is a modified version of
	// [John Resig's class](http://ejohn.org/blog/simple-javascript-inheritance/).  
	// It provides class level inheritance and callbacks._
	
	// A private flag used to initialize a new class instance without
	// initializing it's bindings.
	var initializing = 0;

	/** 
	 * @add can.Construct
	 */
	can.Construct = function() {
		if (arguments.length) {
			return can.Construct.extend.apply(can.Construct, arguments);
		}
	};

	/**
	 * @static
	 */
	can.extend(can.Construct, {
		/**
		 * @property {Boolean} can.Construct.constructorExtends constructorExtends
		 * @parent can.Construct.static
		 * 
		 * @description
		 * 
		 * Toggles the behavior of a constructor function called
		 * without `new` to extend the constructor function or
		 * create a new instance.
		 * 
		 * @body
		 * 
		 * If `constructorExtends` is:
		 * 
		 *  - `true` - the constructor extends
		 *  - `false` - a new instance of the constructor is created
		 * 
		 * For 1.1, `constructorExtends` defaults to true. For
		 * 1.2, `constructorExtends` will default to false.
		 */
		constructorExtends: true,
		/**
		 * @function can.Construct.newInstance newInstance
		 * @parent can.Construct.static
		 * 
		 * @description Returns an instance of `can.Construct`. This method
		 * can be overridden to return a cached instance.
		 * 
		 * @signature `can.Construct.newInstance([...args])`
		 * 
		 * @param {*} [args] arguments that get passed to [can.Construct::setup] and [can.Construct::init]. Note
		 * that if [can.Construct::setup] returns an array, those arguments will be passed to [can.Construct::init]
		 * instead.
		 * @return {class} instance of the class
		 *
		 * @body
		 * Creates a new instance of the constructor function. This method is useful for creating new instances
		 * with arbitrary parameters. Typically, however, you will simply want to call the constructor with the
		 * __new__ operator.
		 * 
		 * ## Example
		 * 
		 * The following creates a `Person` Construct and then creates a new instance of Person,
		 * using `apply` on newInstance to pass arbitrary parameters.
		 * 
		 * @codestart
		 * var Person = can.Construct.extend({
		 *   init : function(first, middle, last) {
		 *     this.first = first;
		 *     this.middle = middle;
		 *     this.last = last;
		 *   }
		 * });
		 * 
		 * var args = ["Justin","Barry","Meyer"],
		 *     justin = new Person.newInstance.apply(null, args);
		 * @codeend
		 */
		newInstance: function() {
			// Get a raw instance object (`init` is not called).
			var inst = this.instance(),
				arg = arguments,
				args;
				
			// Call `setup` if there is a `setup`
			if ( inst.setup ) {
				args = inst.setup.apply(inst, arguments);
			}

			// Call `init` if there is an `init`  
			// If `setup` returned `args`, use those as the arguments
			if ( inst.init ) {
				inst.init.apply(inst, args || arguments);
			}

			return inst;
		},
		// Overwrites an object with methods. Used in the `super` plugin.
		// `newProps` - New properties to add.  
		// `oldProps` - Where the old properties might be (used with `super`).  
		// `addTo` - What we are adding to.
		_inherit: function( newProps, oldProps, addTo ) {
			can.extend(addTo || newProps, newProps || {})
		},
		// used for overwriting a single property.
		// this should be used for patching other objects
		// the super plugin overwrites this
		_overwrite : function(what, oldProps, propName, val){
			what[propName] = val;
		},
		// Set `defaults` as the merger of the parent `defaults` and this 
		// object's `defaults`. If you overwrite this method, make sure to
		// include option merging logic.
		/**
		 * @function can.Construct.setup setup
		 * @parent can.Construct.static
		 * 
		 * @description Perform initialization logic for a constructor function.
		 * 
		 * @signature `can.Construct.setup(base, fullName, staticProps, protoProps)`
		 * 
		 * A static `setup` method provides inheritable setup functionality
		 * for a Constructor function. The following example
		 * creates a Group constructor function.  Any constructor
		 * functions that inherit from Group will be added to 
		 * `Group.childGroups`.
		 * 
		 * 
		 *     Group = can.Construct.extend({
		 *       setup: function(Construct, fullName, staticProps, protoProps){
		 *         this.childGroups = [];
		 *         if(Construct !== can.Construct){
		 *           this.childGroups(Construct)
		 *         }
		 *         Construct.setup.apply(this, arguments)
		 *       }   
		 *     },{})
		 *     var Flock = Group.extend(...)
		 *     Group.childGroups[0] //-> Flock
		 * 
		 * @param {constructor} base The base constructor that is being inherited from.
		 * @param {String} fullName The name of the new constructor.
		 * @param {Object} staticProps The static properties of the new constructor.
		 * @param {Object} protoProps The prototype properties of the new constructor.
		 *
		 * @body
		 * The static `setup` method is called immediately after a constructor 
		 * function is created and 
		 * set to inherit from its base constructor. It is useful for setting up 
		 * additional inheritance work.
		 * Do not confuse this with the prototype `[can.Construct::setup]` method.
		 * 
		 * ## Setup Extends Defaults
		 * 
		 * Setup deeply extends the static `defaults` property of the base constructor with 
		 * properties of the inheriting constructor.  For example:
		 * 
		 * @codestart
		 * Parent = can.Construct.extend({
		 *   defaults : {
		 *     parentProp: 'foo'
		 *   }
		 * },{})
		 * 
		 * Child = Parent.extend({
		 *   defaults : {
		 *     childProp : 'bar'
		 *   }
		 * },{}
		 *     
		 * Child.defaults // {parentProp: 'foo', 'childProp': 'bar'}
		 * @codeend
		 * 
		 * ## Example
		 * 
		 * This `Parent` class adds a reference to its base class to itself, and
		 * so do all the classes that inherit from it.
		 * 
		 * @codestart
		 * Parent = can.Construct.extend({
		 *   setup : function(base, fullName, staticProps, protoProps){
		 *     this.base = base;
		 * 
		 *     // call base functionality
		 *     can.Construct.setup.apply(this, arguments)
		 *   }
		 * },{});
		 * 
		 * Parent.base; // can.Construct
		 *     
		 * Child = Parent({});
		 * 
		 * Child.base; // Parent
		 * @codeend
		 */
		setup: function( base, fullName ) {
			this.defaults = can.extend(true,{}, base.defaults, this.defaults);
		},
		// Create's a new `class` instance without initializing by setting the
		// `initializing` flag.
		instance: function() {

			// Prevents running `init`.
			initializing = 1;

			var inst = new this();

			// Allow running `init`.
			initializing = 0;

			return inst;
		},
		// Extends classes.
		/**
		 * @function can.Construct.extend extend
		 * @parent can.Construct.static
		 * 
		 * @signature `can.Construct.extend([name,] [staticProperties,] instanceProperties)`
		 * 
		 * Extends `can.Construct`, or constructor functions derived from `can.Construct`, 
		 * to create a new constructor function. Example:
		 * 
		 *     Animal = can.Construct.extend({
		 *       sayHi: function(){
		 *         console.log("hi")
		 *       }
		 *     })
		 *     var animal = new Animal()
		 *     animal.sayHi();
		 * 
		 * @param {String} [name] Creates the necessary properties and 
		 * objects that point from the `window` to the created constructor function. The following:
		 * 
		 *     can.Construct.extend("company.project.Constructor",{})
		 *     
		 * creates a `company` object on window if it does not find one, a 
		 * `project` object on `company` if it does not find one, and it will set the
		 * `Constructor` property on the `project` object to point to the constructor function.
		 * 
		 * Finally, it sets "company.project.Constructor" as [can.Construct.fullName fullName]
		 * and "Constructor" as [can.Construct.shortName shortName].
		 * 
		 * @param {Object} [staticProperties] Properties that are added the constructor 
		 * function directly. For example:
		 * 
		 *     Animal = can.Construct.extend({
		 *       findAll: function(){
		 *         return can.ajax({url: "/animals"})
		 *       }
		 *     },{});
		 *     
		 *     Animal.findAll().then(function(json){ ... })
		 * 
		 * The [can.Construct.setup static setup] method can be used to 
		 * specify inheritable behavior when a Constructor function is created.
		 * 
		 * @param {Object} instanceProperties Properties that belong to 
		 * instances made with the constructor. These properties are added to the
		 * constructor's `prototype` object. Example:
		 * 
		 *     Animal = can.Construct.extend({
		 *       init: function(name){
		 *         this.name = name;
		 *       },
		 *       sayHi: function(){
		 *         console.log(this.name,"says hi")
		 *       }
		 *     })
		 *     var animal = new Animal()
		 *     animal.sayHi();
		 * 
		 * The [can.Construct::init init] and [can.Construct::setup setup] properties
		 * are used for initialization.
		 * 
		 * @return {function} The constructor function.
		 * 
		 */
		extend: function( fullName, klass, proto ) {
			// Figure out what was passed and normalize it.
			if ( typeof fullName != 'string' ) {
				proto = klass;
				klass = fullName;
				fullName = null;
			}

			if ( ! proto ) {
				proto = klass;
				klass = null;
			}
			proto = proto || {};

			var _super_class = this,
				_super = this.prototype,
				name, shortName, namespace, prototype;

			// Instantiate a base class (but only create the instance,
			// don't run the init constructor).
			prototype = this.instance();
			
			// Copy the properties over onto the new prototype.
			can.Construct._inherit(proto, _super, prototype);

			// The dummy class constructor.
			function Constructor() {
				// All construction is actually done in the init method.
				if ( ! initializing ) {
					return this.constructor !== Constructor && arguments.length && Constructor.constructorExtends?
						// We are being called without `new` or we are extending.
						arguments.callee.extend.apply(arguments.callee, arguments) :
						// We are being called with `new`.
						Constructor.newInstance.apply(Constructor, arguments);
				}
			}

			// Copy old stuff onto class (can probably be merged w/ inherit)
			for ( name in _super_class ) {
				if ( _super_class.hasOwnProperty(name) ) {
					Constructor[name] = _super_class[name];
				}
			}

			// Copy new static properties on class.
			can.Construct._inherit(klass, _super_class, Constructor);

			// Setup namespaces.
			if ( fullName ) {

				var parts = fullName.split('.'),
					shortName = parts.pop(),
					current = can.getObject(parts.join('.'), window, true),
					namespace = current,
					_fullName = can.underscore(fullName.replace(/\./g, "_")),
					_shortName = can.underscore(shortName);

			
				
				current[shortName] = Constructor;
			}

			// Set things that shouldn't be overwritten.
			can.extend(Constructor, {
				constructor: Constructor,
				prototype: prototype,
				/**
				 * @property {String} can.Construct.namespace namespace
				 * @parent can.Construct.static
				 *
				 * The `namespace` property returns the namespace your constructor is in.
				 * This provides a way organize code and ensure globally unique types. The
				 * `namespace` is the [can.Construct.fullName fullName] you passed without the [can.Construct.shortName shortName].
				 * 
				 * @codestart
				 * can.Construct("MyApplication.MyConstructor",{},{});
				 * MyApplication.MyConstructor.namespace // "MyApplication"
				 * MyApplication.MyConstructor.shortName // "MyConstructor"
				 * MyApplication.MyConstructor.fullName  // "MyApplication.MyConstructor"
				 * @codeend
				 */
				namespace: namespace,
				/**
				 * @property {String} can.Construct.shortName shortName
				 * @parent can.Construct.static
				 *
				 * If you pass a name when creating a Construct, the `shortName` property will be set to the
				 * name you passed without the [can.Construct.namespace namespace].
				 * 
				 * @codestart
				 * can.Construct("MyApplication.MyConstructor",{},{});
				 * MyApplication.MyConstructor.namespace // "MyApplication"
				 * MyApplication.MyConstructor.shortName // "MyConstructor"
				 * MyApplication.MyConstructor.fullName  // "MyApplication.MyConstructor"
				 * @codeend
				 */
				_shortName : _shortName,
				/**
				 * @property {String} can.Construct.fullName fullName
				 * @parent can.Construct.static
				 *
				 * If you pass a name when creating a Construct, the `fullName` property will be set to
				 * the name you passed. The `fullName` consists of the [can.Construct.namespace namespace] and 
				 * the [can.Construct.shortName shortName].
				 * 
				 * @codestart
				 * can.Construct("MyApplication.MyConstructor",{},{});
				 * MyApplication.MyConstructor.namespace // "MyApplication"
				 * MyApplication.MyConstructor.shortName // "MyConstructor"
				 * MyApplication.MyConstructor.fullName  // "MyApplication.MyConstructor"
				 * @codeend
				 */
				fullName: fullName,
				_fullName: _fullName
			});

			// Dojo and YUI extend undefined
			if(shortName !== undefined) {
				Constructor.shortName = shortName;
			}

			// Make sure our prototype looks nice.
			Constructor.prototype.constructor = Constructor;

			
			// Call the class `setup` and `init`
			var t = [_super_class].concat(can.makeArray(arguments)),
				args = Constructor.setup.apply(Constructor, t );
			
			if ( Constructor.init ) {
				Constructor.init.apply(Constructor, args || t );
			}

			/**
			 * @prototype
			 */
			return Constructor;

			
			
			//  
			/**
			 * @property {Object} can.Construct.prototype.constructor constructor
			 * @parent can.Construct.prototype
			 *
			 * A reference to the constructor function that created the instance. This allows you to access
			 * the constructor's static properties from an instance.
			 * 
			 * ## Example
			 * 
			 * This can.Construct has a static counter that counts how many instances have been created:
			 *
			 * @codestart
			 * can.Construct.extend("Counter", {
			 *     count: 0
			 * }, {
			 *     init: function() {
			 *         this.constructor.count++;
			 *     }
			 * });
			 * 
			 * new Counter();
			 * Counter.count; // 1
			 * @codeend 
			 */
		}

	});
	/** 
	 * @function can.Construct.prototype.setup setup
	 * @parent can.Construct.prototype
	 * 
	 * @signature `construct.setup(...args)`
	 * 
	 * A setup function for the instantiation of a constructor function.
	 * 
	 * @param {*} args The arguments passed to the constructor.
	 * 
	 * @return {Array|undefined} If an array is returned, the array's items are passed as
	 * arguments to [can.Construct::init init]. The following example always makes 
	 * sure that init is called with a jQuery wrapped element:
	 * 
	 *     WidgetFactory = can.Construct.extend({
	 *         setup: function(element){
	 *             return [$(element)]
	 *         }
	 *     })
	 *     
	 *     MyWidget = WidgetFactory.extend({
	 *         init: function($el){
	 *             $el.html("My Widget!!")
	 *         }
	 *     })
	 * 
	 * Otherwise, the arguments to the
	 * constructor are passed to [can.Construct::init] and the return value of `setup` is discarded.
	 * 
	 * @body
	 * 
	 * ## Deciding between `setup` and `init`
	 * 
	 * 
	 * Usually, you should use [can.Construct::init init] to do your constructor function's initialization.
	 * Use `setup` instead for:
	 * 
	 *   - initialization code that you want to run before the inheriting constructor's 
	 *     `init` method is called.
	 *   - initialization code that should run whether or not inheriting constructors
	 *     call their base's `init` methods.
	 *   - modifying the arguments that will get passed to `init`.
	 * 
	 * ## Example
	 * 
	 * This code is a simplified version of the code in [can.Control]'s setup
	 * method. It converts the first argument to a jQuery collection and
	 * extends the controller's defaults with the options that were passed.
	 * 
	 * 
	 *     can.Control = can.Construct.extend({
	 *         setup: function(domElement, rawOptions) {
	 *             // set up this.element
	 *             this.element = $(domElement);
	 *         
	 *             // set up this.options
	 *             this.options = can.extend({},
	 *                                   this.constructor.defaults,
	 *                                   rawOptions
	 *                                  );
	 * 
	 *             // pass this.element and this.options to init.
	 *             return [this.element, this.options];        
	 *         }
	 *     });
	 * 
	 */
	can.Construct.prototype.setup = function(){};
	/** 
	 * @function can.Construct.prototype.init init
	 * @parent can.Construct.prototype
	 * 
	 * @description Called when a new instance of a can.Construct is created.
	 * 
	 * @signature `construct.init(...args)`
	 * @param {*} args the arguments passed to the constructor (or the items of the array returned from [can.Construct::setup])
	 * 
	 * @body
	 * If a prototype `init` method is provided, it is called when a new Construct is created,
	 * after [can.Construct::setup]. The `init` method is where the bulk of your initialization code
	 * should go, and a common thing to do in `init` is to save the arguments passed into the constructor.
	 * 
	 * ## Examples
	 * 
	 * First, we'll make a Person constructor that has a first and last name:
	 *
	 * @codestart
	 * var Person = can.Construct.extend({
	 *     init: function(first, last) {
	 *         this.first = first;
	 *         this.last  = last;
	 *     }
	 * });
	 * 
	 * var justin = new Person("Justin", "Meyer");
	 * justin.first; // "Justin"
	 * justin.last; // "Meyer"
	 * @codeend
	 * 
	 * Then we'll extend Person into Programmer and add a favorite language:
	 * 
	 * @codestart
	 * var Programmer = Person.extend({
	 *     init: function(first, last, language) {
	 *         // call base's init
	 *         Person.prototype.init.apply(this, arguments);
	 *
	 *         // other initialization code
	 *         this.language = language;
	 *     },
	 *     bio: function() {
	 *         return "Hi! I'm "" + this.first + " " + this.last +
	 *             " and I write " + this.language + ".";
	 *     }
	 * });
	 * 
	 * var brian = new Programmer("Brian", "Moschel", 'ECMAScript');
	 * brian.bio(); // "Hi! I'm Brian Moschel and I write ECMAScript.";
	 * @codeend
	 * 
	 * ## Modified Arguments
	 * 
	 * [can.Construct::setup] is able to modify the arguments passed to `init`.
	 * If you aren't receiving the exact arguments as those passed to `new Construct(args)`,
	 * check to make sure that they aren't being changed by `setup` somewhere along 
	 * the inheritance chain.
	 */
	can.Construct.prototype.init = function(){};

	
	return can.Construct;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/util/batch',["can/util/can"], function(can){
	
		// Which batch of events this is for -- might not want to send multiple
		// messages on the same batch.  This is mostly for event delegation.
	var	batchNum = 1,
		// how many times has start been called without a stop
		transactions = 0,
		// an array of events within a transaction
		batchEvents = [],
		stopCallbacks = [];
	
	
	can.batch = {
		/**
		 * @function can.batch.start
		 * @parent can.batch
		 * @description Begin an event batch.
		 * 
		 * @signature `can.batch.start([batchStopHandler])`
		 * 
		 * @param {Function} [batchStopHandler] a callback that gets called after all batched events have been called
		 *
		 * @body
		 * `can.batch.start` causes can.Map to begin an event batch. Until `[can.batch.stop]` is called, any
		 * events that would result from calls to `[can.Map::attr attr]` are held back from firing. If you have
		 * lots of changes to make to can.Maps, batching them together can help performance &emdash; especially if
		 * those can.Maps are live-bound to the DOM.
		 *
		 * In this example, you can see how the _first_ and _change_ events are not fired (and their handlers
		 * are not called) until `can.batch.stop` is called.
		 *
		 * @codestart
		 * var person = new can.Map({
		 *     first: 'Alexis',
		 *     last: 'Abril'
		 * });
		 *
		 * person.bind('first', function() {
		 *     console.log("First name changed."");
		 * }).bind('change', function() {
		 *     console.log("Something changed.");
		 * });
		 * 
		 * can.batch.start();
		 * person.attr('first', 'Alex');
		 * console.log('Still in the batch.');
		 * can.batch.stop();
		 * 
		 * // the log has:
		 * // Still in the batch.
		 * // First name changed.
		 * // Something changed.
		 * @codeend
		 *
		 * You can also pass a callback to `can.batch.start` which will be called after all the events have
		 * been fired:
		 * @codestart
		 * can.batch.start(function() {
		 *     console.log('The batch is over.');
		 * });
		 * person.attr('first', 'Izzy');
		 * console.log('Still in the batch.');
		 * can.batch.stop();
		 * 
		 * // The console has:
		 * // Still in the batch.
		 * // First name changed.
		 * // Something changed.
		 * // The batch is over.
		 * @codeend
		 *
		 * ## Calling `can.batch.start` multiple times
		 * 
		 * If you call `can.batch.start` more than once, `can.batch.stop` needs to be called
		 * the same number of times before any batched events will fire. For ways
		 * to circumvent this process, see [can.batch.stop].
		 *
		 * Here is an example that demonstrates how events are affected by calling
		 * `can.batch.start` multiple times.
		 * 
		 * @codestart
		 * var addPeople = function(observable) {
		 *     can.batch.start();
		 *     observable.attr('a', 'Alice');
		 *     observable.attr('b', 'Bob');
		 *     observable.attr('e', 'Eve');
		 *     can.batch.stop();
		 * };
		 *
		 * // In a completely different place:
		 * var list = new can.Map();
		 * list.bind('change', function() {
		 *     console.log('The list changed.');
		 * });
		 *
		 * can.batch.start();
		 * addPeople(list);
		 * console.log('Still in the batch.');
		 *
		 * // Here, the console has:
		 * // Still in the batch.
		 * 
		 * can.batch.stop();
		 * 
		 * // Here, the console has:
		 * // Still in the batch.
		 * // The list changed.
		 * // The list changed.
		 * // The list changed.
		 * @codeend
		 */
		start: function( batchStopHandler ) {
			transactions++;
			batchStopHandler && stopCallbacks.push(batchStopHandler);
		},
		/**
		 * @function can.batch.stop
		 * @parent can.batch
		 * @description End an event batch.
		 * @signature `can.batch.stop([force[, callStart]])`
		 * @param {bool} [force=false] whether to stop batching events immediately
		 * @param {bool} [callStart=false] whether to call `[can.batch.start can.batch.start]` after firing batched events
		 * 
		 * @body
		 * `can.batch.stop` matches an earlier `[can.batch.start]` call. If `can.batch.stop` has been
		 * called as many times as `can.batch.start` (or if _force_ is true), all batched events will be
		 * fired and any callbacks passed to `can.batch.start` since the beginning of the batch will be
		 * called. If _force and _callStart_ are both true, a new batch will be started when all
		 * the events and callbacks have been fired.
		 *
		 * See `[can.batch.start]` for examples of `can.batch.start` and `can.batch.stop` in normal use.
		 * 
		 * In this example, the batch is forceably ended in the `addPeople` function.
		 * @codestart
		 * var addPeople = function(observable) {
		 *     can.batch.start();
		 *     observable.attr('a', 'Alice');
		 *     observable.attr('b', 'Bob');
		 *     observable.attr('e', 'Eve');
		 *     can.batch.stop(true);
		 * };
		 *
		 * // In a completely different place:
		 * var list = new can.Map();
		 * list.bind('change', function() {
		 *     console.log('The list changed.');
		 * });
		 *
		 * can.batch.start();
		 * addPeople(list);
		 * console.log('Still in the batch.');
		 *
		 * // Here, the console has:
		 * // Still in the batch.
		 * 
		 * can.batch.stop();
		 * 
		 * // Here, the console has:
		 * // The list changed.
		 * // The list changed.
		 * // The list changed.
		 * // Still in the batch.
		 * @codeend
		 */
		stop: function(force, callStart){
			if(force){
				transactions = 0;
			} else {
				transactions--;
			}
			
			if(transactions == 0){
				var items = batchEvents.slice(0),
					callbacks = stopCallbacks.slice(0);
				batchEvents= [];
				stopCallbacks = [];
				batchNum++;
				callStart && can.batch.start();
				can.each(items, function( args ) {
					can.trigger.apply(can, args);
				});
				can.each(callbacks, function( cb ) {
					cb();
				});
			}
		},
		/**
		 * @function can.batch.trigger
		 * @parent can.batch
		 * @description Trigger an event to be added to the current batch.
		 * @signature `can.batch.trigger(item, event [, args])`
		 * @param {can.Map} item the target of the event
		 * @param {String|{type: String}} event the type of event, or an event object with a type given
		 * @param {Array} [args] the parameters to trigger the event with.
		 * 
		 * @body
		 * If events are currently being batched, calling `can.batch.trigger` adds an event
		 * to the batch. If events are not currently being batched, the event is triggered
		 * immediately.
		 */
		trigger: function( item, event, args ) {
			// Don't send events if initalizing.
			if ( ! item._init) {
				if (transactions == 0 ) {
					return can.trigger(item, event, args);
				} else {
					event = typeof event === "string" ?
						{ type: event } : 
						event;
					event.batchNum = batchNum;
					batchEvents.push([
					item,
					event, 
					args ] );
				}
			}
		}
	}
	
	
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/map',["can/util/library", "can/util/bind", "can/construct", "can/util/batch"], function(can, bind) {
	// ## map.js  
	// `can.Map`  
	// _Provides the observable pattern for JavaScript Objects._  
	//  
		// Removes all listeners.
	var	bindToChildAndBubbleToParent = function(child, prop, parent){
			can.listenTo.call(parent,child,"change", function( /* ev, attr */ ) {
				// `batchTrigger` the type on this...
				var args = can.makeArray(arguments),
					ev = args.shift();
					args[0] = (prop === "*" ? 
						[ parent.indexOf( child ), args[0]] :
						[ prop, args[0]] ).join(".");

				// track objects dispatched on this map		
				ev.triggeredNS = ev.triggeredNS || {};

				// if it has already been dispatched exit
				if (ev.triggeredNS[parent._cid]) {
					return;
				}

				ev.triggeredNS[parent._cid] = true;
				// send change event with modified attr to parent	
				can.trigger(parent, ev, args);
				// send modified attr event to parent
				//can.trigger(parent, args[0], args);
			});
		},
		// An `id` to track events for a given map.
		observeId = 0,
		attrParts = function(attr, keepKey) {
			if(keepKey) {
				return [attr];
			}
			return can.isArray(attr) ? attr : (""+attr).split(".");
		},
		makeBindSetup = function(wildcard){
			return function(){
				var parent = this;
				this._each(function(child, prop){
					if(child && child.bind){
						bindToChildAndBubbleToParent(child, wildcard || prop, parent)
					}
				})
			};
		},
		// A map that temporarily houses a reference 
		// to maps that have already been made for a plain ole JS object
		madeMap = null,
		teardownMap = function(){
			for(var cid in madeMap){
				if(madeMap[cid].added) {
					delete madeMap[cid].obj._cid;
				}
			}
			madeMap = null;
		},
		getMapFromObject = function(obj){
			return madeMap && madeMap[obj._cid] && madeMap[obj._cid].instance
		};
		
	/**
	 * @add can.Map
	 */
	//
	var Map = can.Map = can.Construct.extend( {
	/**
	 * @static
	 */
		setup: function(){

			can.Construct.setup.apply( this, arguments );
			
			
			if(can.Map){
				if(!this.defaults){
					this.defaults = {};
				}
				// a list of the compute properties
				this._computes = [];
				for(var prop in this.prototype){
					if(typeof this.prototype[prop] !== "function"){
						this.defaults[prop] = this.prototype[prop];
					} else if(this.prototype[prop].isComputed) {
						this._computes.push(prop)	
					}
				}
			}
			// if we inerit from can.Map, but not can.List
			if(can.List && !(this.prototype instanceof can.List) ){
				this.List = Map.List({ Map : this }, {});
			}
	
		},
		_computes: [],
		// keep so it can be overwritten
		bind: can.bindAndSetup,
		on: can.bindAndSetup,
		unbind: can.unbindAndTeardown,
		off: can.unbindAndTeardown,
		id: "id",
		helpers: {
			addToMap: function(obj, instance){
				var teardown;
				if(!madeMap){
					teardown = teardownMap;
					madeMap = {}
				}
				// record if it has a Cid before we add one
				var hasCid = obj._cid;
				var cid = can.cid(obj);
				
				// only update if there already isn't one
				if( !madeMap[cid] ){
				
					madeMap[cid] = {
						obj: obj,
						instance: instance,
						added: !hasCid
					}
				}
				return teardown;
			},
			
			canMakeObserve : function( obj ) {
				return obj && !can.isDeferred(obj) && (can.isArray(obj) || can.isPlainObject( obj ) || ( obj instanceof can.Map ));
			},
			unhookup: function(items, parent){
				return can.each(items, function(item){
					if(item && item.unbind){
						can.stopListening.call(parent, item,"change");
					}
				});
			},
			// Listens to changes on `child` and "bubbles" the event up.  
			// `child` - The object to listen for changes on.  
			// `prop` - The property name is at on.  
			// `parent` - The parent object of prop.
			// `ob` - (optional) The Map object constructor
			// `list` - (optional) The observable list constructor
			hookupBubble: function( child, prop, parent, Ob, List ) {
				Ob = Ob || Map;
				List = List || Map.List;
	
				// If it's an `array` make a list, otherwise a child.
				if (child instanceof Map){
					// We have an `map` already...
					// Make sure it is not listening to this already
					// It's only listening if it has bindings already.
					parent._bindings && Map.helpers.unhookup([child], parent);
				} else if ( can.isArray(child) ) {
					child = getMapFromObject(child) || new List(child);
				} else {
					child = getMapFromObject(child) || new Ob(child);
				}
				// only listen if something is listening to you
				if(parent._bindings){
					// Listen to all changes and `batchTrigger` upwards.
					bindToChildAndBubbleToParent(child, prop, parent)
				}
				
	
				return child;
			},
			// A helper used to serialize an `Map` or `Map.List`.  
			// `map` - The observable.  
			// `how` - To serialize with `attr` or `serialize`.  
			// `where` - To put properties, in an `{}` or `[]`.
			serialize: function( map, how, where ) {
				// Go through each property.
				map.each(function( val, name ) {
					// If the value is an `object`, and has an `attrs` or `serialize` function.
					where[name] = Map.helpers.canMakeObserve(val) && can.isFunction( val[how] ) ?
					// Call `attrs` or `serialize` to get the original data back.
					val[how]() :
					// Otherwise return the value.
					val;
				});
				return where;
			},
			makeBindSetup: makeBindSetup
		},
		
		// starts collecting events
		// takes a callback for after they are updated
		// how could you hook into after ejs
		/**
		 * @function can.Map.keys keys
		 * @parent can.Map.static
		 * @description Iterate over the keys of an Map.
		 * @signature `can.Map.keys(map)`
		 * @param {can.Map} map the `can.Map` to get the keys from
		 * @return {Array} array An array containing the keys from _map_.
		 * 
		 * @body
		 * `keys` iterates over an map to get an array of its keys.
		 * 
		 * @codestart
		 * var people = new can.Map({
		 *     a: 'Alice',
		 *     b: 'Bob',
		 *     e: 'Eve'
		 * });
		 * 
		 * can.Map.keys(people); // ['a', 'b', 'e']
		 * @codeend
		 */
		keys: function(map) {
			var keys = [];
			can.__reading && can.__reading(map, '__keys');
			for(var keyName in map._data) {
				keys.push(keyName);
			}
			return keys;
		}
	},
	/**
	 * @prototype
	 */
	{
		setup: function( obj ) {
			// `_data` is where we keep the properties.
			this._data = {}
			/**
			 * @property {String} can.Map.prototype._cid
			 * @hide
			 *
			 * A globally unique ID for this `can.Map` instance.
			 */
			// The namespace this `object` uses to listen to events.
			can.cid(this, ".map");
			// Sets all `attrs`.
			this._init = 1;
			this._setupComputes();
			var teardownMapping = obj && can.Map.helpers.addToMap(obj, this);
			/**
			 * @property {*} can.Map.prototype.DEFAULT-ATTR
			 * 
			 * @description Specify a default property and value.
			 * 
			 * @option {*} A value of any type other than a function that will
			 * be set as the `DEFAULT-ATTR` attribute's value.
			 * 
			 * @body
			 * 
			 * ## Use
			 * 
			 * When extending [can.Map], if a prototype property is not a function,
			 * it is used as a default value on instances of the extended Map.  For example:
			 * 
			 *     var Paginate = can.Map.extend({
			 *       limit: 20,
			 *       offset: 0,
			 *       next: function(){
			 *         this.attr("offset", this.attr("offset")+this.attr("limit"))
			 *       }  
			 *     });
			 * 
			 *     var paginate = new Paginate({limit: 30});
			 * 
			 *     paginate.attr("offset") //-> 0
			 *     paginate.attr("limit")  //-> 30
			 * 
			 *     paginate.next();
			 *     
			 *     paginate.attr("offset") //-> 30
			 */
			var data = can.extend( can.extend(true,{},this.constructor.defaults || {}), obj )
			this.attr(data);
			
			teardownMapping && teardownMapping()
			
			this.bind('change',can.proxy(this._changes,this));
			
			delete this._init;
		},
		/**
		 * @property {can.compute} can.Map.prototype.COMPUTE-ATTR
		 * 
		 * @description Specify an attribute that is computed from other attributes.
		 * 
		 * @option {can.compute} A compute that reads values on instances of the
		 * map and returns a derived value.  The compute may also be a getter-setter
		 * compute and able to be passed a value.
		 * 
		 * @body
		 * 
		 * ## Use
		 * 
		 * When extending [can.Map], if a prototype property is a [can.compute]
		 * it will setup that compute to behave like a normal attribute. This means
		 * that it can be read and written to with [can.Map::attr attr] and bound to
		 * with [can.Map::bind bind].  
		 * 
		 * The following example makes a `fullName` attribute on `Person` maps:
		 * 
		 *     var Person = can.Map.extend({
		 *       fullName: can.compute(function(){
		 *         return this.attr("first")+" "+this.attr("last")  
		 *       })
		 *     })
		 *     
		 *     var me = new Person({first: "Justin", last: "Meyer"})
		 * 
		 *     me.attr("fullName") //-> "Justin Meyer"
		 *     
		 *     me.bind("fullName", function(ev, newValue, oldValue){
		 *       newValue //-> Brian Moschel
		 *       oldValue //-> Justin Meyer
		 *     })
		 *     
		 *     me.attr({first: "Brian", last: "Moschel"})
		 * 
		 * ## Getter / Setter computes
		 * 
		 * A compute's setter will be called if [can.Map::attr attr] is
		 * used to set the compute-property's value.
		 * 
		 * The following makes `fullName` able to set `first` and `last`:
		 * 
		 *     var Person = can.Map.extend({
		 *       fullName: can.compute(function(newValue){
		 *         if( arguments.length ) {
		 *           var parts = newValue.split(" ");
		 *           this.attr({
		 *             first: parts[0],
		 *             last:  parts[1]
		 *           });
		 *            
		 *         } else {
		 *           return this.attr("first")+" "+this.attr("last");
		 *         }
		 *       })
		 *     })
		 *     
		 *     var me = new Person({first: "Justin", last: "Meyer"})
		 * 
		 *     me.attr("fullName", "Brian Moschel") 
		 *     me.attr("first") //-> "Brian"
		 *     me.attr("last")  //-> "Moschel"
		 * 
		 * 
		 * ## Alternatives
		 * 
		 * [can.Mustache] and [can.EJS] will automatically convert any function
		 * read in the template to a can.compute. So, simply having a fullName
		 * function like:
		 * 
		 *     var Person = can.Map.extend({
		 *       fullName: function(){
		 *         return this.attr("first")+" "+this.attr("last")  
		 *       }
		 *     })
		 *     var me = new Person({first: "Justin", last: "Meyer"})
		 * 
		 * Will already be live-bound if read in a template like:
		 * 
		 *     {{me.fullName}}
		 *     <%= me.attr("fullName") %>
		 * 
		 * The [can.Map.setter setter] plugin can also provide similar functionality as
		 * Getter/Setter computes.
		 */
		_setupComputes: function(){
			var computes = this.constructor._computes;
			this._computedBindings = {};
			for(var i = 0, len = computes.length, prop; i< len; i++) {
				prop = computes[i];
				this[prop] = this[prop].clone(this);
				this._computedBindings[prop] = {
					count: 0
				}
			}
		},
		_bindsetup: makeBindSetup(),
		_bindteardown: function(){
			var self = this;
			this._each(function(child){
				Map.helpers.unhookup([child], self)
			})
		},
		_changes: function(ev, attr, how,newVal, oldVal){
			can.batch.trigger(this, {type:attr, batchNum: ev.batchNum}, [newVal,oldVal]);
		},
		_triggerChange: function(attr, how,newVal, oldVal){
			can.batch.trigger(this,"change",can.makeArray(arguments))
		},
		// no live binding iterator
		_each: function(callback){
			var data = this.__get();
			for(var prop in data){
				if(data.hasOwnProperty(prop)){
					callback(data[prop],prop)
				}
			}
		},
		/**
		 * @function can.Map.prototype.attr attr
		 * @description Get or set properties on an Map.
		 * @signature `map.attr()`
		 * 
		 * Gets a collection of all the properties in this `can.Map`.
		 * 
		 * @return {Object<String, *>} an object with all the properties in this `can.Map`.
		 * 
		 * @signature `map.attr(key)`
		 * 
		 * Reads a property from this `can.Map`.
		 * 
		 * @param {String} key the property to read
		 * @return {*} the value assigned to _key_.
		 *
		 * @signature `map.attr(key, value)`
		 * 
		 * Assigns _value_ to a property on this `can.Map` called _key_.
		 * 
		 * @param {String} key the property to set
		 * @param {*} the value to assign to _key_.
		 * @return {can.Map} this Map, for chaining
		 * 
		 * @signature `map.attr(obj[, removeOthers])`
		 * 
		 * Assigns each value in _obj_ to a property on this `can.Map` named after the
		 * corresponding key in _obj_, effectively merging _obj_ into the Map.
		 * 
		 * @param {Object<String, *>} obj a collection of key-value pairs to set.
		 * If any properties already exist on the `can.Map`, they will be overwritten.
		 *
		 * @param {bool} [removeOthers=false] whether to remove keys not present in _obj_.
		 * To remove keys without setting other keys, use `[can.Map::removeAttr removeAttr]`.
		 *
		 * @return {can.Map} this Map, for chaining
		 * 
		 * @body
		 * `attr` gets or sets properties on the `can.Map` it's called on. Here's a tour through
		 * how all of its forms work:
		 *
		 * @codestart
		 * var people = new can.Map({});
		 * 
		 * // set a property:
		 * people.attr('a', 'Alex');
		 * 
		 * // get a property:
		 * people.attr('a'); // 'Alex'
		 *
		 * // set and merge multiple properties:
		 * people.attr({
		 *     a: 'Alice',
		 *     b: 'Bob'
		 * });
		 * 
		 * // get all properties:
		 * people.attr(); // {a: 'Alice', b: 'Bob'}
		 * 
		 * // set properties while removing others:
		 * people.attr({
		 *     b: 'Bill',
		 *     e: 'Eve'
		 * }, true);
		 *
		 * people.attr(); // {b: 'Bill', e: 'Eve'}
		 * @codeend
		 * 
		 * ## Deep properties
		 * 
		 * `attr` can also set and read deep properties. All you have to do is specify
		 * the property name as you normally would if you weren't using `attr`.
		 * 
		 * @codestart
		 * var people = new can.Map({names: {}});
		 * 
		 * // set a property:
		 * people.attr('names.a', 'Alice');
		 * 
		 * // get a property:
		 * people.attr('names.a'); // 'Alice'
		 * people.names.attr('a'); // 'Alice'
		 *
		 * // get all properties:
		 * people.attr(); // {names: {a: 'Alice'}}
		 * @codeend
		 * 
		 * Objects that are added to Observes become Observes themselves behind the scenes,
		 * so changes to deep properties fire events at each level, and you can bind at any
		 * level. As this example shows, all the same events are fired no matter what level
		 * you call `attr` at:
		 * 
		 * @codestart
		 * var people = new can.Map({names: {}});
		 *
		 * people.bind('change', function(ev, attr, how, newVal, oldVal) {
		 *   console.log('people change: ' + attr + ', ' + how + ', ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * people.names.bind('change', function(ev, attr, how, newVal, oldVal) {
		 *    console.log('people.names change' + attr + ', ' + how + ', ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * people.bind('names', function(ev, newVal, oldVal) {
		 *     console.log('people names: ' + newVal + ', ' + oldVal);
		 * });
		 *
		 * people.names.bind('a', function(ev, newVal, oldVal) {
		 *     console.log('people.names a: ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * people.bind('names.a', function(ev, newVal, oldVal) {
		 *     console.log('people names.a: ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * people.attr('names.a', 'Alice'); // people change: names.a, add, Alice, undefined
		 *                                  // people.names change: a, add, Alice, undefined
		 *                                  // people.names a: Alice, undefined
		 *                                  // people names.a: Alice, undefined
		 * 
		 * people.names.attr('b', 'Bob');   // people change: names.b, add, Bob, undefined
		 *                                  // people.names change: b, add, Bob, undefined
		 *                                  // people.names b: Bob, undefined
		 *                                  // people names.b: Bob, undefined
		 * @codeend
		 * 
		 * ## See also
		 * 
		 * For information on the events that are fired on property changes and how
		 * to listen for those events, see [can.Map.prototype.bind bind].
		 */
		attr: function( attr, val ) {
			// This is super obfuscated for space -- basically, we're checking
			// if the type of the attribute is not a `number` or a `string`.
			var type = typeof attr;
			if ( type !== "string" && type !== "number" ) {
				return this._attrs(attr, val)
			} else if ( arguments.length === 1 ) {// If we are getting a value.
				// Let people know we are reading.
				can.__reading && can.__reading(this, attr)
				return this._get(attr)
			} else {
				// Otherwise we are setting.
				this._set(attr, val);
				return this;
			}
		},
		/**
		 * @function can.Map.prototype.each each
		 * @description Call a function on each property of an Map.
		 * @signature `map.each( callback(item, propName ) )`
		 * 
		 * `each` iterates through the Map, calling a function
		 * for each property value and key.
		 * 
		 * @param {function(*,String)} callback(item,propName) the function to call for each property
		 * The value and key of each property will be passed as the first and second
		 * arguments, respectively, to the callback. If the callback returns false,
		 * the loop will stop.
		 * 
		 * @return {can.Map} this Map, for chaining
		 *
		 * @body
		 * @codestart
		 * var names = [];
		 * new can.Map({a: 'Alice', b: 'Bob', e: 'Eve'}).each(function(value, key) {
		 *     names.push(value);
		 * });
		 * 
		 * names; // ['Alice', 'Bob', 'Eve']
		 * 
		 * names = [];
		 * new can.Map({a: 'Alice', b: 'Bob', e: 'Eve'}).each(function(value, key) {
		 *     names.push(value);
		 *     if(key === 'b') {
		 *         return false;
		 *     }
		 * });
		 * 
		 * names; // ['Alice', 'Bob']
		 * 
		 * @codeend
		 */
		each: function() {
			can.__reading && can.__reading(this, '__keys');
			return can.each.apply(undefined, [this.__get()].concat(can.makeArray(arguments)))
		},
		/**
		 * @function can.Map.prototype.removeAttr removeAttr
		 * @description Remove a property from an Map.
		 * @signature `map.removeAttr(attrName)`
		 * @param {String} attrName the name of the property to remove
		 * @return {*} the value of the property that was removed
		 * 
		 * @body
		 * `removeAttr` removes a property by name from an Map.
		 * 
		 * @codestart
		 * var people = new can.Map({a: 'Alice', b: 'Bob', e: 'Eve'});
		 * 
		 * people.removeAttr('b'); // 'Bob'
		 * people.attr();          // {a: 'Alice', e: 'Eve'}
		 * @codeend
		 * 
		 * Removing an attribute will cause a _change_ event to fire with `'remove'`
		 * passed as the _how_ parameter and `undefined` passed as the _newVal_ to
		 * handlers. It will also cause a _property name_ event to fire with `undefined`
		 * passed as _newVal_. An in-depth description at these events can be found
		 * under `[can.Map.prototype.attr attr]`.
		 */
		removeAttr: function( attr ) {
				// Info if this is List or not
			var isList = can.List && this instanceof can.List,
				// Convert the `attr` into parts (if nested).
				parts = attrParts(attr),
				// The actual property to remove.
				prop = parts.shift(),
				// The current value.
				current = isList ? this[prop] : this._data[prop];

			// If we have more parts, call `removeAttr` on that part.
			if ( parts.length ) {
				return current.removeAttr(parts)
			} else {
				if(isList) {
					this.splice(prop, 1)
				} else if( prop in this._data ){
					// Otherwise, `delete`.
					delete this._data[prop];
					// Create the event.
					if (!(prop in this.constructor.prototype)) {
						delete this[prop]
					}
					// Let others know the number of keys have changed
					can.batch.trigger(this, "__keys");
					this._triggerChange(prop, "remove", undefined, current);

				}
				return current;
			}
		},
		// Reads a property from the `object`.
		_get: function( attr ) {
			var value = typeof attr === 'string' && !!~attr.indexOf('.') && this.__get(attr);
			if(value) {
				return value;
			}

			// break up the attr (`"foo.bar"`) into `["foo","bar"]`
			var parts = attrParts(attr),
				// get the value of the first attr name (`"foo"`)
				current = this.__get(parts.shift());
			// if there are other attributes to read
			return parts.length ? 
				// and current has a value
				current ?
					// lookup the remaining attrs on current
					current._get(parts) : 
					// or if there's no current, return undefined
					undefined 	
				: 
				// if there are no more parts, return current
				current;
		},
		// Reads a property directly if an `attr` is provided, otherwise
		// returns the "real" data object itself.
		__get: function( attr ) {
			if(attr){
				if(this[attr] && this[attr].isComputed && can.isFunction(this.constructor.prototype[attr])){
					return this[attr]()
				} else {
					return this._data[attr]
				}
			} else {
				return this._data;
			}
		},
		// Sets `attr` prop as value on this object where.
		// `attr` - Is a string of properties or an array  of property values.
		// `value` - The raw value to set.
		_set: function( attr, value, keepKey) {
			// Convert `attr` to attr parts (if it isn't already).
			var parts = attrParts(attr, keepKey),
				// The immediate prop we are setting.
				prop = parts.shift(),
				// The current value.
				current = this.__get(prop);

			// If we have an `object` and remaining parts.
			if ( Map.helpers.canMakeObserve(current) && parts.length ) {
				// That `object` should set it (this might need to call attr).
				current._set(parts, value)
			} else if (!parts.length ) {
				// We're in "real" set territory.
				if(this.__convert){
					value = this.__convert(prop, value)
				}
				this.__set(prop, value, current)
			} else {
				throw "can.Map: Object does not exist"
			}
		},
		__set : function(prop, value, current){
		
			// Otherwise, we are setting it on this `object`.
			// TODO: Check if value is object and transform
			// are we changing the value.
			if ( value !== current ) {
				// Check if we are adding this for the first time --
				// if we are, we need to create an `add` event.
				var changeType = this.__get().hasOwnProperty(prop) ? "set" : "add";

				// Set the value on data.
				this.___set(prop,

				// If we are getting an object.
				Map.helpers.canMakeObserve(value) ?

				// Hook it up to send event.
				Map.helpers.hookupBubble(value, prop, this) :
				// Value is normal.
				value);

				if(changeType == "add"){
					// If there is no current value, let others know that
					// the the number of keys have changed
					
					can.batch.trigger(this, "__keys", undefined);
					
				}
				// `batchTrigger` the change event.
				this._triggerChange(prop, changeType, value, current);
				
				//can.batch.trigger(this, prop, [value, current]);
				// If we can stop listening to our old value, do it.
				current && Map.helpers.unhookup([current], this);
			}

		},
		// Directly sets a property on this `object`.
		___set: function( prop, val ) {
			
			if(this[prop] && this[prop].isComputed && can.isFunction(this.constructor.prototype[prop])){
				this[prop](val);
			}
			
			this._data[prop] = val;
			// Add property directly for easy writing.
			// Check if its on the `prototype` so we don't overwrite methods like `attrs`.
			if (!(can.isFunction(this.constructor.prototype[prop]))) {
				this[prop] = val
			}
		},

		/**
		 * @function can.Map.prototype.bind bind
		 * @description Bind event handlers to an Map.
		 * 
		 * @signature `map.bind(eventType, handler)`
		 * 
		 * @param {String} eventType the type of event to bind this handler to
		 * @param {Function} handler the handler to be called when this type of event fires
		 * The signature of the handler depends on the type of event being bound. See below
		 * for details.
		 * @return {can.Map} this Map, for chaining
		 * 
		 * @body
		 * `bind` binds event handlers to property changes on `can.Map`s. When you change
		 * a property using `attr`, two events are fired on the Map, allowing other parts
		 * of your application to map the changes to the object.
		 *
		 * ## The _change_ event
		 * 
		 * The first event that is fired is the _change_ event. The _change_ event is useful
		 * if you want to react to all changes on an Map.
		 *
		 * @codestart
		 * var o = new can.Map({});
		 * o.bind('change', function(ev, attr, how, newVal, oldVal) {
		 *     console.log('Something changed.');
		 * });
		 * @codeend
		 * 
		 * The parameters of the event handler for the _change_ event are:
		 *
		 * - _ev_ The event object.
		 * - _attr_ Which property changed.
		 * - _how_ Whether the property was added, removed, or set. Possible values are `'add'`, `'remove'`, or `'set'`.
		 * - _newVal_ The value of the property after the change. `newVal` will be `undefined` if the property was removed.
		 * - _oldVal_ Thishe value of the property before the change. `oldVal` will be `undefined` if the property was added.
		 * 
		 * Here is a concrete tour through the _change_ event handler's arguments:
		 * 
		 * @codestart
		 * var o = new can.Map({});
		 * o.bind('change', function(ev, attr, how, newVal, oldVal) {
		 *     console.log(ev + ', ' + attr + ', ' + how + ', ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * o.attr('a', 'Alexis'); // [object Object], a, add, Alexis, undefined
		 * o.attr('a', 'Adam');   // [object Object], a, set, Adam, Alexis
		 * o.attr({
		 *     'a': 'Alice',      // [object Object], a, set, Alice, Adam
		 *     'b': 'Bob'         // [object Object], b, add, Bob, undefined
		 * });
		 * o.removeAttr('a');     // [object Object], a, remove, undefined, Alice
		 * @codeend
		 *
		 * (See also `[can.Map::removeAttr removeAttr]`, which removes properties).
		 * 
		 * ## The _property name_ event
		 * 
		 * The second event that is fired is an event whose type is the same as the changed
		 * property's name. This event is useful for noticing changes to a specific property.
		 *
		 * @codestart
		 * var o = new can.Map({});
		 * o.bind('a', function(ev, newVal, oldVal) {
		 *     console.log('The value of a changed.');
		 * });
		 * @codeend
		 * 
		 * The parameters of the event handler for the _property name_ event are:
		 *
		 * - _ev_ The event object.
		 * - _newVal_ The value of the property after the change. `newVal` will be `undefined` if the property was removed.
		 * - _oldVal_ The value of the property before the change. `oldVal` will be `undefined` if the property was added.
		 * 
		 * Here is a concrete tour through the _property name_ event handler's arguments:
		 * 
		 * @codestart
		 * var o = new can.Map({});
		 * o.bind('a', function(ev, newVal, oldVal) {
		 *     console.log(ev + ', ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * o.attr('a', 'Alexis'); // [object Object], Alexis, undefined
		 * o.attr('a', 'Adam');   // [object Object], Adam, Alexis
		 * o.attr({
		 *     'a': 'Alice',      // [object Object], Alice, Adam
		 *     'b': 'Bob' 
		 * });
		 * o.removeAttr('a');     // [object Object], undefined, Alice
		 * @codeend
		 *
		 * ## See also
		 * 
		 * More information about changing properties on Observes can be found under
		 * [can.Map.prototype.attr attr].
		 * 
		 * For a more specific way to changes on Observes, see the [can.Map.delegate] plugin.
		 */
		bind: function(eventName, handler){
			var computedBinding = this._computedBindings && this._computedBindings[eventName]
			if( computedBinding ) {
				if( !computedBinding.count ) {
					computedBinding.count = 1;
					var self =  this;
					computedBinding.handler = function(ev, newVal, oldVal){
						can.batch.trigger(self, {type: eventName, batchNum: ev.batchNum}, [newVal, oldVal] )
					}
					this[eventName].bind("change", computedBinding.handler)
				} else {
					computedBinding.count++
				}
				
			}
			return can.bindAndSetup.apply(this, arguments);
			
		},
		/**
		 * @function can.Map.prototype.unbind unbind
		 * @description Unbind event handlers from an Map.
		 * @signature `map.unbind(eventType[, handler])`
		 * @param {String} eventType the type of event to unbind, exactly as passed to `bind`
		 * @param {Function} [handler] the handler to unbind
		 *
		 * @body
		 * `unbind` unbinds event handlers previously bound with [can.Map.prototype.bind|`bind`].
		 * If no _handler_ is passed, all handlers for the given event type will be unbound.
		 *
		 * @codestart
		 * var i = 0,
		 *     increaseBy2 = function() { i += 2; },
		 *     increaseBy3 = function() { i += 3; },
		 *     o = new can.Map();
		 *
		 * o.bind('change', increaseBy2);
		 * o.bind('change', increaseBy3);
		 * o.attr('a', 'Alice');
		 * i; // 5
		 * 
		 * o.unbind('change', increaseBy2);
		 * o.attr('b', 'Bob');
		 * i; // 8
		 *
		 * o.unbind('change');
		 * o.attr('e', 'Eve');
		 * i; // 8
		 * @codeend
		 */
		unbind: function(eventName, handler){
			var computedBinding = this._computedBindings && this._computedBindings[eventName]
			if( computedBinding ) {
				if( computedBinding.count == 1 ) {
					computedBinding.count = 0;
					this[eventName].unbind("change", computedBinding.handler);
					delete computedBinding.handler;
				} else {
					computedBinding.count++
				}
				
			}
			return can.unbindAndTeardown.apply(this, arguments);
			
		},
		/**
		 * @function can.Map.prototype.serialize serialize
		 * @description Serialize this object to something that
		 * can be passed to `JSON.stringify`.
		 * @signature `map.serialize()`
		 * 
		 * 
		 * Get the serialized Object form of the map.  Serialized
		 * data is typically used to send back to a server.
		 * 
		 *     o.serialize() //-> { name: 'Justin' }
		 *     
		 * Serialize currently returns the same data 
		 * as [can.Map.prototype.attrs].  However, in future
		 * versions, serialize will be able to return serialized
		 * data similar to [can.Model].  The following will work:
		 * 
		 *     new Map({time: new Date()})
		 *       .serialize() //-> { time: 1319666613663 }
		 * 
		 * @return {Object} a JavaScript Object that can be 
		 * serialized with `JSON.stringify` or other methods. 
		 * 
		 */
		serialize: function() {
			return can.Map.helpers.serialize(this, 'serialize', {});
		},
		/**
		 * @hide
		 * Set multiple properties on the observable
		 * @param {Object} props
		 * @param {Boolean} remove true if you should remove properties that are not in props
		 */
		_attrs: function( props, remove ) {

			if ( props === undefined ) {
				return Map.helpers.serialize(this, 'attr', {})
			}

			props = can.simpleExtend({}, props);
			var prop,
				self = this,
				newVal;
			can.batch.start();
			this.each(function(curVal, prop){
				// you can not have a _cid property!
				if(prop === "_cid"){
					return;
				}
				newVal = props[prop];

				// If we are merging...
				if ( newVal === undefined ) {
					remove && self.removeAttr(prop);
					return;
				}
				
				if(self.__convert){
					newVal = self.__convert(prop, newVal)
				}

				// if we're dealing with models, want to call _set to let converter run
				if( newVal instanceof can.Map ) {
					self.__set(prop, newVal, curVal)
				// if its an object, let attr merge
				} else if ( Map.helpers.canMakeObserve(curVal) && Map.helpers.canMakeObserve(newVal) && curVal.attr ) {
					curVal.attr(newVal, remove)
				// otherwise just set
				} else if ( curVal != newVal ) {
					self.__set(prop, newVal, curVal)
				}

				delete props[prop];
			})
			// Add remaining props.
			for ( var prop in props ) {
				if(prop !== "_cid"){
					newVal = props[prop];
					this._set(prop, newVal, true)
				}
				
			}
			can.batch.stop()
			return this;
		},

		/**
		 * @function can.Map.prototype.compute compute
		 * @description Make a can.compute from an observable property.
		 * @signature `map.compute(attrName)`
		 * @param {String} attrName the property to bind to
		 * @return {can.compute} a [can.compute] bound to _attrName_
		 *
		 * @body
		 * `compute` is a convenience method for making computes from properties
		 * of Observes. More information about computes can be found under [can.compute].
		 *
		 * @codestart
		 * var map = new can.Map({a: 'Alexis'});
		 * var name = map.compute('a');
		 * name.bind('change', function(ev, nevVal, oldVal) {
		 *     console.log('a changed from ' + oldVal + 'to' + newName + '.');
		 * });
		 *
		 * name(); // 'Alexis'
		 * 
		 * map.attr('a', 'Adam'); // 'a changed from Alexis to Adam.'
		 * name(); // 'Adam'
		 *
		 * name('Alice'); // 'a changed from Adam to Alice.'
		 * name(); // 'Alice'
		 */
		compute: function(prop) {
			if(can.isFunction( this.constructor.prototype[prop] )){
				return can.compute(this[prop], this);
			} else {
				return can.compute(this,prop);
			}
			
		}
	});
	
	Map.prototype.on = Map.prototype.bind;
	Map.prototype.off = Map.prototype.unbind;

	return Map;
});
define('demo/model',['jquery', 'can/map'], function ($, m) {
    
    return m.extend({});
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/list',["can/util/library", "can/map"], function(can, Map){
	
	
	
	// Helpers for `observable` lists.
	var splice = [].splice,
		// test if splice works correctly
		spliceRemovesProps = (function(){
			// IE's splice doesn't remove properties
			var obj = {0: "a", length: 1};
			splice.call(obj, 0,1);
			return !obj[0];
		})(),
	/**
	 * @add can.List
	 */
	list = Map(
	/**
	 * @static
	 */
	{
		/**
		 * @property {can.Map} can.List.Map
		 * 
		 * @description Specify the Map type used to make objects added to this list observable.
		 * 
		 * @option {can.Map} When objects are added to a can.List, those objects are
		 * converted into can.Map instances.  For example:
		 * 
		 *     var list = new can.List();
		 *     list.push({name: "Justin"});
		 *     
		 *     var map = list.attr(0);
		 *     map.attr("name") //-> "Justin"
		 * 
		 * By changing [can.List.Map], you can specify a different type of Map instance to 
		 * create. For example:
		 * 
		 *     var User = can.Map.extend({
		 *       fullName: function(){
		 *         return this.attr("first")+" "+this.attr("last")
		 *       }
		 *     });
		 * 
		 *     User.List = can.List.extend({
		 *       Map: User
		 *     });
		 * 
		 *     var list = new User.List();
		 *     list.push({first: "Justin", last: "Meyer"});
		 * 
		 *     var user = list.attr(0);
		 *     user.fullName() //-> "Justin Meyer"
		 * 
		 * 
		 * 
		 */
		Map: Map
		/**
		 * @function can.Map.extend
		 * 
		 * @signature `can.List.extend([name,] [staticProperties,] instanceProperties)`
		 * 
		 * Creates a new extended constructor function. Learn more at [can.Construct.extend].
 		 *    
		 * @param {String} [name] If provided, adds the extened List constructor function
		 * to the window at the given name.
		 * 
		 * @param {Object} [staticProperties] Properties and methods 
		 * directly on the constructor function. The most common property to set is [can.List.Map].
		 * 
		 * @param {Object} [instanceProperties] Properties and methods on instances of this list type.
		 * 
		 * @body
		 * 
		 * ## Use
		 * 
		 * 
		 */
	},
	/**
	 * @prototype
	 */
	{
		setup: function( instances, options ) {
			this.length = 0;
			can.cid(this, ".map")
			this._init = 1;
			instances = instances || [];
			
			
			if( can.isDeferred(instances) ) {
				this.replace(instances)
			} else {
				var teardownMapping = instances.length && can.Map.helpers.addToMap(instances, this);
				this.push.apply(this, can.makeArray(instances || []));
			}
			
			teardownMapping && teardownMapping();
			
			// this change needs to be ignored
			this.bind('change',can.proxy(this._changes,this));
			can.simpleExtend(this, options);
			delete this._init;
		},
		_triggerChange: function(attr, how, newVal, oldVal){
			
			Map.prototype._triggerChange.apply(this,arguments)
			// `batchTrigger` direct add and remove events...
			if ( !~ attr.indexOf('.')){
				
				if( how === 'add' ) {
					can.batch.trigger(this, how, [newVal,+attr]);
					can.batch.trigger(this,'length',[this.length]);
				} else if( how === 'remove' ) {
					can.batch.trigger(this, how, [oldVal, +attr]);
					can.batch.trigger(this,'length',[this.length]);
				} else {
					can.batch.trigger(this,how,[newVal, +attr])
				}
				
			}
			
		},
		__get : function(attr){
			return attr ? this[attr] : this;
		},
		___set : function(attr, val){
			this[attr] = val;
			if(+attr >= this.length){
				this.length = (+attr+1)
			}
		},
		_each: function(callback){
			var data = this.__get();
			for(var i =0; i < data.length; i++){
				callback(data[i],i)
			}
		},
		_bindsetup: Map.helpers.makeBindSetup("*"),
		// Returns the serialized form of this list.
		/**
		 * @hide
		 * Returns the serialized form of this list.
		 */
		serialize: function() {
			return Map.helpers.serialize(this, 'serialize', []);
		},
		/**
		 * @function can.List.prototype.each each
		 * @description Call a function on each element of a List.
		 * @signature `list.each( callback(item, index) )`
		 * 
		 * `each` iterates through the Map, calling a function
		 * for each element.
		 * 
		 * @param {function(*, Number)} callback the function to call for each element
		 * The value and index of each element will be passed as the first and second
		 * arguments, respectively, to the callback. If the callback returns false,
		 * the loop will stop.
		 * 
		 * @return {can.List} this List, for chaining
		 *
		 * @body
		 * @codestart
		 * var i = 0;
		 * new can.Map([1, 10, 100]).each(function(element, index) {
		 *     i += element;
		 * });
		 * 
		 * i; // 111
		 * 
		 * i = 0;
		 * new can.Map([1, 10, 100]).each(function(element, index) {
		 *     i += element;
		 *     if(index >= 1) {
		 *         return false;
		 *     }
		 * });
		 * 
		 * i; // 11
		 * @codeend
		 */
		//  
		/**
		 * @function can.List.prototype.splice splice
		 * @description Insert and remove elements from a List.
		 * @signature `list.splice(index[, howMany[, ...newElements]])`
		 * @param {Number} index where to start removing or inserting elements
		 * 
		 * @param {Number} [howMany] the number of elements to remove
		 * If _howMany_ is not provided, `splice` will all elements from `index` to the end of the List.
		 *
		 * @param {*} newElements elements to insert into the List
		 *
		 * @return {Array} the elements removed by `splice`
		 *
		 * @body
		 * `splice` lets you remove elements from and insert elements into a List.
		 *
		 * This example demonstrates how to do surgery on a list of numbers:
		 * 
		 * @codestart
		 * var list = new can.List([0, 1, 2, 3]);
		 *
		 * // starting at index 2, remove one element and insert 'Alice' and 'Bob':
		 * list.splice(2, 1, 'Alice', 'Bob');
		 * list.attr(); // [0, 1, 'Alice', 'Bob', 3]
		 * @codeend
		 *
		 * ## Events
		 *
		 * `splice` causes the List it's called on to emit _change_ events,
		 * _add_ events, _remove_ events, and _length_ events. If there are
		 * any elements to remove, a _change_ event, a _remove_ event, and a
		 * _length_ event will be fired. If there are any elements to insert, a
		 * separate _change_ event, an _add_ event, and a separate _length_ event
		 * will be fired. 
		 *
		 * This slightly-modified version of the above example should help
		 * make it clear how `splice` causes events to be emitted:
		 *
		 * @codestart
		 * var list = new can.List(['a', 'b', 'c', 'd']);
		 * list.bind('change', function(ev, attr, how, newVals, oldVals) {
	     *     console.log('change: ' + attr + ', ' + how + ', ' + newVals + ', ' + oldVals);
		 * });
		 * list.bind('add', function(ev, newVals, where) {
	     *     console.log('add: ' + newVals + ', ' + where);
		 * });
		 * list.bind('remove', function(ev, oldVals, where) {
	     *     console.log('remove: ' + oldVals + ', ' + where);
		 * });
		 * list.bind('length', function(ev, length) {
	     *     console.log('length: ' + length + ', ' + this.attr());
		 * });
		 *
		 * // starting at index 2, remove one element and insert 'Alice' and 'Bob':
		 * list.splice(2, 1, 'Alice', 'Bob'); // change: 2, 'remove', undefined, ['c']
		 *                                    // remove: ['c'], 2
		 *                                    // length: 5, ['a', 'b', 'Alice', 'Bob', 'd']
		 *                                    // change: 2, 'add', ['Alice', 'Bob'], ['c']
		 *                                    // add: ['Alice', 'Bob'], 2
		 *                                    // length: 5, ['a', 'b', 'Alice', 'Bob', 'd']
		 * @codeend
		 *
		 * More information about binding to these events can be found under [can.List.attr attr].
		 */
		splice: function( index, howMany ) {
			var args = can.makeArray(arguments),
				i;

			for ( i = 2; i < args.length; i++ ) {
				var val = args[i];
				if ( Map.helpers.canMakeObserve(val) ) {
					args[i] = Map.helpers.hookupBubble(val, "*", this, this.constructor.Map, this.constructor)
				}
			}
			if ( howMany === undefined ) {
				howMany = args[1] = this.length - index;
			}
			var removed = splice.apply(this, args);
			
			if(!spliceRemovesProps) {
				for(var i = this.length; i < removed.length+this.length; i++){
					delete this[i]
				}
			}
			
			can.batch.start();
			if ( howMany > 0 ) {
				this._triggerChange(""+index, "remove", undefined, removed);
				Map.helpers.unhookup(removed, this);
			}
			if ( args.length > 2 ) {
				this._triggerChange(""+index, "add", args.slice(2), removed);
			}
			can.batch.stop();
			return removed;
		},
		/**
		 * @description Get or set elements in a List.
		 * @function can.List.prototype.attr attr
		 * 
		 * @signature `list.attr()`
		 * 
		 * Gets an array of all the elements in this `can.List`.
		 * 
		 * @return {Array} An array with all the elements in this List.
		 * 
		 * @signature `list.attr(index)`
		 * 
		 * Reads an element from this `can.List`.
		 * 
		 * @param {Number} index The element to read.
		 * @return {*} The value at _index_.
		 * 
		 * @signature `list.attr(index, value)`
		 * 
		 * Assigns _value_ to the index _index_ on this `can.List`, expanding the list if necessary.
		 * 
		 * @param {Number} index The element to set.
		 * @param {*} value The value to assign at _index_.
		 * @return {can.List} This list, for chaining.
		 * 
		 * @signature `list.attr(elements[, replaceCompletely])`
		 * 
		 * Merges the members of _elements_ into this List, replacing each from the beginning in order. If
		 * _elements_ is longer than the current List, the current List will be expanded. If _elements_
		 * is shorter than the current List, the extra existing members are not affected (unless
		 * _replaceCompletely_ is `true`). To remove elements without replacing them, use `[can.Map::removeAttr removeAttr]`.
		 * 
		 * @param {Array} elements An array of elements to merge in.
		 * 
		 * @param {bool} [replaceCompletely=false] whether to completely replace the elements of List
		 * If _replaceCompletely_ is `true` and _elements_ is shorter than the List, the existing
		 * extra members of the List will be removed.
		 * 
		 * @return {can.List} This list, for chaining.
		 * 
		 * @body
		 * 
		 * 
		 * ## Use
		 * 
		 * `attr` gets or sets elements on the `can.List` it's called on. Here's a tour through
		 * how all of its forms work:
		 * 
		 *     var people = new can.List(['Alex', 'Bill']);
		 *     
		 *     // set an element:
		 *     people.attr(0, 'Adam');
		 *     
		 *     // get an element:
		 *     people.attr(0); // 'Adam'
		 *     people[0]; // 'Adam'
		 *     
		 *     // get all elements:
		 *     people.attr(); // ['Adam', 'Bill']
		 *     
		 *     // extend the array:
		 *     people.attr(4, 'Charlie');
		 *     people.attr(); // ['Adam', 'Bill', undefined, undefined, 'Charlie']
		 *     
		 *     // merge the elements:
		 *     people.attr(['Alice', 'Bob', 'Eve']);
		 *     people.attr(); // ['Alice', 'Bob', 'Eve', undefined, 'Charlie']
		 * 
		 * ## Deep properties
		 * 
		 * `attr` can also set and read deep properties. All you have to do is specify
		 * the property name as you normally would if you weren't using `attr`.
		 * 
		 * @codestart
		 * var people = new can.List([{name: 'Alex'}, {name: 'Bob'}]);
		 * 
		 * // set a property:
		 * people.attr('0.name', 'Alice');
		 * 
		 * // get a property:
		 * people.attr('0.name');  // 'Alice'
		 * people[0].attr('name'); // 'Alice'
		 * 
		 * // get all properties:
		 * people.attr(); // [{name: 'Alice'}, {name: 'Bob'}]
		 * @codeend
		 * 
		 * The discussion of deep properties under `[can.Map.prototype.attr]` may also
		 * be enlightening.
		 * 
		 * ## Events
		 * 
		 * `can.List`s emit five types of events in response to changes. They are:
		 * 
		 * - the _change_ event fires on every change to a List.
		 * - the _set_ event is fired when an element is set.
		 * - the _add_ event is fired when an element is added to the List.
		 * - the _remove_ event is fired when an element is removed from the List.
		 * - the _length_ event is fired when the length of the List changes.
		 * 
		 * ### The _change_ event
		 *  
		 * The first event that is fired is the _change_ event. The _change_ event is useful
		 * if you want to react to all changes on an List.
		 * 
		 * @codestart
		 * var list = new can.List([]);
		 * list.bind('change', function(ev, index, how, newVal, oldVal) {
		 *     console.log('Something changed.');
		 * });
		 * @codeend
		 * 
		 * The parameters of the event handler for the _change_ event are:
		 * 
		 * - _ev_ The event object.
		 * - _index_ Where the change took place.
		 * - _how_ Whether elements were added, removed, or set.
		 * Possible values are `'add'`, `'remove'`, or `'set'`.
		 * - _newVal_ The elements affected after the change
		 *  _newVal_ will be a single value when an index is set, an Array when elements
		 * were added, and `undefined` if elements were removed.
		 * - _oldVal_ The elements affected before the change.
		 * _newVal_ will be a single value when an index is set, an Array when elements
		 * were removed, and `undefined` if elements were added.
		 * 
		 * Here is a concrete tour through the _change_ event handler's arguments:
		 * 
		 * @codestart
		 * var list = new can.List();
		 * list.bind('change', function(ev, index, how, newVal, oldVal) {
		 *     console.log(ev + ', ' + index + ', ' + how + ', ' + newVal + ', ' + oldVal);
		 * });
		 * 
		 * list.attr(['Alexis', 'Bill']); // [object Object], 0, add, ['Alexis', 'Bill'], undefined
		 * list.attr(2, 'Eve');           // [object Object], 2, add, Eve, undefined
		 * list.attr(0, 'Adam');          // [object Object], 0, set, Adam, Alexis
		 * list.attr(['Alice', 'Bob']);   // [object Object], 0, set, Alice, Adam
		 *                                // [object Object], 1, set, Bob, Bill
		 * list.removeAttr(1);            // [object Object], 1, remove, undefined, Bob
		 * @codeend
		 * 
		 * ### The _set_ event
		 * 
		 * _set_ events are fired when an element at an index that already exists in the List is
		 * modified. Actions can cause _set_ events to fire never also cause _length_ events
		 * to fire (although some functions, such as `[can.List.prototype.splice splice]`
		 * may cause unrelated sets of events to fire after being batched).
		 * 
		 * The parameters of the event handler for the _set_ event are:
		 * 
		 * - _ev_ The event object.
		 * - _newVal_ The new value of the element.
		 * - _index_ where the set took place.
		 * 
		 * Here is a concrete tour through the _set_ event handler's arguments:
		 * 
		 * @codestart
		 * var list = new can.List();
		 * list.bind('set', function(ev, newVal, index) {
		 *     console.log(newVal + ', ' + index);
		 * });
		 * 
		 * list.attr(['Alexis', 'Bill']);
		 * list.attr(2, 'Eve');          
		 * list.attr(0, 'Adam');          // Adam, 0
		 * list.attr(['Alice', 'Bob']);   // Alice, 0
		 *                                // Bob, 1
		 * list.removeAttr(1);            
		 * @codeend
		 * 
		 * ### The _add_ event
		 * 
		 * _add_ events are fired when elements are added or inserted
		 * into the List.
		 * 
		 * The parameters of the event handler for the _add_ event are:
		 * 
		 * - _ev_ The event object.
		 * - _newElements_ The new elements.
		 * If more than one element is added, _newElements_ will be an array.
		 * Otherwise, it is simply the new element itself.
		 * - _index_ Where the add or insert took place.
		 * 
		 * Here is a concrete tour through the _add_ event handler's arguments:
		 * 
		 * @codestart
		 * var list = new can.List();
		 * list.bind('add', function(ev, newElements, index) {
		 *     console.log(newElements + ', ' + index);
		 * });
		 * 
		 * list.attr(['Alexis', 'Bill']); // ['Alexis', 'Bill'], 0
		 * list.attr(2, 'Eve');           // Eve, 2
		 * list.attr(0, 'Adam');          
		 * list.attr(['Alice', 'Bob']);   
		 *                                
		 * list.removeAttr(1);            
		 * @codeend
		 * 
		 * ### The _remove_ event
		 * 
		 * _remove_ events are fired when elements are removed from the list.
		 * 
		 * The parameters of the event handler for the _remove_ event are:
		 * 
		 * - _ev_ The event object.
		 * - _removedElements_ The removed elements.
		 * If more than one element was removed, _removedElements_ will be an array.
		 * Otherwise, it is simply the element itself.
		 * - _index_ Where the removal took place.
		 * 
		 * Here is a concrete tour through the _remove_ event handler's arguments:
		 * 
		 * @codestart
		 * var list = new can.List();
		 * list.bind('remove', function(ev, removedElements, index) {
		 *     console.log(removedElements + ', ' + index);
		 * });
		 * 
		 * list.attr(['Alexis', 'Bill']); 
		 * list.attr(2, 'Eve');           
		 * list.attr(0, 'Adam');          
		 * list.attr(['Alice', 'Bob']);   
		 *                                
		 * list.removeAttr(1);            // Bob, 1
		 * @codeend
		 * 
		 * ### The _length_ event
		 * 
		 * _length_ events are fired whenever the list changes.
		 * 
		 * The parameters of the event handler for the _length_ event are:
		 * 
		 * - _ev_ The event object.
		 * - _length_ The current length of the list.
		 * If events were batched when the _length_ event was triggered, _length_
		 * will have the length of the list when `stopBatch` was called. Because
		 * of this, you may recieve multiple _length_ events with the same
		 * _length_ parameter.
		 * 
		 * Here is a concrete tour through the _length_ event handler's arguments:
		 * 
		 * @codestart
		 * var list = new can.List();
		 * list.bind('length', function(ev, length) {
		 *     console.log(length);
		 * });
		 * 
		 * list.attr(['Alexis', 'Bill']); // 2
		 * list.attr(2, 'Eve');           // 3
		 * list.attr(0, 'Adam');          
		 * list.attr(['Alice', 'Bob']);   
		 *                                
		 * list.removeAttr(1);            // 2
		 * @codeend
		 */
		_attrs: function( items, remove ) {
			if ( items === undefined ) {
				return Map.helpers.serialize(this, 'attr', []);
			}

			// Create a copy.
			items = can.makeArray( items );

      		can.batch.start();
			this._updateAttrs(items, remove);
			can.batch.stop()
		},

	    _updateAttrs : function( items, remove ){
	      var len = Math.min(items.length, this.length);
	
	      for ( var prop = 0; prop < len; prop++ ) {
	        var curVal = this[prop],
	          newVal = items[prop];
	
	        if ( Map.helpers.canMakeObserve(curVal) && Map.helpers.canMakeObserve(newVal) ) {
	          curVal.attr(newVal, remove)
	        } else if ( curVal != newVal ) {
	          this._set(prop, newVal)
	        } else {
	
	        }
	      }
	      if ( items.length > this.length ) {
	        // Add in the remaining props.
	        this.push.apply( this, items.slice( this.length ) );
	      } else if ( items.length < this.length && remove ) {
	        this.splice(items.length)
	      }
	    }
	}),


		// Converts to an `array` of arguments.
		getArgs = function( args ) {
			return args[0] && can.isArray(args[0]) ?
				args[0] :
				can.makeArray(args);
		};
	// Create `push`, `pop`, `shift`, and `unshift`
	can.each(
	{
		/**
		 * @function can.List.prototype.push push
		 * @description Add elements to the end of a list.
		 * @signature `list.push(...elements)`
		 *
		 * `push` adds elements onto the end of a List.]
		 * 
		 * @param {*} elements the elements to add to the List
		 *
		 * @return {Number} the new length of the List
		 *
		 * @body
		 * `push` is fairly straightforward:
		 *
		 * @codestart
		 * var list = new can.List(['Alice']);
		 *
		 * list.push('Bob', 'Eve');
		 * list.attr(); // ['Alice', 'Bob', 'Eve']
		 * @codeend
		 *
		 * If you have an array you want to concatenate to the end
		 * of the List, you can use `apply`:
		 *
		 * @codestart
		 * var names = ['Bob', 'Eve'],
		 *     list = new can.List(['Alice']);
		 *
		 * list.push.apply(list, names);
		 * list.attr(); // ['Alice', 'Bob', 'Eve']
		 * @codeend
		 *
		 * ## Events
		 *
		 * `push` causes _change_, _add_, and _length_ events to be fired.
		 *
		 * ## See also
		 *
		 * `push` has a counterpart in [can.List.pop pop], or you may be
		 * looking for [can.List.unshift unshift] and its counterpart [can.List.shift shift].
		 */
		push: "length",
		/**
		 * @function can.List.prototype.unshift unshift
		 * @description Add elements to the beginning of a List.
		 * @signature `list.unshift(...elements)`
		 *
		 * `unshift` adds elements onto the beginning of a List.
		 * 
		 * @param {*} elements the elements to add to the List
		 *
		 * @return {Number} the new length of the List
		 *
		 * @body
		 * `unshift` adds elements to the front of the list in bulk in the order specified:
		 *
		 * @codestart
		 * var list = new can.List(['Alice']);
		 *
		 * list.unshift('Bob', 'Eve');
		 * list.attr(); // ['Bob', 'Eve', 'Alice']
		 * @codeend
		 *
		 * If you have an array you want to concatenate to the beginning
		 * of the List, you can use `apply`:
		 *
		 * @codestart
		 * var names = ['Bob', 'Eve'],
		 *     list = new can.List(['Alice']);
		 *
		 * list.push.apply(list, names);
		 * list.attr(); // ['Bob', 'Eve', 'Alice']
		 * @codeend
		 *
		 * ## Events
		 *
		 * `unshift` causes _change_, _add_, and _length_ events to be fired.
		 *
		 * ## See also
		 *
		 * `unshift` has a counterpart in [can.List.shift shift], or you may be
		 * looking for [can.List.push push] and its counterpart [can.List.pop pop].
		 */
		unshift: 0
	},
	// Adds a method
	// `name` - The method name.
	// `where` - Where items in the `array` should be added.
	function( where, name ) {
		var orig = [][name]
		list.prototype[name] = function() {
			// Get the items being added.
			var args = [],
				// Where we are going to add items.
				len = where ? this.length : 0,
				i = arguments.length,
				res,
				val,
				constructor = this.constructor;

			// Go through and convert anything to an `map` that needs to be converted.
			while(i--){
				val = arguments[i];
				args[i] =  Map.helpers.canMakeObserve(val) ?
					Map.helpers.hookupBubble(val, "*", this, this.constructor.Map, this.constructor) :
					val;
			}
			
			// Call the original method.
			res = orig.apply(this, args);

			if ( !this.comparator || args.length ) {

				this._triggerChange(""+len, "add", args, undefined);
			}
						
			return res;
		}
	});

	can.each({
		/**
		 * @function can.List.prototype.pop pop
		 * @description Remove an element from the end of a List.
		 * @signature `list.pop()`
		 *
		 * `push` removes an element from the end of a List.
		 * 
		 * @return {*} the element just popped off the List, or `undefined` if the List was empty
		 *
		 * @body
		 * `pop` is the opposite action from `[can.List.push push]`:
		 *
		 * @codestart
		 * var list = new can.List(['Alice']);
		 *
		 * list.push('Bob', 'Eve');
		 * list.attr(); // ['Alice', 'Bob', 'Eve']
		 * 
		 * list.pop(); // 'Eve'
		 * list.pop(); // 'Bob'
		 * list.pop(); // 'Alice'
		 * list.pop(); // undefined
		 * @codeend
		 *
		 * ## Events
		 *
		 * `pop` causes _change_, _remove_, and _length_ events to be fired if the List is not empty
		 * when it is called.
		 *
		 * ## See also
		 *
		 * `pop` has its counterpart in [can.List.push push], or you may be
		 * looking for [can.List.unshift unshift] and its counterpart [can.List.shift shift].
		 */
		pop: "length",
		/**
		 * @function can.List.prototype.shift shift
		 * @description Remove en element from the front of a list.
		 * @signature `list.shift()`
		 *
		 * `shift` removes an element from the beginning of a List.
		 *
		 * @return {*} the element just shifted off the List, or `undefined` if the List is empty
		 *
		 * @body
		 * `shift` is the opposite action from `[can.List.unshift unshift]`:
		 *
		 * @codestart
		 * var list = new can.List(['Alice']);
		 *
		 * list.unshift('Bob', 'Eve');
		 * list.attr(); // ['Bob', 'Eve', 'Alice']
		 *
		 * list.shift(); // 'Bob'
		 * list.shift(); // 'Eve'
		 * list.shift(); // 'Alice'
		 * list.shift(); // undefined
		 * @codeend
		 *
		 * ## Events
		 *
		 * `pop` causes _change_, _remove_, and _length_ events to be fired if the List is not empty
		 * when it is called.
		 *
		 * ## See also
		 *
		 * `shift` has a counterpart in [can.List.unshift unshift], or you may be
		 * looking for [can.List.push push] and its counterpart [can.List.pop pop].
		 */
		shift: 0
	},
	// Creates a `remove` type method
	function( where, name ) {
		list.prototype[name] = function() {
			
			var args = getArgs(arguments),
				len = where && this.length ? this.length - 1 : 0;


			var res = [][name].apply(this, args)

			// Create a change where the args are
			// `len` - Where these items were removed.
			// `remove` - Items removed.
			// `undefined` - The new values (there are none).
			// `res` - The old, removed values (should these be unbound).
			this._triggerChange(""+len, "remove", undefined, [res])

			if ( res && res.unbind ) {
				can.stopListening.call(this, res, "change");
			}
			return res;
		}
	});
	
	can.extend(list.prototype, {
		/**
		 * @function can.List.prototype.indexOf indexOf
		 * @description Look for an item in a List.
		 * @signature `list.indexOf(item)`
		 *
		 * `indexOf` finds the position of a given item in the List.
		 *
		 * @param {*} item the item to find
		 *
		 * @return {Number} the position of the item in the List, or -1 if the item is not found.
		 *
		 * @body
		 * @codestart
		 * var list = new can.List(['Alice', 'Bob', 'Eve']);
		 * list.indexOf('Alice');   // 0
		 * list.indexOf('Charlie'); // -1
		 * @codeend
		 *
		 * It is trivial to make a `contains`-type function using `indexOf`:
		 *
		 * @codestart
		 * function(list, item) {
		 *     return list.indexOf(item) >= 0;
		 * }
		 * @codeend
		 */
		indexOf: function(item, fromIndex) {
			this.attr('length')
			return can.inArray(item, this, fromIndex)
		},

		/**
		 * @function can.List.prototype.join join
		 * @description Join a List's elements into a string.
		 * @signature `list.join(separator)`
		 *
		 * `join` turns a List into a string by inserting _separator_ between the string representations
		 * of all the elements of the List.
		 *
		 * @param {String} separator the string to seperate elements with
		 *
		 * @return {String} the joined string
		 *
		 * @body
		 * @codestart
		 * var list = new can.List(['Alice', 'Bob', 'Eve']);
		 * list.join(', '); // 'Alice, Bob, Eve'
		 *
		 * var beatles = new can.List(['John', 'Paul', 'Ringo', 'George']);
		 * beatles.join('&'); // 'John&Paul&Ringo&George'
		 * @codeend
		 */
		join: function(){
			return [].join.apply(this.attr(), arguments)
		},
		
		/**
		 * @function can.List.prototype.reverse reverse
		 * @description Reverse the order of a List.
		 * @signature `list.reverse()`
		 *
		 * `reverse` reverses the elements of the List in place.
		 *
		 * @return {can.List} the List, for chaining
		 *
		 * @body
		 * @codestart
		 * var list = new can.List(['Alice', 'Bob', 'Eve']);
		 * var reversedList = list.reverse();
		 *
		 * reversedList.attr(); // ['Eve', 'Bob', 'Alice'];
		 * list === reversedList; // true
		 * @codeend
		 */
		reverse: [].reverse,

		/**
		 * @function can.List.prototype.slice slice
		 * @description Make a copy of a part of a List.
		 * @signature `list.slice([start[, end]])`
		 *
		 * `slice` creates a copy of a portion of the List.
		 *
		 * @param {Number} [start=0] the index to start copying from
		 *
		 * @param {Number} [end] the first index not to include in the copy
		 * If _end_ is not supplied, `slice` will copy until the end of the list.
		 *
		 * @return {can.List} a new `can.List` with the extracted elements
		 *
		 * @body
		 * @codestart
		 * var list = new can.List(['Alice', 'Bob', 'Charlie', 'Daniel', 'Eve']);
		 * var newList = list.slice(1, 4);
		 * newList.attr(); // ['Bob', 'Charlie', 'Daniel']
		 * @codeend
		 *
		 * `slice` is the simplest way to copy a List:
		 * 
		 * @codestart
		 * var list = new can.List(['Alice', 'Bob', 'Eve']);
		 * var copy = list.slice();
		 *
		 * copy.attr();   // ['Alice', 'Bob', 'Eve']
		 * list === copy; // false
		 * @codeend
		 */
		slice : function() {
			var temp = Array.prototype.slice.apply(this, arguments);
			return new this.constructor( temp );
		},

		/**
		 * @function can.List.prototype.concat concat
		 * @description Merge many collections together into a List.
		 * @signature `list.concat(...args)`
		 * @param {Array|can.List|*} args Any number of arrays, Lists, or values to add in
		 * For each parameter given, if it is an Array or a List, each of its elements will be added to
		 * the end of the concatenated List. Otherwise, the parameter itself will be added.
		 *
		 * @body
		 * `concat` makes a new List with the elements of the List followed by the elements of the parameters.
		 *
		 * @codestart
		 * var list = new can.List();
		 * var newList = list.concat(
		 *     'Alice',
		 *     ['Bob', 'Charlie']),
		 *     new can.List(['Daniel', 'Eve']),
		 *     {f: 'Francis'}
		 * );
		 * newList.attr(); // ['Alice', 'Bob', 'Charlie', 'Daniel', 'Eve', {f: 'Francis'}]
		 * @codeend
		 */
		concat : function() {
			var args = [];
			can.each( can.makeArray( arguments ), function( arg, i ) {
				args[i] = arg instanceof can.List ? arg.serialize() : arg ;
			});
			return new this.constructor(Array.prototype.concat.apply(this.serialize(), args));
		},

		/**
		 * @function can.List.prototype.forEach forEach
		 * @description Call a function for each element of a List.
		 * @signature `list.forEach(callback[, thisArg])`
		 * @param {function(element, index, list)} callback a function to call with each element of the List
		 * The three parameters that _callback_ gets passed are _element_, the element at _index_, _index_ the
		 * current element of the list, and _list_ the List the elements are coming from.
		 * @param {Object} [thisArg] the object to use as `this` inside the callback
		 *
		 * @body
		 * `forEach` calls a callback for each element in the List.
		 *
		 * @codestart
		 * var list = new can.List([1, 2, 3]);
		 * list.forEach(function(element, index, list) {
		 *     list.attr(index, element * element);
		 * });
		 * list.attr(); // [1, 4, 9]
		 * @codeend
		 */
		forEach : function( cb, thisarg ) {
			return can.each(this, cb, thisarg || this );
		},

		/**
		 * @function can.List.prototype.replace replace
		 * @description Replace all the elements of a List.
		 * @signature `list.replace(collection)`
		 * @param {Array|can.List|can.Deferred} collection the collection of new elements to use
		 * If a [can.Deferred] is passed, it must resolve to an `Array` or `can.List`.
		 * The elements of the list are not actually removed until the Deferred resolves.
		 *
		 * @body
		 * `replace` replaces all the elements of this List with new ones.
		 *
		 * `replace` is especially useful when `can.List`s are live-bound into `[can.Control]`s,
		 * and you intend to populate them with the results of a `[can.Model]` call:
		 *
		 * @codestart
		 * can.Control({
		 *     init: function() {
		 *         this.list = new Todo.List();
		 *         // live-bind the list into the DOM
		 *         this.element.html(can.view('list.mustache', this.list));
		 *         // when this AJAX call returns, the live-bound DOM will be updated
		 *         this.list.replace(Todo.findAll());
		 *     }
		 * });
		 * @codeend
		 *
		 * Learn more about [can.Model.List making Lists of models].
		 *
		 * ## Events
		 * 
		 * A major difference between `replace` and `attr(newElements, true)` is that `replace` always emits
		 * an_add_ event and a _remove_ event, whereas `attr` will cause _set_ events along an _add_ or _remove_
		 * event if needed. Corresponding _change_ and _length_ events will be fired as well.
		 *
		 * The differences in the events fired by `attr` and `replace` are demonstrated concretely by this example:
		 * @codestart
		 * var attrList = new can.List(['Alexis', 'Bill']);
		 * attrList.bind('change', function(ev, index, how, newVals, oldVals) {
		 *     console.log(index + ', ' + how + ', ' + newVals + ', ' + oldVals);
		 * });
		 * 
		 * var replaceList = new can.List(['Alexis', 'Bill']);
		 * replaceList.bind('change', function(ev, index, how, newVals, oldVals) {
		 *     console.log(index + ', ' + how + ', ' + newVals + ', ' + oldVals);
		 * });
		 * 
		 * attrList.attr(['Adam', 'Ben'], true);         // 0, set, Adam, Alexis
		 *                                               // 1, set, Ben, Bill
		 * replaceList.replace(['Adam', 'Ben']);         // 0, remove, undefined, ['Alexis', 'Bill']
		 *                                               // 0, add, undefined, ['Adam', 'Ben']
		 * 
		 * attrList.attr(['Amber'], true);               // 0, set, Amber, Adam
		 *                                               // 1, remove, undefined, Ben
		 * replaceList.replace(['Amber']);               // 0, remove, undefined, ['Adam', 'Ben']
		 *                                               // 0, add, Amber, ['Adam', 'Ben']
		 * 
		 * attrList.attr(['Alice', 'Bob', 'Eve'], true); // 0, set, Alice, Amber
		 *                                               // 1, add, ['Bob', 'Eve'], undefined
		 * replaceList.replace(['Alice', 'Bob', 'Eve']); // 0, remove, undefined, Amber
		 *                                               // 0, add, ['Alice', 'Bob', 'Eve'], Amber
		 * @codeend
		 */
		replace : function(newList) {
			if(can.isDeferred(newList)) {
				newList.then(can.proxy(this.replace, this));
			} else {
				this.splice.apply(this, [0, this.length].concat(can.makeArray(newList || [])));
			}

			return this;
		}
	});
	can.List = Map.List = list;
	return can.List;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view',["can/util/library"], function( can ) {
	// ## view.js
	// `can.view`  
	// _Templating abstraction._

	var isFunction = can.isFunction,
		makeArray = can.makeArray,
		// Used for hookup `id`s.
		hookupId = 1,
	/**
	 * @add can.view
	 */
	$view = can.view = can.template = function(view, data, helpers, callback){
		// If helpers is a `function`, it is actually a callback.
		if ( isFunction( helpers )) {
			callback = helpers;
			helpers = undefined;
		}

		var pipe = function(result){
				return $view.frag(result);
			},
			// In case we got a callback, we need to convert the can.view.render
			// result to a document fragment
			wrapCallback = isFunction(callback) ? function(frag) {
				callback(pipe(frag));
			} : null,
			// Get the result, if a renderer function is passed in, then we just use that to render the data
			result = isFunction(view) ? view(data, helpers, wrapCallback) : $view.render(view, data, helpers, wrapCallback),
			deferred = can.Deferred();

		if(isFunction(result))  {
			return result;
		}

		if(can.isDeferred(result)){
			result.then(function(result, data) {
				deferred.resolve.call(deferred, pipe(result), data);
			}, function() {
				deferred.fail.apply(deferred, arguments);
			});
			return deferred;
		}
		
		// Convert it into a dom frag.
		return pipe(result);
	};

	can.extend( $view, {
		// creates a frag and hooks it up all at once
		/**
		 * @function can.view.frag frag
		 * @parent can.view.static
		 */
		frag: function(result, parentNode ){
			return $view.hookup( $view.fragment(result), parentNode );
		},

		// simply creates a frag
		// this is used internally to create a frag
		// insert it
		// then hook it up
		fragment: function(result){
			var frag = can.buildFragment(result,document.body);
			// If we have an empty frag...
			if(!frag.childNodes.length) { 
				frag.appendChild(document.createTextNode(''));
			}
			return frag;
		},

		// Convert a path like string into something that's ok for an `element` ID.
		toId : function( src ) {
			return can.map(src.toString().split(/\/|\./g), function( part ) {
				// Dont include empty strings in toId functions
				if ( part ) {
					return part;
				}
			}).join("_");
		},
		
		hookup: function(fragment, parentNode ){
			var hookupEls = [],
				id, 
				func;
			
			// Get all `childNodes`.
			can.each(fragment.childNodes ? can.makeArray(fragment.childNodes) : fragment, function(node){
				if(node.nodeType === 1){
					hookupEls.push(node);
					hookupEls.push.apply(hookupEls, can.makeArray( node.getElementsByTagName('*')));
				}
			});


			// Filter by `data-view-id` attribute.
			can.each( hookupEls, function( el ) {
				if ( el.getAttribute && (id = el.getAttribute('data-view-id')) && (func = $view.hookups[id]) ) {
					func(el, parentNode, id);
					delete $view.hookups[id];
					el.removeAttribute('data-view-id');
				}
			});

			return fragment;
		},

		/**
		 * @function can.view.ejs ejs
		 * @parent can.view.static
		 *
		 * @signature `can.view.ejs( [id,] template )`
		 * 
		 * Register an EJS template string and create a renderer function.
		 * 
		 *     var renderer = can.view.ejs("<h1><%= message %></h1>");
		 *     renderer({message: "Hello"}) //-> docFrag[ <h1>Hello</h1> ]
		 * 
		 * @param {String} [id] An optional ID to register the template.
		 * 
		 *     can.view.ejs("greet","<h1><%= message %></h1>");
		 *     can.view("greet",{message: "Hello"}) //-> docFrag[<h1>Hello</h1>]
		 * 
		 * @param {String} template An EJS template in string form.
		 * @return {can.view.renderer} A renderer function that takes data and helpers.
		 * 
		 *
		 * @body
		 * `can.view.ejs([id,] template)` registers an EJS template string
		 * for a given id programatically. The following
		 * registers `myViewEJS` and renders it into a documentFragment.
		 *
		 *      can.view.ejs('myViewEJS', '<h2><%= message %></h2>');
		 *
		 *      var frag = can.view('myViewEJS', {
		 *          message : 'Hello there!'
		 *      });
		 *
		 *      frag // -> <h2>Hello there!</h2>
		 *
		 * To convert the template into a render function, just pass
		 * the template. Call the render function with the data
		 * you want to pass to the template and it returns the
		 * documentFragment.
		 *
		 *      var renderer = can.view.ejs('<div><%= message %></div>');
		 *      renderer({
		 *          message : 'EJS'
		 *      }); // -> <div>EJS</div>
		 */
		// auj
		/**
		 * @function can.view.mustache mustache
		 * @parent can.view.static
		 * 
		 * @signature `can.view.mustache( [id,] template )`
		 * 
		 * Register a Mustache template string and create a renderer function.
		 * 
		 *     var renderer = can.view.mustache("<h1>{{message}}</h1>");
		 *     renderer({message: "Hello"}) //-> docFrag[ <h1>Hello</h1> ]
		 * 
		 * @param {String} [id] An optional ID for the template.
		 * 
		 *     can.view.ejs("greet","<h1>{{message}}</h1>");
		 *     can.view("greet",{message: "Hello"}) //-> docFrag[<h1>Hello</h1>]
		 * 
		 * @param {String} template A Mustache template in string form.
		 *
		 * @return {can.view.renderer} A renderer function that takes data and helpers.
		 *
		 * @body
		 * 
		 * `can.view.mustache([id,] template)` registers an Mustache template string 
		 * for a given id programatically. The following
		 * registers `myStache` and renders it into a documentFragment.
		 *
		 *      can.viewmustache('myStache', '<h2>{{message}}</h2>');
		 * 
		 *      var frag = can.view('myStache', {
		 *          message : 'Hello there!'
		 *      });
		 * 
		 *      frag // -> <h2>Hello there!</h2>
		 *
		 * To convert the template into a render function, just pass 
		 * the template. Call the render function with the data
		 * you want to pass to the template and it returns the 
		 * documentFragment.
		 *
		 *      var renderer = can.view.mustache('<div>{{message}}</div>');
		 *      renderer({
		 *          message : 'Mustache'
		 *      }); // -> <div>Mustache</div>
		 */
		// heir
		/**
		 * @property hookups
		 * @hide
		 * A list of pending 'hookups'
		 */
		hookups: {},

		/**
		 * @description Create a hookup to insert into templates.
		 * @function can.view.hook hook
		 * @parent can.view.static
		 * @signature `can.view.hook(callback)`
		 * @param {Function} callback A callback function to be called with the element.
		 *
		 * @body
		 * Registers a hookup function that can be called back after the html is 
		 * put on the page.  Typically this is handled by the template engine.  Currently
		 * only EJS supports this functionality.
		 * 
		 *     var id = can.view.hook(function(el){
		 *            //do something with el
		 *         }),
		 *         html = "<div data-view-id='"+id+"'>"
		 *     $('.foo').html(html);
		 */
		hook: function( cb ) {
			$view.hookups[++hookupId] = cb;
			return " data-view-id='"+hookupId+"'";
		},

		/**
		 * @hide
		 * @property {Object} can.view.cached view
		 * @parent can.view
		 * Cached are put in this object
		 */
		cached: {},

		cachedRenderers: {},

		/**
		 * @property {Boolean} can.view.cache cache
		 * @parent can.view.static
		 * By default, views are cached on the client.  If you'd like the
		 * the views to reload from the server, you can set the `cache` attribute to `false`.
		 *
		 * 		//- Forces loads from server
		 * 		can.view.cache = false; 
		 *
		 */
		cache: true,

		/**
		 * @function can.view.register register
		 * @parent can.view.static
		 * @description Register a templating language.
		 * @signature `can.view.register(info)`
		 * @param {{}} info Information about the templating language.
		 * @option {String} plugin The location of the templating language's plugin.
		 * @option {String} suffix Files with this suffix will use this templating language's plugin by default.
		 * @option {function} renderer A function that returns a function that, given data, will render the template with that data.
		 * The __renderer__ function receives the id of the template and the text of the template.
		 * @option {function} script A function that returns the string form of the processed template.
		 *
		 * @body
		 * Registers a template engine to be used with 
		 * view helpers and compression.  
		 * 
		 * ## Example
		 * 
		 * @codestart
		 * can.View.register({
		 * 	suffix : "tmpl",
		 *  plugin : "jquery/view/tmpl",
		 * 	renderer: function( id, text ) {
		 * 		return function(data){
		 * 			return jQuery.render( text, data );
		 * 		}
		 * 	},
		 * 	script: function( id, text ) {
		 * 		var tmpl = can.tmpl(text).toString();
		 * 		return "function(data){return ("+
		 * 		  	tmpl+
		 * 			").call(jQuery, jQuery, data); }";
		 * 	}
		 * })
		 * @codeend
		 */
		register: function( info ) {
			this.types["." + info.suffix] = info;
		},

		types: {},

		/**
		 * @property {String} can.view.ext ext
		 * @parent can.view.static
		 * The default suffix to use if none is provided in the view's url.  
		 * This is set to `.ejs` by default.
		 *
		 * 		// Changes view ext to 'txt'
		 * 		can.view.ext = 'txt';
		 *
		 */
		ext: ".ejs",

		/**
		 * Returns the text that 
		 * @hide 
		 * @param {Object} type
		 * @param {Object} id
		 * @param {Object} src
		 */
		registerScript: function() {},

		/**
		 * @hide
		 * Called by a production script to pre-load a renderer function
		 * into the view cache.
		 * @param {String} id
		 * @param {Function} renderer
		 */
		preload: function( ) {},

		/**
		 * @function can.view.render render
		 * @parent can.view.static
		 * @description Render a template.
		 * @signature `can.view.render(template[, callback])`
		 * @param {String|Object} view The path of the view template or a view object.
		 * @param {Function} [callback] A function executed after the template has been processed.
		 * @return {Function|can.Deferred} A renderer function to be called with data and helpers
		 * or a Deferred that resolves to a renderer function.
		 *
		 * @signature `can.view.render(template, data[, [helpers,] callback])`
		 * @param {String|Object} view The path of the view template or a view object.
		 * @param {Object} [data] The data to populate the template with.
		 * @param {Object.<String, function>} [helpers] Helper methods referenced in the template.
		 * @param {Function} [callback] A function executed after the template has been processed.
		 * @return {String|can.Deferred} The template with interpolated data in string form
		 * or a Deferred that resolves to the template with interpolated data.
		 *
		 * @body
		 * `can.view.render(view, [data], [helpers], callback)` returns the rendered markup produced by the corresponding template
		 * engine as String. If you pass a deferred object in as data, render returns
		 * a deferred resolving to the rendered markup.
		 * 
		 * `can.view.render` is commonly used for sub-templates.
		 * 
		 * ## Example
		 * 
		 * _welcome.ejs_ looks like:
		 * 
		 *     <h1>Hello <%= hello %></h1>
		 * 
		 * Render it to a string like:
		 * 
		 *     can.view.render("welcome.ejs",{hello: "world"})
		 *       //-> <h1>Hello world</h1>
		 * 
		 * ## Use as a Subtemplate
		 * 
		 * If you have a template like:
		 * 
		 *     <ul>
		 *       <% list(items, function(item){ %>
		 *         <%== can.view.render("item.ejs",item) %>
		 *       <% }) %>
		 *     </ul>
		 *
		 * ## Using renderer functions
		 *
		 * If you only pass the view path, `can.view will return a renderer function that can be called with
		 * the data to render:
		 *
		 *     var renderer = can.view.render("welcome.ejs");
		 *     // Do some more things
		 *     renderer({hello: "world"}) // -> Document Fragment
		 * 
		 */
		render: function( view, data, helpers, callback ) {
			// If helpers is a `function`, it is actually a callback.
			if ( isFunction( helpers )) {
				callback = helpers;
				helpers = undefined;
			}

			// See if we got passed any deferreds.
			var deferreds = getDeferreds(data);

			if ( deferreds.length ) { // Does data contain any deferreds?
				// The deferred that resolves into the rendered content...
				var deferred = new can.Deferred(),
					dataCopy = can.extend({}, data);
	
				// Add the view request to the list of deferreds.
				deferreds.push(get(view, true))
	
				// Wait for the view and all deferreds to finish...
				can.when.apply(can, deferreds).then(function( resolved ) {
					// Get all the resolved deferreds.
					var objs = makeArray(arguments),
						// Renderer is the last index of the data.
						renderer = objs.pop(),
						// The result of the template rendering with data.
						result; 
	
					// Make data look like the resolved deferreds.
					if ( can.isDeferred(data) ) {
						dataCopy = usefulPart(resolved);
					}
					else {
						// Go through each prop in data again and
						// replace the defferreds with what they resolved to.
						for ( var prop in data ) {
							if ( can.isDeferred(data[prop]) ) {
								dataCopy[prop] = usefulPart(objs.shift());
							}
						}
					}

					// Get the rendered result.
					result = renderer(dataCopy, helpers);
	
					// Resolve with the rendered view.
					deferred.resolve(result, dataCopy);

					// If there's a `callback`, call it back with the result.
					callback && callback(result, dataCopy);
				}, function() {
					deferred.reject.apply(deferred, arguments)
				});
				// Return the deferred...
				return deferred;
			}
			else {
				// get is called async but in 
				// ff will be async so we need to temporarily reset
				if(can.__reading){
					var reading = can.__reading;
					can.__reading = null;
				}
				
				// No deferreds! Render this bad boy.
				var response, 
					// If there's a `callback` function
					async = isFunction( callback ),
					// Get the `view` type
					deferred = get(view, async);
					
				if(can.Map && can.__reading){
					can.__reading = reading;
				}
				
				// If we are `async`...
				if ( async ) {
					// Return the deferred
					response = deferred;
					// And fire callback with the rendered result.
					deferred.then(function( renderer ) {
						callback(data ? renderer(data, helpers) : renderer);
					})
				} else {
					// if the deferred is resolved, call the cached renderer instead
					// this is because it's possible, with recursive deferreds to
					// need to render a view while its deferred is _resolving_.  A _resolving_ deferred
					// is a deferred that was just resolved and is calling back it's success callbacks.
					// If a new success handler is called while resoliving, it does not get fired by
					// jQuery's deferred system.  So instead of adding a new callback
					// we use the cached renderer.
					// We also add __view_id on the deferred so we can look up it's cached renderer.
					// In the future, we might simply store either a deferred or the cached result.
					if(deferred.state() === "resolved" && deferred.__view_id  ){
						var currentRenderer = $view.cachedRenderers[ deferred.__view_id ];
						return data ? currentRenderer(data, helpers) : currentRenderer;
					} else {
						// Otherwise, the deferred is complete, so
						// set response to the result of the rendering.
						deferred.then(function( renderer ) {
							response = data ? renderer(data, helpers) : renderer;
						});
					}
				}

				return response;
			}
		},

		/**
		 * @hide
		 * Registers a view with `cached` object.  This is used
		 * internally by this class and Mustache to hookup views.
		 * @param  {String} id
		 * @param  {String} text
		 * @param  {String} type
		 * @param  {can.Deferred} def
		 */
		registerView: function( id, text, type, def ) {
			// Get the renderer function.
			var func = (type || $view.types[$view.ext]).renderer(id, text);
			def = def || new can.Deferred();
			
			// Cache if we are caching.
			if ( $view.cache ) {
				$view.cached[id] = def;
				def.__view_id = id;
				$view.cachedRenderers[id] = func;
			}

			// Return the objects for the response's `dataTypes`
			// (in this case view).
			return def.resolve(func);
		}
	});

	// Makes sure there's a template, if not, have `steal` provide a warning.
	var	checkText = function( text, url ) {
			if ( ! text.length ) {
			
				throw "can.view: No template or empty template:" + url;
			}
		},
		// `Returns a `view` renderer deferred.  
		// `url` - The url to the template.  
		// `async` - If the ajax request should be asynchronous.  
		// Returns a deferred.
		get = function( obj, async ) {
			var url = typeof obj === 'string' ? obj : obj.url,
				suffix = obj.engine || url.match(/\.[\w\d]+$/),
				type,
				// If we are reading a script element for the content of the template,
				// `el` will be set to that script element.
				el,
				// A unique identifier for the view (used for caching).
				// This is typically derived from the element id or
				// the url for the template.
				id,
				// The ajax request used to retrieve the template content.
				jqXHR;

			//If the url has a #, we assume we want to use an inline template
			//from a script element and not current page's HTML
			if( url.match(/^#/) ) {
				url = url.substr(1);
			}
			// If we have an inline template, derive the suffix from the `text/???` part.
			// This only supports `<script>` tags.
			if ( el = document.getElementById(url) ) {
				suffix = "."+el.type.match(/\/(x\-)?(.+)/)[2];
			}
	
			// If there is no suffix, add one.
			if (!suffix && !$view.cached[url] ) {
				url += ( suffix = $view.ext );
			}

			if ( can.isArray( suffix )) {
				suffix = suffix[0]
			}
	
			// Convert to a unique and valid id.
			id = $view.toId(url);
	
			// If an absolute path, use `steal` to get it.
			// You should only be using `//` if you are using `steal`.
			if ( url.match(/^\/\//) ) {
				var sub = url.substr(2);
				url = ! window.steal ? 
					sub :
					steal.config().root.mapJoin(""+steal.id(sub));
			}
	
			// Set the template engine type.
			type = $view.types[suffix];
	
			// If it is cached, 
			if ( $view.cached[id] ) {
				// Return the cached deferred renderer.
				return $view.cached[id];
			
			// Otherwise if we are getting this from a `<script>` element.
			} else if ( el ) {
				// Resolve immediately with the element's `innerHTML`.
				return $view.registerView(id, el.innerHTML, type);
			} else {
				// Make an ajax request for text.
				var d = new can.Deferred();
				can.ajax({
					async: async,
					url: url,
					dataType: "text",
					error: function(jqXHR) {
						checkText("", url);
						d.reject(jqXHR);
					},
					success: function( text ) {
						// Make sure we got some text back.
						checkText(text, url);
						$view.registerView(id, text, type, d)
					}
				});
				return d;
			}
		},
		// Gets an `array` of deferreds from an `object`.
		// This only goes one level deep.
		getDeferreds = function( data ) {
			var deferreds = [];

			// pull out deferreds
			if ( can.isDeferred(data) ) {
				return [data]
			} else {
				for ( var prop in data ) {
					if ( can.isDeferred(data[prop]) ) {
						deferreds.push(data[prop]);
					}
				}
			}
			return deferreds;
		},
		// Gets the useful part of a resolved deferred.
		// This is for `model`s and `can.ajax` that resolve to an `array`.
		usefulPart = function( resolved ) {
			return can.isArray(resolved) && resolved[1] === 'success' ? resolved[0] : resolved
		};

	//!steal-pluginify-remove-start
	if ( window.steal ) {
		steal.type("view js", function( options, success, error ) {
			var type = $view.types["." + options.type],
				id = $view.toId(options.id);
			/**
			 * @hide
			 * should return something like steal("dependencies",function(EJS){
			 * 	 return can.view.preload("ID", options.text)
			 * })
			 */
			options.text = "steal('" + (type.plugin || "can/view/" + options.type) + "',function(can){return " + "can.view.preload('" + id + "'," + options.text + ");\n})";
			success();
		})
	}
	//!steal-pluginify-remove-end

	can.extend($view, {
		register: function( info ) {
			this.types["." + info.suffix] = info;

			//!steal-pluginify-remove-start
			if ( window.steal ) {
				steal.type(info.suffix + " view js", function( options, success, error ) {
					var type = $view.types["." + options.type],
						id = $view.toId(options.id+'');

					options.text = type.script(id, options.text)
					success();
				})
			};
			//!steal-pluginify-remove-end
			
			$view[info.suffix] = function(id, text){
				if(!text) {
					// Return a nameless renderer
					var renderer = function() {
						return $view.frag(renderer.render.apply(this, arguments));
					}
					renderer.render = function() {
						var renderer = info.renderer(null, id);
						return renderer.apply(renderer, arguments);
					}
					return renderer;
				}

				return $view.preload(id, info.renderer(id, text));
			}
		},
		registerScript: function( type, id, src ) {
			return "can.view.preload('" + id + "'," + $view.types["." + type].script(id, src) + ");";
		},
		preload: function( id, renderer ) {
			var def = $view.cached[id] = new can.Deferred().resolve(function( data, helpers ) {
				return renderer.call(data, data, helpers);
			});
			function frag(){
				return $view.frag(renderer.apply(this,arguments));
			}
			// expose the renderer for mustache
			frag.render = renderer;

			// set cache references (otherwise preloaded recursive views won't recurse properly)
			def.__view_id = id;
			$view.cachedRenderers[id] = renderer;

			return frag;
		}

	});

	return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/compute',["can/util/library", "can/util/bind", "can/util/batch"], function(can, bind) {
	
	var names = ["__reading","__clearReading","__setReading"],
		setup = function(observed){
			var old = {};
			for(var i =0; i < names.length; i++){
				old[names[i]] = can[names[i]]
			}
			can.__reading = function(obj, attr){
				// Add the observe and attr that was read
				// to `observed`
				observed.push({
					obj: obj,
					attr: attr+""
				});
			};
			can.__clearReading = function(){
				return observed.splice(0, observed.length);
			}
			can.__setReading = function(o){
				[].splice.apply(observed, [0, observed.length].concat(o))
			}
			return old;
		},
		// empty default function 
		k = function(){};
		
	// returns the
    // - observes and attr methods are called by func
	// - the value returned by func
	// ex: `{value: 100, observed: [{obs: o, attr: "completed"}]}`
	var getValueAndObserved = function(func, self){
		
		var observed = [],
			old = setup(observed),
			// Call the "wrapping" function to get the value. `observed`
			// will have the observe/attribute pairs that were read.
			value = func.call(self);

		// Set back so we are no longer reading.
		can.simpleExtend(can,old);
		
		return {
			value : value,
			observed : observed
		};
	},
		// Calls `callback(newVal, oldVal)` everytime an observed property
		// called within `getterSetter` is changed and creates a new result of `getterSetter`.
		// Also returns an object that can teardown all event handlers.
		computeBinder = function(getterSetter, context, callback, computeState){
			// track what we are observing
			var observing = {},
				// a flag indicating if this observe/attr pair is already bound
				matched = true,
				// the data to return 
				data = {
					// we will maintain the value while live-binding is taking place
					value : undefined,
					// a teardown method that stops listening
					teardown: function(){
						for ( var name in observing ) {
							var ob = observing[name];
							ob.observe.obj.unbind(ob.observe.attr, onchanged);
							delete observing[name];
						}
					}
				},
				batchNum;
			
			// when a property value is changed
			var onchanged = function(ev){
				// If the compute is no longer bound (because the same change event led to an unbind)
				// then do not call getValueAndBind, or we will leak bindings.
				if ( computeState && !computeState.bound ) {
					return;
				}
				if(ev.batchNum === undefined || ev.batchNum !== batchNum) {
					// store the old value
					var oldValue = data.value,
						// get the new value
						newvalue = getValueAndBind();

					// update the value reference (in case someone reads)
					data.value = newvalue;
					// if a change happened
					if ( newvalue !== oldValue ) {
						callback(newvalue, oldValue);
					}
					batchNum = batchNum = ev.batchNum;
				}
				
				
			};
			
			// gets the value returned by `getterSetter` and also binds to any attributes
			// read by the call
			var getValueAndBind = function(){
				var info = getValueAndObserved( getterSetter, context ),
					newObserveSet = info.observed;
				
				var value = info.value,
					ob;
					matched = !matched;
				
				// go through every attribute read by this observe
				for ( var i = 0, len = newObserveSet.length; i < len; i++ ) {
					ob = newObserveSet[i];
					// if the observe/attribute pair is being observed
					if(observing[ob.obj._cid+"|"+ob.attr]){
						// mark at as observed
						observing[ob.obj._cid+"|"+ob.attr].matched = matched;
					} else {
						// otherwise, set the observe/attribute on oldObserved, marking it as being observed
						observing[ob.obj._cid+"|"+ob.attr] = {
							matched: matched,
							observe: ob
						};
						ob.obj.bind(ob.attr, onchanged);
					}
				}
				
				// Iterate through oldObserved, looking for observe/attributes
				// that are no longer being bound and unbind them
				for ( var name in observing ) {
					var ob = observing[name];
					if(ob.matched !== matched){
						ob.observe.obj.unbind(ob.observe.attr, onchanged);
						delete observing[name];
					}
				}
				return value;
			};
			// set the initial value
			data.value = getValueAndBind();

			data.isListening = ! can.isEmptyObject(observing);
			return data;
		}
	
	// if no one is listening ... we can not calculate every time

	can.compute = function(getterSetter, context, eventName){
		if(getterSetter && getterSetter.isComputed){
			return getterSetter;
		}
		// stores the result of computeBinder
		var computedData,
			// how many listeners to this this compute
			bindings = 0,
			// the computed object
			computed,
			// an object that keeps track if the computed is bound
			// onchanged needs to know this. It's possible a change happens and results in
			// something that unbinds the compute, it needs to not to try to recalculate who it
			// is listening to
			computeState = { 
				bound: false,
				// true if this compute is calculated from other computes and observes
				hasDependencies: false
			},
			// The following functions are overwritten depending on how compute() is called
			// a method to setup listening
			on = k,
			// a method to teardown listening
			off = k,
			// the current cached value (only valid if bound = true)
			value,
			// how to read the value
			get = function(){
				return value
			},
			// sets the value
			set = function(newVal){
				value = newVal;
			},
			// this compute can be a dependency of other computes
			canReadForChangeEvent = true,
			// save for clone
			args = can.makeArray(arguments),
			updater= function(newValue, oldValue){
				value = newValue;
				// might need a way to look up new and oldVal
				can.batch.trigger(computed, "change",[newValue, oldValue])
			},
			// the form of the arguments
			form;

		computed = function(newVal){
			// setting ...
			if(arguments.length){
				// save a reference to the old value
				var old = value;

				// setter may return a value if 
				// setter is for a value maintained exclusively by this compute
				var setVal = set.call(context,newVal, old);

				// if this has dependencies return the current value
				if(computed.hasDependencies){
					return get.call(context);
				}

				if(setVal === undefined) {
					// it's possible, like with the DOM, setting does not
					// fire a change event, so we must read
					value = get.call(context);
				} else {
					value = setVal;
				}
				// fire the change
				if( old !== value){
					can.batch.trigger(computed, "change",[value, old] );
				}
				return value;
			} else {
				// Another compute wants to bind to this compute
				if( can.__reading && canReadForChangeEvent ) {
					// Tell the compute to listen to change on this computed
					can.__reading(computed,'change');
					// We are going to bind on this compute.
					// If we are not bound, we should bind so that
					// we don't have to re-read to get the value of this compute.
					!computeState.bound && can.compute.temporarilyBind(computed)
				}
				// if we are bound, use the cached value
				if( computeState.bound ) {
					return value;
				} else {
					return get.call(context);
				}
			}
		}
		if(typeof getterSetter === "function"){
			set = getterSetter;
			get = getterSetter;
			canReadForChangeEvent = eventName === false ? false : true;
			computed.hasDependencies = false;
			on = function(update){
				computedData = computeBinder(getterSetter, context || this, update, computeState);
				computed.hasDependencies = computedData.isListening
				value = computedData.value;
			}
			off = function(){
				computedData && computedData.teardown();
			}
		} else if(context) {
			
			if(typeof context == "string"){
				// `can.compute(obj, "propertyName", [eventName])`
				
				var propertyName = context,
					isObserve = getterSetter instanceof can.Map;
				if(isObserve){
					computed.hasDependencies = true;
				}
				get = function(){
					if(isObserve){
						return getterSetter.attr(propertyName);
					} else {
						return getterSetter[propertyName];
					}
				}
				set = function(newValue){
					if(isObserve){
						getterSetter.attr(propertyName, newValue)
					} else {
						getterSetter[propertyName] = newValue;
					}
				}
				var handler;
				on = function(update){
					handler = function(){
						update(get(), value)
					};
					can.bind.call(getterSetter, eventName || propertyName,handler)
					
					// use getValueAndObserved because
					// we should not be indicating that some parent
					// reads this property if it happens to be binding on it
					value = getValueAndObserved(get).value
				}
				off = function(){
					can.unbind.call(getterSetter, eventName || propertyName,handler)
				}

			} else {
				// `can.compute(initialValue, setter)`
				if(typeof context === "function"){
					value = getterSetter;
					set = context;
					context = eventName;
					form = "setter";
				} else {
					// `can.compute(initialValue,{get:, set:, on:, off:})`
					value = getterSetter;
					var options = context;
					get = options.get || get;
					set = options.set ||set;
					on = options.on || on;
					off = options.off || off;
				}

			}


			

		} else {
			// `can.compute(5)`
			value = getterSetter;
		}
		
		
		can.cid(computed,"compute")


		return can.simpleExtend(computed,{
			/**
			 * @property {Boolean} can.computed.isComputed compute.isComputed
			 * @parent can.compute
			 * Whether the value of the compute has been computed yet.
			 */
			isComputed: true,
			_bindsetup: function(){
				computeState.bound = true;
				// setup live-binding
				// while binding, this does not count as a read
				var oldReading = can.__reading;
				delete can.__reading;
				on.call(this, updater);
				can.__reading = oldReading;
			},
			_bindteardown: function(){
				off.call(this,updater)
				computeState.bound = false;
			},
			/**
			 * @function can.computed.bind compute.bind
			 * @parent can.compute
			 * @description Bind an event handler to a compute.
			 * @signature `compute.bind(eventType, handler)`
			 * @param {String} eventType The event to bind this handler to.
			 * The only event type that computes emit is _change_.
			 * @param {function({Object},{*},{*})} handler The handler to call when the event happens.
			 * The handler should have three parameters:
			 *
			 * - _event_ is the event object.
			 * - _newVal_ is the newly-computed value of the compute.
			 * - _oldVal_ is the value of the compute before it changed.
			 *
			 * `bind` lets you listen to a compute to know when it changes. It works just like
			 * can.Map's `[can.Map.prototype.bind bind]`:
			 @codestart
			 * var tally = can.compute(0);
			 * tally.bind('change', function(ev, newVal, oldVal) {
			 *     console.log('The tally is now at ' + newVal + '.');
			 * });
			 *
			 * tally(tally() + 5); // The log reads:
			 *                     // 'The tally is now at 5.'
			 * @codeend
			 */
			bind: can.bindAndSetup,
			/**
			 * @function computed.unbind compute.unbind
			 * @parent can.compute
			 * @description Unbind an event handler from a compute.
			 * @signature `compute.unbind(eventType[, handler])`
			 * @param {String} eventType The type of event to unbind.
			 * The only event type available for computes is _change_.
			 * @param {function} [handler] If given, the handler to unbind.
			 * If _handler_ is not supplied, all handlers bound to _eventType_
			 * will be removed.
			 */
			unbind: can.unbindAndTeardown,
			clone: function(context){
				if(context){
					if(form == "setter"){
						args[2] = context
					} else {
						args[1] = context
					}
				}
				return can.compute.apply(can,args);
			}
		});
	};
	
	// a list of temporarily bound computes
	var computes,
		unbindComputes = function(){
			for( var i =0, len = computes.length; i < len; i++ ) {
				computes[i].unbind("change",k)
			}
			computes = null;
		}
	
	// Binds computes for a moment to retain their value and prevent caching
	can.compute.temporarilyBind = function(compute){
		compute.bind("change",k)
		if(!computes){
			computes = [];
			setTimeout(unbindComputes,10)
		} 
		computes.push(compute)
	};
	
	can.compute.binder = computeBinder;
	can.compute.truthy = function(compute){
		return can.compute(function(){
			var res = compute();
			if(typeof res === "function"){
				res = res()
			}
			return !!res;
		})
	}
	return can.compute;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/scope',["can/util/library", "can/construct", "can/map", "can/list", "can/view", "can/compute"], function(can){
	
	
	
	var isObserve = function(obj) {
		return obj instanceof can.Map || (obj && obj.__get);
	},
		getProp = function(obj, prop){
			var val = obj[prop];
	
			if(typeof val !== "function" && obj.__get) {
				return obj.__get(prop);
			}
			else {
				return val;
			}
		},
		escapeReg = /(\\)?\./g,
		escapeDotReg = /\\\./g,
		getNames = function(attr){
			var names = [], last = 0;
			attr.replace(escapeReg, function($0, $1, index) {
				if (!$1) {
					names.push(attr.slice(last, index).replace(escapeDotReg,'.'));
					last = index + $0.length;
				}
			});
			names.push(attr.slice(last).replace(escapeDotReg,'.'));
			return names;
		}
	

	/**
	 * @add can.view.Scope
	 */
	var Scope = can.Construct.extend(
		
	/**
	 * @static
	 */	
	{
		// reads properties from a parent.  A much more complex version of getObject.
		/**
		 * @function can.view.Scope.read read
		 * @parent can.view.Scope.static
		 * 
		 * @signature `Scope.read(parent, reads, options)`
		 * 
		 * Read properties from an object.
		 * 
		 * @param {*} parent A parent object to read properties from.
		 * @param {Array<String>} reads An array of properties to read.
		 * @param {can.view.Scope.readOptions} options Configures
		 * how to read properties and values and register callbacks
		 * 
		 * @return {{value: *, parent: *}} Returns an object that
		 * provides the value and parent object.
		 * 
		 * @option {*} value The value found by reading `reads` properties.  If 
		 * no value was found, value will be undefined.
		 * 
		 * @option {*} parent The most immediate parent object of the value specified by `key`.
		 * 
		 * @body
		 *  
		 * 
		 */
		read: function(parent, reads, options){
			options = options || {};
			// `cur` is the current value.
			var cur = parent,
				type,
				// `prev` is the object we are reading from.
				prev,
				// `foundObs` did we find an observable.
				foundObs;
			for( var i = 0, readLength = reads.length ; i < readLength; i++ ) {
				// Update what we are reading from.
				prev = cur;
				// Read from the compute. We can't read a property yet.
				if( prev && prev.isComputed ) {
					options.foundObservable && options.foundObservable(prev, i)
					prev = prev()
				}
				// Look to read a property from something.
				if( isObserve(prev) ) {
					!foundObs && options.foundObservable && options.foundObservable(prev, i);
					foundObs = 1;
					// is it a method on the prototype?
					if(typeof prev[reads[i]] === "function" && prev.constructor.prototype[reads[i]] === prev[reads[i]] ){
						// call that method
						if(options.returnObserveMethods){
							cur = cur[reads[i]]
						} else {
							cur = prev[ reads[i] ].apply(prev, options.args ||[])
						}
						
					} else {
						// use attr to get that value
						cur = cur.attr( reads[i] );
					}
					
				} else {
					// just do the dot operator
					cur = prev[reads[i]]
				}
				// If it's a compute, get the compute's value
				// unless we are at the end of the 
				if( cur && cur.isComputed && (!options.isArgument && i < readLength - 1) ) {
					!foundObs && options.foundObservable && options.foundObservable(prev, i+1)
					cur = cur()
				}
				
				type = typeof cur;
				// if there are properties left to read, and we don't have an object, early exit
				if( i < reads.length -1 && ( cur == null || (type != "function" && type != "object" ) ) ) {
					options.earlyExit && options.earlyExit(prev, i, cur);
					// return undefined so we know this isn't the right value
					return {value: undefined, parent: prev};
				}
			}
			// if we don't have a value, exit early.
			if( cur === undefined ){
				options.earlyExit && options.earlyExit(prev, i - 1)
			}
			// handle an ending function
			if(typeof cur === "function"){
				if( options.isArgument ) {
					if( ! cur.isComputed && options.proxyMethods !== false) {
						cur = can.proxy(cur, prev)
					}
				} else {
					
					cur.isComputed && !foundObs && options.foundObservable && options.foundObservable(cur, i)
					
					
					cur = cur.call(prev)
				}
				
			}
			return {value: cur, parent: prev};
		}
	},
	/**
	 * @prototype
	 */
	{
		init: function(context, parent){
			this._context = context;
			this._parent = parent;
		},
		/**
		 * @function can.view.Scope.prototype.attr
		 * 
		 * Reads a value from the current context or parent contexts.
		 * 
		 * @param {can.Mustache.key} key A dot seperated path.  Use `"\."` if you have a 
		 * property name that includes a dot. 
		 * 
		 * @return {*} The found value or undefined if no value is found.
		 * 
		 * @body
		 * 
		 * ## Use
		 * 
		 * `scope.attr(key)` looks up a value in the current scope's 
		 * context, if a value is not found, parent scope's context
		 * will be explored.
		 * 
		 *     var list = [{name: "Justin"},{name: "Brian"}],
		 *     	   justin = list[0];
		 *     	
		 *     var curScope = new can.view.Scope(list).add(justin);
		 *     
		 *     curScope.attr("name") //-> "Justin"
		 *     curScope.attr("length") //-> 2
		 */
		attr: function(key){
			return this.read(key,{isArgument: true, returnObserveMethods:true, proxyMethods: false}).value
		},
		/**
		 * @function can.view.Scope.prototype.add
		 * 
		 * Creates a new scope with its parent set as the current scope.
		 * 
		 * @param {*} context The context of the new scope object. 
		 * 
		 * @return {can.view.Scope}  A scope object.
		 * 
		 * @body
		 * 
		 * ## Use
		 * 
		 * `scope.add(context)` creates a new scope object that
		 * first looks up values in context and then in the 
		 * parent `scope` object.
		 * 
		 *     var list = [{name: "Justin"},{name: "Brian"}],
		 *     	   justin = list[0];
		 *     	
		 *     var curScope = new can.view.Scope(list).add(justin);
		 *     
		 *     curScope.attr("name") //-> "Justin"
		 *     curScope.attr("length") //-> 2
		 */
		add: function(context){
			if(context !== this._context){
				return new this.constructor( context, this );
			} else {
				return this;
			}
		},
		/**
		 * @function can.view.Scope.prototype.computeData
		 * 
		 * @description Provides a compute that represents a 
		 * key's value and other information about where the value was found.
		 * 
		 *
		 * @param {can.Mustache.key} key A dot seperated path.  Use `"\."` if you have a 
		 * property name that includes a dot. 
		 * 
		 * @param {can.view.Scope.readOptions} [options] Options that configure how the `key` gets read.
		 * 
		 * @return {{}} An object with the following values:
		 * 
		 * @option {can.compute} compute A compute that returns the 
		 * value of `key` looked up in the scope's context or parent context. This compute can
		 * also be written to, which will set the observable attribute or compute value at the 
		 * location represented by the key.
		 * 
		 * @option {can.view.Scope} scope The scope the key was found within. The key might have
		 * been found in a parent scope.
		 * 
		 * @option {*} initialData The initial value at the key's location.
		 * 
		 * @body
		 *  
		 * ## Use
		 * 
		 * `scope.computeData(key, options)` is used heavily by [can.Mustache] to get the value of 
		 * a [can.Mustache.key key] value in a template. Configure how it reads values in the
		 * scope and what values it returns with the [can.view.Scope.readOptions options] argument.
		 * 
		 *     var context = new Map({
		 *       name: {first: "Curtis"}  
		 *     })
		 *     var scope = new can.view.Scope(context)
		 *     var computeData = scope.computeData("name.first");
		 * 
		 *     computeData.scope === scope //-> true
		 *     computeData.initialValue    //-> "Curtis"
		 *     computeData.compute()       //-> "Curtis"
		 * 
		 * The `compute` value is writable.  For example:
		 * 
		 *     computeData.compute("Andy")
		 *     context.attr("name.first") //-> "Andy"
		 * 
		 */
		computeData: function(key, options ){
			options = options || {args: []};
			var self = this,
				rootObserve,
				rootReads,
				computeData = {
					compute: can.compute(function(newVal){
						if(arguments.length){
							// check that there's just a compute with nothing from it ...
							if(rootObserve.isComputed && !rootReads.length){
								rootObserve(newVal)
							} else {
								var last = rootReads.length-1;
								Scope.read(rootObserve,rootReads.slice(0, last)).value.attr(rootReads[last], newVal)
							}
						} else {
							if( rootObserve ) {
								return Scope.read(rootObserve, rootReads,  options).value
							}
							// otherwise, go get the value
							var data = self.read(key, options);
							rootObserve = data.rootObserve;
							rootReads = data.reads;
							computeData.scope = data.scope;
							computeData.initialValue = data.value;
							return data.value;
						}
					})
				};
			return computeData
			
		},
		/**
		 * @hide
		 * @function can.view.Scope.prototype.read read
		 * 
		 * Read a key value from the scope and provide useful information
		 * about what was found along the way.
		 * 
		 * @param {can.Mustache.key} attr A dot seperated path.  Use `"\."` if you have a property name that includes a dot. 
		 * @param {can.view.Scope.readOptions} options that configure how this gets read.
		 * 
		 * @return {{}} 
		 * 
		 * @option {Object} parent the value's immediate parent
		 * 
		 * @option {can.Map|can.compute} rootObserve the first observable to read from.
		 * 
		 * @option {Array<String>} reads An array of properties that can be used to read from the rootObserve to get the value.
		 * 
		 * @option {*} value the found value
		 */
		read : function(attr, options){
			
			// check if we should be running this on a parent.
			if( attr.substr(0,3) === "../" ) {
				return this._parent.read( attr.substr(3), options )
			} else if(attr == ".."){
				return {value: this._parent._context}
			} else if(attr == "." || attr == "this"){
				return {value: this._context};
			}
			
			// Split the name up.
			var names = attr.indexOf('\\.') == -1 
				// Reference doesn't contain escaped periods
				? attr.split('.')
				// Reference contains escaped periods (`a.b\c.foo` == `a["b.c"].foo)
				: getNames(attr),
				namesLength = names.length,
				j,
				// The current context (a scope is just data and a parent scope).
				context,
				// The current scope.
				scope = this,
				// While we are looking for a value, we track the most likely place this value will be found.  
				// This is so if there is no me.name.first, we setup a listener on me.name.
				// The most likely canidate is the one with the most "read matches" "lowest" in the
				// context chain.
				// By "read matches", we mean the most number of values along the key.
				// By "lowest" in the context chain, we mean the closest to the current context.
				// We track the starting position of the likely place with `defaultObserve`.
				defaultObserve,
				// Tracks how to read from the defaultObserve.
				defaultReads = [],
				// Tracks the highest found number of "read matches".
				defaultPropertyDepth = -1,
				// `scope.read` is designed to be called within a compute, but
				// for performance reasons only listens to observables within one context.
				// This is to say, if you have me.name in the current context, but me.name.first and
				// we are looking for me.name.first, we don't setup bindings on me.name and me.name.first.
				// To make this happen, we clear readings if they do not find a value.  But,
				// if that path turns out to be the default read, we need to restore them.  This
				// variable remembers those reads so they can be restored.
				defaultComputeReadings,
				// Tracks the default's scope.
				defaultScope,
				// Tracks the first found observe.
				currentObserve,
				// Tracks the reads to get the value for a scope.
				currentReads;
				
			// While there is a scope/context to look in.
			while(scope){
				
				// get the context
				context = scope._context;

				if (context != null) {
					
					
					// Lets try this context
					var data = Scope.read(context, names, can.simpleExtend({
						// Called when an observable is found.
						foundObservable: function(observe, nameIndex){
							// Save the current observe.
							currentObserve = observe;
							currentReads = names.slice(nameIndex);
						},
						// Called when we were unable to find a value.
						earlyExit: function(parentValue, nameIndex){
							// If this has more matching values,
							if(nameIndex > defaultPropertyDepth) {
								// save the state.
								defaultObserve = currentObserve;
								defaultReads = currentReads;
								defaultPropertyDepth = nameIndex;
								defaultScope = scope;
								// Clear and save readings so next attempt does not use these readings
								defaultComputeReadings = can.__clearReading && can.__clearReading();
							}
							
						}
					}, options));
					
					// Found a matched reference.
					if (data.value !== undefined ) {
						return {
							scope: scope,
							rootObserve: currentObserve,
							value: data.value,
							reads: currentReads
						}; 
					} 
				}
				// Prevent prior readings.
				can.__clearReading && can.__clearReading();
				// Move up to the next scope.
				scope = scope._parent;
			}
			// If there was a likely observe.
			if( defaultObserve ) {
				// Restore reading for previous compute
				can.__setReading && can.__setReading(defaultComputeReadings)
				return {
					scope: defaultScope,
					rootObserve: defaultObserve,
					reads: defaultReads,
					value: undefined
				}
			} else {
				// we found nothing and no observable
				return {
					names: names,
					value: undefined
				};
			}
			
		}
	});
	can.view.Scope = Scope;
	return Scope;
	
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/elements',[],function(){
	/**
	 * @property {Object} can.view.elements
	 * @parent can.view
	 * 
	 * Provides helper methods for and information about the behavior
	 * of DOM elements.  
	 */
	var elements = {
		tagToContentPropMap: {
			option: "textContent" in document.createElement("option") ? "textContent" : "innerText",
			textarea: "value"
		},
		/**
		 * @property {Object.<String,(String|Boolean|function)>} can.view.elements.attrMap 
		 * @parent can.view.elements
		 * 
		 * 
		 * A mapping of
		 * special attributes to their JS property. For example:
		 * 
		 *     "class" : "className"
		 * 
		 * means get or set `element.className`. And: 
		 * 
		 *      "checked" : true
		 * 
		 * means set `element.checked = true`.
		 *     
		 * 
		 * If the attribute name is not found, it's assumed to use
		 * `element.getAttribute` and `element.setAttribute`.
		 */
		attrMap: {
			"class" : "className",
			"value": "value",
			"innerText" : "innerText",
			"textContent" : "textContent",
			"checked": true,
			"disabled": true,
			"readonly": true,
			"required": true,
			src: function(el, val){
				if(val == null || val == ""){
					el.removeAttribute("src")
				} else {
					el.setAttribute("src",val)
				}
			}
		},
		// matches the attrName of a regexp
		attrReg: /([^\s]+)[\s]*=[\s]*/,
		// elements whos default value we should set
		defaultValue : ["input","textarea"],
		// a map of parent element to child elements
		/**
		 * @property {Object.<String,String>} can.view.elements.tagMap 
		 * @parent can.view.elements
		 * 
		 * A mapping of parent node names to child node names that can be inserted within
		 * the parent node name.  For example: `table: "tbody"` means that
		 * if you want a placeholder element within a `table`, a `tbody` will be
		 * created.
		 */
		tagMap : {
			"": "span", 
			table: "tbody", 
			tr: "td",
			ol: "li", 
			ul: "li", 
			tbody: "tr",
			thead: "tr",
			tfoot: "tr",
			select: "option",
			optgroup: "option"
		},
		// a tag's parent element
		reverseTagMap: {
			tr:"tbody",
			option:"select",
			td:"tr",
			th:"tr",
			li: "ul"
		},
		// Used to determine the parentNode if el is directly within a documentFragment
		getParentNode: function(el, defaultParentNode){
			return defaultParentNode && el.parentNode.nodeType === 11 ? defaultParentNode : el.parentNode;
		},
		// Set an attribute on an element
		setAttr: function (el, attrName, val) {
			var tagName = el.nodeName.toString().toLowerCase(),
				prop = elements.attrMap[attrName];
			// if this is a special property
			if(typeof prop === "function"){
				prop(el, val)
			} else if(prop === true) {
				el[attrName]  = true;
			} else if (prop) {
				// set the value as true / false
				el[prop] = val;
				if( prop === "value" && can.inArray(tagName, elements.defaultValue) >= 0 ) {
					el.defaultValue = val;
				}
			} else {
				el.setAttribute(attrName, val);
			}
		},
		// Gets the value of an attribute.
		getAttr: function(el, attrName){
			// Default to a blank string for IE7/8
			return (elements.attrMap[attrName] && el[elements.attrMap[attrName]] ?
				el[elements.attrMap[attrName]]:
				el.getAttribute(attrName)) || '';
		},
		// Removes the attribute.
		removeAttr: function(el, attrName){
			var setter = elements.attrMap[attrName];
			if(typeof prop === "function"){
				prop(el, undefined)
			} if( setter === true ) {
				el[attrName] = false;
			} else if(typeof setter === "string"){
				el[setter] = "";
			} else {
				el.removeAttribute(attrName);
			}
		},
		// Gets a "pretty" value for something
		contentText: function(text){
			if ( typeof text == 'string' ) {
				return text;
			}
			// If has no value, return an empty string.
			if ( !text && text !== 0 ) {
				return '';
			}
			return "" + text;
		},
		/**
		 * @function can.view.elements.after 
		 * @parent can.view.elements
		 * 
		 * Inserts newFrag after oldElements.
		 * 
		 * @param {Array.<HTMLElement>} oldElements
		 * @param {DocumentFragment} newFrag
		 */
		after: function(oldElements, newFrag){
			var last = oldElements[oldElements.length - 1];
					
			// Insert it in the `document` or `documentFragment`
			if( last.nextSibling ){
				can.insertBefore(last.parentNode, newFrag, last.nextSibling)
			} else {
				can.appendChild(last.parentNode, newFrag);
			}
		},
		/**
		 * @function can.view.elements.replace 
		 * @parent can.view.elements
		 * 
		 * Replaces `oldElements` with `newFrag`
		 * 
		 * @param {Array.<HTMLElement>} oldElements
		 * @param {DocumentFragment} newFrag
		 */
		replace: function(oldElements,newFrag){
			elements.after(oldElements,newFrag);
			can.remove( can.$(oldElements) );
		}
	};
	// TODO: this doesn't seem to be doing anything
	// feature detect if setAttribute works with styles
	(function(){
		// feature detect if 
		var div = document.createElement('div')
		div.setAttribute("style","width: 5px")
		div.setAttribute("style","width: 10px");
		// make style use cssText
		elements.attrMap.style = function(el, val){
			el.style.cssText = val || ""
		}
	})();
	
	
	return elements;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/scanner',["can/view", "can/view/elements"], function(can, elements){

/**
 * Helper(s)
 */
var newLine = /(\r|\n)+/g,
	// Escapes characters starting with `\`.
	clean = function( content ) {
		return content
			.split('\\').join("\\\\")
			.split("\n").join("\\n")
			.split('"').join('\\"')
			.split("\t").join("\\t");
	},
	// Returns a tagName to use as a temporary placeholder for live content
	// looks forward ... could be slow, but we only do it when necessary
	getTag = function(tagName, tokens, i){
		// if a tagName is provided, use that
		if(tagName){
			return tagName;  
		} else {
			// otherwise go searching for the next two tokens like "<",TAG
			while(i < tokens.length){
				if(tokens[i] == "<" && elements.reverseTagMap[tokens[i+1]]){
					return elements.reverseTagMap[tokens[i+1]];
				}
				i++;
			}
		}
		return '';
	},
	bracketNum = function(content){
		return (--content.split("{").length) - (--content.split("}").length);
	},
	myEval = function( script ) {
		eval(script);
	},
	attrReg = /([^\s]+)[\s]*=[\s]*$/,
	// Commands for caching.
	startTxt = 'var ___v1ew = [];',
	finishTxt = "return ___v1ew.join('')",
	put_cmd = "___v1ew.push(\n",
	insert_cmd = put_cmd,
	// Global controls (used by other functions to know where we are).
	// Are we inside a tag?
	htmlTag = null,
	// Are we within a quote within a tag?
	quote = null,
	// What was the text before the current quote? (used to get the `attr` name)
	beforeQuote = null,
	// Whether a rescan is in progress
	rescan = null,
	getAttrName = function(){
		var matches = beforeQuote.match(attrReg);
		return matches && matches[1];
	},
	// Used to mark where the element is.
	status = function(){
		// `t` - `1`.
		// `h` - `0`.
		// `q` - String `beforeQuote`.
		return quote ? "'"+getAttrName()+"'" : (htmlTag ? 1 : 0);
	},
	// returns the top of a stack
	top = function(stack){
		return stack[stack.length-1]
	},
	// characters that automatically mean a custom element
	automaticCustomElementCharacters = /[-\:]/,
	Scanner;

/**
 * @constructor can.view.Scanner
 * 
 * can.view.Scanner is used to convert a template into a JavaScript function.  That
 * function is called to produce a rendered result as a string. Often
 * the rendered result will include data-view-id attributes on elements that
 * will be processed after the template is used to create a document fragment.
 * 
 * 
 * @param {{text: can.view.Scanner.text, tokens: Array<can.view.Scanner.token>, helpers: Array<can.view.Scanner.helpers>}}
 */
//
/**
 * @typedef {{0:String,}}
 */

can.view.Scanner = Scanner = function( options ) {
	// Set options on self
	can.extend(this, {
  		/**
  		 * @typedef {{start: String, escape: String, scope: String, options: String}}  can.view.Scanner.text
  		 */
		text: {},
		tokens: []
	}, options);
	// make sure it's an empty string if it's not
	this.text.options = this.text.options || ""
	
	// Cache a token lookup
	this.tokenReg = [];
	this.tokenSimple = { "<": "<", ">": ">", '"': '"', "'": "'" };
	this.tokenComplex = [];
	this.tokenMap = {};
	for (var i = 0, token; token = this.tokens[i]; i++) {
		/**
		 * Token data structure (complex token and rescan function are optional):
		 * [
		 *	"token name",
		 *	"simple token or abbreviation",
		 *	/complex token regexp/,
		 *	function(content) {
		 *		// Rescan Function
		 *		return {
		 *			before: '\n',
		 *			content: content.trim(),
		 *			after: '\n'
		 *		}
		 * ]
		 */
		
		// Save complex mappings (custom regexp)
		if (token[2]) {
			this.tokenReg.push(token[2]);
			this.tokenComplex.push({ abbr: token[1], re: new RegExp(token[2]), rescan: token[3] });
		}
		// Save simple mappings (string only, no regexp)
		else {
			this.tokenReg.push(token[1]);
			this.tokenSimple[token[1]] = token[0];
		}
		this.tokenMap[token[0]] = token[1];
	}
	
	// Cache the token registry.
	this.tokenReg = new RegExp("(" + this.tokenReg.slice(0).concat(["<", ">", '"', "'"]).join("|") + ")","g");
};

Scanner.attributes = {};
Scanner.regExpAttributes = {};

Scanner.attribute = function(attribute, callback){
	if(typeof attribute == "string"){
		Scanner.attributes[attribute] = callback;
	} else {
		Scanner.regExpAttributes[attribute] = {
			match: attribute,
			callback: callback
		};
	}
	
}
Scanner.hookupAttributes = function(options, el){
	can.each(options && options.attrs || [], function(attr){
		options.attr = attr;
		if(Scanner.attributes[attr]) {
			Scanner.attributes[attr](options,el);
		} else {
			can.each(Scanner.regExpAttributes,function(attrMatcher){
				if(attrMatcher.match.test(attr)){
					attrMatcher.callback(options, el)
				}
			})
		}
		
	})
}
Scanner.tag = function( tagName, callback){
	// if we have html5shive ... re-generate
	if(window.html5){
		html5.elements += " "+tagName
		html5.shivDocument();
	}
	
	Scanner.tags[tagName.toLowerCase()] = callback;
}
Scanner.tags = {};
// This is called when there is a special tag
Scanner.hookupTag = function(hookupOptions){
	// we need to call any live hookups
	// so get that and return the hook
	// a better system will always be called with the same stuff
	var hooks = can.view.getHooks();
	return can.view.hook(function(el){
		can.each(hooks, function(fn){
			fn(el);
		});
		
		var tagName= hookupOptions.tagName,
			helperTagCallback = hookupOptions.options.read('helpers._tags.'+tagName,{isArgument: true, proxyMethods: false}).value,
			tagCallback = helperTagCallback || Scanner.tags[tagName];
			
		// If this was an element like <foo-bar> that doesn't have a component, just render its content
		var scope = hookupOptions.scope,
			res = tagCallback ? tagCallback(el, hookupOptions) : scope;
			
		// If the tagCallback gave us something to render with, and there is content within that element
		// render it!
		if(res && hookupOptions.subtemplate){
			
			if(scope !== res){
				scope = scope.add(res)
			}
			var frag = can.view.frag( hookupOptions.subtemplate(scope, hookupOptions.options) );
			can.appendChild(el, frag);
		}
		can.view.Scanner.hookupAttributes(hookupOptions, el);
	});
	
}

/**
 * Extend can.View to add scanner support.
 */
Scanner.prototype = {
	// a default that can be overwritten
	helpers: [],

	scan: function(source, name){
		var tokens = [],
			last = 0,
			simple = this.tokenSimple,
			complex = this.tokenComplex;
		
		source = source.replace(newLine, "\n");
		if (this.transform) {
			source = this.transform(source);
		}
		source.replace(this.tokenReg, function(whole, part){
			// offset is the second to last argument
			var offset = arguments[arguments.length-2];
			
			// if the next token starts after the last token ends
			// push what's in between
			if(offset > last){
				tokens.push( source.substring(last, offset) );
			}
			
			// push the simple token (if there is one)
			if (simple[whole]) {
				tokens.push(whole);
			}
			// otherwise lookup complex tokens
			else {
				for (var i = 0, token; token = complex[i]; i++) {
					if (token.re.test(whole)) {
						tokens.push(token.abbr);
						// Push a rescan function if one exists
						if (token.rescan) {
							tokens.push(token.rescan(part));
						}
						break;
					}
				}
			}

			// update the position of the last part of the last token
			last = offset+part.length;
		});

		// if there's something at the end, add it
		if(last < source.length){
			tokens.push(source.substr(last));
		}
		
		var content = '',
			buff = [startTxt + (this.text.start || '')],
			// Helper `function` for putting stuff in the view concat.
			put = function( content, bonus ) {
				buff.push(put_cmd, '"', clean(content), '"'+(bonus||'')+');');
			},
			// A stack used to keep track of how we should end a bracket
			// `}`.  
			// Once we have a `<%= %>` with a `leftBracket`,
			// we store how the file should end here (either `))` or `;`).
			endStack =[],
			// The last token, used to remember which tag we are in.
			lastToken,
			// The corresponding magic tag.
			startTag = null,
			// Was there a magic tag inside an html tag?
			magicInTag = false,
			// was there a special state
			specialStates = {
				attributeHookups: [],
				// a stack of tagHookups
				tagHookups: []
			},
			// The current tag name.
			tagName = '',
			// stack of tagNames
			tagNames = [],
			// Pop from tagNames?
			popTagName = false,
			// Declared here.
			bracketCount,
			
			// in a special attr like src= or style=
			specialAttribute = false,
			
			i = 0,
			token,
			tmap = this.tokenMap,
			attrName;

		// Reinitialize the tag state goodness.
		htmlTag = quote = beforeQuote = null;

		for (; (token = tokens[i++]) !== undefined;) {
			if ( startTag === null ) {
				switch ( token ) {
				case tmap.left:
				case tmap.escapeLeft:
				case tmap.returnLeft:
					magicInTag = htmlTag && 1;
				case tmap.commentLeft:
					// A new line -- just add whatever content within a clean.  
					// Reset everything.
					startTag = token;
					if ( content.length ) {
						put(content);
					}
					content = '';
					break;
				case tmap.escapeFull:
					// This is a full line escape (a line that contains only whitespace and escaped logic)
					// Break it up into escape left and right
					magicInTag = htmlTag && 1;
					rescan = 1;
					startTag = tmap.escapeLeft;
					if ( content.length ) {
						put(content);
					}
					rescan = tokens[i++];
					content = rescan.content || rescan;
					if ( rescan.before ) {
						put(rescan.before);
					}
					tokens.splice(i, 0, tmap.right);
					break;
				case tmap.commentFull:
					// Ignore full line comments.
					break;
				case tmap.templateLeft:
					content += tmap.left;
					break;
				case '<':
					// Make sure we are not in a comment.
					if(tokens[i].indexOf("!--") !== 0) {
						htmlTag = 1;
						magicInTag = 0;
					}
					
					content += token;
					
					
					break;
				case '>':
					htmlTag = 0;
					// content.substr(-1) doesn't work in IE7/8
					var emptyElement = (content.substr(content.length-1) == "/" || content.substr(content.length-2) == "--"),
						attrs = "";
					// if there was a magic tag
					// or it's an element that has text content between its tags, 
					// but content is not other tags add a hookup
					// TODO: we should only add `can.EJS.pending()` if there's a magic tag 
					// within the html tags.
					if(specialStates.attributeHookups.length) {
						attrs = "attrs: ['"+specialStates.attributeHookups.join("','")+"'], ";
						specialStates.attributeHookups = [];
					}
					// this is the > of a special tag
					if(tagName === top(specialStates.tagHookups) ){
						// If it's a self closing tag (like <content/>) make sure we put the / at the end.
						if(emptyElement) {
							content = content.substr(0,content.length-1)
						}
						// Put the start of the end
						buff.push(put_cmd, 
								 '"', clean(content), '"', 
								 ",can.view.Scanner.hookupTag({tagName:'"+tagName+"',"+(attrs)+"scope: "+(this.text.scope || "this")+this.text.options)
						
						
						
						
						// if it's a self closing tag (like <content/>) close and end the tag
						if(emptyElement) {
							buff.push("}));");
							content = "/>";
							specialStates.tagHookups.pop()
						} 
						// if it's an empty tag	 
						else if( tokens[i] === "<" &&  tokens[i+1] === "/"+tagName ){
							buff.push("}));");
							content = token;
							specialStates.tagHookups.pop()
						} else {
							// it has content
							buff.push(",subtemplate: function("+this.text.argNames+"){\n"+ startTxt+(this.text.start || '') );
							content = '';
						}

					} else if(magicInTag || (!popTagName && elements.tagToContentPropMap[ tagNames[tagNames.length -1] ] ) || attrs ){
						// make sure / of /> is on the right of pending
						var pendingPart = ",can.view.pending({"+attrs+"scope: "+(this.text.scope || "this")+this.text.options+"}),\"";
						if(emptyElement){
							put(content.substr(0,content.length-1),pendingPart+ "/>\"");
						} else {
							put(content, pendingPart+">\"");
						}
						content = '';
						magicInTag = 0;
					} else {
						content += token;
					}
					
					
					
					// if it's a tag like <input/>
					if(emptyElement || popTagName){
						// remove the current tag in the stack
						tagNames.pop();
						// set the current tag to the previous parent
						tagName = tagNames[tagNames.length-1];
						// Don't pop next time
						popTagName = false;
					}
					specialStates.attributeHookups = [];
					break;
				case "'":
				case '"':
					// If we are in an html tag, finding matching quotes.
					if(htmlTag){
						// We have a quote and it matches.
						if(quote && quote === token){
							// We are exiting the quote.
							quote = null;
							// Otherwise we are creating a quote.
							// TODO: does this handle `\`?
							var attr = getAttrName();
							if(Scanner.attributes[attr]){
								specialStates.attributeHookups.push(attr);
							} else {
								can.each(Scanner.regExpAttributes,function(attrMatcher){
									if( attrMatcher.match.test(attr) ) {
										specialStates.attributeHookups.push(attr);
									}
								});
							}
							
							if(specialAttribute) {
								
								content += token;
								put(content);
								buff.push(finishTxt, "}));\n")
								content = ""
								specialAttribute = false;
								
								break;
							}
							
							
						} else if(quote === null){
							quote = token;
							beforeQuote = lastToken;
							attrName = getAttrName()
							// TODO: check if there's magic!!!!
							if( (tagName == "img" && attrName == "src") || attrName === "style" ) {
								// put content that was before the attr name, but don't include the src=
								put(content.replace(attrReg,""));
								content = "";
								
								specialAttribute = true;
								
								buff.push(insert_cmd, "can.view.txt(2,'"+getTag(tagName,tokens, i)+"'," + status() + ",this,function(){", startTxt);
								put(attrName+"="+token);
								break;
							}
							
						}
					}
				default:
					// Track the current tag
					if(lastToken === '<'){
						
						tagName = token.substr(0,3) === "!--" ?
							"!--" : token.split(/\s/)[0];
							
						var isClosingTag = false;
						
						if( tagName.indexOf("/") === 0 ) {
							isClosingTag = true;
							var cleanedTagName = tagName.substr(1);
						}
						
						if( isClosingTag ) { // </tag>
							
							// when we enter a new tag, pop the tag name stack
							if( top( tagNames ) === cleanedTagName ) {
								// set tagName to the last tagName
								// if there are no more tagNames, we'll rely on getTag.
								tagName = cleanedTagName;
								popTagName = true;
							}
							
							// if we are in a closing tag of a custom tag
							if( top( specialStates.tagHookups) == cleanedTagName ) {
								
								// remove the last < from the content
								put(content.substr(0, content.length-1));
								
								// finish the "section"
								buff.push(finishTxt+"}}) );" );
								
								// the < belongs to the outside
								content = "><"
								specialStates.tagHookups.pop()
							} 
	
						} else {
							if( tagName.lastIndexOf("/") === tagName.length -1 ) {
								tagName = tagName.substr(0, tagName.length -1);
								
								
							} 
								
							if(tagName !== "!--" && ( Scanner.tags[tagName]  || automaticCustomElementCharacters.test(tagName) )){
								// if the content tag is inside something it doesn't belong ...
								if(tagName === "content" && elements.tagMap[top(tagNames)]){
									// convert it to an element that will work
									token = token.replace("content",elements.tagMap[top(tagNames)])
								}
								// we will hookup at the ending tag>
								specialStates.tagHookups.push(tagName);
							}
							
							
							tagNames.push(tagName);
							
						}
						
					}
					content += token;
					break;
				}
			} else {
				// We have a start tag.
				switch ( token ) {
				case tmap.right:
				case tmap.returnRight:
					switch ( startTag ) {
					case tmap.left:
						// Get the number of `{ minus }`
						bracketCount = bracketNum(content);
						
						// We are ending a block.
						if (bracketCount == 1) {

							// We are starting on.
							buff.push(insert_cmd, "can.view.txt(0,'"+getTag(tagName,tokens, i)+"'," + status() + ",this,function(){", startTxt, content);

							endStack.push({
								before: "",
								after: finishTxt+"}));\n"
							});
						}
						else {
							
							// How are we ending this statement?
							last = // If the stack has value and we are ending a block...
								endStack.length && bracketCount == -1 ? // Use the last item in the block stack.
								endStack.pop() : // Or use the default ending.
							{
								after: ";"
							};
							
							// If we are ending a returning block, 
							// add the finish text which returns the result of the
							// block.
							if (last.before) {
								buff.push(last.before);
							}
							// Add the remaining content.
							buff.push(content, ";",last.after);
						}
						break;
					case tmap.escapeLeft:
					case tmap.returnLeft:
						// We have an extra `{` -> `block`.
						// Get the number of `{ minus }`.
						bracketCount = bracketNum(content);
						// If we have more `{`, it means there is a block.
						if( bracketCount ){
							// When we return to the same # of `{` vs `}` end with a `doubleParent`.
							endStack.push({
								before : finishTxt,
								after: "}));\n"
							});
						} 

						var escaped = startTag === tmap.escapeLeft ? 1 : 0,
							commands = { 
								insert: insert_cmd, 
								tagName: getTag(tagName, tokens, i), 
								status: status(),
								specialAttribute: specialAttribute
							};

						for(var ii = 0; ii < this.helpers.length;ii++){
							// Match the helper based on helper
							// regex name value
							var helper = this.helpers[ii];
							if(helper.name.test(content)){
								content = helper.fn(content, commands);

								// dont escape partials
								if(helper.name.source == /^>[\s]*\w*/.source){
									escaped = 0;
								}	
								break;
							}
						}
						
						// Handle special cases
						if (typeof content == 'object') {
							if (content.raw) {
								buff.push(content.raw);
							}
						} else if (specialAttribute) {
							buff.push(insert_cmd, content, ');');
						} else {
							// If we have `<%== a(function(){ %>` then we want
							// `can.EJS.text(0,this, function(){ return a(function(){ var _v1ew = [];`.
							buff.push(insert_cmd, "can.view.txt(\n" + escaped + ",\n'"+tagName+"',\n" + status() +",\nthis,\nfunction(){ " + (this.text.escape || '') + "return ", content, 
								// If we have a block.
								bracketCount ? 
								// Start with startTxt `"var _v1ew = [];"`.
								startTxt : 
								// If not, add `doubleParent` to close push and text.
								"}));\n"
								);
						}
						
						if (rescan && rescan.after && rescan.after.length) {
							put(rescan.after.length);
							rescan = null;
						}
						break;
					}
					startTag = null;
					content = '';
					break;
				case tmap.templateLeft:
					content += tmap.left;
					break;
				default:
					content += token;
					break;
				}
			}
			lastToken = token;
		}
		
		// Put it together...
		if ( content.length ) {
			// Should be `content.dump` in Ruby.
			put(content);
		}
		buff.push(";");
		var template = buff.join(''),
			out = {
				out: (this.text.outStart||"") + template + " "+finishTxt+(this.text.outEnd || "")
			};
		// Use `eval` instead of creating a function, because it is easier to debug.
		myEval.call(out, 'this.fn = (function('+this.text.argNames+'){' + out.out + '});\r\n//@ sourceURL=' + name + ".js");

		return out;
	}
};

can.view.Scanner.tag("content",function(el, options){
	return options.scope;
})

return Scanner;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/node_lists',["can/util/library", "can/view/elements"], function(can){


	// In some browsers, text nodes can not take expando properties.
	// We test that here.
	var canExpando = true;
	try {
		document.createTextNode('')._ = 0;
	} catch (ex) {
		canExpando = false;
	}


	// A mapping of element ids to nodeList id
	var nodeMap = {},
	// A mapping of ids to text nodes
	textNodeMap = {},
	expando = "ejs_"+Math.random(),
	_id=0,
	id = function(node){
		if(canExpando || node.nodeType !== 3) {
			if(node[expando]) {
				return node[expando];
			}
			else {
				return node[expando] = (node.nodeName ? "element_" : "obj_")+(++_id);
			}
		}
		else {
			for(var textNodeID in textNodeMap) {
				if(textNodeMap[textNodeID] === node) {
					return textNodeID;
				}
			}

			textNodeMap["text_" + (++_id)] = node;
			return "text_" + _id;
		}
	},
		splice = [].splice;

	/**
	 * @property {Object} can.view.nodeLists
	 * @parent can.view.static
	 * 
	 * Stores hierarchical node references.
	 * 
	 * ## Use
	 * 
	 * `can.view.nodeLists` is used to make sure "directly nested" live-binding
	 * sections update content correctly.
	 * 
	 * Consider a template like:
	 * 
	 *     <div>
	 *     {{#if items.length}}
	 *        Items:
	 *        {{#items}}
	 *           <label></label>
	 *        {{/items}}
	 *     {{/if}}
	 *     </div>
	 * 
	 * 
	 * The `{{#if}}` and `{{#items}}` seconds are "directly nested" because
	 * they share the same `<div>` parent element.
	 * 
	 * If `{{#items}}` changes the DOM by adding more `<labels>`, 
	 * `{{#if}}` needs to know about the `<labels>` to remove them
	 * if `{{#if}}` is re-rendered.  `{{#if}}` would be re-rendered, for example, if 
	 * all items were removed.
	 * 
	 * 
	 * To keep all live-bound sections knowing which elements they are managing,
	 * all live-bound elments are [can.view.nodeLists.register registered] and
	 * [can.view.nodeLists.update updated] when the change.
	 * 
	 * For example, the above template, when rendered with data like:
	 * 
	 *     data = new can.Map({
	 *       items: ["first","second"]
	 *     })
	 *     
	 * This will first render the following content:
	 * 
	 *     <div>
	 *        <span data-view-id='5'/>
	 *     </div>
	 * 
	 * When the `5` [can.view.hookup hookup] callback is called, this will register the `<span>` like:
	 * 
	 *     var ifsNodes = [<span 5>]
	 *     nodeLists.register(ifsNodes);
	 * 
	 * And then render `{{if}}`'s contents and update `ifsNodes` with it:
	 * 
	 *     nodeLists.update( ifsNodes, [<"\nItems:\n">, <span data-view-id="6">] );
	 *      
	 * Next, hookup `6` is called which will regsiter the `<span>` like:
	 * 
	 *     var eachsNodes = [<span 6>];
	 *     nodeLists.register(eachsNodes);
	 * 
	 * And then it will render `{{#each}}`'s content and update `eachsNodes` with it:
	 * 
	 *     nodeLists.update(eachsNodes, [<label>,<label>]);
	 * 
	 * As `nodeLists` knows that `eachsNodes` is inside `ifsNodes`, it also updates
	 * `ifsNodes`'s nodes to look like:
	 * 
	 *     [<"\nItems:\n">,<label>,<label>]
	 * 
	 * Now, if all items were removed, `{{#if}}` would be able to remove 
	 * all the `<label>` elements.
	 * 
	 * When you regsiter a nodeList, you can also provide a callback to know when 
	 * that nodeList has been replaced by a parent nodeList.  This is
	 * useful for tearing down live-binding.
	 * 
	 * 
	 *  
	 * 
	 * 
	 */
	var nodeLists = {
		id: id,

		/**
		 * @function can.view.nodeLists.update
		 * @parent can.view.nodeLists
		 * 
		 * Updates a nodeList with new items
		 * 
		 * @param {Array.<HTMLElement>} nodeList A registered nodeList.
		 * 
		 * @param {Array.<HTMLElement>} newNodes HTML nodes that should be placed in the nodeList.
		 * 
		 */
		update: function(nodeList, newNodes){
			// Unregister all childNodes.
			can.each(nodeList.childNodeLists, function(nodeList){
				nodeLists.unregister(nodeList)
			})
			nodeList.childNodeLists = [];
			
			// Remove old node pointers to this list.
			can.each(nodeList, function(node){
				delete nodeMap[id(node)];
			});
			
			var newNodes = can.makeArray(newNodes);
			
			// indicate the new nodes belong to this list
			can.each(newNodes, function(node){
				nodeMap[id(node)] = nodeList;
			});

			
			var oldListLength = nodeList.length,
				firstNode = nodeList[0];
			// Replace oldNodeLists's contents'
			splice.apply( nodeList, [0, oldListLength ].concat(newNodes) );
			
			// update all parent nodes so they are able to replace the correct elements
			var parentNodeList = nodeList;
			while(parentNodeList = parentNodeList.parentNodeList) {
				splice.apply(parentNodeList, [can.inArray(firstNode, parentNodeList), oldListLength ].concat(newNodes) );
			}
			
			
		},
		/**
		 * @function can.view.nodeLists.register
		 * @parent can.view.nodeLists
		 * 
		 * Registers a nodeList.
		 * 
		 * @param {Array.<HTMLElement>} nodeList An array of elements. This array will be kept live if child nodeLists
		 * update themselves.
		 * 
		 * @param {function} [unregistered] An optional callback that is called when the `nodeList` is 
		 * replaced due to a parentNode list being updated.
		 * 
		 * @param {Array.<HTMLElement>} [parent] An optional parent nodeList.  If no parentNode list is found,
		 * the first element in `nodeList`'s current nodeList will be used. 
		 * 
		 * @return {Array.<HTMLElement>} The `nodeList` passed to `register`.
		 */
		register: function(nodeList, unregistered, parent){
			
			// add an id to the nodeList
			nodeList.unregistered = unregistered, 
			
			nodeList.childNodeLists = [];
			
			if(!parent) {
				// find the parent by looking up where this node is
				if(nodeList.length > 1) {
					throw "does not work"
				}
				var nodeId = id(nodeList[0]);
				parent =  nodeMap[nodeId];
				
			}
			nodeList.parentNodeList = parent;
			parent && parent.childNodeLists.push( nodeList );
			return nodeList;
		},
		// removes node in all parent nodes and unregisters all childNodes
		/**
		 * @function can.view.nodeLists.unregister
		 * @parent can.view.nodeLists
		 * 
		 * Unregister's a nodeList.  Call if the nodeList is no longer being 
		 * updated.  This will unregister all child nodeLists.
		 * 
		 * 
		 * @param {Array.<HTMLElement>} nodeList The nodelist to unregister.
		 */
		unregister: function(nodeList){
			if(!nodeList.isUnregistered) {
				nodeList.isUnregistered = true;
				// unregister all childNodeLists
				delete nodeList.parentNodeList;
				can.each(nodeList, function(node){
					var nodeId = id(node);
					delete nodeMap[nodeId]
				});
				// this can unbind which will call itself
				nodeList.unregistered && nodeList.unregistered();
				can.each( nodeList.childNodeLists, function(nodeList){
					nodeLists.unregister(nodeList)
				});
			}
		},
		nodeMap: nodeMap,
	}
	return nodeLists;


});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/live',["can/util/library", "can/view/elements", "can/view", "can/view/node_lists"], function(can, elements,view,nodeLists){
	// ## live.js
	// 
	// The live module provides live binding for computes
	// and can.List.
	// 
	// Currently, it's API is designed for `can/view/render`, but
	// it could easily be used for other purposes.


	// ### Helper methods
	// 
	// #### setup
	// 
	// `setup(HTMLElement, bind(data), unbind(data)) -> data`
	// 
	// Calls bind right away, but will call unbind
	// if the element is "destroyed" (removed from the DOM).
	var setupCount = 0;
	var setup = function(el, bind, unbind){
		// Removing an element can call teardown which
		// unregister the nodeList which calls teardown
		var tornDown = false,
			teardown = function(){
				if(!tornDown) {
					tornDown = true;
					unbind(data)
					can.unbind.call(el,'removed', teardown);
					
				}
				
				return true
			},
			data = {
				// returns true if no parent
				teardownCheck: function(parent){
					return parent ? false : teardown();
				}
			}

		can.bind.call(el,'removed', teardown);
		bind(data)
		return data;
	},
		// #### listen
		// Calls setup, but presets bind and unbind to 
		// operate on a compute
		listen = function(el, compute, change){
			return setup(el, function(){
				compute.bind("change", change);
			},function(data){
				compute.unbind("change", change);
				if(data.nodeList){
					nodeLists.unregister( data.nodeList );
				}
			});
		},
		// #### getAttributeParts
		// Breaks up a string like foo='bar' into ["foo","'bar'""]
		getAttributeParts = function(newVal){
			return (newVal|| "").replace(/['"]/g, '').split('=')
		},
			splice = [].splice;

	/**
	 * @property {Object} can.view.live
	 * @parent can.view.static
	 * 
	 * Setup live-binding to a compute manually.
	 * 
	 * @body
	 * 
	 * ## Use
	 * 
	 * `can.view.live` is an object with utlitiy methods for setting up 
	 * live-binding.  For example, to make an `<h2>`
	 * 
	 *  
	 * 
	 */
	var live = {
		/**
		 * @function can.view.live.list
		 * @parent can.view.live
		 * 
		 * Live binds a compute's [can.List] incrementally.  
		 * 
		 *  
		 * @param {HTMLElement} el An html element to replace with the live-section.
		 * 
		 * @param {can.compute|can.List} list A [can.List] or [can.compute] whose value is a [can.List].
		 * 
		 * @param {function(this:*,*,index):String} render(index, index) A function that when called with 
		 * the incremental item to render and the index of the item in the list. 
		 * 
		 * @param {Object} context The `this` the `render` function will be called with.
		 * 
		 * @param {HTMLElement} [parentNode] An overwritable parentNode if `el`'s parent is
		 * a documentFragment.
		 * 
		 * ## Use
		 * 
		 * `can.view.live.list` is used to setup incremental live-binding.
		 * 
		 *     // a compute that change's it's list
		 *     var todos = can.compute(function(){
		 *       return new Todo.List({page: can.route.attr("page")})
		 *     })
		 * 
		 *     var placeholder = document.createTextNode(" ")
		 *     $("ul#todos").append(placeholder)
		 * 
		 * 
		 * 
		 *     can.view.live.list(
		 *       placeholder, 
		 *       todos, 
		 *       function(todo, index){
		 *         return "<li>"+todo.attr("name")+"</li>"
		 *       })
		 * 
		 */
		list: function(el, compute, render, context, parentNode){
			
			
			// A nodeList of all elements this live-list manages.
			// This is here so that if this live list is within another section
			// that section is able to remove the items in this list.
			var masterNodeList = [el],
				// A mapping of the index of an item to an array
				// of elements that represent the item.
				// Each array is registered so child or parent
				// live structures can update the elements.
				itemIndexToNodeListsMap = [],
				// A mapping of items to their indicies'
				indexMap = [],
				
				// Called when items are added to the list.
				add = function(ev, items, index){

					// Collect new html and mappings
					var frag = document.createDocumentFragment(),
						newNodeLists = [],
						newIndicies = [];
						
					// For each new item,
					can.each(items, function(item, key){
						
						var itemIndex = can.compute(key + index),
							// get its string content
							itemHTML = render.call(context, item, itemIndex),
							// and convert it into elements.
							itemFrag = can.view.fragment(itemHTML)

						
						// Add those elements to the mappings.
						newNodeLists.push( 
							// Register those nodes with nodeLists.
							nodeLists.register( can.makeArray(itemFrag.childNodes), undefined, masterNodeList ) 
						);
						
						// Hookup the fragment (which sets up child live-bindings) and
						// add it to the collection of all added elements.
						frag.appendChild( can.view.hookup(itemFrag)  );
						newIndicies.push(itemIndex)
					})

					// Check if we are adding items at the end
					if( !itemIndexToNodeListsMap[index] ) {
						
						elements.after(
							// If we are adding items to an empty list
							index == 0 ?
								// add those items after the placeholder text element.
								[text] :
								// otherwise, add them after the last element in the previous index.
								itemIndexToNodeListsMap[index-1], frag)
					} else {
						// Add elements before the next index's first element.
						var el = itemIndexToNodeListsMap[index][0];
						can.insertBefore(el.parentNode, frag, el);
					}
					
					splice.apply(itemIndexToNodeListsMap, [index, 0].concat(newNodeLists));
					
					// update indices after insert point
					splice.apply(indexMap, [index, 0].concat(newIndicies));
					for(var i = index+newIndicies.length, len = indexMap.length; i < len; i++){
						indexMap[i](i)
					}
					
				},
				
				// Called when items are removed or when the bindings are torn down.
				remove = function(ev, items, index, duringTeardown){
					
					// If this is because an element was removed, we should
					// check to make sure the live elements are still in the page.
					// If we did this during a teardown, it would cause an infinite loop.
					if(!duringTeardown && data.teardownCheck(text.parentNode)){
						return
					}
					
					var removedMappings = itemIndexToNodeListsMap.splice(index, items.length),
						itemsToRemove = [];

					can.each(removedMappings,function(nodeList){
						// add items that we will remove all at once
						[].push.apply(itemsToRemove, nodeList)
						// Update any parent lists to remove these items
						nodeLists.update(nodeList,[]);
						// unregister the list
						nodeLists.unregister(nodeList);

					});
					// update indices after remove point
					indexMap.splice(index, items.length)
					for(var i = index, len = indexMap.length; i < len; i++){
						indexMap[i](i)
					}
					
					can.remove( can.$(itemsToRemove) );
				},
				parentNode = elements.getParentNode(el, parentNode),
				text = document.createTextNode(""),
				// The current list.
				list,

				// Called when the list is replaced with a new list or the binding is torn-down.
				teardownList = function(){
					// there might be no list right away, and the list might be a plain
					// array
					list && list.unbind && list.unbind("add", add).unbind("remove", remove);
					// use remove to clean stuff up for us
					remove({},{length: itemIndexToNodeListsMap.length},0, true);
				},
				// Called when the list is replaced or setup.
				updateList = function(ev, newList, oldList){
					teardownList();
					// make an empty list if the compute returns null or undefined
					list = newList || [];
					// list might be a plain array
					list.bind && list.bind("add", add).bind("remove", remove);
					add({}, list, 0);
				}
			
			
			// Setup binding and teardown to add and remove events
			var data = setup(parentNode, function(){
				can.isFunction(compute) && compute.bind("change",updateList)
			},function(){
				can.isFunction(compute) && compute.unbind("change",updateList)
				teardownList()
			});
			
			live.replace(masterNodeList, text, data.teardownCheck)
			
			// run the list setup
			updateList({},can.isFunction(compute) ? compute() : compute)
			

		},
		/**
		 * @function can.view.live.html
		 * @parent can.view.live
		 * 
		 * Live binds a compute's value to a collection of elements.
		 * 
		 *  
		 * @param {HTMLElement} el An html element to replace with the live-section.
		 * 
		 * @param {can.compute} compute A [can.compute] whose value is HTML.
		 * 
		 * @param {HTMLElement} [parentNode] An overwritable parentNode if `el`'s parent is
		 * a documentFragment.
		 * 
		 * ## Use
		 * 
		 * `can.view.live.html` is used to setup incremental live-binding.
		 * 
		 *     // a compute that change's it's list
		 *     var greeting = can.compute(function(){
		 *       return "Welcome <i>"+me.attr("name")+"</i>"
		 *     });
		 * 
		 *     var placeholder = document.createTextNode(" ");
		 *     $("#greeting").append(placeholder);
		 *     
		 *     can.view.live.html( placeholder,  greeting );
		 * 
		 */
		html: function(el, compute, parentNode){
			var parentNode = elements.getParentNode(el, parentNode),
				data = listen(parentNode, compute, function(ev, newVal, oldVal){
					// TODO: remove teardownCheck in 2.1
					var attached = nodes[0].parentNode;
					// update the nodes in the DOM with the new rendered value
					if( attached ) {
						makeAndPut(newVal);
					}
					data.teardownCheck(nodes[0].parentNode);
				});
			
			var nodes = [el],
				makeAndPut = function(val){
					var frag = can.view.fragment( ""+val ),
						oldNodes = can.makeArray(nodes);
					
					// We need to mark each node as belonging to the node list.
					nodeLists.update( nodes, frag.childNodes )
					
					frag = can.view.hookup( frag, parentNode )
					
					elements.replace(oldNodes, frag)
				};
			
			data.nodeList = nodes;
			// register the span so nodeLists knows the parentNodeList
			nodeLists.register(nodes, data.teardownCheck)
			makeAndPut(compute());

		},
		/**
		 * @function can.view.live.replace
		 * @parent can.view.live
		 * 
		 * Replaces one element with some content while keeping [can.view.live.nodeLists nodeLists] data
		 * correct.
		 * 
		 * @param {Array.<HTMLElement>} nodes An array of elements.  There should typically be one element.
		 * @param {String|HTMLElement|DocumentFragment} val The content that should replace 
		 * `nodes`.  If a string is passed, it will be [can.view.hookup hookedup].
		 * 
		 * @param {function} [teardown] A callback if these elements are torn down.
		 */
		replace: function(nodes, val, teardown){
			var oldNodes = nodes.slice(0),
				frag;
				
			nodeLists.register(nodes, teardown);
			if(typeof val === "string") {
				frag = can.view.fragment( val )
			} else if(val.nodeType !== 11){
				frag = document.createDocumentFragment();
				frag.appendChild(val)
			} else {
				frag = val;
			}
	
			// We need to mark each node as belonging to the node list.
			nodeLists.update( nodes, frag.childNodes )
			
			if(typeof val === "string"){
				// if it was a string, check for hookups
				frag = can.view.hookup( frag, nodes[0].parentNode );
			}
			elements.replace(oldNodes, frag);
			
			return nodes;
		},
		/**
		 * @function can.view.live.text
		 * @parent can.view.live
		 * 
		 * Replaces one element with some content while keeping [can.view.live.nodeLists nodeLists] data
		 * correct.
		 */
		text: function(el, compute, parentNode){
			var parent = elements.getParentNode(el, parentNode);

			// setup listening right away so we don't have to re-calculate value
			var data  = listen( parent, compute, function(ev, newVal, oldVal){
				// Sometimes this is 'unknown' in IE and will throw an exception if it is
				if ( typeof node.nodeValue != 'unknown' ) {
					node.nodeValue = ""+newVal;
				}
				// TODO: remove in 2.1
				data.teardownCheck(node.parentNode);
			}),
				// The text node that will be updated
				node = document.createTextNode( compute() );
			
			// Replace the placeholder with the live node and do the nodeLists thing.
			live.replace([el], node,  data.teardownCheck  );
		},
		/**
		 * @function can.view.live.text
		 * @parent can.view.live
		 * 
		 * Replaces one element with some content while keeping [can.view.live.nodeLists nodeLists] data
		 * correct.
		 */
		attributes: function(el, compute, currentValue){
			var setAttrs = function(newVal){
				var parts = getAttributeParts(newVal),
					newAttrName = parts.shift();
				
				// Remove if we have a change and used to have an `attrName`.
				if((newAttrName != attrName) && attrName){
					elements.removeAttr(el,attrName);
				}
				// Set if we have a new `attrName`.
				if(newAttrName){
					elements.setAttr(el, newAttrName, parts.join('='));
					attrName = newAttrName;
				}
			}

			listen(el, compute, function(ev, newVal){
				setAttrs(newVal)
			})
			// current value has been set
			if(arguments.length >= 3) {
				var attrName = getAttributeParts(currentValue)[0]
			} else {
				setAttrs(compute())
			}
		},
		attributePlaceholder: '__!!__',
		attributeReplace: /__!!__/g,
		attribute: function(el, attributeName, compute){
			listen(el, compute, function(ev, newVal){
				elements.setAttr( el, attributeName, hook.render() );
			})

			var wrapped = can.$(el),
				hooks;
			
			// Get the list of hookups or create one for this element.
			// Hooks is a map of attribute names to hookup `data`s.
			// Each hookup data has:
			// `render` - A `function` to render the value of the attribute.
			// `funcs` - A list of hookup `function`s on that attribute.
			// `batchNum` - The last event `batchNum`, used for performance.
			hooks = can.data(wrapped,'hooks');
			if ( ! hooks ) {
				can.data(wrapped, 'hooks', hooks = {});
			}
			
			// Get the attribute value.
			var attr = elements.getAttr(el, attributeName ),
				// Split the attribute value by the template.
				// Only split out the first __!!__ so if we have multiple hookups in the same attribute, 
				// they will be put in the right spot on first render
				parts = attr.split(live.attributePlaceholder),
				goodParts = [],
				hook;
				goodParts.push(parts.shift(), 
							   parts.join(live.attributePlaceholder));

			// If we already had a hookup for this attribute...
			if(hooks[attributeName]) {
				// Just add to that attribute's list of `function`s.
				hooks[attributeName].computes.push(compute);
			} else {
				// Create the hookup data.
				hooks[attributeName] = {
					render: function() {
						var i =0,
							// attr doesn't have a value in IE
							newAttr = attr
								? attr.replace(live.attributeReplace, function() {
										return elements.contentText( hook.computes[i++]() );
									})
								: elements.contentText( hook.computes[i++]() );
						return newAttr;
					},
					computes: [compute],
					batchNum : undefined
				};
			}

			// Save the hook for slightly faster performance.
			hook = hooks[attributeName];

			// Insert the value in parts.
			goodParts.splice(1,0,compute());

			// Set the attribute.
			elements.setAttr(el, attributeName, goodParts.join("") );




		},
		specialAttribute: function(el, attributeName, compute){
			
			listen(el, compute, function(ev, newVal){
				elements.setAttr( el, attributeName, getValue( newVal ) );
			});
			
			elements.setAttr(el, attributeName, getValue( compute() ) );
		}
	}
	var newLine = /(\r|\n)+/g;
	var getValue = function(val){
		val = val.replace(elements.attrReg,"").replace(newLine,"");
		// check if starts and ends with " or '
		return /^["'].*["']$/.test(val) ? val.substr(1, val.length-2) : val
	}
	can.view.live = live;
	can.view.nodeLists = nodeLists;
	can.view.elements = elements;
	return live;

});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/render',["can/view", "can/view/elements", "can/view/live", "can/util/string"], function(can, elements, live){

/**
 * Helper(s)
 */
var pendingHookups = [],
	tagChildren = function(tagName) {
		var newTag = elements.tagMap[tagName] || "span";
		if(newTag === "span") {
			//innerHTML in IE doesn't honor leading whitespace after empty elements
			return "@@!!@@";
		}	
		return "<" + newTag + ">" + tagChildren(newTag) + "</" + newTag + ">";
	},
	contentText = function( input, tag ) {	
		
		// If it's a string, return.
		if ( typeof input == 'string' ) {
			return input;
		}
		// If has no value, return an empty string.
		if ( !input && input !== 0 ) {
			return '';
		}

		// If it's an object, and it has a hookup method.
		var hook = (input.hookup &&

		// Make a function call the hookup method.
		function( el, id ) {
			input.hookup.call(input, el, id);
		}) ||

		// Or if it's a `function`, just use the input.
		(typeof input == 'function' && input);

		// Finally, if there is a `function` to hookup on some dom,
		// add it to pending hookups.
		if ( hook ) {
			if(tag){
				return "<"+tag+" "+can.view.hook(hook)+"></"+tag+">"
			} else {
				pendingHookups.push(hook);
			}
			
			return '';
		}

		// Finally, if all else is `false`, `toString()` it.
		return "" + input;
	},
	// Returns escaped/sanatized content for anything other than a live-binding
	contentEscape = function( txt , tag) {
		return (typeof txt == 'string' || typeof txt == 'number') ?
			can.esc( txt ) :
			contentText(txt, tag);
	},
	// A flag to indicate if .txt was called within a live section within an element like the {{name}}
	// within `<div {{#person}}{{name}}{{/person}}/>`.
	withinTemplatedSectionWithinAnElement = false,
	emptyHandler = function(){};


var current, lastHookups;

can.extend(can.view, {
	live: live,
	// called in text to make a temporary 
	// can.view.lists function that can be called with
	// the list to iterate over and the template
	// used to produce the content within the list
	setupLists: function(){

		var old = can.view.lists,
			data;

		can.view.lists = function(list, renderer){
			data = {
				list: list,
				renderer: renderer
			}
			return Math.random()
		}
		// sets back to the old data
		return function(){
			can.view.lists = old;
			return data;
		}
	},
	pending: function(data) {
		// TODO, make this only run for the right tagName
		var hooks = can.view.getHooks();
		return can.view.hook(function(el){
			can.each(hooks, function(fn){
				fn(el);
			});
			can.view.Scanner.hookupAttributes(data, el);
		});
	},
	getHooks: function(){
		var hooks = pendingHookups.slice(0);
		lastHookups = hooks;
		pendingHookups = [];
		return hooks;
	},
	onlytxt: function(self, func){
		return contentEscape(func.call(self))
	},
	/**
	 * @function can.view.txt
	 * @hide
	 * 
	 * A helper function used to insert the 
	 * value of the contents of a magic tag into 
	 * a template's output. It detects if an observable value is
	 * read and will setup live binding.
	 * 
	 * @signature `can.view.txt(escape, tagName, status, self, func)`
	 * 
	 * @param {Number} 1 if the content returned should be escaped, 0 if otherwise.
	 * @param {String} tagName the name of the tag the magic tag is most immediately
	 * within. Ex: `"li"`.
	 * @param {String|Number} status A flag indicates which part of a tag the
	 * magic tag is within. Status can be:
	 * 
	 *  - _STRING_ - The name of the attribute the magic tag is within. Ex: `"class"`
	 *  - `1` - The magic tag is within a tag like `<div <%= %>>`
	 *  - `0` - The magic tag is outside (or between) tags like `<div><%= %></div>`
	 * 
	 * @param {*} self The `this` of the current context template. `func` is called with
	 * self as this.
	 *   
	 * @param {function} func The "wrapping" function. For 
	 * example:  `<%= task.attr('name') %>` becomes
	 *   `(function(){return task.attr('name')})
	 *
	 */
	txt: function(escape, tagName, status, self, func){
		// the temporary tag needed for any live setup
		var tag = (elements.tagMap[tagName] || "span"),
			// should live-binding be setup
			setupLiveBinding = false,
			// the compute's value
			value;
		
		
		// Are we currently within a live section within an element like the {{name}}
		// within `<div {{#person}}{{name}}{{/person}}/>`.
		if( withinTemplatedSectionWithinAnElement ) {
			value = func.call(self);
		} else {
			
			// If this magic tag is within an attribute or an html element,
			// set the flag to true so we avoid trying to live bind
			// anything that func might be setup.
			// TODO: the scanner should be able to set this up.
			if(typeof status === "string" || status === 1){
				withinTemplatedSectionWithinAnElement = true;
			}
			
			// Sets up a listener so we know any can.view.lists called 
			// when func is called
			var listTeardown = can.view.setupLists(),
				// 
				unbind = function(){
					compute.unbind("change",emptyHandler)
				};
			// Create a compute that calls func and looks for dependencies.
			// By passing `false`, this compute can not be a dependency of other 
			// computes.  This is because live-bits are nested, but 
			// handle their own updating. For example:
			//     {{#if items.length}}{{#items}}{{.}}{{/items}}{{/if}}
			// We do not want `{{#if items.length}}` changing the DOM if
			// `{{#items}}` text changes.
			var compute = can.compute(func, self, false);
			
			// Bind to get and temporarily cache the value of the compute.
			compute.bind("change",emptyHandler);
			
			// Call the "wrapping" function and get the binding information
			var	listData = listTeardown();
			
			// Get the value of the compute
			value = compute();
			
			// Let people know we are no longer within an element.
			withinTemplatedSectionWithinAnElement = false;
			
			// If we should setup live-binding.
			setupLiveBinding = compute.hasDependencies;
		}
		
		if(listData){
			unbind && unbind();
			return "<" +tag+can.view.hook(function(el, parentNode){
				live.list(el, listData.list, listData.renderer, self, parentNode);
			})+"></" +tag+">";
		}

		// If we had no observes just return the value returned by func.
		if(!setupLiveBinding || typeof value === "function"){
			unbind && unbind();
			return (  (escape || typeof status === 'string') && escape !== 2  ? contentEscape : contentText)(value, status === 0 && tag);
		}


		// the property (instead of innerHTML elements) to adjust. For
		// example options should use textContent
		var contentProp = elements.tagToContentPropMap[tagName];
		

		// The magic tag is outside or between tags.
		if ( status === 0 && !contentProp ) {
			// Return an element tag with a hookup in place of the content
			return "<" +tag+can.view.hook(
			// if value is an object, it's likely something returned by .safeString
			escape && typeof value != "object" ? 
				// If we are escaping, replace the parentNode with 
				// a text node who's value is `func`'s return value.
				function(el, parentNode){
					live.text(el, compute, parentNode);
					unbind();
				} 
				:
				// If we are not escaping, replace the parentNode with a
				// documentFragment created as with `func`'s return value.
				function( el, parentNode ) {
					live.html(el, compute, parentNode);
					unbind();
				//children have to be properly nested HTML for buildFragment to work properly
				}) + ">"+tagChildren(tag)+"</" +tag+">";
		// In a tag, but not in an attribute
		} else if( status === 1 ) { 
			// remember the old attr name
			pendingHookups.push(function(el) {
				live.attributes(el, compute, compute());
				unbind();
			});
			
			return compute();
		} else if( escape === 2 ) { // In a special attribute like src or style
			
			var attributeName = status;
			pendingHookups.push(function(el){
				live.specialAttribute(el, attributeName, compute);
				unbind();
			})
			return compute();
		} else { // In an attribute...
			var attributeName = status === 0 ? contentProp : status;
			// if the magic tag is inside the element, like `<option><% TAG %></option>`,
			// we add this hookup to the last element (ex: `option`'s) hookups.
			// Otherwise, the magic tag is in an attribute, just add to the current element's
			// hookups.
			(status === 0  ? lastHookups : pendingHookups ).push(function(el){
				live.attribute(el, attributeName, compute);
				unbind();
			});
			return live.attributePlaceholder;
		}
	}
});

return can;
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/view/mustache',["can/util/library", "can/view/scope", "can/view", "can/view/scanner", "can/compute", "can/view/render"], function( can ){
	
	// # mustache.js
	// `can.Mustache`: The Mustache templating engine.
	// 
	// See the [Transformation](#section-29) section within *Scanning Helpers* for a detailed explanation 
	// of the runtime render code design. The majority of the Mustache engine implementation 
	// occurs within the *Transformation* scanning helper.

	// ## Initialization
	//
	// Define the view extension.
	can.view.ext = ".mustache";

	// ### Setup internal helper variables and functions.
	//
	// An alias for the context variable used for tracking a stack of contexts.
	// This is also used for passing to helper functions to maintain proper context.
	var SCOPE = 'scope',
		// An alias for the variable used for the hash object that can be passed
		// to helpers via `options.hash`.
		HASH = '___h4sh',
		// An alias for the most used context stacking call.
		CONTEXT_OBJ = '{scope:' + SCOPE + ',options:options}',
		// argument names used to start the function (used by scanner and steal)
		ARG_NAMES = SCOPE+",options",
		
		// matches arguments inside a {{ }}
		argumentsRegExp = /((([^\s]+?=)?('.*?'|".*?"))|.*?)\s/g,
		
		// matches a literal number, string, null or regexp
		literalNumberStringBooleanRegExp = /^(('.*?'|".*?"|[0-9]+\.?[0-9]*|true|false|null|undefined)|((.+?)=(('.*?'|".*?"|[0-9]+\.?[0-9]*|true|false)|(.+))))$/,
		
		// returns an object literal that we can use to look up a value in the current scope
		makeLookupLiteral = function(type){
			return '{get:"'+type.replace(/"/g,'\\"')+'"}'
		},
		// returns if the object is a lookup
		isLookup = function(obj){
			return obj && typeof obj.get == "string"
		},
		
		/*
		 * Checks whether an object is like a can.Map. This takes into
		 * fact that can.route is can.Map like.
		 * @param  {[can.Map]}  observable
		 * @return {Boolean} returns if the object is observable like.
		 */
		isObserveLike = function(obj) {
			return obj instanceof can.Map || (obj && !!obj._get);
		},
		
		/*
		 * Tries to determine if the object passed is an array.
		 * @param  {Array}  obj The object to check.
		 * @return {Boolean} returns if the object is an array.
		 */
		isArrayLike = function(obj) {
			return obj && obj.splice && typeof obj.length == 'number';
		},
		// used to make sure .fn and .inverse are always called with a Scope like object
		makeConvertToScopes = function(orignal, scope, options){
			return function(updatedScope, updatedOptions){
				if(updatedScope !== undefined && !(updatedScope instanceof  can.view.Scope)){
					updatedScope = scope.add(updatedScope)	
				}
				if(updatedOptions !== undefined && !(updatedOptions instanceof  OptionsScope)){
					updatedOptions = options.add(updatedOptions)
				}
				return orignal(updatedScope, updatedOptions || options)
			}
		};
		
		
		// ## Mustache
		/**
		 * @hide
		 * The Mustache templating engine.
		 * @param {Object} options	Configuration options
		 */
		Mustache = function(options, helpers) {
			// Support calling Mustache without the constructor.
			// This returns a function that renders the template.
			if ( this.constructor != Mustache ) {
				var mustache = new Mustache(options);
				return function(data,options) {
					 return mustache.render(data,options);
				};
			}

			// If we get a `function` directly, it probably is coming from
			// a `steal`-packaged view.
			if ( typeof options == "function" ) {
				this.template = {
					fn: options
				};
				return;
			}

			// Set options on self.
			can.extend(this, options);
			this.template = this.scanner.scan(this.text, this.name);
		};

	/**
	 * @add can.Mustache
	 */
	// Put Mustache on the `can` object.
	can.Mustache = window.Mustache = Mustache;

	/** 
	 * @prototype
	 */
	Mustache.prototype.
	/**
	 * @function can.Mustache.prototype.render render
	 * @parent can.Mustache.prototype
	 * @signature `mustache.render( data [, helpers] )`
	 * @param {Object} data Data to interpolate into the template.
	 * @return {String} The template with interpolated data, in string form.
	 * @hide
	 * 
	 * @body
	 * Renders an object with view helpers attached to the view.
	 * 
	 *		 new Mustache({text: "<%= message %>"}).render({
	 *			 message: "foo"
	 *		 })
	 */
	render = function( data, options ) {
		if(!(data instanceof can.view.Scope)){
			data = new can.view.Scope(data || {});
		}
		if( ! (options instanceof OptionsScope) ){
			options = new OptionsScope(options || {})
		}
		options = options || {};
		
		return this.template.fn.call(data, data, options);
	};

	can.extend(Mustache.prototype, {
		// Share a singleton scanner for parsing templates.
		scanner: new can.view.Scanner({
			// A hash of strings for the scanner to inject at certain points.
			text: {
				// This is the logic to inject at the beginning of a rendered template. 
				// This includes initializing the `context` stack.
				start: "",//"var "+SCOPE+"= this instanceof can.view.Scope? this : new can.view.Scope(this);\n",
				scope: SCOPE,
				options: ",options: options",
				argNames: ARG_NAMES
			},
			
			// An ordered token registry for the scanner.
			// This needs to be ordered by priority to prevent token parsing errors.
			// Each token follows the following structure:
			//
			//		[
			//			// Which key in the token map to match.
			//			"tokenMapName",
			//
			//			// A simple token to match, like "{{".
			//			"token",
			//
			//			// Optional. A complex (regexp) token to match that 
			//			// overrides the simple token.
			//			"[\\s\\t]*{{",
			//
			//			// Optional. A function that executes advanced 
			//			// manipulation of the matched content. This is 
			//			// rarely used.
			//			function(content){   
			//				return content;
			//			}
			//		]
			tokens: [
				/**
				 * @function can.Mustache.tags.escaped {{key}}
				 * 
				 * @description Insert the value of the [can.Mustache.key key] into the 
				 * output of the template.
				 * 
				 * @parent can.Mustache.tags 0
				 * 
				 * @signature `{{key}}`
				 * 
				 * @param {can.Mustache.key} key A key that references one of the following:
				 * 
				 *  - A [can.Mustache.registerHelper registered helper].
				 *  - A value within the current or parent 
				 *    [can.Mustache.context context]. If the value is a function or [can.compute], the 
				 *    function's return value is used.
				 * 
				 * @return {String|Function|*} 
				 * 
				 * After the key's value is found (and set to any function's return value), 
				 * it is passed to [can.view.txt] as the result of a call to its `func` 
				 * argument. There, if the value is a:
				 * 
				 *  - `null` or `undefined` - an empty string is inserted into the rendered template result.
				 *  - `String` or `Number` - the value is inserted into the rendered template result.
				 *  - `Function` - A [can.view.hook hookup] attribute or element is inserted so this function
				 *    will be called back with the DOM element after it is created.
				 * 
				 * @body
				 * 
				 * ## Use
				 * 
				 * `{{key}}` insert data into the template. It most commonly references 
				 * values within the current [can.Mustache.context context]. For example:
				 * 
				 * Rendering:
				 * 
				 *     <h1>{{name}}</h1>
				 * 
				 * With:
				 * 
				 *     {name: "Austin"}
				 * 
				 * Results in:
				 * 
				 *     <h1>Austin</h1>
				 * 
				 * If the key value is a String or Number, it is inserted into the template.  
				 * If it is `null` or `undefined`, nothing is added to the template.
				 * 
				 * 
				 * ## Nested Properties
				 * 
				 * Mustache supports nested paths, making it possible to 
				 * look up properties nested deep inside the current context. For example:
				 * 
				 * Rendering:
				 * 
				 *     <h1>{{book.author}}</h1>
				 * 
				 * With:
				 * 
				 *     {
				 *       book: {
				 *         author: "Ernest Hemingway"
				 *       }
				 *     }
				 * 
				 * Results in:
				 * 
				 *     <h1>Ernest Hemingway</h1>
				 * 
				 * ## Looking up values in parent contexts
				 * 
				 * Sections and block helpers can create their own contexts. If a key's value
				 * is not found in the current context, it will look up the key's value
				 * in parent contexts. For example:
				 * 
				 * Rendering:
				 * 
				 *     {{#chapters}}
				 *        <li>{{title}} - {{name}}</li>
				 *     {{chapters}}
				 * 
				 * With:
				 * 
				 *     {
				 *       title: "The Book of Bitovi"	
				 *       chapters: [{name: "Breakdown"}]
				 *     }
				 *   
				 * Results in:
				 * 
				 *     <li>The Book of Bitovi - Breakdown</li>
				 * 
				 * 
				 */
				// Return unescaped
				["returnLeft", "{{{", "{{[{&]"],
				// Full line comments
				["commentFull", "{{!}}", "^[\\s\\t]*{{!.+?}}\\n"],
				/**
				 * @function can.Mustache.tags.comment {{!key}}
				 * 
				 * @parent can.Mustache.tags 7
				 * 
				 * @description A comment that doesn't get inserted into the rendered result.
				 * 
				 * @signature `{{!key}}`
				 * 
				 * The comment tag operates similarly to a `<!-- -->` tag in HTML. It exists in your template but never shows up.
				 * 
				 * @param {can.Mustache.key} key Everything within this tag is completely ignored.
				 * @return {String} 
				 * 
				 */
				// Inline comments
				["commentLeft", "{{!", "(\\n[\\s\\t]*{{!|{{!)"],
				/**
				 * @function can.Mustache.tags.unescaped {{{key}}}
				 * 
				 * @parent can.Mustache.tags 1
				 * 
				 * @description Insert the unescaped value of the [can.Mustache.key key] into the 
				 * output of the template.
				 * 
				 * @signature `{{{key}}}`
				 * 
				 * Behaves just like [can.Mustache.tags.escaped {{key}}] and [can.Mustache.helpers.helper {{helper}}] but does not
				 * escape the result. 
				 * 
				 * @param {can.Mustache.key} key A key that references a value within the current or parent 
				 * context. If the value is a function or can.compute, the function's return value is used.
				 * @return {String|Function|*} 
				 * 
				 * 
				 */
				//
				/**
				 * @function can.Mustache.tags.unescaped2 {{&key}}
				 * 
				 * @parent can.Mustache.tags 2
				 * 
				 * @description Insert the unescaped value of the [can.Mustache.key key] into the 
				 * output of the template.
				 * 
				 * @signature `{{&key}}`
				 * 
				 * The `{{&key}}` tag is an alias for [can.Mustache.tags.unescaped {{{key}}}], behaving just 
				 * like [can.Mustache.tags.escaped {{key}}] and [can.Mustache.helpers.helper {{helper}}] but does not
				 * escape the result. 
				 * 
				 * @param {can.Mustache.key} key A key that references a value within the current or parent 
				 * context. If the value is a function or can.compute, the function's return value is used.
				 * @return {String|Function|*} 
				 * 
				 */
				// Full line escapes
				// This is used for detecting lines with only whitespace and an escaped tag
				["escapeFull", "{{}}", "(^[\\s\\t]*{{[#/^][^}]+?}}\\n|\\n[\\s\\t]*{{[#/^][^}]+?}}\\n|\\n[\\s\\t]*{{[#/^][^}]+?}}$)", function(content) {
					return {
						before: /^\n.+?\n$/.test(content) ? '\n' : '',
						content: content.match(/\{\{(.+?)\}\}/)[1] || ''
					};
				}],
				// Return escaped
				["escapeLeft", "{{"],
				// Close return unescaped
				["returnRight", "}}}"],
				// Close tag
				["right", "}}"]
			],
			
			// ## Scanning Helpers
			//
			// This is an array of helpers that transform content that is within escaped tags like `{{token}}`. These helpers are solely for the scanning phase; they are unrelated to Mustache/Handlebars helpers which execute at render time. Each helper has a definition like the following:
			//
			//		{
			//			// The content pattern to match in order to execute.
			//			// Only the first matching helper is executed.
			//			name: /pattern to match/,
			//
			//			// The function to transform the content with.
			//			// @param {String} content   The content to transform.
			//			// @param {Object} cmd       Scanner helper data.
			//			//                           {
			//			//                             insert: "insert command",
			//			//                             tagName: "div",
			//			//                             status: 0
			//			//                           }
			//			fn: function(content, cmd) {
			//				return 'for text injection' || 
			//					{ raw: 'to bypass text injection' };
			//			}
			//		}
			helpers: [
				// ### Partials
				//
				// Partials begin with a greater than sign, like {{> box}}.
				// 
				// Partials are rendered at runtime (as opposed to compile time), 
				// so recursive partials are possible. Just avoid infinite loops.
				// 
				// For example, this template and partial:
				// 
				// 		base.mustache:
				// 			<h2>Names</h2>
				// 			{{#names}}
				// 				{{> user}}
				// 			{{/names}}
				// 			
				// 		user.mustache:
				// 			<strong>{{name}}</strong>
				{
					name: /^>[\s]*\w*/,
					fn:function(content, cmd){
						// Get the template name and call back into the render method,
						// passing the name and the current context.
						var templateName = can.trim(content.replace(/^>\s?/, '')).replace(/["|']/g, "");
						return "can.Mustache.renderPartial('"+templateName+"'," + ARG_NAMES + ")";
					}
				},

				// ### Data Hookup
				// 
				// This will attach the data property of `this` to the element
				// its found on using the first argument as the data attribute
				// key.
				// 
				// For example:
				// 	
				//		<li id="nameli" {{ data 'name' }}></li>
				// 
				// then later you can access it like:
				// 
				//		can.$('#nameli').data('name');
				/**
				 * @function can.Mustache.helpers.data {{data name}}
				 * @parent can.Mustache.htags 7
				 * @signature `{{data name}}`
				 * 
				 * Adds the current [can.Mustache.context context] to the
				 * element's [can.data].
				 * 
				 * @param {String} name The name of the data attribute to use for the
				 * context.
				 * 
				 * @body
				 * 
				 * ## Use 
				 * 
				 * It is common for you to want some data in the template to be available
				 * on an element.  `{{data name}}` allows you to save the 
				 * context so it can later be retrieved by [can.data] or 
				 * `$.fn.data`. For example,
				 * 
				 * The template:
				 * 
				 *     <ul>
				 *       <li id="person" {{data 'person'}}>{{name}}</li>
				 *     </ul>
				 * 
				 * Rendered with:
				 * 
				 *     document.body.appendChild(
				 *       can.view.mustache(template,{ person: { name: 'Austin' } });
				 * 
				 * Retrieve the person data back with:
				 * 
				 *     $("#person").data("person")
				 * 
				 */
				{
					name: /^\s*data\s/,
					fn: function(content, cmd){
						var attr = content.match(/["|'](.*)["|']/)[1];
						// return a function which calls `can.data` on the element
						// with the attribute name with the current context.
						return "can.proxy(function(__){" +
							// "var context = this[this.length-1];" +
							// "context = context." + STACKED + " ? context[context.length-2] : context; console.warn(this, context);" +
							"can.data(can.$(__),'" + attr + "', this.attr('.')); }, " + SCOPE + ")";
					}
				},
				{
					name:/\s*\(([\$\w]+)\)\s*->([^\n]*)/,
					fn: function(content){
						var quickFunc = /\s*\(([\$\w]+)\)\s*->([^\n]*)/,
							parts = content.match(quickFunc);
						
						//find 
						return "can.proxy(function(__){var " + parts[1] + "=can.$(__);with("+SCOPE+".attr('.')){" + parts[2] + "}}, this);";
					}
				},
				// ### Transformation (default)
				//
				// This transforms all content to its interpolated equivalent,
				// including calls to the corresponding helpers as applicable. 
				// This outputs the render code for almost all cases.
				//
				// #### Definitions
				// 
				// * `context` - This is the object that the current rendering context operates within. 
				//		Each nested template adds a new `context` to the context stack.
				// * `stack` - Mustache supports nested sections, 
				//		each of which add their own context to a stack of contexts.
				//		Whenever a token gets interpolated, it will check for a match against the 
				//		last context in the stack, then iterate through the rest of the stack checking for matches.
				//		The first match is the one that gets returned.
				// * `Mustache.txt` - This serializes a collection of logic, optionally contained within a section.
				//		If this is a simple interpolation, only the interpolation lookup will be passed.
				//		If this is a section, then an `options` object populated by the truthy (`options.fn`) and 
				//		falsey (`options.inverse`) encapsulated functions will also be passed. This section handling 
				//		exists to support the runtime context nesting that Mustache supports.
				// * `Mustache.get` - This resolves an interpolation reference given a stack of contexts.
				// * `options` - An object containing methods for executing the inner contents of sections or helpers.  
				//		`options.fn` - Contains the inner template logic for a truthy section.  
				//		`options.inverse` - Contains the inner template logic for a falsey section.  
				//		`options.hash` - Contains the merged hash object argument for custom helpers.
				//
				// #### Design
				//
				// This covers the design of the render code that the transformation helper generates.
				//
				// ##### Pseudocode
				// 
				// A detailed explanation is provided in the following sections, but here is some brief pseudocode
				// that gives a high level overview of what the generated render code does (with a template similar to  
				// `"{{#a}}{{b.c.d.e.name}}{{/a}}" == "Phil"`).
				//
				// *Initialize the render code.*
				// 
				// 		view = []
				// 		context = []
				// 		stack = fn { context.concat([this]) }
				// 		
				// *Render the root section.*
				//
				// 		view.push( "string" )
				// 		view.push( can.view.txt(
				//
				// *Render the nested section with `can.Mustache.txt`.*
				//
				// 			txt( 
				//
				// *Add the current context to the stack.*
				//
				// 				stack(), 
				//
				// *Flag this for truthy section mode.*
				//
				// 				"#",
				//
				// *Interpolate and check the `a` variable for truthyness using the stack with `can.Mustache.get`.*
				// 
				// 				get( "a", stack() ),
				//
				// *Include the nested section's inner logic.
				// The stack argument is usually the parent section's copy of the stack, 
				// but it can be an override context that was passed by a custom helper.
				// Sections can nest `0..n` times -- **NESTCEPTION**.*
				//
				// 				{ fn: fn(stack) {
				//
				// *Render the nested section (everything between the `{{#a}}` and `{{/a}}` tokens).*
				//
				// 					view = []
				// 					view.push( "string" )
				// 					view.push(
				//
				// *Add the current context to the stack.*
				//
				// 						stack(),
				//
				// *Flag this as interpolation-only mode.*
				//
				// 						null,
				//
				// *Interpolate the `b.c.d.e.name` variable using the stack.*
				//
				// 						get( "b.c.d.e.name", stack() ),
				// 					)
				// 					view.push( "string" )
				//
				// *Return the result for the nested section.*
				//
				// 					return view.join()
				// 				}}
				// 			)
				// 		))
				// 		view.push( "string" )
				//
				// *Return the result for the root section, which includes all nested sections.*
				//
				// 		return view.join()
				//
				// ##### Initialization
				//
				// Each rendered template is started with the following initialization code:
				//
				// 		var ___v1ew = [];
				// 		var ___c0nt3xt = [];
				// 		___c0nt3xt.__sc0pe = true;
				// 		var __sc0pe = function(context, self) {
				// 			var s;
				// 			if (arguments.length == 1 && context) {
				// 				s = !context.__sc0pe ? [context] : context;
				// 			} else {
				// 				s = context && context.__sc0pe 
				//					? context.concat([self]) 
				//					: __sc0pe(context).concat([self]);
				// 			}
				// 			return (s.__sc0pe = true) && s;
				// 		};
				//
				// The `___v1ew` is the the array used to serialize the view.
				// The `___c0nt3xt` is a stacking array of contexts that slices and expands with each nested section.
				// The `__sc0pe` function is used to more easily update the context stack in certain situations.
				// Usually, the stack function simply adds a new context (`self`/`this`) to a context stack. 
				// However, custom helpers will occasionally pass override contexts that need their own context stack.
				//
				// ##### Sections
				//
				// Each section, `{{#section}} content {{/section}}`, within a Mustache template generates a section 
				// context in the resulting render code. The template itself is treated like a root section, with the 
				// same execution logic as any others. Each section can have `0..n` nested sections within it.
				//
				// Here's an example of a template without any descendent sections.  
				// Given the template: `"{{a.b.c.d.e.name}}" == "Phil"`  
				// Would output the following render code:
				//
				//		___v1ew.push("\"");
				//		___v1ew.push(can.view.txt(1, '', 0, this, function() {
				// 			return can.Mustache.txt(__sc0pe(___c0nt3xt, this), null, 
				//				can.Mustache.get("a.b.c.d.e.name", 
				//					__sc0pe(___c0nt3xt, this))
				//			);
				//		}));
				//		___v1ew.push("\" == \"Phil\"");
				//
				// The simple strings will get appended to the view. Any interpolated references (like `{{a.b.c.d.e.name}}`) 
				// will be pushed onto the view via `can.view.txt` in order to support live binding.
				// The function passed to `can.view.txt` will call `can.Mustache.txt`, which serializes the object data by doing 
				// a context lookup with `can.Mustache.get`.
				//
				// `can.Mustache.txt`'s first argument is a copy of the context stack with the local context `this` added to it.
				// This stack will grow larger as sections nest.
				//
				// The second argument is for the section type. This will be `"#"` for truthy sections, `"^"` for falsey, 
				// or `null` if it is an interpolation instead of a section.
				//
				// The third argument is the interpolated value retrieved with `can.Mustache.get`, which will perform the 
				// context lookup and return the approriate string or object.
				//
				// Any additional arguments, if they exist, are used for passing arguments to custom helpers.
				//
				// For nested sections, the last argument is an `options` object that contains the nested section's logic.
				//
				// Here's an example of a template with a single nested section.  
				// Given the template: `"{{#a}}{{b.c.d.e.name}}{{/a}}" == "Phil"`  
				// Would output the following render code:
				//
				//		___v1ew.push("\"");
				// 		___v1ew.push(can.view.txt(0, '', 0, this, function() {
				// 			return can.Mustache.txt(__sc0pe(___c0nt3xt, this), "#", 
				//				can.Mustache.get("a", __sc0pe(___c0nt3xt, this)), 
				//					[{
				// 					_: function() {
				// 						return ___v1ew.join("");
				// 					}
				// 				}, {
				// 					fn: function(___c0nt3xt) {
				// 						var ___v1ew = [];
				// 						___v1ew.push(can.view.txt(1, '', 0, this, 
				//								function() {
				//  								return can.Mustache.txt(
				// 									__sc0pe(___c0nt3xt, this), 
				// 									null, 
				// 									can.Mustache.get("b.c.d.e.name", 
				// 										__sc0pe(___c0nt3xt, this))
				// 								);
				// 							}
				// 						));
				// 						return ___v1ew.join("");
				// 					}
				// 				}]
				//			)
				// 		}));
				//		___v1ew.push("\" == \"Phil\"");
				//
				// This is specified as a truthy section via the `"#"` argument. The last argument includes an array of helper methods used with `options`.
				// These act similarly to custom helpers: `options.fn` will be called for truthy sections, `options.inverse` will be called for falsey sections.
				// The `options._` function only exists as a dummy function to make generating the section nesting easier (a section may have a `fn`, `inverse`,
				// or both, but there isn't any way to determine that at compilation time).
				// 
				// Within the `fn` function is the section's render context, which in this case will render anything between the `{{#a}}` and `{{/a}}` tokens.
				// This function has `___c0nt3xt` as an argument because custom helpers can pass their own override contexts. For any case where custom helpers
				// aren't used, `___c0nt3xt` will be equivalent to the `__sc0pe(___c0nt3xt, this)` stack created by its parent section. The `inverse` function
				// works similarly, except that it is added when `{{^a}}` and `{{else}}` are used. `var ___v1ew = []` is specified in `fn` and `inverse` to 
				// ensure that live binding in nested sections works properly.
				//
				// All of these nested sections will combine to return a compiled string that functions similar to EJS in its uses of `can.view.txt`.
				//
				// #### Implementation
				{
					name: /^.*$/,
					fn: function(content, cmd) {
						var mode = false,
							result = [];

						// Trim the content so we don't have any trailing whitespace.
						content = can.trim(content);

						// Determine what the active mode is.
						// 
						// * `#` - Truthy section
						// * `^` - Falsey section
						// * `/` - Close the prior section
						// * `else` - Inverted section (only exists within a truthy/falsey section)
						if (content.length && (mode = content.match(/^([#^/]|else$)/))) {
							mode = mode[0];
							switch (mode) {
								/**
								 * @function can.Mustache.helpers.section {{#key}}
								 * @parent can.Mustache.tags 3
								 * 
								 * @signature `{{#key}}BLOCK{{/key}}`
								 * 
								 * Render blocks of text one or more times, depending 
								 * on the value of the key in the current context.
								 * 
								 * @param {can.Mustache.key} key A key that references a value within the current or parent 
								 * [can.Mustache.context context]. If the value is a function or [can.compute], the 
								 * function's return value is used.
								 * 
								 * 
								 * @return {String} 
								 * 
								 * Depending on the value's type, the following actions happen:
								 * 
								 * - `Array` or [can.List] - the block is rendered for 
								 *   each item in the array. The [can.Mustache.context context] is set to 
								 *   the item within each block rendering.
								 * - A `truthy` value - the block is rendered with the [can.Mustache.context context]
								 *   set to the value.
								 * - A `falsey` value - the block is not rendered.
								 * 
								 * The rendered result of the blocks, block or an empty string is returned.
								 * 
								 * @body
								 * 
								 * Sections contain text blocks and evaluate whether to render it or not.  If
								 * the object evaluates to an array it will iterate over it and render the block
								 * for each item in the array.  There are four different types of sections.
								 * 
								 * ## Falseys or Empty Arrays
								 * 
								 * If the value returns a `false`, `undefined`, `null`, `""` or `[]` we consider
								 * that a *falsey* value.
								 * 
								 * If the value is falsey, the section will **NOT** render the block.
								 * 
								 * 	{ 
								 * 		friends: false
								 * 	}
								 * 
								 * 	{{#friends}}
								 * 		Never shown!
								 * 	{{/friends}}
								 * 
								 * 
								 * ## Arrays
								 * 
								 * If the value is a non-empty array, sections will iterate over the 
								 * array of items, rendering the items in the block.
								 * 
								 * For example, a list of friends will iterate
								 * over each of those items within a section.
								 * 
								 *     { 
								 *         friends: [ 
								 *             { name: "Austin" }, 
								 *             { name: "Justin" } 
								 *         ] 
								 *     }
								 * 
								 *     <ul>
								 *         {{#friends}}
								 *             <li>{{name}}</li>
								 *         {{/friends}}
								 *     </ul>
								 * 
								 * would render:
								 * 
								 *     <ul>
								 *         <li>Austin</li>
								 *         <li>Justin</li>
								 *     </ul>
								 * 
								 * Reminder: Sections will reset the current context to the value for which it is iterating.
								 * See the [basics of contexts](#Basics) for more information.
								 * 
								 * ## Truthys
								 * 
								 * When the value is a non-falsey object but not a list, it is considered truthy and will be used 
								 * as the context for a single rendering of the block.
								 * 
								 *     {
								 *         friends: { name: "Jon" }
								 *     }
								 * 
								 *     {{#friends}}
								 *         Hi {{name}}
								 *     {{/friends}}
								 * 
								 * would render:
								 * 
								 *     Hi Jon!
								 */
								// 
								/**
								 * @function can.Mustache.helpers.helper {{helper args hashes}}
								 * @parent can.Mustache.htags 0
								 * 
								 * @description Calls a mustache helper function and inserts its return value into
								 * the rendered template.
								 * 
								 * @signature `{{helper [args...] [hashProperty=hashValue...]}}`
								 * 
								 * Calls a mustache helper function or a function. For example:
								 * 
								 * The template:
								 * 
								 *     <p>{{madLib "Lebron James" verb 4 foo="bar"}}</p>
								 * 
								 * Rendered with:
								 * 
								 *     {verb: "swept"}
								 * 
								 * Will call a `madLib` helper with the following arguements:
								 * 
								 *     can.Mustache.registerHelper('madLib', 
								 *       function(subject, verb, number, options){
								 *         // subject -> "Lebron James"
								 *         // verb -> "swept"
								 *         // number -> 4
								 *         // options.hash.foo -> "bar"
								 *     });
								 * 
								 * @param {can.Mustache.key} helper A key that finds a [can.Mustache.helper helper function]
								 * that is either [can.Mustache.registerHelper registered] or found within the
								 * current or parent [can.Mustache.context context].
								 * 
								 * @param {...can.Mustache.key|String|Number} [args] Space seperated arguments
								 * that get passed to the helper function as arguments. If the key's value is a:
								 * 
								 *  - [can.Map] - A getter/setter [can.compute] is passed.
								 *  - [can.compute] - The can.compute is passed.
								 *  - `function` - The function's return value is passed.
								 * 
								 * @param {String} hashProperty
								 * 
								 * A property name that gets added to a [can.Mustache.helperOptions helper options]'s 
								 * hash object.
								 * 
								 * @param {...can.Mustache.key|String|Number} hashValue A value that gets 
								 * set as a property value of the [can.Mustache.helperOptions helper option argument]'s 
								 * hash object.
								 * 
								 * @body
								 * 
								 * ## Use
								 * 
								 * The `{{helper}}` syntax is used to call out to Mustache [can.Mustache.helper helper functions] functions 
								 * that may contain more complex functionality. `helper` is a [can.Mustache.key key] that must match either:
								 * 
								 *  - a [can.Mustache.registerHelper registered helper function], or
								 *  - a function in the current or parent [can.Mustache.context contexts]
								 * 
								 * The following example shows both cases.
								 * 
								 * The Template:
								 * 
								 *     <p>{{greeting}} {{user}}</p>
								 * 
								 * Rendered with data:
								 * 
								 *     {
								 *       user: function(){ return "Justin" }
								 *     }
								 * 
								 * And a with a registered helper like:
								 * 
								 *     can.Mustache.registerHelper('greeting', function(){
								 *       return "Hello"
								 *     });
								 * 
								 * Results in:
								 * 
								 *     <p>Hello Justin</p>
								 * 
								 * ## Arguments
								 * 
								 * Arguments can be passed from the template to helper function by
								 * listing space seperated strings, numbers or other [can.Mustache.key keys] after the
								 * `helper` name.  For example:
								 * 
								 * The template:
								 * 
								 *     <p>{{madLib "Lebron James" verb 4}}</p>
								 * 
								 * Rendered with:
								 * 
								 *     {verb: "swept"}
								 * 
								 * Will call a `madLib` helper with the following arguements:
								 * 
								 *     can.Mustache.registerHelper('madLib', 
								 *       function(subject, verb, number, options){
								 *         // subject -> "Lebron James"
								 *         // verb -> "swept"
								 *         // number -> 4
								 *     });
								 * 
								 * If an argument `key` value is a [can.Map] property, the Observe's 
								 * property is converted to a getter/setter [can.compute]. For example:
								 * 
								 * The template:
								 * 
								 *     <p>What! My name is: {{mr user.name}}</p>
								 * 
								 * Rendered with:
								 * 
								 *     {user: new can.Map({name: "Slim Shady"})}
								 * 
								 * Needs the helper to check if name is a function or not:
								 * 
								 *     can.Mustache.registerHelper('mr',function(name){
								 *       return "Mr. "+ (typeof name === "function" ?
								 *                       name():
								 *                       name)
								 *     })
								 * 
								 * This behavior enables two way binding helpers and is explained in more detail 
								 * on the [can.Mustache.helper helper functions] docs.
								 * 
								 * ## Hash
								 * 
								 * If enumerated arguments isn't an appropriate way to configure the behavior
								 * of a helper, it's possible to pass a hash of key-value pairs to the
								 * [can.Mustache.helperOptions helper option argument]'s 
								 * hash object.  Properties and values are specified 
								 * as `hashProperty=hashValue`.  For example:
								 * 
								 * The template:
								 * 
								 *     <p>My {{excuse who=pet how="shreded"}}</p>
								 * `
								 * And the helper:
								 * 
								 *     can.Mustache.registerHelper("excuse",function(options){
								 *       return ["My",
								 *         options.hash.who || "dog".
								 *         options.hash.how || "ate",
								 *         "my",
								 *         options.hash.what || "homework"].join(" ")
								 *     })
								 * 
								 * Render with:
								 * 
								 *     {pet: "cat"}
								 * 
								 * Results in:
								 * 
								 *     <p>My cat shareded my homework</p>
								 * 
								 * ## Returning an element callback function
								 * 
								 * If a helper returns a function, that function is called back after
								 * the template has been rendered into DOM elements. This can 
								 * be used to create mustache tags that have rich behavior. Read about it
								 * on the [can.Mustache.helper helper function] page.
								 * 
								 */
								// 
								/**
								 * @function can.Mustache.helpers.sectionHelper {{#helper args hashes}}
								 * @parent can.Mustache.htags 1
								 * 
								 * Calls a mustache helper function with a block, and optional inverse 
								 * block.
								 * 
								 * @signature `{{#helper [args...] [hashName=hashValue...]}}BLOCK{{/helper}}`
								 * 
								 * Calls a mustache helper function or a function with a block to 
								 * render.
								 * 
								 * The template:
								 * 
								 *     <p>{{countTo number}}{{num}}{{/countTo}}</p>
								 * 
								 * Rendered with:
								 * 
								 *     {number: 5}
								 * 
								 * Will call the `countTo` helper:
								 * 
								 *     can.Mustache.registerHelper('madLib', 
								 *       function(number, options){
								 * 	       var out = []
								 *         for(var i =0; i < number; i++){
								 *           out.push( options.fn({num: i+1}) )
								 *         }
								 *         return out.join(" ")
								 *     });
								 * 
								 * Results in:
								 * 
								 *     <p>1 2 3 4 5</p>
								 * 
								 * @param {can.Mustache.key} helper A key that finds a [can.Mustache.helper helper function]
								 * that is either [can.Mustache.registerHelper registered] or found within the
								 * current or parent [can.Mustache.context context].
								 * 
								 * @param {...can.Mustache.key|String|Number} [args] Space seperated arguments
								 * that get passed to the helper function as arguments. If the key's value is a:
								 * 
								 *  - [can.Map] - A getter/setter [can.compute] is passed.
								 *  - [can.compute] - The can.compute is passed.
								 *  - `function` - The function's return value is passed.
								 * 
								 * @param {String} hashProperty
								 * 
								 * A property name that gets added to a [can.Mustache.helperOptions helper options]'s 
								 * hash object.
								 * 
								 * @param {...can.Mustache.key|String|Number} hashValue A value that gets 
								 * set as a property value of the [can.Mustache.helperOptions helper option argument]'s 
								 * hash object.
								 * 
								 * @param {mustache} BLOCK A mustache template that gets compiled and
								 * passed to the helper function as the [can.Mustache.helperOptions options argument's] `fn`
								 * property.
								 * 
								 * 
								 * @signature `{{#helper [args...] [hashName=hashValue...]}}BLOCK{{else}}INVERSE{{/helper}}`
								 * 
								 * Calls a mustache helper function or a function with a `fn` and `inverse` block to
								 * render.
								 * 
								 * The template:
								 * 
								 *     <p>The bed is 
								 *        {{isJustRight firmness}}
								 *           pefect!
								 *        {{else}}
								 *           uncomfortable.
								 *        {{/justRight}}</p>
								 * 
								 * Rendered with:
								 * 
								 *     {firmness: 45}
								 * 
								 * Will call the `isJustRight` helper:
								 * 
								 *     can.Mustache.registerHelper('isJustRight', 
								 *       function(number, options){
								 * 	       if(number > 50){
								 *           return options.fn(this)  
								 *         } else {
								 *           return options.inverse(this)  
								 *         }
								 *         return out.join(" ")
								 *     });
								 * 
								 * Results in:
								 * 
								 *     <p>The bed is uncomfortable.</p>
								 * 
								 * @param {can.Mustache.key} helper A key that finds a [can.Mustache.helper helper function]
								 * that is either [can.Mustache.registerHelper registered] or found within the
								 * current or parent [can.Mustache.context context].
								 * 
								 * @param {...can.Mustache.key|String|Number} [args] Space seperated arguments
								 * that get passed to the helper function as arguments. If the key's value is a:
								 * 
								 *  - [can.Map] - A getter/setter [can.compute] is passed.
								 *  - [can.compute] - The can.compute is passed.
								 *  - `function` - The function's return value is passed.
								 * 
								 * @param {String} hashProperty
								 * 
								 * A property name that gets added to a [can.Mustache.helperOptions helper options]'s 
								 * hash object.
								 * 
								 * @param {...can.Mustache.key|String|Number} hashValue A value that gets 
								 * set as a property value of the [can.Mustache.helperOptions helper option argument]'s 
								 * hash object.
								 * 
								 * @param {mustache} BLOCK A mustache template that gets compiled and
								 * passed to the helper function as the [can.Mustache.helperOptions options argument's] `fn`
								 * property.
								 * 
								 * @param {mustache} INVERSE A mustache template that gets compiled and
								 * passed to the helper function as the [can.Mustache.helperOptions options argument's] `inverse`
								 * property.
								 * 
								 * 
								 * @body
								 * 
								 * ## Use
								 * 
								 * Read the [use section of {{helper}}](can.Mustache.helpers.helper.html#section_Use) to better understand how:
								 * 
								 *  - [Helper functions are found](can.Mustache.helpers.helper.html#section_Arguments)
								 *  - [Arguments are passed to the helper](can.Mustache.helpers.helper.html#section_Arguments)
								 *  - [Hash values are passed to the helper](can.Mustache.helpers.helper.html#section_Hash)
								 * 
								 * Read how [helpers that return functions](can.Mustache.helper.html#section_Returninganelementcallbackfunction) can
								 * be used for rich behavior like 2-way binding.
								 * 
								 */
								// Open a new section.
								case '#':
								/**
								 * @function can.Mustache.helpers.inverse {{^key}}
								 * @parent can.Mustache.tags 5
								 * 
								 * @signature `{{^key}}BLOCK{{/key}}`
								 * 
								 * Render blocks of text if the value of the key
								 * is falsey.  An inverted section syntax is similar to regular 
								 * sections except it begins with a caret rather than a 
								 * pound. If the value referenced is falsey, the section will render.
								 * 
								 * @param {can.Mustache.key} key A key that references a value within the current or parent 
								 * [can.Mustache.context context]. If the value is a function or [can.compute], the 
								 * function's return value is used.
								 * 
								 * @return {String} 
								 * 
								 * Depending on the value's type, the following actions happen:
								 * 
								 * - A `truthy` value - the block is not rendered.
								 * - A `falsey` value - the block is rendered.
								 * 
								 * The rendered result of the block or an empty string is returned.
								 * 
								 * @body
								 * 
								 * ## Use
								 * 
								 * Inverted sections match falsey values. An inverted section 
								 * syntax is similar to regular sections except it begins with a caret 
								 * rather than a pound. If the value referenced is falsey, the section 
								 * will render. For example:
								 * 
								 * 
								 * The template:
								 * 
								 *     <ul>
								 *         {{#friends}}
								 *             </li>{{name}}</li>
								 *         {{/friends}}
								 *         {{^friends}}
								 *             <li>No friends.</li>
								 *         {{/friends}}
								 *     </ul>
								 * 
								 * And data:
								 * 
								 *     {
								 *         friends: []
								 *     }
								 * 
								 * Results in:
								 * 
								 * 
								 *     <ul>
								 *         <li>No friends.</li>
								 *     </ul>
								 */
								case '^':
									if(cmd.specialAttribute) {
										result.push(cmd.insert + 'can.view.onlytxt(this,function(){ return ');
									} else {
										result.push(cmd.insert + 'can.view.txt(0,\'' + cmd.tagName + '\',' + cmd.status + ',this,function(){ return ');
									}
									break;
								// Close the prior section.
								/**
								 * @function can.Mustache.helpers.close {{/key}}
								 * @parent can.Mustache.tags 4
								 * 
								 * @signature `{{/key}}`
								 * 
								 * Ends a [can.Mustache.helpers.section {{#key}}] or [can.Mustache.helpers.sectionHelper {{#helper}}]
								 * block.
								 * 
								 * @param {can.Mustache.key} [key] A key that matches the opening key or helper name. It's also
								 * possible to simply write `{{/}}` to end a block.
								 */
								case '/':
									return { raw: 'return ___v1ew.join("");}}])}));' };
									break;
							}
							
							// Trim the mode off of the content.
							content = content.substring(1);
						}
						
						// `else` helpers are special and should be skipped since they don't 
						// have any logic aside from kicking off an `inverse` function.
						if (mode != 'else') {
							var args = [],
								i = 0,
								hashing = false,
								arg, split, m;
							
							// Start the content render block.
							result.push('can.Mustache.txt(\n'+CONTEXT_OBJ+',\n' + (mode ? '"'+mode+'"' : 'null') + ',');
							
							// Parse the helper arguments.
							// This needs uses this method instead of a split(/\s/) so that 
							// strings with spaces can be correctly parsed.
							var args = [],
								hashes = [];
							
							(can.trim(content)+' ').replace(argumentsRegExp, function(whole, arg) {
								
								// Check for special helper arguments (string/number/boolean/hashes).
								if (i && (m = arg.match(literalNumberStringBooleanRegExp))) {
									// Found a native type like string/number/boolean.
									if (m[2]) {
										args.push(m[0]);
									}
									// Found a hash object.
									else {
										// Addd to the hash object.
										
										hashes.push(m[4]+":"+(m[6] ? m[6] : makeLookupLiteral(m[5])))
									}
								}
								// Otherwise output a normal interpolation reference.
								else {
									args.push( makeLookupLiteral(arg) );
								}
								i++;
							});

							result.push(args.join(","));
							if( hashes.length ) {
								result.push(",{"+HASH+":{"+hashes.join(",")+"}}")
							}
							
						
						}
						
						// Create an option object for sections of code.
						mode && mode != 'else' && result.push(',[\n\n');
						switch (mode) {
							// Truthy section
							case '#':
								result.push('{fn:function(' + ARG_NAMES + '){var ___v1ew = [];');
								break;
							// If/else section
							// Falsey section
							/**
							 * @function can.Mustache.helpers.else {{else}}
							 * @parent can.Mustache.htags 3
							 *
							 * @signature `{{#helper}}BLOCK{{else}}INVERSE{{/helper}}`
							 * 
							 * Creates an `inverse` block for a [can.Mustache.helper helper function]'s 
							 * [can.Mustache.helperOptions options argument]'s `inverse` property.
							 * 
							 * @param {can.Mustache} INVERSE a mustache template coverted to a
							 * function and set as the [can.Mustache.helper helper function]'s 
							 * [can.Mustache.helperOptions options argument]'s `inverse` property.
							 * 
							 * @body
							 * 
							 * ## Use
							 * 
							 * For more information on how `{{else}}` is used checkout:
							 * 
							 *  - [can.Mustache.helpers.if {{if key}}]
							 *  - [can.Mustache.helpers.sectionHelper {{#helper}}]
							 * 
							 */
							case 'else':
								result.push('return ___v1ew.join("");}},\n{inverse:function(' + ARG_NAMES + '){\nvar ___v1ew = [];');
								break;
							case '^':
								result.push('{inverse:function(' + ARG_NAMES + '){\nvar ___v1ew = [];');
								break;
							
							// Not a section, no mode
							default:
								result.push(')');
								break;
						}
						
						// Return a raw result if there was a section, otherwise return the default string.
						result = result.join('');
						return mode ? { raw: result } : result;
					}
				}
			]
		})
	});

	// Add in default scanner helpers first.
	// We could probably do this differently if we didn't 'break' on every match.
	var helpers = can.view.Scanner.prototype.helpers;
	for (var i = 0; i < helpers.length; i++) {
		Mustache.prototype.scanner.helpers.unshift(helpers[i]);
	};

	/**
	 * @function can.Mustache.txt
	 * @hide
	 * 
	 * Evaluates the resulting string based on the context/name.
	 *
	 * @param {Object|Array} context	The context stack to be used with evaluation.
	 * @param {String} mode		The mode to evaluate the section with: # for truthy, ^ for falsey
	 * @param {String|Object} name	The string (or sometimes object) to pass to the given helper method.
	 */
	Mustache.txt = function(scopeAndOptions, mode, name) {
		var scope = scopeAndOptions.scope,
			options = scopeAndOptions.options,
			args = [],
			helperOptions = {
				fn: function() {},
				inverse: function() {}
			},
			hash,
			context = scope.attr("."),
			getHelper = true; 
		
		// convert lookup values to actual values in name, arguments, and hash
		for(var i =3; i < arguments.length;i++){
			var arg = arguments[i]
			if(mode && can.isArray( arg )){
				// merge into options
				helperOptions = can.extend.apply(can, [helperOptions].concat(arg))
			} else if(arg && arg[HASH]){
				hash = arg[HASH];
				// get values on hash
				for(var prop in hash){
					if(isLookup(hash[prop]) ){
						hash[prop] = Mustache.get(hash[prop].get, scopeAndOptions)
					}
				}
			} else if(arg && isLookup(arg)){
				args.push( Mustache.get(arg.get, scopeAndOptions, false, true) );
			} else {
				args.push(arg)
			}
		}
		
		if( isLookup(name) ){
			var get = name.get;
			name = Mustache.get(name.get, scopeAndOptions, args.length , false);
			
			// Base whether or not we will get a helper on whether or not the original
			// name.get and Mustache.get resolve to the same thing. Saves us from running
			// into issues like {{text}} / {text: 'with'}
			getHelper = (get === name);
		}	
			
		// overwrite fn and inverse to always convert to scopes
		helperOptions.fn = makeConvertToScopes(helperOptions.fn, scope, options);
		helperOptions.inverse = makeConvertToScopes(helperOptions.inverse, scope, options)

		// Check for a registered helper or a helper-like function.
		if (helper = ( getHelper && (typeof name === "string" && Mustache.getHelper(name,options)  )|| (can.isFunction(name) && !name.isComputed && { fn: name }))) {
			// Add additional data to be used by helper functions
			
			can.extend(helperOptions,{
				context: context,
				scope: scope,
				contexts: scope,
				hash: hash
			})

			args.push(helperOptions)
			// Call the helper.
			return helper.fn.apply(context, args) || '';
		}

		
		if( can.isFunction(name)  ){
			if ( name.isComputed ) {
				name = name();
			} 
		}

		// An array of arguments to check for truthyness when evaluating sections.
		var validArgs = args.length ? args : [name],
			// Whether the arguments meet the condition of the section.
			valid = true,
			result = [],
			i, helper, argIsObserve, arg;
		// Validate the arguments based on the section mode.
		if (mode) {
			for (i = 0; i < validArgs.length; i++) {
				arg          = validArgs[i];
				argIsObserve = typeof arg !== 'undefined' && isObserveLike(arg);
				// Array-like objects are falsey if their length = 0.
				if (isArrayLike(arg)) {
					// Use .attr to trigger binding on empty lists returned from function
					if(mode == '#'){
						valid = valid && !!(argIsObserve ? arg.attr('length') : arg.length);
					} else if(mode == '^'){
						valid = valid && !(argIsObserve ? arg.attr('length') : arg.length);
					}
				}
				// Otherwise just check if it is truthy or not.
				else {
					valid = mode == '#' ? valid && !!arg
						: mode == '^' ? valid && !arg
						: valid;
				}
			}
		}
		
		// Otherwise interpolate like normal.
		if (valid) {
			switch (mode) {
				// Truthy section.
				case '#':
					// Iterate over arrays
					if (isArrayLike(name)) {
						var isObserveList = isObserveLike(name);
						
						// Add the reference to the list in the contexts.
						for (i = 0; i < name.length; i++) {
							result.push( helperOptions.fn(name[i]) );
							
							// Ensure that live update works on observable lists
							isObserveList && name.attr(''+i);
						}
						return result.join('');
					}
					// Normal case.
					else {
						return helperOptions.fn(name || {}) || '';
					}
					break;
				// Falsey section.
				case '^':
					return helperOptions.inverse(name || {}) || '';
					break;
				default:
					// Add + '' to convert things like numbers to strings.
					// This can cause issues if you are trying to
					// eval on the length but this is the more
					// common case.
					return '' + (name != undefined ? name : '');
					break;
			}
		}
		
		return '';
	};
	
	/**
	 * @function can.Mustache.get
	 * @hide
	 *
	 * Resolves a key for a given object (and then a context if that fails).
	 *	obj = this
	 *	context = { a: true }
	 *	ref = 'a.b.c'
	 *		=> obj.a.b.c || context.a.b.c || ''
	 *
	 * This implements the following Mustache specs:
	 * 	Deeply Nested Contexts
	 *	All elements on the context stack should be accessible.
	 *		{{#bool}}B {{#bool}}C{{/bool}} D{{/bool}}
	 *		{ bool: true }
	 *		=> "B C D"
	 * 	Basic Context Miss Interpolation
	 * 	Failed context lookups should default to empty strings.
	 *  	{{cannot}}
	 *		=> ""
	 * 	Dotted Names - Broken Chains
	 * 	Any falsey value prior to the last part of the name should yield ''.
	 *		{{a.b.c}}
	 *		{ a: { d: 1 } }
	 *		=> ""
	 *
	 * @param {can.Mustache.key} key      The reference to check for on the obj/context.
	 * @param {Object} obj  		The object to use for checking for a reference.
	 * @param {Object} context  The context to use for checking for a reference if it doesn't exist in the object.
	 * @param {Boolean} [isHelper]  Whether the reference is seen as a helper.
	 */
	Mustache.get = function(key, scopeAndOptions, isHelper, isArgument) {
		
		// Cache a reference to the current context and options, we will use them a bunch.
		var context = scopeAndOptions.scope.attr('.'),
			options = scopeAndOptions.options || {};;
		
		// If key is called as a helper,
		if(isHelper){
			// try to find a registered helper.
			if(Mustache.getHelper(key, options)){
				return key
			}
			// Support helper-like functions as anonymous helpers.
			// Check if there is a method directly in the "top" context.
			if(scopeAndOptions.scope && can.isFunction(context[key]) ){
				return context[key];
			}
			
		}
		
		// Get a compute (and some helper data) that represents key's value in the current scope
		var computeData = scopeAndOptions.scope.computeData(key, {isArgument:isArgument, args: [context, scopeAndOptions.scope]}),
			compute = computeData.compute;
			
		// Bind on the compute to cache its value. We will unbind in a timeout later.
		can.compute.temporarilyBind(compute);
		
		// computeData gives us an initial value
		var initialValue = computeData.initialValue;
		
		// Use helper over the found value if the found value isn't in the current context
		if( (initialValue === undefined || computeData.scope != scopeAndOptions.scope) &&  Mustache.getHelper(key, options) ){
			return key
		}
		
		
		// If there are no dependencies, just return the value.
		if( ! compute.hasDependencies ) {
			return initialValue;
		} else {
			return compute;
		}
	};
	
	/**
	 * @hide
	 *
	 * Resolves an object to its truthy equivalent.
	 *
	 * @param {Object} value    The object to resolve.
	 * @return {Object} The resolved object.
	 */
	Mustache.resolve = function(value) {
		if (isObserveLike(value) && isArrayLike(value) && value.attr('length')){
			return value;
		} else if (can.isFunction(value)) {
			return value();
		}
		else {
			return value;
		}
	};
	
	/**
	 * @static
	 */
	
	var OptionsScope = can.view.Scope.extend({
		init: function(data, parent){
			if(!data.helpers && !data.partials){
				data = {
					helpers: data
				}
			}
			can.view.Scope.prototype.init.apply(this, arguments)
		}
	})
	
	
	// ## Helpers
	//
	// Helpers are functions that can be called from within a template.
	// These helpers differ from the scanner helpers in that they execute
	// at runtime instead of during compilation.
	//
	// Custom helpers can be added via `can.Mustache.registerHelper`,
	// but there are also some built-in helpers included by default.
	// Most of the built-in helpers are little more than aliases to actions 
	// that the base version of Mustache simply implies based on the 
	// passed in object.
	// 
	// Built-in helpers:
	// 
	// * `data` - `data` is a special helper that is implemented via scanning helpers. 
	//		It hooks up the active element to the active data object: `<div {{data "key"}} />`
	// * `if` - Renders a truthy section: `{{#if var}} render {{/if}}`
	// * `unless` - Renders a falsey section: `{{#unless var}} render {{/unless}}`
	// * `each` - Renders an array: `{{#each array}} render {{this}} {{/each}}`
	// * `with` - Opens a context section: `{{#with var}} render {{/with}}`
	Mustache._helpers = {};
	/**
	 * @description Register a helper.
	 * @function can.Mustache.registerHelper registerHelper
	 * @signature `Mustache.registerHelper(name, helper)`
	 * @param {String} name The name of the helper.
	 * @param {can.Mustache.helper} helper The helper function.
	 * 
	 * @body
	 * Registers a helper with the Mustache system.
	 * Pass the name of the helper followed by the
	 * function to which Mustache should invoke.
	 * These are run at runtime.
	 */
	Mustache.registerHelper = function(name, fn){
		this._helpers[name]={ name: name, fn: fn };
	};
	
	/**
	 * @hide
	 * @function can.Mustache.getHelper getHelper
	 * @description Retrieve a helper.
	 * @signature `Mustache.getHelper(name)`
	 * @param {String} name The name of the helper.
	 * @return {Function|null} The helper, or `null` if
	 * no helper by that name is found.
	 *
	 * @body 
	 * Returns a helper given the name.
	 */
	Mustache.getHelper = function(name,options) {
		var helper = options.attr("helpers."+name)
		return helper ? { fn: helper } : this._helpers[name];	
	};

	/**
	 * @function can.Mustache.static.render render
	 * @hide
	 * @parent can.Mustache.static
	 * @signature `Mustache.render(partial, context)`
	 * @param {Object} partial
	 * @param {Object} context
	 *
	 * @body
	 * `Mustache.render` is a helper method that calls
	 * into `can.view.render` passing the partial 
	 * and the context object.  
	 * 
	 * Its purpose is to determine if the partial object 
	 * being passed represents a template like:
	 *
	 * 		partial === "movember.mustache"
	 *
	 * or if the partial is a variable name that represents
	 * a partial on the context object such as:
	 *
	 * 		context[partial] === "movember.mustache"
	 */
	Mustache.render = function(partial, context, options){
		// Make sure the partial being passed in
		// isn't a variable like { partial: "foo.mustache" }
		if(!can.view.cached[partial] && context.attr('partial')){
			partial = context.attr('partial');
		}

		// Call into `can.view.render` passing the
		// partial and context.
		return can.view.render(partial, context/*, options*/);
	};

	/**
   * @function can.Mustache.safeString
   * @signature `can.Mustache.safeString(str)`
   *
   * @param {String} str A string you don't want to become escaped.
   * @return {String} A string flagged by `can.Mustache` as safe, which will
   * not become escaped, even if you use [can.Mustache.tags.unescaped](triple slash).
   *
   * @body
   * If you write a helper that generates its own HTML, you will
   * usually want to return a `can.Mustache.safeString.` In this case,
   * you will want to manually escape parameters with `[can.esc].`
   *
   * @codestart
   * can.Mustache.registerHelper('link', function(text, url) {
   *   text = can.esc(text);
   *   url  = can.esc(url);
   *
   *   var result = '&lt;a href="' + url + '"&gt;' + text + '&lt;/a&gt;';
   *   return can.Mustache.safeString(result);
   * });
   * @codeend
   *
   * Rendering:
   * @codestart
   * &lt;div&gt;{{link "Google", "http://google.com"}}&lt;/div&gt;
   * @codeend
   *
   * Results in:
   *
   * @codestart
   * &lt;div&gt;&lt;a href="http://google.com"&gt;Google&lt;/a&gt;&lt;/div&gt;
   * @codeend
   *
   * As an anchor tag whereas if we would have just returned the result rather than a
   * `can.Mustache.safeString` our template would have rendered a div with the escaped anchor tag.
   *
   */
  Mustache.safeString = function(str) {
    return {
      toString: function() {
        return str;
      }
    }
  };

	Mustache.renderPartial = function(partialName,scope,options) {
		var partial = options.attr("partials."+partialName)
		if(partial){
			return partial.render ? partial.render(scope,options) :
					partial(scope,options);
		} else {
			return can.Mustache.render(partialName,scope,options);
		}
	};

	// The built-in Mustache helpers.
	can.each({
		// Implements the `if` built-in helper.
		/**
		 * @function can.Mustache.helpers.if {{#if key}}
		 * @parent can.Mustache.htags 2
		 * @signature `{{#if key}}BLOCK{{/if}}`
	 	 * 
	 	 * Renders the `BLOCK` template within the current template.
	 	 * 
	 	 * @param {can.Mustache.key} key A key that references a value within the current or parent 
	 	 * context. If the value is a function or can.compute, the function's return value is used.
	 	 * 
	 	 * @param {can.Mustache} BLOCK A mustache template.
	 	 * 
	 	 * @return {String} If the key's value is truthy, the `BLOCK` is rendered with the
	 	 * current context and its value is returned; otherwise, an empty string.
	 	 * 
	 	 * @body
	 	 * 
	 	 * ## Use
	 	 * 
		 * `{{#if key}}` provides explicit conditional truthy tests. For example,
		 * 
		 * The template:
		 * 
		 *     {{#if user.isFemale}}
		 *       {{#if user.isMarried}}
		 *         Mrs 
		 *       {{/if}}
		 *       {{#if user.isSingle}}
		 *         Miss 
		 *       {{/if}}
		 *     {{/if}}
		 * 
		 * Rendered with:
		 * 
		 *     {user: {isFemale: true, isMarried: true}}
		 *     
		 * Results in:
		 * 
		 *     Mrs
		 * 
		 * If can be used with [can.Mustache.helpers.else {{else}}] too. For example,
		 * 
		 *     {{#if user.isFemale}}
		 *       {{#if user.isMarried}}
		 *         Mrs 
		 *       {{else}}
		 *         Miss 
		 *       {{/if}}
		 *     {{/if}}
		 * 
		 * Rendered with:
		 * 
		 *     {user: {isFemale: true, isMarried: false}}
		 *     
		 * Results in:
		 * 
		 *     Miss
		 */
		'if': function(expr, options){
			var value;
			// if it's a function, wrap its value in a compute
			// that will only change values from true to false
			if(can.isFunction(expr)){
				value = can.compute.truthy(expr)()
			} else {
				value = !!Mustache.resolve(expr)
			}
			
			if ( value ) {
				return options.fn(options.contexts || this);
			}
			else {
				return options.inverse(options.contexts || this);
			}
		},
		// Implements the `unless` built-in helper.
		/**
		 * @function can.Mustache.helpers.unless {{#unless key}}
		 * @parent can.Mustache.htags 4
		 * 
	 	 * @signature `{{#unless key}}BLOCK{{/unless}}`
	 	 * 
	 	 * Render the block of text if the key's value is falsey.
	 	 * 
	 	 * @param {can.Mustache.key} key A key that references a value within the current or parent 
		 * context. If the value is a function or can.compute, the function's 
		 * return value is used.
		 * 
	 	 * @param {can.Mustache} BLOCK A template that is rendered 
	 	 * if the `key`'s value is falsey.
	 	 * 
	 	 * @body
	 	 * 
		 * The `unless` helper evaluates the inverse of the value
		 * of the key and renders the block between the helper and the slash.
		 * 
		 *     {{#unless expr}}
		 *       // unless
		 *     {{/unless}}
		 */
		'unless': function(expr, options){
			if (!Mustache.resolve(expr)) {
				return options.fn(options.contexts || this);
			}
		},
		
		// Implements the `each` built-in helper.
		/**
		 * @function can.Mustache.helpers.each {{#each key}}
	 	 * @parent can.Mustache.htags 5
	 	 * 
	 	 * @signature `{{#each key}}BLOCK{{/each}}`
	 	 * 
	 	 * Render the block of text for each item in key's value.
	 	 * 
	 	 * @param {can.Mustache.key} key A key that references a value within the current or parent 
		 * context. If the value is a function or can.compute, the function's 
		 * return value is used.
		 * 
		 * If the value of the key is a [can.List], the resulting HTML is updated when the
		 * list changes. When a change in the list happens, only the minimum amount of DOM
		 * element changes occur.
		 *
		 * If the value of the key is a [can.Map], the resulting HTML is updated whenever
		 * attributes are added or removed. When a change in the map happens, only 
		 * the minimum amount of DOM element changes occur.
	 	 * 
	 	 * @param {can.Mustache} BLOCK A template that is rendered for each item in 
	 	 * the `key`'s value. The `BLOCK` is rendered with the context set to the item being rendered.
	 	 * 
	 	 * @body
	 	 * 
	 	 * ## Use
	 	 * 
	 	 * Use the `each` helper to iterate over a array
		 * of items and render the block between the helper and the slash. For example,
		 * 
		 * The template:
		 * 
		 *     <ul>
		 *       {{#each friends}}
		 *         <li>{{name}}</li>
		 *       {{/each}}
		 *     </ul>
		 * 
		 * Rendered with:
		 * 
		 *     {friends: [{name: "Austin"},{name: "Justin"}]}
		 * 
		 * Renders:
		 * 
		 *     <ul>
		 *       <li>Austin</li>
		 *       <li>Justin</li>
		 *     </ul>
		 *
		 * ## Object iteration
		 *
		 * As of 2.1, you can now iterate over properties of objects and attributes with
		 * the `each` helper. When iterating over [can.Map] it will only iterate over the
		 * map's [keys](can.Map.keys.html) and none of the hidden properties of a can.Map. For example,
		 * 
		 * The template:
		 * 
		 *     <ul>
		 *       {{#each person}}
		 *         <li>{{.}}</li>
		 *       {{/each}}
		 *     </ul>
		 * 
		 * Rendered with:
		 * 
		 *     {person: {name: 'Josh', age: 27}}
		 * 
		 * Renders:
		 * 
		 *     <ul>
		 *       <li>Josh</li>
		 *       <li>27</li>
		 *     </ul>
		 */
		'each': function(expr, options) {
			// Check if this is a list or a compute that resolves to a list, and setup
			// the incremental live-binding 
			
			
			// First, see what we are dealing with.  It's ok to read the compute
			// because can.view.text is only temporarily binding to what is going on here.
			// Calling can.view.lists prevents anything from listening on that compute.
			var resolved = Mustache.resolve(expr);
			
			if(resolved instanceof can.List){
				return can.view.lists && can.view.lists(expr, function(item, index) {
					return options.fn( options.scope.add({"@index": index}).add(item) );
				});
			}
			expr = resolved;
			
			if (!!expr && isArrayLike(expr)) {
				var result = [];
				for (var i = 0; i < expr.length; i++) {
					var index = function() {
						return i;
					};
					
					result.push(options.fn(options.scope.add({"@index": index}).add(expr[i])));
				}
				return result.join('');
			}
			else if(isObserveLike(expr)) {
				var result = [],
					// listen to keys changing so we can livebind lists of attributes.
					keys = can.Map.keys(expr);
				for (var i = 0; i < keys.length; i++) {
					var key = keys[i];
					result.push(options.fn(options.scope.add({"@key": key}).add(expr[key])));
				}
				return result.join('');
			}
			else if(expr instanceof Object) {
				var result = [];
				for (var key in expr) {
					result.push(options.fn(options.scope.add({"@key": key}).add(expr[key])));
				}
				return result.join('');

			}
		},
		// Implements the `with` built-in helper.
		/**
		 * @function can.Mustache.helpers.with {{#with key}}
		 * @parent can.Mustache.htags 6
		 * 
		 * @signature `{{#with key}}BLOCK{{/with}}`
		 * 
		 * Changes the context within a block.
		 * 
		 * @param {can.Mustache.key} key A key that references a value within the current or parent 
		 * context. If the value is a function or can.compute, the function's 
		 * return value is used.
		 * 
	 	 * @param {can.Mustache} BLOCK A template that is rendered 
	 	 * with the context of the `key`'s value.
		 * 
		 * @body
	 	 * 
		 * Mustache typically applies the context passed in the section 
		 * at compiled time.  However, if you want to override this 
		 * context you can use the `with` helper.
		 * 
		 *     {{#with arr}}
		 *       // with
		 *     {{/with}}
		 */
		'with': function(expr, options){
			var ctx = expr;
			expr = Mustache.resolve(expr);
			if (!!expr) {
				return options.fn(ctx);
			}
		},
		/**
		 * @function can.Mustache.helpers.log {{log}}
		 * @parent can.Mustache.htags 9
		 * 
		 * @signature `{{#log [message]}}`
		 * 
		 * Logs the context of the current block with an optional message.
		 * 
		 * @param {*} message An optional message to log out in addition to the 
		 * current context. 
		 *
		 */
		'log': function(expr, options) {
			if(console !== undefined) {
				if(!options) {
					console.log(expr.context);
				}
				else {
					console.log(expr, options.context);	
				}
			}
		}
		/**
		 * @function can.Mustache.helpers.elementCallback {{(el)->CODE}}
		 *
		 * @parent can.Mustache.htags 8
		 *
		 * @signature `{{(el) -> CODE}}`
		 * 
		 * Executes an element callback with the inline code on the element.
		 * 
		 * @param {String} code The inline code to execute on the element.
		 * 
		 * @body
		 * 
		 * ## Use 
		 * 
		 * It is common for you to want to execute some code on a given 
		 * DOM element. An example would be for initializing a jQuery plugin 
		 * on the new HTML.
		 * 
		 * 		<div class="tabs" {{(el) -> el.jquery_tabs()}}></div>
		 * 
		 */
		//
		/**
		 * @function can.Mustache.helpers.index {{@index}}
		 *
		 * @parent can.Mustache.htags 10
		 *
		 * @signature `{{@index [offset]}}`
		 * 
		 * Insert the index of an Array or can.List we are iterating on with [#each](can.Mustache.helpers.each)
		 * 
		 * @param {Number} offset The number to optionally offset the index by.
		 * 
		 * @body
		 * 
		 * ## Use 
		 * 
		 * When iterating over and array or list of items, you might need to render the index
		 * of the item. Use the `@index` directive to do so. For example,
		 *
		 * The template:
		 * 
		 *     <ul>
		 *       {{#each items}}
		 *         <li> {{@index}} - {{.}} </li>
		 *       {{/each}}
		 *     </ul>
		 * 
		 * Rendered with:
		 * 
		 *     { items: ['Josh', 'Eli', 'David'] }
		 * 
		 * Renders:
		 * 
		 *     <ul>
		 *       <li> 0 - Josh </li>
		 *       <li> 1 - Eli </li>
		 *       <li> 2 - David </li>
		 *     </ul>
		 * 
		 */
		 //
		/**
		 * @function can.Mustache.helpers.key {{@key}}
		 *
		 * @parent can.Mustache.htags 11
		 *
		 * @signature `{{@key}}`
		 * 
		 * Insert the property name of an Object or attribute name of a can.Map that we iterate over with [#each](can.Mustache.helpers.each)
		 * 
		 * @body
		 * 
		 * ## Use 
		 * 
		 * Use `{{@key}}` to render the property or attribute name of an Object or can.Map, when iterating over it with [#each](can.Mustache.helpers.each). For example,
		 * 
		 * The template:
		 * 
		 *     <ul>
		 *       {{#each person}}
		 *         <li> {{@key}}: {{.}} </li>
		 *       {{/each}}
		 *     </ul>
		 * 
		 * Rendered with:
		 * 
		 *     { person: {name: 'Josh', age: 27, likes: 'Mustache, JavaScript, High Fives'} }
		 * 
		 * Renders:
		 * 
		 *     <ul>
		 *       <li> name: Josh </li>
		 *       <li> age: 27 </li>
		 *       <li> likes: Mustache, JavaScript, High Fives </li>
		 *     </ul>
		 * 
		 */
	}, function(fn, name){
		Mustache.registerHelper(name, fn);
	});
	
	// ## Registration
	//
	// Registers Mustache with can.view.
	can.view.register({
		suffix: "mustache",

		contentType: "x-mustache-template",

		// Returns a `function` that renders the view.
		script: function( id, src ) {
			return "can.Mustache(function("+ARG_NAMES+") { " + new Mustache({
				text: src,
				name: id
			}).template.out + " })";
		},

		renderer: function( id, text ) {
			return Mustache({
				text: text,
				name: id
			});
		}
	});

	return can;
});
/**
 * @license RequireJS text 2.0.10 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('requirejs-text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.10',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                errback(e);
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes,
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});

define('requirejs-text!demo/../../template/partial/touch.hbs',[],function () { return '{{#if area}}\n    <div style="outline:.1em solid lime;width:{{area.width}}px;height:{{area.height}}px;position:fixed;top:{{area.top}}px;left:{{area.left}}px"></div>\n{{/if}}';});

define('demo/view',['can/view/mustache', 'requirejs-text!../../template/partial/touch.hbs'], function (can, template) {
    
    return can.view.mustache(template);
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/control',["can/util/library", "can/construct"], function( can ) {
	// ## control.js
	// `can.Control`  
	// _Controller_
	
	// Binds an element, returns a function that unbinds.
	var bind = function( el, ev, callback ) {

			can.bind.call( el, ev, callback );

			return function() {
				can.unbind.call(el, ev, callback);
			};
		},
		isFunction = can.isFunction,
		extend = can.extend,
		each = can.each,
		slice = [].slice,
		paramReplacer = /\{([^\}]+)\}/g,
		special = can.getObject("$.event.special", [can]) || {},

		// Binds an element, returns a function that unbinds.
		delegate = function( el, selector, ev, callback ) {
			can.delegate.call(el, selector, ev, callback);
			return function() {
				can.undelegate.call(el, selector, ev, callback);
			};
		},
		
		// Calls bind or unbind depending if there is a selector.
		binder = function( el, ev, callback, selector ) {
			return selector ?
				delegate( el, can.trim( selector ), ev, callback ) : 
				bind( el, ev, callback );
		},
		
		basicProcessor;

	var Control = can.Control = can.Construct(
	/**
	 * @add can.Control
	 */
	//
	/** 
	 * @static
	 */
	{
		// Setup pre-processes which methods are event listeners.
		/**
		 * @hide
		 * 
		 * Setup pre-process which methods are event listeners.
		 * 
		 */
		setup: function() {

			// Allow contollers to inherit "defaults" from super-classes as it 
			// done in `can.Construct`
			can.Construct.setup.apply( this, arguments );

			// If you didn't provide a name, or are `control`, don't do anything.
			if ( can.Control ) {

				// Cache the underscored names.
				var control = this,
					funcName;

				// Calculate and cache actions.
				control.actions = {};
				for ( funcName in control.prototype ) {
					if ( control._isAction(funcName) ) {
						control.actions[funcName] = control._action(funcName);
					}
				}
			}
		},
		// Moves `this` to the first argument, wraps it with `jQuery` if it's an element
		_shifter : function( context, name ) {

			var method = typeof name == "string" ? context[name] : name;

			if ( ! isFunction( method )) {
				method = context[ method ];
			}
			
			return function() {
				context.called = name;
				return method.apply(context, [this.nodeName ? can.$(this) : this].concat( slice.call(arguments, 0)));
			};
		},

		// Return `true` if is an action.
		/**
		 * @hide
		 * @param {String} methodName a prototype function
		 * @return {Boolean} truthy if an action or not
		 */
		_isAction: function( methodName ) {
			
			var val = this.prototype[methodName],
				type = typeof val;
			// if not the constructor
			return (methodName !== 'constructor') &&
				// and is a function or links to a function
				( type == "function" || (type == "string" &&  isFunction(this.prototype[val] ) ) ) &&
				// and is in special, a processor, or has a funny character
				!! ( special[methodName] || processors[methodName] || /[^\w]/.test(methodName) );
		},
		// Takes a method name and the options passed to a control
		// and tries to return the data necessary to pass to a processor
		// (something that binds things).
		/**
		 * @hide
		 * Takes a method name and the options passed to a control
		 * and tries to return the data necessary to pass to a processor
		 * (something that binds things).
		 * 
		 * For performance reasons, this called twice.  First, it is called when 
		 * the Control class is created.  If the methodName is templated
		 * like: "{window} foo", it returns null.  If it is not templated
		 * it returns event binding data.
		 * 
		 * The resulting data is added to this.actions.
		 * 
		 * When a control instance is created, _action is called again, but only
		 * on templated actions.  
		 * 
		 * @param {Object} methodName the method that will be bound
		 * @param {Object} [options] first param merged with class default options
		 * @return {Object} null or the processor and pre-split parts.  
		 * The processor is what does the binding/subscribing.
		 */
		_action: function( methodName, options ) {
			
			// If we don't have options (a `control` instance), we'll run this 
			// later.  
			paramReplacer.lastIndex = 0;
			if ( options || ! paramReplacer.test( methodName )) {
				// If we have options, run sub to replace templates `{}` with a
				// value from the options or the window
				var convertedName = options ? can.sub(methodName, this._lookup(options)) : methodName;
				if(!convertedName) {
					return null;
				}
				// If a `{}` template resolves to an object, `convertedName` will be
				// an array
				var arr = can.isArray(convertedName),

					// Get the name
					name = arr ? convertedName[1] : convertedName,

					// Grab the event off the end
					parts = name.split(/\s+/g),
					event = parts.pop();

				return {
					processor: processors[event] || basicProcessor,
					parts: [name, parts.join(" "), event],
					delegate : arr ? convertedName[0] : undefined
				};
			}
		},
		_lookup: function(options){
			return [options, window]
		},
		// An object of `{eventName : function}` pairs that Control uses to 
		// hook up events auto-magically.
		/**
		 * @property {Object.<can.Control.processor>} can.Control.processors processors
		 * @parent can.Control.static
		 * 
		 * @description A collection of hookups for custom events on Controls.
		 *
		 * @body
		 * `processors` is an object that allows you to add new events to bind
		 * to on a control, or to change how existent events are bound. Each
		 * key-value pair of `processors` is a specification that pertains to
		 * an event where the key is the name of the event, and the value is
		 * a function that processes calls to bind to the event.
		 *
		 * The processor function takes five arguments:
		 * 
		 * - _el_: The Control's element.
		 * - _event_: The event type.
		 * - _selector_: The selector preceding the event in the binding used on the Control.
		 * - _callback_: The callback function being bound.
		 * - _control_: The Control the event is bound on.
		 *
		 * Inside your processor function, you should bind _callback_ to the event, and
		 * return a function for can.Control to call when _callback_ needs to be unbound.
		 * (If _selector_ is defined, you will likely want to use some form of delegation
		 * to bind the event.)
		 *
		 * Here is a Control with a custom event processor set and two callbacks bound
		 * to that event:
		 *
		 * @codestart
		 * can.Control.processors.birthday = function(el, ev, selector, callback, control) {
		 *   if(selector) {
		 *     myFramework.delegate(ev, el, selector, callback);
		 *     return function() { myFramework.undelegate(ev, el, selector, callback); };
		 *   } else {
	     *     myFramework.bind(ev, el, callback);
		 *     return function() { myFramework.unbind(ev, el, callback); };  
		 *   }
		 * };
		 *
		 * can.Control("EventTarget", { }, {
		 *   'birthday': function(el, ev) {
		 *     // do something appropriate for the occasion
		 *   },
		 *   '.grandchild birthday': function(el, ev) {
		 *     // do something appropriate for the occasion
		 *   }
		 * });
		 *
		 * var target = new EventTarget('#person');
		 * @codeend
		 *
		 * When `target` is initialized, can.Control will call `can.Control.processors.birthday`
		 * twice (because there are two event hookups for the _birthday_ event). The first
		 * time it's called, the arguments will be:
		 * 
		 * - _el_: A NodeList that wraps the element with id 'person'.
		 * - _ev_: `'birthday'`
		 * - _selector_: `''`
		 * - _callback_: The function assigned to `' birthday'` in the prototype section of `EventTarget`'s
		 * definition.
		 * - _control_: `target` itself.
		 * 
		 * The second time, the arguments are slightly different:
		 * 
		 * - _el_: A NodeList that wraps the element with id 'person'.
		 * - _ev_: `'birthday'`
		 * - _selector_: `'.grandchild'`
		 * - _callback_: The function assigned to `'.grandchild birthday'` in the prototype section of `EventTarget`'s
		 * definition.
		 * - _control_: `target` itself.
		 *
		 * can.Control already has processors for these events:
		 * 
		 *   - change 
		 *   - click 
		 *   - contextmenu 
		 *   - dblclick 
		 *   - focusin
		 *   - focusout
		 *   - keydown 
		 *   - keyup 
		 *   - keypress 
		 *   - mousedown 
		 *   - mouseenter
		 *   - mouseleave
		 *   - mousemove 
		 *   - mouseout 
		 *   - mouseover 
		 *   - mouseup 
		 *   - reset 
		 *   - resize 
		 *   - scroll 
		 *   - select 
		 *   - submit  
		 */
		processors: {},
		// A object of name-value pairs that act as default values for a 
		// control instance
		defaults: {}
		/**
		 * @property {Object} can.Control.defaults defaults
		 * @parent can.Control.static
		 * @description Default values for the Control's options.
		 *
		 * @body
		 * `defaults` provides default values for a Control's options.
		 * Options passed into the constructor function will be shallowly merged
		 * into the values from defaults in [can.Control::setup], and
		 * the result will be stored in [can.Control::options this.options].
		 * 
		 *     Message = can.Control.extend({
		 *       defaults: {
		 *         message: "Hello World"
		 *       }
		 *     }, {
		 *       init: function(){
		 *         this.element.text( this.options.message );
		 *       }
		 *     });
		 *
		 *     new Message( "#el1" ); //writes "Hello World"
		 *     new Message( "#el12", { message: "hi" } ); //writes hi
		 */
	},
	{
		/**
		 * @prototype
		 */
		// Sets `this.element`, saves the control in `data, binds event
		// handlers.
		/**
		 * @property {NodeList} can.Control.prototype.element element
		 * @parent can.Control.prototype
		 * @description The element associated with this control.
		 * 
		 * @body
		 * The library-wrapped element this control is associated with,
		 * as passed into the constructor. If you want to change the element
		 * that a Control will attach to, you should do it in [can.Control::setup setup].
		 * If you change the element later, make sure to call [can.Control::on on]
		 * to rebind all the bindings.
		 *
		 * If `element` is removed from the DOM, [can.Control::destroy] will
		 * be called and the Control will be destroyed.
		 */
		//
		/**
		 * @function can.Control.prototype.setup setup
		 * @parent can.Control.prototype
		 * @description Perform pre-initialization logic.
		 * @signature `control.setup(element, options)`
		 * @param {HTMLElement|NodeList|String} element The element as passed to the constructor.
		 * @param {Object} [options] option values for the control.  These get added to
		 * this.options and merged with [can.Control.static.defaults defaults].
		 * @return {undefined|Array} return an array if you want to change what init is called with. By
		 * default it is called with the element and options passed to the control.
		 * 
		 * @body
		 * Setup is where most of control's magic happens.  It does the following:
		 * 
		 * ### Sets this.element
		 * 
		 * The first parameter passed to new Control( el, options ) is expected to be 
		 * an element.  This gets converted to a Wrapped NodeList element and set as
		 * [can.Control.prototype.element this.element].
		 * 
		 * ### Adds the control's name to the element's className
		 * 
		 * Control adds it's plugin name to the element's className for easier 
		 * debugging.  For example, if your Control is named "Foo.Bar", it adds
		 * "foo_bar" to the className.
		 * 
		 * ### Saves the control in $.data
		 * 
		 * A reference to the control instance is saved in $.data.  You can find 
		 * instances of "Foo.Bar" like: 
		 * 
		 *     $( '#el' ).data( 'controls' )[ 'foo_bar' ]
		 *
		 * ### Merges Options
		 * Merges the default options with optional user-supplied ones.
		 * Additionally, default values are exposed in the static [can.Control.static.defaults defaults] 
		 * so that users can change them.
		 * 
		 * ### Binds event handlers
		 * 
		 * Setup does the event binding described in [can.Control].
		 */
		setup: function( element, options ) {

			var cls = this.constructor,
				pluginname = cls.pluginName || cls._fullName,
				arr;

			// Want the raw element here.
			this.element = can.$(element)

			if ( pluginname && pluginname !== 'can_control') {
				// Set element and `className` on element.
				this.element.addClass(pluginname);
			}
			
			(arr = can.data(this.element,"controls")) || can.data(this.element,"controls",arr = []);
			arr.push(this);
			
			// Option merging.
			/**
			 * @property {Object} can.Control.prototype.options options
			 * @parent can.Control.prototype
			 * 
			 * @description
			 * 
			 * Options used to configure a control.
			 * 
			 * @body
			 * 
			 * The `this.options` property is an Object that contains
			 * configuration data passed to a control when it is
			 * created (`new can.Control(element, options)`). 
			 * 
			 * In the following example, an options object with
			 * a message is passed to a `Greeting` control. The 
			 * `Greeting` control changes the text of its [can.Control::element element] 
			 * to the options' message value.
			 * 
			 *     var Greeting = can.Control.extend({
			 *       init: function(){
			 *         this.element.text( this.options.message )  
			 *       }  
			 *     })
			 *     
			 *     new Greeting("#greeting",{message: "I understand this.options"})
			 * 
			 * The options argument passed when creating the control
			 * is merged with [can.Control.defaults defaults] in
			 * [can.Control.prototype.setup setup].
			 * 
			 * In the following example, if no message property is provided,
			 * the defaults' message property is used.
			 * 
			 *     var Greeting = can.Control.extend({
			 *       defaults: {
			 *         message: "Defaults merged into this.options"
			 *       }
			 *     },{
			 *       init: function(){
			 *         this.element.text( this.options.message )  
			 *       }  
			 *     })
			 *     
			 *     new Greeting("#greeting")
			 * 
			 */
			this.options = extend({}, cls.defaults, options);

			// Bind all event handlers.
			this.on();

			// Gets passed into `init`.
			/**
			 * @property {can.NodeList} can.Control.prototype.element element
			 * 
			 * @description The element the Control is associated with.
			 * 
			 * @parent can.Control.prototype
			 * 
			 * @body
			 * 
			 * The control instance's HTMLElement (or window) wrapped by the 
			 * util library for ease of use. It is set by the first
			 * parameter to `new can.Construct( element, options )` 
			 * in [can.Control::setup].  By default, a control listens to events on `this.element`.
			 * 
			 * ### Quick Example
			 * 
			 * The following `HelloWorld` control sets the control`s text to "Hello World":
			 * 
			 *     HelloWorld = can.Control({
			 *       init: function(){
			 * 	       this.element.text( 'Hello World' );
			 *       }
			 *     });
			 *     
			 *     // create the controller on the element
			 *     new HelloWorld( document.getElementById( '#helloworld' ) );
			 * 
			 * ## Wrapped NodeList
			 * 
			 * `this.element` is a wrapped NodeList of one HTMLELement (or window).  This
			 * is for convenience in libraries like jQuery where all methods operate only on a
			 * NodeList.  To get the raw HTMLElement, write:
			 * 
			 *     this.element[0] //-> HTMLElement
			 * 
			 * The following details the NodeList used by each library with 
			 * an example of updating its text:
			 * 
			 * __jQuery__ `jQuery( HTMLElement )`
			 * 
			 *     this.element.text("Hello World")
			 * 
			 * __Zepto__ `Zepto( HTMLElement )`
			 * 
			 *     this.element.text("Hello World")
			 * 
			 * __Dojo__ `new dojo.NodeList( HTMLElement )`
			 * 
			 *     this.element.text("Hello World")
			 * 
			 * __Mootools__ `$$( HTMLElement )`
			 * 
			 *     this.element.empty().appendText("Hello World")
			 * 
			 * __YUI__ 
			 * 
			 *     this.element.set("text", "Hello World")
			 * 
			 * 
			 * ## Changing `this.element`
			 * 
			 * Sometimes you don't want what's passed to `new can.Control`
			 * to be this.element.  You can change this by overwriting
			 * setup or by unbinding, setting this.element, and rebinding.
			 * 
			 * ### Overwriting Setup
			 * 
			 * The following Combobox overwrites setup to wrap a
			 * select element with a div.  That div is used 
			 * as `this.element`. Notice how `destroy` sets back the
			 * original element.
			 * 
			 *     Combobox = can.Control({
			 *       setup: function( el, options ) {
			 *          this.oldElement = $( el );
			 *          var newEl = $( '<div/>' );
			 *          this.oldElement.wrap( newEl );
			 *          can.Control.prototype.setup.call( this, newEl, options );
			 *       },
			 *       init: function() {
			 *          this.element //-> the div
			 *       },
			 *       ".option click": function() {
			 *         // event handler bound on the div
			 *       },
			 *       destroy: function() {
			 *          var div = this.element; //save reference
			 *          can.Control.prototype.destroy.call( this );
			 *          div.replaceWith( this.oldElement );
			 *       }
			 *     });
			 * 
			 * ### unbinding, setting, and rebinding.
			 * 
			 * You could also change this.element by calling
			 * [can.Control::off], setting this.element, and 
			 * then calling [can.Control::on] like:
			 * 
			 *     move: function( newElement ) {
			 *        this.off();
			 *        this.element = $( newElement );
			 *        this.on();
			 *     }
			 */
			return [this.element, this.options];
		},
		/**
		 * @function can.Control.prototype.on on
		 * @parent can.Control.prototype
		 * 
		 * @description Bind an event handler to a Control, or rebind all event handlers on a Control.
		 * 
		 * @signature `control.on([el,] selector, eventName, func)`
		 * @param {HTMLElement|jQuery collection|Object} [el=this.element]
		 * The element to be bound.  If no element is provided, the control's element is used instead.
		 * @param {CSSSelectorString} selector A css selector for event delegation.
		 * @param {String} eventName The event to listen for.
		 * @param {Function|String} func A callback function or the String name of a control function.  If a control
		 * function name is given, the control function is called back with the bound element and event as the first
		 * and second parameter.  Otherwise the function is called back like a normal bind.
		 * @return {Number} The id of the binding in this._bindings
		 * 
		 * @body
		 * `on(el, selector, eventName, func)` binds an event handler for an event to a selector under the scope of the given element.
		 *
		 * @signature `control.on()`
		 * 
		 * Rebind all of a control's event handlers.
		 * 
		 * @return {Number} The number of handlers bound to this Control.
		 *
		 * @body
		 * `this.on()` is used to rebind 
		 * all event handlers when [can.Control::options this.options] has changed.  It
		 * can also be used to bind or delegate from other elements or objects.
		 * 
		 * ## Rebinding
		 * 
		 * By using templated event handlers, a control can listen to objects outside
		 * `this.element`.  This is extremely common in MVC programming.  For example,
		 * the following control might listen to a task model's `completed` property and
		 * toggle a strike className like:
		 * 
		 *     TaskStriker = can.Control({
		 *       "{task} completed": function(){
		 * 	       this.update();
		 *       },
		 *       update: function(){
		 *         if ( this.options.task.completed ) {
		 * 	         this.element.addClass( 'strike' );
		 * 	       } else {
		 *           this.element.removeClass( 'strike' );
		 *         }
		 *       }
		 *     });
		 * 
		 *     var taskstriker = new TaskStriker({ 
		 *       task: new Task({ completed: 'true' }) 
		 *     });
		 * 
		 * To update the `taskstriker`'s task, add a task method that updates
		 * this.options and rebinds the event handlers for the new task like:
		 * 
		 *     TaskStriker = can.Control({
		 *       "{task} completed": function(){
		 * 	       this.update();
		 *       },
		 *       update: function() {
		 *         if ( this.options.task.completed ) {
		 * 	         this.element.addClass( 'strike' );
		 * 	       } else {
		 *           this.element.removeClass( 'strike' );
		 *         }
		 *       },
		 *       task: function( newTask ) {
		 *         this.options.task = newTask;
		 *         this.on();
		 *         this.update();
		 *       }
		 *     });
		 * 
		 *     var taskstriker = new TaskStriker({ 
		 *       task: new Task({ completed: true }) 
		 *     });
		 *     taskstriker.task( new TaskStriker({ 
		 *       task: new Task({ completed: false }) 
		 *     }));
		 * 
		 * ## Adding new events
		 * 
		 * If events need to be bound to outside of the control and templated event handlers
		 * are not sufficient, you can call this.on to bind or delegate programmatically:
		 * 
		 *     init: function() {
		 *        // calls somethingClicked( el, ev )
		 *        this.on( 'click', 'somethingClicked' ); 
		 *     
		 *        // calls function when the window is clicked
		 *        this.on( window, 'click', function( ev ) {
		 *          //do something
		 *        });
		 *     },
		 *     somethingClicked: function( el, ev ) {
		 *       
		 *     }
		 */
		on: function( el, selector, eventName, func ) {
			if ( ! el ) {

				// Adds bindings.
				this.off();

				// Go through the cached list of actions and use the processor 
				// to bind
				var cls = this.constructor,
					bindings = this._bindings,
					actions = cls.actions,
					element = this.element,
					destroyCB = can.Control._shifter(this,"destroy"),
					funcName, ready;
					
				for ( funcName in actions ) {
					// Only push if we have the action and no option is `undefined`
					if ( actions.hasOwnProperty( funcName ) &&
						(ready = actions[funcName] || cls._action(funcName, this.options))) {
						bindings.push(ready.processor(ready.delegate || element,
							ready.parts[2], ready.parts[1], funcName, this));
					}
				}
	
	
				// Setup to be destroyed...  
				// don't bind because we don't want to remove it.
				can.bind.call(element,"removed", destroyCB);
				bindings.push(function( el ) {
					can.unbind.call(el,"removed", destroyCB);
				});
				return bindings.length;
			}

			if ( typeof el == 'string' ) {
				func = eventName;
				eventName = selector;
				selector = el;
				el = this.element;
			}

			if(func === undefined) {
				func = eventName;
				eventName = selector;
				selector = null;
			}

			if ( typeof func == 'string' ) {
				func = can.Control._shifter(this,func);
			}

			this._bindings.push( binder( el, eventName, func, selector ));

			return this._bindings.length;
		},
		// Unbinds all event handlers on the controller.
		/**
		 * @hide
		 * Unbinds all event handlers on the controller. You should never
		 * be calling this unless in use with [can.Control::on].
		 */
		off : function(){
			var el = this.element[0];
			each(this._bindings || [], function( value ) {
				value(el);
			});
			// Adds bindings.
			this._bindings = [];
		},
		// Prepares a `control` for garbage collection
		/**
		 * @description Remove a Control from an element and clean up the Control.
		 * @signature `control.destroy()`
		 * 
		 * Prepares a control for garbage collection and is a place to
		 * reset any changes the control has made.  
		 * 
		 * @function can.Control.prototype.destroy destroy
		 * @parent can.Control.prototype
		 * 
		 * @body
		 * 
		 * 
		 * ## Allowing Garbage Collection
		 * 
		 * Destroy is called whenever a control's element is removed from the page using 
		 * the library's standard HTML modifier methods.  This means that you
		 * don't have to call destroy yourself and it 
		 * will be called automatically when appropriate.  
		 * 
		 * The following `Clicker` widget listens on the window for clicks and updates
		 * its element's innerHTML.  If we remove the element, the window's event handler
		 * is removed auto-magically:
		 *  
		 * 
		 *      Clickr = can.Control({
		 *       "{window} click": function() {
		 * 	       this.element.html( this.count ? 
		 * 	                          this.count++ : this.count = 0 );
		 *       }  
		 *     });
		 *     
		 *     // create a clicker on an element
		 *     new Clicker( "#clickme" );
		 * 
		 *     // remove the element
		 *     $( '#clickme' ).remove();
		 * 
		 * 
		 * The methods you can use that will destroy controls automatically by library:
		 * 
		 * __jQuery and Zepto__
		 * 
		 *   - $.fn.remove
		 *   - $.fn.html
		 *   - $.fn.replaceWith
		 *   - $.fn.empty
		 * 
		 * __Dojo__
		 * 
		 *   - dojo.destroy
		 *   - dojo.empty
		 *   - dojo.place (with the replace option)
		 * 
		 * __Mootools__
		 * 
		 *   - Element.prototype.destroy
		 * 
		 * __YUI__
		 * 
		 *   - Y.Node.prototype.remove
		 *   - Y.Node.prototype.destroy
		 * 
		 * 
		 * ## Teardown in Destroy
		 * 
		 * Sometimes, you want to reset a controlled element back to its
		 * original state when the control is destroyed.  Overwriting destroy
		 * lets you write teardown code of this manner.  __When overwriting
		 * destroy, make sure you call Control's base functionality__.
		 * 
		 * The following example changes an element's text when the control is
		 * created and sets it back when the control is removed:
		 * 
		 *     Changer = can.Control.extend({
		 *       init: function() {
		 *         this.oldText = this.element.text();
		 *         this.element.text( "Changed!!!" );
		 *       },
		 *       destroy: function() {
		 *         this.element.text( this.oldText );
		 *         can.Control.prototype.destroy.call( this );
		 *       }
		 *     });
		 *     
		 *     // create a changer which changes #myel's text
		 *     var changer = new Changer( '#myel' );
		 * 
		 *     // destroy changer which will reset it
		 *     changer.destroy();
		 * 
		 * ## Base Functionality
		 * 
		 * Control prepares the control for garbage collection by:
		 * 
		 *   - unbinding all event handlers
		 *   - clearing references to this.element and this.options
		 *   - clearing the element's reference to the control
		 *   - removing it's [can.Control.pluginName] from the element's className
		 * 
		 */
		destroy: function() {
			//Control already destroyed
			if(this.element === null) {
			
				return;
			}
			var Class = this.constructor,
				pluginName = Class.pluginName || Class._fullName,
				controls;
			
			// Unbind bindings.
			this.off();
			
			if(pluginName && pluginName !== 'can_control'){
				// Remove the `className`.
				this.element.removeClass(pluginName);
			}
			
			// Remove from `data`.
			controls = can.data(this.element,"controls");
			controls.splice(can.inArray(this, controls),1);
			
			can.trigger( this, "destroyed"); // In case we want to know if the `control` is removed.
			
			this.element = null;
		}
	});

	var processors = can.Control.processors,
	// Processors do the binding.
	// They return a function that unbinds when called.  
	//
	// The basic processor that binds events.
	basicProcessor = function( el, event, selector, methodName, control ) {
		return binder( el, event, can.Control._shifter(control, methodName), selector);
	};




	// Set common events to be processed as a `basicProcessor`
	each(["change", "click", "contextmenu", "dblclick", "keydown", "keyup",
		"keypress", "mousedown", "mousemove", "mouseout", "mouseover",
		"mouseup", "reset", "resize", "scroll", "select", "submit", "focusin",
		"focusout", "mouseenter", "mouseleave",
		// #104 - Add touch events as default processors
		// TOOD feature detect?
		"touchstart", "touchmove", "touchcancel", "touchend", "touchleave"
	], function( v ) {
		processors[v] = basicProcessor;
	});

	return Control;
});
define('can-touch/gesture',['jquery','can/control'], function ($, c) {
    
    return c.extend({
        '{events.move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            this.options.model.attr('touch').update(ev);
            $(ev.target).trigger('onetouchmove', [this.options.model.attr('touch')]);
        },
        '{events.cancel}': function (el, ev) {
            this.options.model.attr('touch').cancel();
            $(ev.target).trigger('onetouchcancel', [this.options.model.removeAttr('touch')]);
        }
    });
});
define('can-touch/control',['jquery', 'can/util/library', 'can/control', './gesture'], function ($, u, C, Gesture) {
    

    var events = ('ontouchstart' in this) ? {
            start: 'touchstart',
            move: 'touchmove',
            end: 'touchend',
            cancel: 'touchcanel'
        } : {
            start: 'mousedown',
            move: 'mousemove',
            end: 'mouseup',
            cancel: 'mouseleave'
        };

    return C.extend({
        defaults: {
            threshold: 30,
            model: null,
            preventDefault: false,
            status: 'touch',
            events: events
        }
    }, {
        '{model} {status}': function (el, ev, val) {
            if (val) {
                this.gesture = new Gesture(this.element, this.options);
            } else if (this.gesture) {
                this.gesture.destroy();
            }
        },
        '{events.start}': function (el, ev) {
            this.options.model.attr('touch', ev);
            $(ev.target).trigger('onetouchstart', [this.options.model.attr('touch')]);
        },
        '{events.end}': function (el, ev) {
            $(ev.target).trigger('onetouchend', [this.options.model.removeAttr('touch')]);
        }
    });
});
/*!
 * CanJS - 2.0.4
 * http://canjs.us/
 * Copyright (c) 2013 Bitovi
 * Mon, 23 Dec 2013 19:49:14 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define('can/map/attributes',["can/util/library", "can/map", "can/list"], function(can, Map) {
can.each([ can.Map, can.Model ], function(clss){
	// in some cases model might not be defined quite yet.
	if(clss === undefined){
		return;
	}
	var isObject = function( obj ) {
		return typeof obj === 'object' && obj !== null && obj;
	};

	can.extend(clss, {
		/**
		 * @property can.Map.attributes.static.attributes attributes
		 * @parent can.Map.attributes.static
		 *
		 * `can.Map.attributes` is a property that contains key/value pair(s) of an attribute's name and its
		 * respective type for using in [can.Map.attributes.static.convert convert] and [can.Map.prototype.serialize serialize].
		 *
		 *		var Contact = can.Map.extend({
		 *			attributes : {
		 *				birthday : 'date',
		 *				age: 'number',
		 *				name: 'string'
		 *			}
		 *		});
		 *
		 */
		attributes : {},

		/**
		 * @property can.Map.attributes.static.convert convert
		 * @parent can.Map.attributes.static
		 *
		 * You often want to convert from what the observe sends you to a form more useful to JavaScript.
		 * For example, contacts might be returned from the server with dates that look like: "1982-10-20".
		 * We can observe to convert it to something closer to `new Date(1982,10,20)`.
		 *
		 * Convert comes with the following types:
		 *
		 * - __date__ Converts to a JS date. Accepts integers or strings that work with Date.parse
		 * - __number__ An integer or number that can be passed to parseFloat
		 * - __boolean__ Converts "false" to false, and puts everything else through Boolean()
		 *
		 * The following sets the birthday attribute to "date" and provides a date conversion function:
		 *
		 *		var Contact = can.Map.extend({
		 *			attributes : {
		 *				birthday : 'date'
		 *			},
		 *			convert : {
		 *				date : function(raw){
		 *					if(typeof raw == 'string'){
		 *						//- Extracts dates formated 'YYYY-DD-MM'
		 *						var matches = raw.match(/(\d+)-(\d+)-(\d+)/);
		 *	
		 *						//- Parses to date object and returns
		 *						return new Date(matches[1], 
		 *								        (+matches[2])-1, 
		 *									    matches[3]);
		 *
		 *					}else if(raw instanceof Date){
		 *						return raw;
		 *					}
		 *				}
		 *			}
		 *		},{});
		 *
		 *		var contact = new Contact();
		 *
		 *		//- calls convert on attribute set
		 *		contact.attr('birthday', '4-26-2012')
		 *
		 *		contact.attr('birthday'); //-> Date
		 *
		 * If a property is set with an object as a value, the corresponding converter is called with the unmerged data (the raw object)
		 * as the first argument, and the old value (a can.Map) as the second:
		 *
		 * 		var MyObserve = can.Map.extend({
	     *			attributes: {
	     *   			nested: "nested"
	     *			},
	     *			convert: {
		 *				nested: function(data, oldVal) {
		 *					if(oldVal instanceof MyObserve) {
		 *						return oldVal.attr(data);
		 *					}
		 *					return new MyObserve(data);
		 *				}
		 *			}
		 *		},{});
		 *
		 * ## Differences From `attr`
		 *
		 * The way that return values from convertors affect the value of an Observe's property is
		 * different from [can.Map::attr attr]'s normal behavior. Specifically, when the
		 * property's current value is an Observe or List, and an Observe or List is returned
		 * from a convertor, the effect will not be to merge the values into the current value as
		 * if the return value was fed straight into `attr`, but to replace the value with the
		 * new Observe or List completely. Because of this, any bindings you have on the previous
		 * observable object will break.
		 *
		 * If you would rather have the new Observe or List merged into the current value, call
		 * `attr` directly on the property instead of on the Observe:
		 *
		 * @codestart
		 * var Contact = can.Map.extend({
		 *   attributes: {
		 *     info: 'info'
		 *   },
		 *   convert: {
		 *     'info': function(data, oldVal) {
		 *       return data;
		 * 	}
		 *   }
		 * }, {});
		 *
		 * var alice = new Contact({info: {name: 'Alice Liddell', email: 'alice@liddell.com'}});
		 * alice.attr(); // {name: 'Alice Liddell', 'email': 'alice@liddell.com'}
		 * alice.info._cid; // '.observe1'
		 *
		 * alice.attr('info', {name: 'Allison Wonderland', phone: '888-888-8888'});
		 * alice.attr(); // {name: 'Allison Wonderland', 'phone': '888-888-8888'}
		 * alice.info._cid; // '.observe2'
		 *
		 * alice.info.attr({email: 'alice@wonderland.com', phone: '000-000-0000'});
		 * alice.attr(); // {name: 'Allison Wonderland', email: 'alice@wonderland.com', 'phone': '000-000-0000'}
		 * alice.info._cid; // '.observe2'
		 * @codeend
		 *
		 * ## Assocations and Convert
		 *
		 * If you have assocations defined within your model(s), you can use convert to automatically
		 * call serialize on those models.
		 *
		 * @codestart
		 * var Contact = can.Model.extend({
		 *   attributes : {
		 *     tasks: Task
		 *   }
		 * }, {});
		 *
		 * var Task = can.Model.extend({
		 *   attributes : {
		 *     due : 'date'
		 *   }
		 * },{});
		 *
		 * var contact = new Contact({
		 *   tasks: [ new Task({
		 *     due: new Date()
		 *   }) ]
		 * });
		 *
		 * contact.serialize();
		 * //-> { tasks: [ { due: 1333219754627 } ] }
		 * @codeend
		 */
		convert: {
			"date": function( str ) {
				var type = typeof str;
				if ( type === "string" ) {
					str = Date.parse(str);
					return isNaN(str) ? null : new Date(str);
				} else if ( type === 'number' ) {
					return new Date(str)
				} else {
					return str
				}
			},
			"number": function( val ) {
				return parseFloat(val);
			},
			"boolean": function (val) {
				if(val === 'false' || val === '0' || !val) {
					return false;
				}
				return true;
			},
			"default": function( val, oldVal, error, type ) {
				// Convert can.Model types using .model and .models
				if(can.Map.prototype.isPrototypeOf(type.prototype) &&
						typeof type.model === 'function' && typeof type.models === 'function') {
					return type[can.isArray(val) ? 'models' : 'model'](val);
				}

				if(can.Map.prototype.isPrototypeOf(type.prototype)) {
					if(can.isArray(val) && typeof type.List === 'function') {
						return new type.List(val);
					}
					return new type(val);
				}

				if(typeof type === 'function') {
					return type(val, oldVal);
				}

				var construct = can.getObject(type),
					context = window,
					realType;

				// if type has a . we need to look it up
				if ( type.indexOf(".") >= 0 ) {
					// get everything before the last .
					realType = type.substring(0, type.lastIndexOf("."));
					// get the object before the last .
					context = can.getObject(realType);
				}
				return typeof construct == "function" ? construct.call(context, val, oldVal) : val;
			}
		},
		/**
		 * @property can.Map.attributes.static.serialize serialize
		 * @parent can.Map.attributes.static
		 *
		 * `can.Map.serialize` is an object of name-function pairs that are used to
		 * serialize attributes.
		 *
		 * Similar to [can.Map.attributes.static.convert can.Map.attributes.convert], in that the keys of this object correspond to
		 * the types specified in [can.Map.attributes].
		 *
		 * By default every attribute will be passed through the 'default' serialization method
		 * that will return the value if the property holds a primitive value (string, number, ...),
		 * or it will call the "serialize" method if the property holds an object with the "serialize" method set.
		 *
		 * For example, to serialize all dates to ISO format:
		 *
		 * @codestart
		 * var Contact = can.Map.extend({
		 *   attributes : {
		 *     birthday : 'date'
		 *   },
		 *   serialize : {
		 *     date : function(val, type){
		 *       return new Date(val).toISOString();
		 *     }
		 *   }
		 * },{});
		 *
		 * var contact = new Contact({
		 *   birthday: new Date("Oct 25, 1973") 
		 * }).serialize();
		 * //-> { "birthday" : "1973-10-25T05:00:00.000Z" }
		 * @codeend
		 *
		 */
		serialize: {
			"default": function( val, type ) {
				return isObject(val) && val.serialize ? val.serialize() : val;
			},
			"date": function( val ) {
				return val && val.getTime()
			}
		}
	});

	// overwrite setup to do this stuff
	var oldSetup = clss.setup;

	/**
	 * @hide
	 * @function can.Map.setup
	 * @parent can.Map.attributes
	 *
	 * `can.Map.static.setup` overrides default `can.Map` setup to provide
	 * functionality for attributes.
	 *
	 */
	clss.setup = function(superClass, stat, proto){
		var self = this;
		oldSetup.call(self, superClass, stat, proto);

		can.each(["attributes"], function( name ) {
			if (!self[name] || superClass[name] === self[name] ) {
				self[name] = {};
			}
		});

		can.each(["convert", "serialize"], function( name ) {
			if ( superClass[name] != self[name] ) {
				self[name] = can.extend({}, superClass[name], self[name]);
			}
		});
	};
});

/**
 * @hide
 * @function can.Map.prototype.convert
 * @parent can.Map.attributes
 */
can.Map.prototype.__convert = function(prop, value){
	// check if there is a

	var Class = this.constructor,
		oldVal = this.attr(prop),
		type, converter;

	if(Class.attributes){
		// the type of the attribute
		type = Class.attributes[prop];
		converter = Class.convert[type] || Class.convert['default'];
	}

	return value === null || !type ?
			// just use the value
			value :
			// otherwise, pass to the converter
			converter.call(Class, value, oldVal, function() {}, type);
};

/**
 * @function can.Map.prototype.attributes.serialize serialize
 * @parent can.Map.attributes.prototype
 *
 * @description Serializes the observe's properties using
 * the [can.Map.attributes attribute plugin].
 *
 * @signature `observe.serialize([attrName])`
 * @param {String} [attrName] If passed, returns only a serialization of the named attribute.
 * @return {String} A serialization of this Observe.
 *
 * @body
 * You can set the serialization methods similar to the convert methods:
 *
 *		var Contact = can.Map.extend({
 *			attributes : { 
 *				birthday : 'date'
 *			},
 *			serialize : {
 *				date : function( val, type ){
 *					return val.getYear() + 
 *						"-" + (val.getMonth() + 1) + 
 *						"-" + val.getDate(); 
 *				}
 *			}
 *		},{})
 *
 *		var contact = new Contact();
 *		contact.attr('birthday', new Date());
 *		contact.serialize()
 *		//-> { birthday: 'YYYY-MM-DD' }
 *
 * You can also get and serialize an individual property by passing the attribute
 * name to the `serialize` function.  Building on the above demo, we can serialize
 * the `birthday` attribute only.
 *
 *		contact.serialize('birthday') //-> 'YYYY-MM-DD'
 */
can.List.prototype.serialize = function(attrName, stack) {
	return can.makeArray(can.Map.prototype.serialize.apply(this, arguments));
}

can.Map.prototype.serialize = function(attrName, stack) {
	var where = {},
		Class = this.constructor,
		attrs = {};

	stack = can.isArray(stack) ? stack : [];
	stack.push(this._cid);

	if(attrName !== undefined){
		attrs[attrName] = this[attrName];
	} else {
		attrs = this.__get();
	}

	can.each(attrs, function( val, name ) {
		var type, converter;

		// If this is an observe, check that it wasn't serialized earlier in the stack.
		if(val instanceof can.Map && can.inArray(val._cid, stack) > -1) {
			// Since this object has already been serialized once,
			// just reference the id (or undefined if it doesn't exist).
			where[name] = val.attr('id');
		}
		else {
			type = Class.attributes ? Class.attributes[name] : 0;
			converter = Class.serialize ? Class.serialize[type] : 0;

			// if the value is an object, and has a attrs or serialize function
			where[name] = val && typeof val.serialize == 'function' ?
			// call attrs or serialize to get the original data back
			val.serialize(undefined, stack) :
			// otherwise if we have  a converter
			converter ?
				// use the converter
				converter(val, type) :
				// or return the val
				val;
		}
	});

	if(typeof attrs.length !== 'undefined') {
		where.length = attrs.length;
	}

	return attrName != undefined ? where[attrName] : where;
};
return can.Map;
});
define('can-touch/rect',['can/map', 'can/map/attributes'], function(m) {
    

    return m.extend({
        attributes: {
            top: 'round',
            right: 'round',
            bottom: 'round',
            left: 'round',
            height: 'round',
            width: 'round'
        },
        convert: {
            round: function(n) {
                return Math.round(n);
            },
            unit: function(u) {
                return u ? String(u) : 'px';
            }
        }
    }, {
        update: function(pt1, pt2) {
            var x1 = pt1.x,
                x2 = pt2.x,
                y1 = pt1.y,
                y2 = pt2.y;

            this.attr({
                top: Math.min(y1, y2),
                left: Math.min(x1, x2),
                bottom: Math.max(y1, y2),
                right: Math.max(x1, x2)
            });

            this.attr('width', this.attr('right') - this.attr('left'));
            this.attr('height', this.attr('bottom') - this.attr('top'));

            return this;
        },
        toStyle: function(unit) {
            unit = this.constructor.convert.unit(unit) + ' ';
            return 'rect( '+ this.top + unit + this.right + unit + this.bottom + unit + this.left + unit + ')';
        }
    });
});
define('can-touch/touch',['can/map', './rect', 'can/map/attributes'], function (M, Rect) {
    
    return M.extend({
        attributes: {
            origin: 'touch-point',
            point: 'touch-point',
            'start-time': 'date',
            'end-time': 'date',
            duration: 'number'
        },
        convert: {
            'touch-point': function (touch) {
                touch = this.convert.touch(touch);

                return this.convert.point.call(this, [
                    (touch.pageX || touch.clientX),
                    (touch.pageY || touch.clientY)]);
            },
            point: function (a) {
                return {
                    x: this.convert.number(a[0]),
                    y: this.convert.number(a[1])
                };
            },
            touch: function (ev) {
                ev = ev.originalEvent ? ev.originalEvent : ev;

                if (ev.changedTouches) {
                    ev = ev.changedTouches[0];
                }
                return ev;
            }
        }
    }, {
        init: function (touch) {
            this.attr('origin', touch);
            return this;
        },
        start: function() {
            var now = new Date();
            this.attr('start-time', now);
            this.attr('end-time', now);
            this.attr('duration', 0);
            return this;
        },
        end: function () {
            var now = new Date();
            var elapsed = now - this.attr('start-time');
            this.attr('duration', elapsed);
            this.attr('end', now);
            return this;
        },
        _distance: function(xd, yd) {
            return Math.sqrt((xd * xd) + (yd * yd));
        },
        distance: function() {
            var len = this.length();
            return this._distance(len.x, len.y);
        },
        length: function() {
            return this.constructor.convert.point.call(this.constructor, [
                this.attr('point.x') - this.attr('origin.x'),
                this.attr('point.y') - this.attr('origin.y')
            ]);
        },
        angle: function () {
            var len = this.length();
            var rad = Math.atan2(len.y, len.x);
            return rad * (180 / Math.PI);
        },
        scale: function() {
            var point = this._distance(this.attr('point.x'), this.attr('point.y')),
                origin = this._distance(this.attr('origin.x'), this.attr('origin.y'));
            return (point / origin);
        },
        cancel: function() {
            this.point = this.origin;
            return this;
        },
        area: function(offset) {

            var origin = this.attr('origin'),
                point = this.attr('point');

            if(offset) {
                var offsetX = offset.left || 0,
                    offsetY = offset.top || 0;

                origin = this.constructor.convert.point.call(this.constructor, [
                    origin.attr('x') - offsetX,
                    origin.attr('y') - offsetY
                ]);

                point = this.constructor.convert.point.call(this.constructor, [
                    point.attr('x') - offsetX,
                    point.attr('y') - offsetY
                ]);
            }

            return new Rect().update(origin, point);
        },
        update: function (touch) {
            this.attr('point', touch);
            return this;
        }
    });
});
define('can-touch/model',['jquery', 'can/map', './touch', 'can/map/attributes'], function ($, m, T) {
    
    return m.extend({
        attributes: {
            touch: 'touch',
            event: 'event'
        },
        convert: {
            'touch': function(ev) {
                return new T(ev);
            }
        }
    }, {
        init: function() {
            this.attr('touch', {});
            return this;
        }
    });
});
define('can-touch',['can-touch/control', 'can-touch/model'], function (C, M) {
    
    return function (selector, options) {
        options.model = new M();
        return new C(selector, options);
    };
});
define('demo/control',['can/control', 'can-touch'], function (C, t) {
    
    return C.extend({
        defaults: {
            view: null,
            model: null
        }
    }, {
        init: function () {
            this.options.touchControl = t(this.element, {
                preventDefault: true
            });
            this.element.append(this.options.view(this.options.model));
        },
        ' onetouchmove': function(el, ev, touch) {
            this.options.model.attr({
                area: touch.area(),
                type: touch.attr('type')
            });
        }
    });
});
define('demo',['demo/model', 'demo/view', 'demo/control'], function (M, v, C) {
    
    return function (selector) {
        return new C(selector, {
            view: v,
            model: new M()
        });
    };
});
require(['demo'], function (demo) {
    
    demo('.content');
});
define("index", function(){});
