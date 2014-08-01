/*jslint devel: true, browser: true, windows: true, plusplus: true, maxerr: 50, indent: 4 */

/**
 * @preserve
 * Wayfinding v0.2.0
 * https://github.com/ucdavis/wayfinding
 *
 * Copyright (c) 2010 University of California Regents
 * Licensed under GNU General Public License v2
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 *
 * Date: 2010-08-02, 2014-02-03
 *
 */

//  <![CDATA[

(function ($) {

	'use strict';

	var defaults = {
		// will look for a local .svg file called floorplan.svg by default
		'maps': [{'path': 'floorplan.svg', 'id': 'map.1'}],
		// path formatting
		'path': {
			color: 'red', // the color of the solution path that will be drawn
			radius: 10, // the radius in pixels to apply to the solution path
			speed: 8, // the speed at which the solution path with be drawn
			width: 3 // the width of the solution path in pixels
		},
		// the door identifier for the default starting point
		'startpoint': function () {
			return 'startpoint';
		},
		// if specified in the wayfinding initialization
		// route to this point as soon as the maps load. Can be initialized
		// as a function or a string (for consistency with startpoint)
		'endpoint': false,
		//controls routing through stairs
		'accessibleRoute': false,
		//provides the identifier for the map that should be show at startup, if not given will default to showing first map in the array
		'defaultMap': function () {
			return 'map.1';
		},
		'dataStoreCache' : false,
		'showLocation' : false,
		'locationIndicator' : {
			fill: 'red',
			height: 40
		},
		'zoomToRoute' : false,
		'zoomPadding' : 50,
		'mapEvents': false
	};

	$.fn.wayfinding = function (action, options) {

		var passed = options,
			obj, // the jQuery object being worked with;
			maps, // the array of maps populated from options each time
			defaultMap, // the floor to show at start propulated from options
			startpoint, // the result of either the options.startpoint value or the value of the function
			portalSegments = [], // used to store portal pieces until the portals are assembled, then this is dumped.
			drawing,
			solution,
			result; // used to return non jQuery results

		// set options based on either provided options, prior settings, or defaults
		function getOptions(el) {

			var optionsPrior = el.data('wayfinding:options'), // attempt to load prior settings
				dataStorePrior = el.data('wayfinding:data'); // load any stored data

			drawing = el.data('wayfinding:drawing'); // load a drawn path, if it exists

			if (optionsPrior !== undefined) {
				options = optionsPrior;
			} else {
				options = $.extend(true, {}, defaults, options);
			}

			// check for settings attached to the current object
			options = $.metadata ? $.extend(true, {}, options, el.metadata()) : options;

			// Create references to the options
			maps = options.maps;

			// set defaultMap correctly, handle both function and value being passed
			if (typeof (options.defaultMap) === 'function') {
				defaultMap = options.defaultMap();
			} else {
				defaultMap = options.defaultMap;
			}

			// set startpoint correctly
			if (typeof (options.startpoint) === 'function') {
				setStartPoint(options.startpoint(), el);
			} else {
				startpoint = options.startpoint;
			}

			if (dataStorePrior !== undefined) {
				WayfindingDataStore.dataStore = dataStorePrior;
			}
		} //function getOptions

		//
		function setOptions(el) {
			el.data('wayfinding:options', options);
			el.data('wayfinding:drawing', drawing);
			el.data('wayfinding:data', WayfindingDataStore.dataStore);
		}

		//verify that all floor ids are unique. make them so if they are not

		function checkIds() {
			var mapNum,
				checkNum,
				reassign = false,
				defaultMapValid = false;

			if (maps.length > 0) {
				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					for (checkNum = mapNum; checkNum < maps.length; checkNum++) {
						if (mapNum !== checkNum && maps[mapNum].id === maps[checkNum].id) {
							reassign = true;
						}
					}
				}

				if (reassign === true) {
					for (mapNum = 0; mapNum < maps.length; mapNum++) {
						maps[mapNum].id = 'map_' + mapNum;
					}
				}
				//check that defaultMap is valid as well

				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					if (maps[mapNum].id === defaultMap) {
						defaultMapValid = true;
					}
				}

				if (defaultMapValid === false) {
					defaultMap = maps[0].id;
				}
			} /* else {
				// raise exception about no maps being found
			} */
		} //function checkIds

		//Takes x and y coordinates and makes a location indicating pin for those
		//coordinates. Returns the pin element, not yet attached to the DOM.
		function makePin(x, y) {
			var indicator,
			height,
			width,
			symbolPath;

			indicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');

			$(indicator).attr('class', 'locationIndicator');

			height = options.locationIndicator.height;
			width = height * 5 / 8;

			//draws map pin
			symbolPath = 'M ' + x + ' ' + y;
			//1st diagonal line
			symbolPath += ' l ' + width / 2 + ' ' + height * (-2) / 3;
			//curve over top
			//rx, ry
			symbolPath += ' a ' + width / 2 + ' ' + height / 3;
			//x-axis-rotation large-arc-flag sweep-flag
			symbolPath += ' 0 0 0 ';
			//dx, dy
			symbolPath += width * (-1) + ' 0 ';
			//close path
			symbolPath += 'Z';
			//finish with circle at center of pin
			symbolPath += ' m ' + height / (-8) + ' ' + height * (-2) / 3;
			symbolPath += ' a ' + height / 8 + ' ' + height / 8;
			symbolPath += ' 0 1 0 ';
			symbolPath += height / 4 + ' 0';
			symbolPath += ' a ' + height / 8 + ' ' + height / 8;
			symbolPath += ' 0 1 0 ';
			//drawing circle, right back where we started.
			symbolPath += height / (-4) + ' 0';

			indicator.setAttribute('d', symbolPath);
			indicator.setAttribute('fill', options.locationIndicator.fill);
			indicator.setAttribute('fill-rule', 'evenodd');
			indicator.setAttribute('stroke', 'black');

			return indicator;
		} //function makePin

		//set the start point, and put a location indicator
		//in that spot, if feature is enabled.
		function setStartPoint(passed, el) {
			var start,
			x, y,
			pin;

			//clears locationIndicators from the maps
			$('path.locationIndicator', el).remove();

			// set startpoint correctly
			if (typeof (passed) === 'function') {
				options.startpoint = passed();
			} else {
				options.startpoint = passed;
			}

			startpoint = options.startpoint;

			if (options.showLocation) {
				start = $('#Doors #' + startpoint, el);

				if (start.length) {
					x = (Number(start.attr('x1')) + Number(start.attr('x2'))) / 2;
					y = (Number(start.attr('y1')) + Number(start.attr('y2'))) / 2;

					pin = makePin(x, y);

					start.after(pin);
				} else {
					return; //startpoint does not exist
				}
			}
		} //function setStartPoint

		// Hide SVG div, hide 'internal' path lines, make rooms clickable
		function activateSVG(obj, svgDiv) {
			//hide maps until explicitly displayed
			$(svgDiv).hide();

			//hide route information
			$('#Paths line', svgDiv).attr('stroke-opacity', 0);
			$('#Doors line', svgDiv).attr('stroke-opacity', 0);
			$('#Portals line', svgDiv).attr('stroke-opacity', 0);

			//The following need to use the el variable to scope their calls: el is jquery element

			// make clickable
			// removed el scope from this next call.
			$('#Rooms a', svgDiv).click(function (event) {
				console.log("routing to:");
				console.log($(this).prop('id'));
				$(obj).wayfinding('routeTo', $(this).prop('id'));
				event.preventDefault();
			});

			$(obj).append(svgDiv);
		} //function activateSVG

		function replaceLoadScreen(el) {
			var displayNum,
			mapNum;

			$('#mapLoading').remove();

			//loop ensures defaultMap is in fact one of the maps
			displayNum = 0;
			for (mapNum = 0; mapNum < maps.length; mapNum++) {
				if (defaultMap === maps[mapNum].id) {
					displayNum = mapNum;
				}
			}

			//hilight starting floor
			$('#' + maps[displayNum].id, el).show(0, function() {
				$(this).trigger('wfMapsVisible');
			}); // rework
			//if endpoint was specified, route to there.
			if (typeof(options.endpoint) === 'function') {
				routeTo(options.endpoint());
			} else if (typeof(options.endpoint) === 'string') {
				routeTo(options.endpoint);
			}

			$.event.trigger("wayfinding:ready");
		} //function replaceLoadScreen

		// Initialize the jQuery target object
		function initialize(obj) {
			var processed = 0;
			var deferInitializing = false;

			// Load SVGs off the network
			$.each(maps, function (i, map) {
				var svgDiv = $('<div id="' + map.id + '"><\/div>');

				//create svg in that div
				svgDiv.load(
					map.path,
					function (svg) {
						maps[i].svgHandle = svg;
						maps[i].el = svgDiv;

						activateSVG(obj, svgDiv);

						processed = processed + 1;

						if(processed == maps.length) {
							// All SVGs have finished loading

							// Load or create dataStore
							if (options.dataStoreCache) {
								if (typeof(options.dataStoreCache) === 'object') {
									console.debug('Using dataStoreCache object.');
									WayfindingDataStore.dataStore = options.dataStoreCache;
								} else if (typeof(options.dataStoreCache) === 'string') {
									deferInitializing = true;
									console.debug("Attempting to load dataStoreCache from URL ...");
									$.getJSON(options.dataStoreCache, function (result) {
										console.debug('Using dataStoreCache from remote.');
										WayfindingDataStore.dataStore = result;
										finishInitializing();
									}).fail(function () {
										console.error('Failed to get dataStore cache. Falling back to client-side dataStore generation.');

										options.dataStoreCache = false;
										finishInitializing();
									});
								}
							}

							if(deferInitializing == false) finishInitializing();
						}
					}
				);
			});
		} // function initialize

		function finishInitializing() {
			// Manually build the dataStore if necessary
			if(WayfindingDataStore.dataStore == null) {
				console.debug("No dataStore cache exists, building with startpoint '" + options.startpoint + "' ...");
				// No dataStore cache exists, build it.
				WayfindingDataStore.dataStore = WayfindingDataStore.build(options.startpoint, maps);
			}

			// SVGs are loaded, dataStore is set, ready the DOM
			setStartPoint(options.startpoint, obj);
			setOptions(obj);
			replaceLoadScreen(obj);
		} // function finishInitializing

		function switchFloor(floor, el) {
			$('div', el).hide();
			$('#' + floor, el).show(0, function() {
				if (options.mapEvents) {
					$(el).trigger('wfFloorChange');
				}
			});

			//turn floor into mapNum, look for that in drawing
			// if there get drawing[level].routeLength and use that.

			var i, level, mapNum, pathLength;

			if (drawing) {
				mapNum = -1;
				for (i = 0; i < maps.length; i++) {
					if (maps[i] === floor) {
						mapNum = i;
					}
				}
				level = -1;
				for (i = 0; i < drawing.length; i++) {
					if (drawing[i].floor === mapNum) {
						level = i;
					}
				}

				if (level !== -1) {
					pathLength =  drawing[level].routeLength;

					//these next three are potentially redundant now
					$(drawing[level].path, el).attr('stroke-dasharray', [pathLength, pathLength]);
					$(drawing[level].path, el).attr('stroke-dashoffset', pathLength);
					$(drawing[level].path, el).attr('pathLength', pathLength);

					$(drawing[level].path, el).attr('stroke-dashoffset', pathLength);
					$(drawing[level].path, el).animate({svgStrokeDashOffset: 0}, pathLength * options.path.speed); //or move minPath to global variable?
				}
			}
		} //function switchFloor

		function hidePath(obj) {
			$('path[class^=directionPath]', obj).css({
				'stroke': 'none'
			});
		}

		function animatePath(drawing, i) {
			var path,
			svg,
			pathRect,
			oldViewBox,
			drawLength,
			delay,
			pad = options.zoomPadding;

			if (1 !== 1 && i >= drawing.length) {
				// if repeat is set, then delay and rerun display from first.
				// Don't implement, until we have click to cancel out of this
				setTimeout(function () {
					animatePath(drawing, 0);
				},
				5000);
			} else if (i >= drawing.length) {
				//finished, stop recursion.
				return;
			}

			drawLength = drawing[i].routeLength;
			delay = drawLength * options.path.speed;

			switchFloor(maps[drawing[i][0].floor].id, obj);

			path = $('#' + maps[drawing[i][0].floor].id + ' .directionPath' + i)[0];
			path.style.stroke = options.path.color;
			path.style.strokeWidth = options.path.width;
			path.style.transition = path.style.WebkitTransition = 'none';
			path.style.strokeDasharray = drawLength + ' ' + drawLength;
			path.style.strokeDashoffset = drawLength;
			pathRect = path.getBBox();
			path.style.transition = path.style.WebkitTransition = 'stroke-dashoffset ' + delay + 'ms linear';
			path.style.strokeDashoffset = '0';
// http://jakearchibald.com/2013/animated-line-drawing-svg/

			// Zooming logic...
			svg = $('#' + maps[drawing[i][0].floor].id + ' svg')[0];
			oldViewBox = svg.getAttribute('viewBox');

			if (options.zoomToRoute) {
				svg.setAttribute('viewBox', (pathRect.x - pad)  + ' ' + (pathRect.y - pad) +
					' ' + (pathRect.width + pad * 2) + ' ' + (pathRect.height + pad * 2));
			}

			setTimeout(function () {
				animatePath(drawing, ++i);
				svg.setAttribute('viewBox', oldViewBox); //zoom back out
			},
			delay + 1000);
		} //function animatePath

		// The combined routing function
		// revise to only interate if startpoint has changed since last time?
		function routeTo(destination) {
			var i,
				draw,
				stepNum,
				level,
				reversePathStart,
				portalsEntered,
				lastStep,
				ax,
				ay,
				bx,
				by,
				aDX,
				aDY,
				bDX,
				bDY,
				cx,
				cy,
				px,
				py,
				curve,
				nx,
				ny,
				drawLength,
				thisPath,
				pick;

			options.endpoint = destination;

			// remove any prior paths from the current map set
			$('path[class^=directionPath]', obj).remove();

			//clear all rooms
			$('#Rooms *.wayfindingRoom', obj).removeAttr('class');


			solution = [];

			//if startpoint != destination
			if (startpoint !== destination) {

				// get accessibleRoute option -- options.accessibleRoute

				//hilight the destination room
				$('#Rooms a[id="' + destination + '"] g', obj).attr('class', 'wayfindingRoom');

				solution = WayfindingDataStore.getShortestRoute(maps, destination, startpoint).solution;

				if (reversePathStart !== -1) {

					portalsEntered = 0;
					//count number of portal trips
					for (i = 0; i < solution.length; i++) {
						if (solution[i].type === 'po') {
							portalsEntered++;
						}
					}

					//break this into a new function?

					drawing = new Array(portalsEntered); // Problem at line 707 character 40: Use the array literal notation [].

					drawing[0] = [];

					//build drawing and modify solution for text generation by adding .direction to solution segments?

					draw = {};

					if(solution.length == 0) {
						debugger;
					}

					//if statement incorrectly assumes one door at the end of the path, works in that case, need to generalize
					if (WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].doorA[0] === startpoint) {
						draw = {};
						draw.floor = [solution[0].floor];
						draw.type = 'M';
						draw.x = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].ax;
						draw.y = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].ay;
						draw.length = 0;
						drawing[0].push(draw);
						draw = {};
						draw.type = 'L';
						draw.floor = [solution[0].floor];
						draw.x = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].bx;
						draw.y = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].by;
						draw.length = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].length;
						drawing[0].push(draw);
						drawing[0].routeLength = draw.length;
					} else if (WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].doorB[0] === startpoint) {
						draw = {};
						draw.type = 'M';
						draw.floor = [solution[0].floor];
						draw.x = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].bx;
						draw.y = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].by;
						draw.length = 0;
						drawing[0].push(draw);
						draw = {};
						draw.type = 'L';
						draw.floor = [solution[0].floor];
						draw.x = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].ax;
						draw.y = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].ay;
						draw.length = WayfindingDataStore.dataStore.paths[solution[0].floor][solution[0].segment].length;
						drawing[0].push(draw);
						drawing[0].routeLength = draw.length;
					}

					lastStep = 1;

					// for each floor that we have to deal with
					for (i = 0; i < portalsEntered + 1; i++) {
						for (stepNum = lastStep; stepNum < solution.length; stepNum++) {
							if (solution[stepNum].type === 'pa') {
								ax = WayfindingDataStore.dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].ax;
								ay = WayfindingDataStore.dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].ay;
								bx = WayfindingDataStore.dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].bx;
								by = WayfindingDataStore.dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].by;

								draw = {};
								draw.floor = solution[stepNum].floor;
								if (drawing[i].slice(-1)[0].x === ax && drawing[i].slice(-1)[0].y === ay) {
									draw.x = bx;
									draw.y = by;
								} else {
									draw.x = ax;
									draw.y = ay;
								}
								draw.length = WayfindingDataStore.dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].length;
								draw.type = 'L';
								drawing[i].push(draw);
								drawing[i].routeLength += draw.length;
							}
							if (solution[stepNum].type === 'po') {
								drawing[i + 1] = [];
								drawing[i + 1].routeLength = 0;
								// push the first object on
								// check for more than just floor number here....
								pick = '';
								if (WayfindingDataStore.dataStore.portals[solution[stepNum].segment].floorANum === WayfindingDataStore.dataStore.portals[solution[stepNum].segment].floorBNum) {
									if (WayfindingDataStore.dataStore.portals[solution[stepNum].segment].xA === draw.x && WayfindingDataStore.dataStore.portals[solution[stepNum].segment].yA === draw.y) {
										pick = 'B';
									} else {
										pick = 'A';
									}
								} else {
									if (WayfindingDataStore.dataStore.portals[solution[stepNum].segment].floorANum === solution[stepNum].floor) {
										pick = 'A';
									} else if (WayfindingDataStore.dataStore.portals[solution[stepNum].segment].floorBNum === solution[stepNum].floor) {
										pick = 'B';
									}
								}
								if (pick === 'A') {
									draw = {};
									draw.floor = solution[stepNum].floor;
									draw.type = 'M';
									draw.x = WayfindingDataStore.dataStore.portals[solution[stepNum].segment].xA;
									draw.y = WayfindingDataStore.dataStore.portals[solution[stepNum].segment].yA;
									draw.length = 0;
									drawing[i + 1].push(draw);
									drawing[i + 1].routeLength = draw.length;
								} else if (pick === 'B') {
									draw = {};
									draw.floor = solution[stepNum].floor;
									draw.type = 'M';
									draw.x = WayfindingDataStore.dataStore.portals[solution[stepNum].segment].xB;
									draw.y = WayfindingDataStore.dataStore.portals[solution[stepNum].segment].yB;
									draw.length = 0;
									drawing[i + 1].push(draw);
									drawing[i + 1].routeLength = draw.length;
								}
								lastStep = stepNum;
								lastStep++;
								stepNum = solution.length;
							}
						}
					}

					//go back through the drawing and insert curves if requested
					//consolidate colinear line segments?
					if (options.path.radius > 0) {
						for (level = 0; level < drawing.length; level++) {
							for (i = 1; i < drawing[level].length - 1; i++) {
								if (drawing[level][i].type === 'L' && drawing[level][i].type === 'L') {
									// check for colinear here and remove first segment, and add its length to second
									aDX = (drawing[level][i - 1].x - drawing[level][i].x);
									aDY = (drawing[level][i - 1].y - drawing[level][i].y);
									bDX = (drawing[level][i].x - drawing[level][i + 1].x);
									bDY = (drawing[level][i].y - drawing[level][i + 1].y);
									// if the change in Y for both is Zero
									if ((aDY === 0 && bDY === 0) || (aDX === 0 && bDX === 0) || ((aDX / aDY) === (bDX / bDY) && !(aDX === 0 && aDY === 0 && bDX === 0 && bDY === 0))) {
										drawing[level][i + 1].length = drawing[level][i].length + drawing[level][i + 1].length;
//                                      drawing[level][i+1].type = "L";
										drawing[level].splice(i, 1);
										i = 1;
									}
								}
							}
							for (i = 1; i < drawing[level].length - 1; i++) {
								// locate possible curves based on both line segments being longer than options.path.radius
								if (drawing[level][i].type === 'L' && drawing[level][i].type === 'L' && drawing[level][i].length > options.path.radius && drawing[level][i + 1].length > options.path.radius) {
									//save old end point
									cx = drawing[level][i].x;
									cy = drawing[level][i].y;
									// change x,y and change length
									px = drawing[level][i - 1].x;
									py = drawing[level][i - 1].y;
									//new=prior + ((center-prior) * ((length-radius)/length))
									drawing[level][i].x = (Number(px) + ((cx - px) * ((drawing[level][i].length - options.path.radius) / drawing[level][i].length)));
									drawing[level][i].y = (Number(py) + ((cy - py) * ((drawing[level][i].length - options.path.radius) / drawing[level][i].length)));
									//shorten current line
									drawing[level][i].length = drawing[level][i].length - options.path.radius;
									curve =  {};
									//curve center is old end point
									curve.cx = cx;
									curve.cy = cy;
									//curve end point is based on next line
									nx = drawing[level][i + 1].x;
									ny = drawing[level][i + 1].y;
									curve.x = (Number(cx) + ((nx - cx) * ((options.path.radius) / drawing[level][i + 1].length)));
									curve.y = (Number(cy) + ((ny - cy) * ((options.path.radius) / drawing[level][i + 1].length)));
									//change length of next segment now that it has a new starting point
									drawing[level][i + 1].length = drawing[level][i + 1].length - options.path.radius;
									curve.type = 'Q';
									curve.floor = drawing[level][i].floor;
									// insert curve element
									// splice function on arrays allows insertion
									//   array.splice(start, delete count, value, value)
									// drawing[level].splice(current line, 0, curve element object);

									drawing[level].splice(i + 1, 0, curve);

								} // both possible segments long enough
							} // drawing segment
						} // level
					} // if we are doing curves at all

					$.each(drawing, function (i, level) {
						var path = '',
							newPath;
						$.each(level, function (j, stroke) {
							switch (stroke.type) {
							case 'M':
								path = 'M' + stroke.x + ',' + stroke.y;
								break;
							case 'L':
								path += 'L' + stroke.x + ',' + stroke.y;
//                              maps[level[0].floor].svgHandle.circle(stroke.x,stroke.y,2);
								break;
							case 'Q':
								path += 'Q' + stroke.cx + ',' + stroke.cy + ' ' + stroke.x + ',' + stroke.y;
//                              maps[level[0].floor].svgHandle.circle(stroke.cx,stroke.cy,4);
//                              maps[level[0].floor].svgHandle.circle(stroke.x,stroke.y,2);
								break;
							}
						});

						newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
						newPath.setAttribute('d', path);
						newPath.style.fill = 'none';
						if (newPath.classList) {
							newPath.classList.add('directionPath' + i);
						} else {
							newPath.setAttribute('class', 'directionPath' + i);
						}

						$('#' + maps[level[0].floor].id + ' svg').append(newPath);

						thisPath = $('#' + maps[level[0].floor].id + ' svg .directionPath' + i);

						drawing[i].path = thisPath;

						drawLength = drawing[i].routeLength;

					});

					animatePath(drawing, 0);

					//on switch which floor is displayed reset path svgStrokeDashOffset to minPath and the reanimate
					//notify animation loop?

				}  /*else {
					// respond that path not found
				console.log("path not found from " + startpoint + " to " + destination);
			}*/
			}
		} //RouteTo


		if (action && typeof (action) === 'object') {
			options = action;
			action = 'initialize';
		}

		// for each jQuery target object
		this.each(function () {
			// store reference to the currently processing jQuery object
			obj = $(this);

			getOptions(obj); // load the current options

			// Handle actions
			if (action && typeof (action) === 'string') {
				switch (action) {
				case 'initialize':
					checkIds();
					initialize(obj);
					break;
				case 'routeTo':
					// call method
					routeTo(passed);
					break;
				case 'animatePath':
					hidePath(obj);
					animatePath(drawing, 0);
					break;
				case 'startpoint':
					// change the startpoint or startpoint for the instruction path
					if (passed === undefined) {
						result = startpoint;
					} else {
						setStartPoint(passed);
					}
					break;
				case 'currentMap':
					//return and set
					if (passed === undefined) {
						result = $('div:visible', obj).prop('id');
					} else {
						switchFloor(passed, obj);
					}
					break;
				case 'accessibleRoute':
					//return and set
					if (passed === undefined) {
						result = options.accessibleRoute;
					} else {
						options.accessibleRoute = passed;
					}
					break;
				case 'path':
					//return and set
					if (passed === undefined) {
						result = options.path;
					} else {
						options.path = $.extend(true, {}, options.path, passed);
					}
					break;
				case 'checkMap':
					//handle exception report.
					//set result to text report listing non-reachable doors
					result = checkMap(obj);
					break;
				case 'getDataStore':
					//shows JSON version of dataStore when called from console.
					//To facilitate caching dataStore.
					result = JSON.stringify(WayfindingDataStore.dataStore);
					$('body').replaceWith(result);
					break;
				case 'getRoutes':
					//gets the length of the shortest route to one or more
					//destinations.
					if (passed === undefined) {
						result = WayfindingDataStore.getShortestRoute(maps, options.endpoint, startpoint);
					} else {
						result = WayfindingDataStore.getShortestRoute(maps, passed, startpoint);
					}
					break;
				case 'destroy':
					//remove all traces of wayfinding from the obj
					$(obj).remove();
					break;
				default:
					break;
				}
			}
			//
			setOptions(obj);

		}); //this each loop for wayfinding

		if (result !== undefined) {
			return result;
		}
		return this;

	}; // wayfinding function

}(jQuery));

//  ]]>
