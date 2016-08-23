'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var hapi = require('hapi');
var Inert = _interopDefault(require('inert'));
var path = require('path');
var fs = require('fs');

/*eslint no-console: "off"*/

function startServer(server, name) {
	process.title = name;

	server.start().then(() => {
		console.log(`[+] ${name} server running at: ${server.info.uri}`);
	}).catch(err => {
		console.error(`[X] ${name} server issue: ${err}`)
	})
}

var __dirname$1 = __dirname;

var config = {"port":3001};

var analytics = {
	method: 'GET',
	path: '/js/analytics.js',
	handler: {
		file: 'assets/analytics.js'
	}
}

const core = {
	method: 'GET',
	path: '/css/core/{param*}',
	handler: {
		directory: {
			path: 'node_modules/ubc-farm-css/src',
			listing: true,
			defaultExtension: 'css',
			index: false
		}
	}
}

const coreMin = {
	method: 'GET',
	path: '/css/core/min.css',
	handler: {
		file: 'node_modules/ubc-farm-css/min.css'
	}
}

const coreIndex = Object.assign({}, coreMin, {
	path: '/css/core/index.css'
});

var coreCss = [core, coreMin, coreIndex];

var partialCss = {
	method: 'GET',
	path: '/css/partials/{param}',
	handler: {
		directory: {
			path: 'node_modules/ubc-farm-views-utils/partials/css',
			listing: true,
			defaultExtension: 'css',
			index: false
		}
	}
}

function isPromise(thing) {
	return (typeof thing === 'object' || typeof thing === 'function')
	&& typeof thing.res === 'function';
}

function promisify(func) {
	return function(...args) {
		return new Promise((resolve, reject) => {
			args.push((err, result) => {
				if (err) reject(err);
				else resolve(result);
			});

			const result = func.call(this, ...args);
			if (isPromise(result)) resolve(result);
		})
	}
}

const dateGets = [
	'getFullYear',
	'getMonth',
	'getDate',
	'getHours',
	'getMinutes',
	'getSeconds',
	'getMilliseconds'
]

const labels$1 = dateGets
	.map(f => f.substr(3).toLowerCase())
	.map(f => f.endsWith('s') ? f.slice(-1) : f);

const stat$1 = promisify(fs.stat);

function doesPathExist(path) {
	return stat$1(path)
	.then(() => true)
	.catch(err => {
		if (err.code === 'ENOENT') return false;
		else throw err;
	});
}

/**
 * Tries to recursively find the given folder(s) by searching using fs.stat
 * @returns {Promise<string>} undefined if no path is ever found
 */
function search(folder, ...potentialNames) {
	if (folder === path.resolve('/')) return Promise.resolve(undefined);

	const potentialPaths = potentialNames.map(name => path.join(folder, name));
	
	const checkExists = Promise.all(potentialPaths.map(p => doesPathExist(p)));
	
	return checkExists.then(results => {
		if (results.every(v => v === false)) {
			const upOnePath = path.resolve(folder, '../');
			return search(upOnePath, ...potentialNames);
		} else {
			const index = results.findIndex(v => v === true);
			const foundPath = potentialPaths[index];
			return foundPath;
		}
	});
}

function cssRoute(pagename, folder) {
	return {
		method: 'GET',
		path: `/css/page/${pagename}/{param*}`,
		handler: {
			directory: {
				path: path.join(folder, 'styles'),
				listing: true,
				defaultExtension: 'css',
				index: false,
			},
		},
	};
}

function javascriptRoute(pagename, folder) {
	// eslint-disable-next-line global-require
	const pkg = require(path.join(folder, 'package.json'));
	const { browser: main = 'dist/index.iife.js' } = pkg;

	return [
		{
			method: 'GET',
			path: `/js/page/${pagename}/{param*}`,
			handler: {
				directory: {
					path: path.join(folder, 'dist'),
					listing: true,
					defaultExtension: 'js',
					index: false,
				},
			},
		},
		{
			method: 'GET',
			path: `/js/page/${pagename}/index.js`,
			handler: {
				file: {
					path: path.join(folder, main),
					confine: false,
				},
			},
		},
	];
}

const folder = path.join(__dirname$1, 'node_modules');
function searchForRouteFolders(pagename) {
	return search(folder, `ubc-farm-page-${pagename}`, `page-${pagename}`)
		.then(path => {
			if (path === undefined) throw new Error(`${pagename} not found`);
			return [...javascriptRoute(pagename, path), cssRoute(pagename, path)];
		});
}

const pageList = [
	'calendar',
	'directory',
	'fields',
	'invoice',
	'map-editor',
	'add-items',
];

const routes = Promise.all(pageList.map(searchForRouteFolders));

var pageRoutes = routes.then(r => r.reduce(
	(allRoutes = [], additional) => [...allRoutes, ...additional]
));

const folder$1 = path.join(__dirname$1, 'node_modules');
function searchModule(name) {
	return search(folder$1, `ubc-farm-${name}`, name).then(path => {
		if (path === undefined) throw new Error(`Could not find ${name}`);
		else return path;
	})
}

const method = 'GET';
const listing = true;
const index = false;
const tableBase = searchModule('table-base').then(folder => ({
	method, path: '/css/module/table-base/{param*}',
	handler: {
		directory: {
			path: path.join(folder, 'styles'),
			listing, index,
			defaultExtension: 'css'
		}
	}
}))

const datetime = searchModule('datetime-picker').then(folder => ({
	method, path: '/css/module/datetime-picker/{param*}',
	handler: {
		directory: {
			path: path.join(folder, 'styles'),
			listing, index,
			defaultExtension: 'css'
		}
	}
}))

const ports = searchModule('ports').then(folder => {
	const tape = {
		method, path: '/js/module/tape/{file?}',
		handler: {
			file: {
				path: path.join(folder, 'tape/index.js'),
				confine: false
			}
		}
	};

	const visTimelineCss = {
		method, path: '/css/module/vis-timeline/{param*}',
		handler: {
			directory: {
				path: path.join(folder, 'vis-timeline/dist'),
				index, listing: false,
				defaultExtension: 'css'
			}
		}
	}

	const visTimelineJs = {
		method,
		path: '/js' + visTimelineCss.path.substr('/css'.length),
		handler: {
			directory: Object.assign({}, visTimelineCss.handler.directory, {
				defaultExtension: 'js'
			})
		}
	}

	return [tape, visTimelineCss, visTimelineJs];
})

const all = Promise.all([tableBase, datetime, ports])
.then(([table, date, port]) => [table, date, ...port]);

const server = new hapi.Server();
server.connection(config);

server.path(__dirname$1);
server.register(Inert, err => {if (err) throw err});

server.route(analytics);
server.route(coreCss);
server.route(partialCss);

const pagesReady = pageRoutes.then(pages => server.route(pages));
const modReady = all.then(mods => server.route(mods));

const ready = 
	Promise.all([pagesReady, modReady]).then(() => server)
	.catch(err => console.error(err));

ready.then(server => startServer(server, 'Static'));
//# sourceMappingURL=index.node.js.map
