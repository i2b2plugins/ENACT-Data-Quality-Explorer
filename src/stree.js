/*******************************************************************************
 * Copyright (c) 2023-2025 Massachusetts General Hospital 
 * All rights reserved. The ENACT Data Quality Explorer (this program) 
 * and the accompanying materials are made available under the terms 
 * of the accompanying Mozilla Public License, v. 2.0 
 * and the Healthcare Disclaimer: https://www.i2b2.org/software/i2b2_license.html
********************************************************************************/


//import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let   total_site_num = streeVersions.data.stats.siteCount; 
let	  required_column_names = ['c_fullname','agg_count','agg_date'];

// define universe of data for filtering
let tableData = null;
// define columnInfo for filtering
let columnInfo = [
	{type: 'string', filterSpec: null, filterFunction: filterString},								// name
	{type: 'number', filterSpec: null, filterFunction: filterNumber, dataRange: null},				// count
	{type: 'number', filterSpec: null, filterFunction: filterNumber, dataRange: null},				// percent
	{type: 'number', filterSpec: null, filterFunction: filterNumber, dataRange: null},				// depth
	{type: 'boolean', filterSpec: makeDefaultBooleanFilterSpec(), filterFunction: filterBoolean },	// > 2stdv
	{type: 'boolean', filterSpec: makeDefaultBooleanFilterSpec(), filterFunction: filterBoolean },	// > max
	{type: 'boolean', filterSpec: makeDefaultBooleanFilterSpec(), filterFunction: filterBoolean }	// < min	
];

// document ready tasks
let myTable;
$(document).ready( function () {
	// load logo file
	let logoImg = document.getElementById("logo");
	logoImg.src = streeConfig.logoImageRelativePath;
	logoImg.alt = streeConfig.logoImageCaption;

	// initialize Ontology Selector options
	setupOntologySelector();

	// initialize table after
	myTable = $('#myTable').DataTable({
				'columns': [
					{ data: 'name' },
					{ data: 'count' },
					{ data: 'percent' },
					{ data: 'depth'},
					{ data: 'gt2stdv' },
					{ data: 'gtMax' },
					{ data: 'ltMin' }
				],
				'paging': true,
				'scrollCollapse': true,
				'scrollY': '400px',
				'searching': false,			// hide default search box
				'deferRender': true,		// do not render unless needed (speeds up init)
				'processing': true			// show wait icon when processings
			});
	myTable.on('click', 'tbody tr', function() 
	{
	  // console.log(myTable.row(this).data());
	  // find ancestor chain here
	  let ancestors = myTable.row(this).data().node.ancestors(); // get ancestor chain, node is 0th element, root is last
	  // expand each node in ancestor chain	  
	  expandPath( ancestors, ancestors.length-1, myTable.row(this).data().node.data.id );
	})
	// build filter toggle
	let $filterToggle = $('<div>').attr({id:"filterToggle"}).text('Toggle Filter Control').on("click", function(){
		let sizes = tableSplit.getSizes();
		if (sizes[1] <1.5 ) // show filters
			tableSplit.setSizes(new Array(75,25));
		else
			tableSplit.setSizes(new Array(100,0));
		tableSplitterDragEnd();
	});
	$('#myTable_processing').before( $filterToggle );
});
// listener to clearFilterButton
$('#clearFilterButton').on("click", function()
	{
		clearFilters();
	});
	
function expandPath( ancestors, index, targetID )
{
	if (index == 0 )
	{	
		d3.select(".pulsingTarget").remove(); // remove all existing pulsingTargets
		// add new pulsingTarget
		//gNode.selectAll('g').filter( function(a){ return a.data.id == targetID; } ).append("circle").attr("r", 10).attr("stroke", "red").attr("fill", "yellow").attr("class", "pulsingTarget");
		gNode.selectAll('g').filter( function(a){ return a.data.id == targetID; } ).append("circle").attr("class", "pulsingTarget");
		setTimeout( clearPulsingTarget, 3000 );
	}
	if (index < 1 || index >= ancestors.length ) return;

	gNode.selectAll('g').filter( function(a){ return a.data.id == ancestors[index].data.id; } ).each( function(d, i) { 
			//console.log( d.data.name );
			if ( d.collapsed )
			{
				var onClickFunc = d3.select(this).on("click");
				onClickFunc.apply(this, [i, d]);
				setTimeout( expandPath, 200, ancestors, --index, targetID );
			}
			else
				expandPath( ancestors, --index, targetID );
		});
}

// remove all existing pulsingTargets
function clearPulsingTarget()
{
	d3.select(".pulsingTarget").remove();
}

// attach listener to file selector for reading input files
if (window.FileList && window.File && window.FileReader) 
{
	document.getElementById('file-selector').addEventListener('change', event => 
	{
	  const file = event.target.files[0];
	  const reader = new FileReader();
	  reader.addEventListener('load', event => {
		// to parse 3-coumn site data 
		let output = event.target.result;
		
		// header processing: Make sure it is all lower case before parsing
		let header = output.substr( 0, output.indexOf('\n') ); // use of \n ensures that it would work with Windows (\r\n), *NIX (\n), and MacOS 10+ (\n) generated input files
		let headerLow = header.toLowerCase();
		// replace header with all lower-case of itself so JSON attributes are correctly referenced.
		output = output.replace( header, headerLow );
		
		
		// Checking header delimiters
		var dsv = d3.dsvFormat("\t");				// construct a tab-delimited text parser
		let col_headers = d3.dsvFormat("\t").parse(headerLow);
		if ( col_headers.columns.length == 3 ) 	// header claims to be TSV
			dsv = d3.dsvFormat("\t")
		else if ( d3.dsvFormat(",").parse(headerLow).columns.length == 3 ) 	// header claims to be CSV
			dsv = d3.dsvFormat(",")
		else
		{
			alert("The column headers in your file suggest it is not a TSV (Tab-Separated Value) or CSV format (Comma-Separated Value) file. Either improper delimiter is used or there are not exactly 3 columns.");
			updateCurrentFilename(); // no file loaded
			return;
		}
		// Checking header values are {c_fullname, agg_count, agg_date}
		let headerValues = dsv.parse( headerLow );
		let headerSet = new Set(headerValues.columns);
		var missingHeader = null;
		for ( let i = 0; i<required_column_names.length; i++ )
		{
			var colHeaderVal = required_column_names[i];
			if (!headerSet.has(colHeaderVal) )
			{
				missingHeader = colHeaderVal;
				break;
			}
		}
		if ( missingHeader != null )
		{
			alert("Your file is missing the column header '"  + colHeaderVal + "'. Data Quality Explorer does not know how to function without it.");
			updateCurrentFilename(); // no file loaded
			return;
		}
		
		let rows = dsv.parse(output);		// parse result: each row has three properties: {c_fullname, agg_count, agg_date}
		// check for "\denominator\facts\"
		let i =0;
		let hasDenominator = false;
		siteData = new Array();
		for (i =0; i<rows.length; i++)
		{
			siteData.push(rows[i]);			// store siteData
			if (rows[i].c_fullname === allPatientConcept)
			{
				denominatorFactsCount = parseInt(rows[i].agg_count);
				hasDenominator = true;
			}
		}
		
		if (!hasDenominator)
		{
			alert("Your totalnum file is missing " + allPatientConcept + ", which is required for this tool. Please try a different file.");
			updateCurrentFilename(); // no file loaded
			return;
		}
		
		if (isTutorial)
		{
			tutorial2Satisfied = false; // loading a totalnum file resets tutorial2 check
			completeOutTutorialState( 1 ); // complete step 1 of tutorial
		}
		
		// update current file name
		updateCurrentFilename( file.name );
		// fade in domain selector
		let dsui = document.getElementsByClassName("domain_selector_ui");
		for ( i = 0; i < dsui.length; i++)
		{
			dsui[i].style.opacity 	= 0; // set opacity to 0
			dsui[i].style.display = "block";
			fadeIn(dsui[i], 1000, 1, "ease-out");
		}
	  });
	  if (file != null)
	  {
		resetDomainSelector();
		resetVars(); // remove visualization, reset data
		document.getElementById("detail_box").style.visibility = "hidden"; // hide detail_box
		if (isTutorial && !tutorial1Satisfied)
		{
			initOutTutorialState( 1 );
			tutorial1Satisfied = true;
		}
		reader.readAsText(file);
	  }
	});
}

function updateCurrentFilename( newFileName )
{
	let none = "No File Loaded";
	if (!newFileName) newFileName = none;
	
	// set filename to display
	let display = document.getElementById("file-name-display"); 
	display.innerText = newFileName;
	// change display if necessary
	if (newFileName == none)
	{
		display.classList.remove("file-loaded");
		display.classList.add("file-not-loaded");	
	}
	else
	{
		display.classList.remove("file-not-loaded");
		display.classList.add("file-loaded");
	}
}

function setupOntologySelector()
{
	let domainSelector = document.getElementById("domain_selector");
	let i;
	for (i=0;i<streeConfig.ontologyDropdownList.length; i++)
	{
		let opt = document.createElement("option");
		opt.value = i;
		opt.text  = streeConfig.ontologyDropdownList[i];
		domainSelector.appendChild(opt);
	}
}

function controlTabClicked( evt, tabID )
{
  let i, tabcontent, tablinks;
  // Get all "tabcontent" and hide them
  tabcontent = document.getElementsByClassName("control_tabcontent");
  for (i = 0; i < tabcontent.length; i++)
    tabcontent[i].style.display = "none";

  // inactivate class="tablinks"
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Show the current tab and append class "active"
  document.getElementById(tabID).style.display = "block";
  evt.currentTarget.className += " active";
}
//attach scroll listener to the document
/*
document.addEventListener("scroll", (event) => {
	console.log( "scrollY: " + window.scrollY );
	console.log( "viewBox: " + d3.select("svg").attr("viewBox") );
	//document.getElementById("detail_box").style.bottom = -window.scrollY + "px";
	
	// translate legend to be visible
	if (legend == null) return;
	
	let oldTx = d3.select("#legend").attr("transform");
	let newX = parseInt(oldTx.substring( oldTx.indexOf("(")+1, oldTx.indexOf(",") ));
	//let oldY = parseInt(oldTx.substring( oldTx.indexOf(",")+1, oldTx.indexOf(")") ));
	
	let viewBoxValues = parseViewBox(d3.select("svg").attr("viewBox"));
	let newY = (parseInt(viewBoxValues[1]) + scrollY)/1.3885 + parseInt(viewBoxValues[1]); // viewBox.y + windowScroll
	console.log( "newY: " + newY );
	
	// set new transform for Legend
	legend.attr("transform", "translate("+ newX + "," + newY + ")");
});
*/

let tableSplit = null;
// listener to DOCUMENT LOAD
document.addEventListener('DOMContentLoaded', function() 
{
	// setup main splitter
	Split(['#control_panel', '#viz_panel'], // id of panels to split
		{sizes:[20,80],				// initial size for splits (20%|80%)
		
		 onDragEnd:splitterDragEnd  // react to splitter resizing change
		}
	 );
	loadDictionary();	// load dictionary
	
	
	// setup table and table_control splitter
	tableSplit = Split(['#table_div', '#table_control_div'], // id of panels to split
		{sizes:[100,0],				  	   // initial size for splits (80%|20%)
		 minSize: [100, 0],				   // min width for each
		 onDragEnd:tableSplitterDragEnd    // react to splitter resizing change
		}
	 );
	
}, false);

// attach WINDOW LISTENER
window.onresize = handleWindowResized;
var isSVGSet = false;


// listener to TUTORIAL toggle
document.getElementById("tutorialButton").addEventListener("click", toggleTutorial);
// listner to TUTORIAL next/prev
document.getElementById("tutorialNext").addEventListener("click", tutorialNextClicked);
document.getElementById("tutorialPrevious").addEventListener("click", tutorialPreviousClicked);

// listener to DEMO VIDEO button
document.getElementById("viewVideoButton").addEventListener("click", viewDemoVideo);
// listener to DOCUMENTATION button
document.getElementById("readDocButton").addEventListener("click", showDocumentation);

var isTutorial 	  = false;
var tutorialState = 0;
var tutorial1Satisfied = false;
var tutorial2Satisfied = false;
var tutorial5Satisfied = false;

// listener to DOMAIN ONTOLOGY selection
document.getElementById('domain_selector').onchange = (event) => {	
     let i = parseInt(event.target.value)-1;
	 document.getElementById('domain_selector')[0].disabled = true; // disable the 'none' option upon first selection change
	 let fileURL = networkStatsPath + networkStatsFilenames[i];
	 
	 resetVars(); // reset variables and clean up current viz
	 if (isTutorial && tutorialState == 2)
	 {
		initOutTutorialState( 2 );
		tutorial2Satisfied = true;
	 }
	 if (debugConfig.console)
		console.log( "loading file: " + fileURL );
	 document.getElementById("detail_box").style.visibility = "hidden";
	 fetchUnzipDomain( fileURL );
 }
 
// listener to LEGEND TOGGLE
document.getElementById("legend_activator").addEventListener("click",toggleLegend);

// setting up constants and vars
const cfullname2intMap = new Map(); // maps c_fullname to fullname_int
let siteData = null;
let denominatorFactsCount = -1;
let networkDataIndex = null;
const networkStatsPath = streeConfig.networkStatsPath;

const networkStatsFilenames = streeConfig.networkStatsFilenames;

/*
const networkStatsFilenames = new Array("ACT_COVID_19_ENACT_Stats.zip",
										"ACT_Diagnoses_ICD-10_ENACT_Stats.zip",
										"ACT_Labs_ENACT_Stats.zip",
										"ACT_Medication_VA_Classes_ENACT_Stats.zip",
										"ACT_Procedures_CPT_ENACT_Stats.zip",
										"ACT_Procedures_ICD-10_ENACT_Stats.zip",
										"Demographics_ENACT_Stats.zip",
										"Diagnoses_ENACT_Stats.zip",
										"Social_Determits_Of_Healt_ENACT_Stats.zip",
										"Visit_Details_ENACT_Stats.zip",
										"Vital_Signs_(LG47-3)_ENACT_Stats.zip");
*/

// setting up values
var width = 1104; // used to be 906
var dx = 15;
var dy = width / 6;
var tree = d3.tree().nodeSize([dx, dy]);
var diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);
var margin = reinitMargin();
var root = null; // root to be initialized after reading file

var outlierStrokeColor = "mediumvioletred";
var nonOutlierColor = "lightgray";
var higherOutlierColor = "#ffc253";
var lowerOutlierColor  = "#90efed";

var lw  = 150; // legend width
var lth = 20;  // legend title height
var lh  = 210; // lengend height (without title)
	
// set up other variables:
var svg = reinitMainSVG();
var gLink = svg.append("g")
			.attr("fill", "none")
			.attr("stroke", "#555")
			.attr("stroke-opacity", 0.3)
			.attr("stroke-width", 1.5);
var gNode = svg.append("g")
			.attr("cursor", "pointer")
			.attr("pointer-events", "all");
var pathToRoot = svg.append("g")
				  .attr("id", "pathToRoot");
				  
var maxNodeID  = -1;

var parentMap  		= null; // map for parents->list of children of a selected sumNode
var parentMapIndex  = 0;
var currentSumNode  = null;

var standardNodeSizes = [2, 2, 2.5, 3.2, 4.35, 5.5, 6.5];
var standardNodeSizeLabels = ["no count", "5 - 99", "100 - 999", "1,000 - 9,999", "10,000 - 99,999", "100,000 - 999,999", "> 1,000,000"];


function reinitMainSVG()
{
	return d3.create("svg")
			.attr("id", "svg")
			.attr("viewBox", [-margin.left, -margin.top, width, dx])    // set (-140, -margin.top, 110, dx )
			.style("font", "10px sans-serif")
			.style("user-select", "none");
}
function reinitMargin()
{
	return ({top:50, right:120, bottom:50, left:140});
}
function resetVars()
{	
	width = 1104;
	dx = 15;
	dy = width / 6;
	tree = d3.tree().nodeSize([dx, dy]);
	diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);
	margin = reinitMargin();
	//({top:50, right:120, bottom:50, left:140});
	root = null; // root to be initialized after reading file

	// remove svg node and its descendants
	let vizDom = document.getElementById("viz_panel");
	// remove all nodes in the svg dom
	let svgDom = document.getElementById("svg");
	if (svgDom)
		vizDom.removeChild( svgDom );	// drop svg
	
	// re-set up variables:
	svg = reinitMainSVG();
	/*
	d3.create("svg")
			.attr("id", "svg")
			.attr("viewBox", [-margin.left, -margin.top, width, dx])
			.style("font", "10px sans-serif")
			.style("user-select", "none");*/
	gLink = svg.append("g")
			.attr("fill", "none")
			.attr("stroke", "#555")
			.attr("stroke-opacity", 0.3)
			.attr("stroke-width", 1.5);
	gNode = svg.append("g")
			.attr("cursor", "pointer")
			.attr("pointer-events", "all");

	clearPathToRoot();
	
	pathToRoot = svg.append("g")
				  .attr("id", "pathToRoot");
	
	maxNodeID  = -1;
	parentMap  = null;
	parentMapIndex  = 0;
	currentSumNode  = null;
}

function resetTutorialStates()
{
	tutorialState = 0; // reset tutorial state	 
	tutorial1Satisfied = false;
	tutorial2Satisfied = false;
	tutorial5Satisfied = false;
}

// reset domain selector
function resetDomainSelector()
{	
	document.getElementById('domain_selector')[0].disabled = false; // enable the 'none' option when resetting
	document.getElementById('domain_selector').value = "0"; 		// default selection to 1st item
}

function resetUI()
{
	// reset legend
	document.getElementById("legend_box").style.display = "none";
	if (document.getElementById("legend_svg")) 
		document.getElementById("legend_svg").style.display = "block";
	document.getElementById("legend_activator").innerHTML = "Hide Legend &#x25B2;";
	resetDomainSelector();
	// reset detail_box
	document.getElementById("detail_box").style.visibility = "hidden";
	// reset file-name-display
	let display = document.getElementById("file-name-display");
	display.classList.remove("file-loaded");
	display.classList.add("file-not-loaded");
}

function toggleLegend()
{
	if ( document.getElementById("legend_svg").style.display != "none") 
	{
		document.getElementById("legend_svg").style.display = "none";
		document.getElementById("legend_activator").innerHTML = "Show Legend &#x25BC;";
	}
	else
	{
		document.getElementById("legend_svg").style.display = "block";
		document.getElementById("legend_activator").innerHTML = "Hide Legend &#x25B2;";
	}
}

// variables or for logging elapsed time
var sTime    = null;
var sElapsed = null;

// Use d3 to parse tsv file given URL. Walks through each parsed row and saves to siteData
function fetchTSV(url)
{
	initOutTutorialState(1);
	const startTime = Date.now();
	const promise = d3.dsv("\t", url);
	promise.then((data) => {
		const millis = Date.now()-startTime;
		if (debugConfig.console)
			console.log('Columns: ' + data.columns + ' #Rows+Header: ' + data.length + " | Time Elapsed: " + millis/1000.0 + " seconds");
		let i = 0;
		siteData = new Array();
		for (i =0; i<data.length; i++)
		{
			siteData.push(data[i]);			// store siteData
			if (data[i].c_fullname === allPatientConcept)
			{
				denominatorFactsCount = parseInt(data[i].agg_count);
				hasDenominator = true;
			}
		}		
		if (!hasDenominator) // sanity check
		{
			alert("Your totalnum file is missing " + allPatientConcept + ", which is required for this tool. Please try a different file.");
			return;
		}		
		if (isTutorial)
		{
			tutorial1Satisfied = true;
			completeOutTutorialState( 1 ); // complete step 1 of tutorial
		}
		let dsui = document.getElementsByClassName("domain_selector_ui");
		for (i=0; i < dsui.length; i++)
			dsui[i].style.display = "block";
	});	
}

function fetchUnzipDomain( url )
{
	enableLoadingAnimation( true, "Loading Ontology..." );
	sTime = Date.now();
	JSZipUtils.getBinaryContent(url, function(err, file) 
	{
		if(err)
		{	
			alert("Error occurred downloading json. Unable to launch DQ Explorer. Please try another time." + " [" + err + "]");
			return;
		}
		sElapsed = Date.now()-sTime;
		if (debugConfig.console)
			console.log('[zipped json] Downloading zipped json file: ' + sElapsed/1000.0 + " seconds");		
		sTime = Date.now();
		var jsZip = new JSZip();
		jsZip.loadAsync(file).then(function (zip) 
		{
			Object.keys(zip.files).forEach(function (filename) 
			{
				sTime = Date.now();
				zip.files[filename].async('string').then(function (fileData) 
				{
					// fileData is a String representation of the json file
					let newJSONObj = JSON.parse( fileData);
					sElapsed = Date.now()-sTime;
					if (debugConfig.console)
						console.log('[zipped json] Unzipping and create JSON Obj: ' + sElapsed/1000.0 + " seconds");
					networkDataIndex = new Map();
					
					buildNetworkIndex( newJSONObj.data ); // traverse the JSON, create mapping (fullname_int -> obj)
					updateSiteData();
					
					enableLoadingAnimation( false );
					
					if (isTutorial && tutorialState == 2) 
						completeOutTutorialState( 2 );

					setupRoot( newJSONObj.data ); // initialize viz data
					start(); 				 // begin visualization
				});
			});
		});
	});
}

// traversal every node and put every node into a map
function buildNetworkIndex( node )
{
	networkDataIndex.set( node.id, node );
	if (node.children)
	{
		let i = 0;
		for (i = 0; i < node.children.length; i++)
		{
			let c = node.children[i];
			buildNetworkIndex(c);
		}
	}
}

function updateSiteData()
{
	let i = 0;
	for (i = 0; i < siteData.length; i++)
	{
		let fullname_int = cfullname2intMap.get(siteData[i].c_fullname);
		if (networkDataIndex.get(fullname_int) === undefined) // skip nodes not in this domain
		  continue;
		let node = networkDataIndex.get(fullname_int);
		// set count and percent;
		let count = (parseInt(siteData[i].agg_count));
		node.data.count = (count == -1)? 5 : count; // covert -1 to 5
		node.data.percent = node.data.count * 100.0 / denominatorFactsCount;
	}
}

function setupLegend( legend )
{
	let headerColor = "#37042f";
	let keyTextColor= "darkgray";

	legend.append("rect").attr("id", "legendContent")
					.attr("fill", "white")
					.attr("stroke", "lightgray")
					.attr("width", lw)
					.attr("height", lh)
					.attr("x", 0)
					.attr("y", 0)
					.attr("stroke-width", 1);
	legend.append("text")
					.attr("stroke", headerColor)
					.attr("stroke-width", "0.1px")
					.attr("fill", headerColor)
					.attr("x", 2)
					.attr("y", 12)
					.attr("font-size", "10px")
					.attr("font-family", "sans-serif")
					.attr("font-weight", "normal")
					.text("Size: Obfuscated Count");
	let i = 0;
	let y = 9;
	for ( i=0; i< standardNodeSizes.length; i++)
	{
		let r = standardNodeSizes[i];
		y = y + Math.max(2*r, 10) + 2;
		legend.append("circle")
			  .classed("legendKey", true)
			  .attr("cx", 18)
			  .attr("cy", y)
			  .attr("r", r) 
			  .attr("fill", i==0? "white": nonOutlierColor)
			  .attr("stroke", nonOutlierColor)
			  .attr("stroke-width", 1)
			  .attr("stroke-opacity", 1)
			  .attr("fill-opacity", 1);
		legend.append("text")
			  .classed("legendKey", true)
			  .attr("x", 28)
			  .attr("y", y+3)
			  .attr("stroke", keyTextColor)
			  .attr("fill", keyTextColor)
			  .attr("stroke-width", "0.1px")
			  .text(standardNodeSizeLabels[i]);
	}
	
	// key for outline (existence of outliers in subtree)
	y = y + standardNodeSizes[standardNodeSizes.length-1]*2 + 8;
	legend.append("text")
				.attr("stroke", headerColor)
				.attr("stroke-width", "0.1px")
				.attr("fill", headerColor)
				.attr("x", 2)
				.attr("y", y)
				.attr("font-size", "10px")
				.attr("font-family", "sans-serif")
				.attr("font-weight", "normal")
				.text("Outline Color");
				
	for ( i=0; i<2; i++)
	{
		let r = standardNodeSizes[4]; 
		y = y + Math.max(2*r, 10) + 2;
		let strokeColor = (i==0?outlierStrokeColor:nonOutlierColor);
		legend.append("circle")
			  .classed("legendKey", true)
			  .attr("cx", 18)
			  .attr("cy", y)
			  .attr("r", r) 
			  .attr("fill", nonOutlierColor)
			  .attr("stroke", strokeColor)
			  .attr("stroke-width", 1)
			  .attr("stroke-opacity", 1)
			  .attr("fill-opacity", 1);
		let outlineKeyText = (i==0?"has outlier(s) in subtree":"has no outliers in subtree")
		legend.append("text")
			  .classed("legendKey", true)
			  .attr("x", 28)
			  .attr("y", y+3)
			  .attr("stroke", keyTextColor)
			  .attr("stroke-width", "0.1px")
			  .attr("fill", keyTextColor)
			  .text(outlineKeyText);
	}			
	
	// key for fill (if node is an outlier)
	y = y + standardNodeSizes[standardNodeSizes.length-1]*2 + 8;
	legend.append("text")
				.attr("stroke", headerColor)
				.attr("stroke-width", "0.1px")
				.attr("fill", headerColor)
				.attr("x", 2)
				.attr("y", y)
				.attr("font-size", "10px")
				.attr("font-family", "sans-serif")
				.attr("font-weight", "normal")
				.text("Fill Color");

	let fillColors = [higherOutlierColor, lowerOutlierColor, nonOutlierColor];
	let keyText    = ["higher-than-mean outlier", "lower-than-mean outlier", "not an outlier"];
	let r = standardNodeSizes[4];
	for ( i=0; i<3; i++)
	{
		y = y + Math.max(2*r, 10) + 2;
		let fillColor = fillColors[i];
		legend.append("circle")
			  .classed("legendKey", true)
			  .attr("cx", 18)
			  .attr("cy", y)
			  .attr("r", r) 
			  .attr("fill", fillColor)
			  .attr("stroke", nonOutlierColor)
			  .attr("stroke-width", 1)
			  .attr("stroke-opacity", 1)
			  .attr("fill-opacity", 1);
		let outlineKeyText = keyText[i];
		legend.append("text")
			  .classed("legendKey", true)
			  .attr("x", 28)
			  .attr("y", y+3)
			  .attr("stroke", keyTextColor)
			  .attr("stroke-width", "0.1px")
			  .attr("fill", keyTextColor)
			  .text(outlineKeyText);
	}
}

// window resize listener
function handleWindowResized()
{
	if (isSVGSet) // update legend
		updateLegend();
}

function updateLegend()
{
	// setup legend if it does not exist.
	if ( document.getElementById("legend") == null )
	{
		let legend_svg = d3.create("svg")
		.attr("id", "legend_svg")
		.style("font", "10px sans-serif")
		.style("user-select", "none");
		
		let legend = legend_svg.append("g")
				.attr("id", "legend")
				.attr("fill", "none")
				.attr("stroke", "#555")
				.attr("stroke-opacity", 0.3)
				.attr("stroke-width", 1.5);
		setupLegend( legend );
		
		document.getElementById("legend_box").appendChild( legend_svg.node() );
	}

	if ( d3.select("#svg")._groups[0][0]==null) return;
	
	let viewBoxValues = parseViewBox(d3.select("#svg").attr("viewBox"));
	let vw = parseInt(viewBoxValues[2]); // viewWidth
	let vh = parseInt(viewBoxValues[3]); // viewHeight
	
	let bRect = document.getElementById("svg").getBoundingClientRect();
	let ratio = bRect.width/vw;
	
	let svg_w = 150*ratio;
	d3.select("#legend").attr("transform", "scale(" + ratio+ ")");
	d3.select("#legend_svg").attr("width", svg_w + "px");
	d3.select("#legend_svg").attr("height", (230*ratio)+"px");
}


// initialize root
function setupRoot( jsonObj )
{
	let start = Date.now();
	root = d3.hierarchy( jsonObj );
	let elapsed = (Date.now() - start) / 1000.0;
	
	if (debugConfig.console)
	{
		console.log("Node Count: " + root.descendants().length );
		console.log("Load Time: " + elapsed + " sec" );
	}

	root.x0 = dy / 2;
	root.y0 = 0;

	let descendants = root.descendants();
	maxNodeID = descendants.length;
	
	start = Date.now();
	descendants.forEach(d => computeSumTrees(d));
	elapsed = (Date.now() - start) / 1000.0;
	if (debugConfig.console)
	{
		console.log("SumTree Time: " + elapsed + " sec" );
	}
	
	descendants.forEach((d, i) => {
		d.collapsed = d.depth == 0? false : true;	// initial state: every node is collapsed except the root
		d.id = i;
		d._children = d.children;
		// initially state is just root (every node is collapsed. Next update(root) will show its children)
		if (d.depth) 
			d.children = null; 
	});	
}
	
function computeSumTrees( node )
{
	node.sumTree  = {};
	node.sumTree.size = 0;
	node.descendants().forEach( d => {
			if (d == node ) return;  // no need to process node
			let rDepth = d.depth - node.depth; // depth relative to node
			let n = node.sumTree[ rDepth + '' ];
			if (n == null)
			{
				n = {};
				n.nodes = new Array();
				node.sumTree.size++;
			}
			n.nodes.push(d);
			node.sumTree[rDepth + ''] = n;
			
	});
	for (let i = 1; i <= node.sumTree.size; i++)
	{
		d = node.sumTree[i+''];		
		if ( i == 1 ) 	d.parent = node;				// parent set to node
		else			d.parent = node.sumTree[i-1];	// parent set to the previous sumTreeNode
		d.height = d.parent.height-1;	 // assign height
		d.depth = d.parent.depth + 1;// assign depth		
		d.id = maxNodeID;			 // assign ID to node d and increment maxNodeID
		d.data  = {};				 // assign data object
		
		maxNodeID++;
		
		d.qualified = new Array();
		d.count = 0;									//TODO: replace d.count with d.qualified.length
		d.higherNodes = new Array();
		d.lowerNodes  = new Array();
		// use qualifies to determine if interesting
		d.nodes.forEach( nd => { 
			if (qualifies(nd) )
			{
				d.qualified.push(nd);
				d.count++;
				if(nd.data.data.percent > nd.data.data.mean)
					d.higherNodes.push(nd);		// nodes that have % significantly greater than mean
				else
					d.lowerNodes.push(nd);		// nodes that have % significant lower than mean
			}
		});
			
		d.data.name = d.count + "/" + d.nodes.length;
		d.data.numerator = d.count;
		d.data.denominator = d.nodes.length;
		
		if (i < node.sumTree.size-1)
		{
			d.children = new Array();
			d.children.push( node.sumTree[ (i+1)+''] );
		}
	}
}


function qualifies(d)
{
	return (d.data && d.data.data && d.data.data.percent && Math.abs(d.data.data.percent - d.data.data.mean) > (d.data.data.stdv * 2));
}

function sumTreeHasCount(d)
{
	if (!d.sumTree) return false;

	for (let i = 1; i <= d.sumTree.size; i++)
		if (d.sumTree[i+""].count>0) 
			return true;
	return false;
}

// determines if a node is a SumTree Node
function isSumNode(n)
{
	return n.__data__.nodes;
}


 function addSumNodes( sumNodeSelection ) 
 {
	let heightMap = new Map();

	sumNodeSelection.append("rect")
		.attr("width", 20)
		.attr("height", 30)
		.attr("x",   0)
		.attr("y",  -15)
		.attr("fill", "white")
		.attr("stroke", "darkgray")
		.attr("stroke-width", 1)
		.on("mouseover", mouseover)				// mouseover behavior
		.on("mouseout", mouseout);				// mouseout behavior

	// paint % lower nodes
	sumNodeSelection.append("rect")
		.attr("width", 20)
		.attr("height", function(d)
				{ 
					let h = d.lowerNodes.length/d.data.denominator * 30.0;
					heightMap.set( d.id, h );
					return h;
				}) 
		.attr("x",   0)
		.attr("y", function(d){ return 15 - d.lowerNodes.length/d.data.denominator * 30.0; } )
		.attr("fill", lowerOutlierColor )
		.attr("stroke", lowerOutlierColor)
		.attr("stroke-width", 1)
		.on("mouseover", mouseover)				// mouseover behavior
		.on("mouseout", mouseout);				// mouseout behavior

	// paint % higher nodes
	sumNodeSelection.append("rect")
		.attr("width", 20)
		.attr("height", function(d)
				{ 
					let h = d.higherNodes.length/d.data.denominator * 30.0;
					return h;
				}) 
		.attr("x",   0)
		.attr("y", function(d)
				{ 
					if ( heightMap.get( d.id ) == 0) return 15 - d.higherNodes.length/d.data.denominator * 30.0; 
					else   							 return 15 - Math.max(1, heightMap.get( d.id )) - d.higherNodes.length/d.data.denominator * 30.0; 
				})
		.attr("fill", higherOutlierColor )
		.attr("stroke", higherOutlierColor)
		.attr("stroke-width", 1)
		.on("mouseover", mouseover)				// mouseover behavior
		.on("mouseout", mouseout);				// mouseout behavior
	
	sumNodeSelection.append("text")
		.attr("dy", "0.31em")
		//.attr("x", d => d._children ? -shortenName(d.data.name).length * 1.3 : -shortenName(d.data.name).length * 1.3)
		//.attr("y", -20 )
		.attr("x", -2 )
		.attr("y", -8 )
		.attr("text-anchor", "end")
		//.attr("text-anchor", d => d._children ? "end" : "start")
		.text(d => shortenName(d.data.name) )
	  .clone(true).lower()
		.attr("stroke-linejoin", "round")
		.attr("stroke-width", 3)
		.attr("stroke", "white");
 }

/* returns color corresponding if percent is significantly higher or lower than mean */
function getNodeFillColor( d )
{
	if (qualifies(d))
	{	
		if (d.data && d.data.data && d.data.data.percent && (d.data.data.percent - d.data.data.mean > 0))
			return higherOutlierColor;
		else
			return lowerOutlierColor;
	}
	else
	{
		if (!d.data.data.count)
			return "white";
	}
	return nonOutlierColor;
}

/* returns css class corresponding if percent is significantly higher or lower than mean */
function getDataRowClass( d )
{
	if (qualifies(d))
	{	
		if (d.data && d.data.data && d.data.data.percent && (d.data.data.percent - d.data.data.mean > 0))
			return "data_row_high";
		else
			return "data_row_low";
	}
	return null;
}

function getNodeRadius( d )
{
	if ( d.data.data.count>=100 && d.data.data.count<1000) 	 		 return standardNodeSizes[2];
	else if ( d.data.data.count>=1000 && d.data.data.count<10000) 	 return standardNodeSizes[3];
	else if ( d.data.data.count>=10000 && d.data.data.count<100000)  return standardNodeSizes[4];
	else if ( d.data.data.count>=100000 && d.data.data.count<1000000)return standardNodeSizes[5];
	else if ( d.data.data.count>=1000000 ) 							 return standardNodeSizes[6];

	return standardNodeSizes[0];; // for nodes that have count less than 100 or have no counts
}

/*
function getNodeID( d )
{
	return 'id'+d.id;
}
*/

 function addNormalNodes( normalNodeSelection ) 
 {
	normalNodeSelection.append("circle")
		//.attr("r", d => (qualifies(d)||sumTreeHasCount(d)) ? 4 : 2.5) 	// radius depending on whether node or any descendants are 'interesting'
		.attr("r", d => getNodeRadius(d) ) 	// radius depending on whether node or any descendants are 'interesting'
		.attr("fill", d => getNodeFillColor(d))							// fill color depending on whether node is 'interesting'
		.attr("stroke", d => sumTreeHasCount(d) ? outlierStrokeColor : nonOutlierColor)	// stroke color depending on if subtree has 'interesting' nodes
		.attr("stroke-width", 1)
		.on("mouseover", mouseover)				// mouseover behavior
		.on("mouseout", mouseout);				// mouseout behavior
		
	normalNodeSelection.append("text")
		.attr("dy", "0.31em")
		.attr("x", d => d._children ? -6 : 6)
		.attr("text-anchor", d => d._children ? "end" : "start")
		.text(d => (qualifies(d)||sumTreeHasCount(d)|| !d.parent)? shortenName(d.data.name) : null)
		.clone(true).lower()
		.attr("stroke-linejoin", "round")
		.attr("stroke-width", 3)
		.attr("stroke", "white");	
 }

function update(source) 
{		
		const duration = d3.event && d3.event.altKey ? 2500 : 250;
		let desc = root.descendants();
		let desc2 = [...new Set(desc)];
		let nodes = desc2.reverse();
		
		//let nodes = [ new Set(desc) ]; // ensure each element is an unique object reference		
		const links = root.links();
		
		// Compute the new tree layout.
		tree(root);
		
		nodes.forEach(function(d) {
			d.y = d.depth * 90;
		});
		
		// fix all sumtree node's x to the parent's x for straight horizontal line
		let collapsedNodes = nodes.filter( d => d.collapsed );
		collapsedNodes.forEach( r => {
			let sTree = r.sumTree;
			for (let i = 1; i <= sTree.size; i++)
			{
				sTree[i+''].x = r.x;
			}
		});
		
		// Compute for left-most (top) and right-most (bottom)nodes
		let left = root;
		let right = root;
		root.eachBefore(node => {
		  if (node.x < left.x) left = node;
		  if (node.x > right.x) right = node;
		});

		const height = right.x - left.x + margin.top + margin.bottom;

		const transition = svg.transition()
			.duration(duration)
			.attr("viewBox", [-margin.left, left.x - margin.top, width, height])
			.tween("resize", window.ResizeObserver ? null : () => () => svg.dispatch("toggle"));

		// Update the nodes
		const node = gNode.selectAll("g")
		  .data(nodes, d => d.id); // databind nodes to selected <g> dom elements. d is an element of nodes

		// Enter any new nodes at the parent's previous position.
		const nodeEnter = node.enter().append("g")
			.attr("transform", d => `translate(${source.y0},${source.x0})`)
			.attr("fill-opacity", 0)
			.attr("stroke-opacity", 0)
			.on("click", (event, d) => {
				if (d.nodes) // this is a sumNode
				{
					pathToRoot.html(null); // clear pathToRoot
					let viewBoxValues = parseViewBox(d3.select("#svg").attr("viewBox"));
					if (d.data.numerator == 0 )
					{
						clearPathToRoot();
						return;
					}
					
					let xoffset = Math.abs(viewBoxValues[0]);
					let height = 100;
					let yoffset = 16;
					pathToRoot.append("rect")
							   .attr("id", "pathToRootBackground")
							   .attr("x", 5)
							   .attr("y", d.x + yoffset)
							   .attr("width", d.y + 20)
							   .attr("height", height)
							   .attr("fill", "#f3f3f3")
							   .attr("stroke", "white")
							   .attr("stroke-width", 0.5);

					// make close icon					
					let icon = d3.select("#pathToRoot").append("g")
							   .on("mouseover", pathViewCloseIcon_mouseover)
							   .on("mouseout", pathViewCloseIcon_mouseout)
							   .on("click", clearPathToRoot );
					
					icon.append("rect")
							   .attr("class", "pathView_closeIcon")
							   .attr("x", d.y+10)
							   .attr("y", d.x+18)
							   .attr("width", 12)
							   .attr("height", 12)
							   .attr("fill","white")
							   .attr("stroke","darkgray")
							   .attr("stroke-width", 0.5);
							   
					icon.append("line")
								.attr("class", "pathView_closeIconLine")
								.attr("x1", d.y+12)
								.attr("y1", d.x+20)
								.attr("x2", d.y+6+14)
								.attr("y2", d.x+28)
								.attr("stroke", "darkgray")
								.attr("stroke-width", 1);
					icon.append("line")
								.attr("class", "pathView_closeIconLine")
								.attr("x1", d.y+12)
								.attr("y1", d.x+28)
								.attr("x2", d.y+6+14)
								.attr("y2", d.x+20)
								.attr("stroke", "darkgray")
								.attr("stroke-width", 1);
													
					let triangleControlNext = d3.select("#pathToRoot").append("g");
					triangleControlNext.append("polygon")
					   .attr("class", "pathView_navigateDown")
					   .attr("points", (d.y-2)+","+(d.x+19)+ " " + (d.y+3)+","+(d.x+29) + " " + (d.y+8)+","+(d.x+19))
					   .style("strokeWidth", "1")
					   .on("mouseover", pathViewNavigateDown_mouseover)
					   .on("mouseout", pathViewNavigateDown_mouseout)
					   .on("click", drawNextSet );
					   
					let triangleControlPrev = d3.select("#pathToRoot").append("g");
					triangleControlPrev.append("polygon")
					   .attr("class", "pathView_navigateUp")
					   .attr("points", (d.y-12)+","+(d.x+29)+ " " + (d.y-7)+","+(d.x+19) + " " + (d.y-2)+","+(d.x+29))
					   .style("strokeWidth", "1")
					   .on("mouseover", pathViewNavigateUp_mouseover)
					   .on("mouseout", pathViewNavigateUp_mouseout)
					   .on("click", drawPrevSet );
					   
					// text display
					d3.select("#pathToRoot").append("text")
						.attr("id", "parentMapIndexDisplay")
						.attr("x", (d.y-15))
						.attr("y", (d.x+27))
						.attr("text-anchor", "end" )
						.attr("font-size", "10px")
						.text( "" );
					
					// build data structure, reset index
					parentMap 		= computeOutlierSets( d.nodes ); // parentMap is a Map object					
					parentMapIndex  = 0;
					currentSumNode  = d;
					drawPath();
					return;
				}
				else if (!d._children) return; // This is a leaf node, no need to update
				d.collapsed = !d.collapsed;
				// close pathToRoot before expanding /collapsing nodes
				clearPathToRoot();
				
				if (d.collapsed) // show summary nodes
				{
					// if in tutorial stage 5, user clicked on root to show its sumtree.
					if (isTutorial && tutorialState==5 && d==root)
					{
						initOutTutorialState( tutorialState );
						completeOutTutorialState( tutorialState, 400 ); // advance to stage 6
						tutorial5Satisfied = true;
					}
					d.children = new Array();
					for (let i = 1; i <= d.sumTree.size; i++)
						d.children.push( d.sumTree[i+''] );
				}
				else // expand children
					d.children = d._children;
			  update(d);
			});
		
		nodeEnter.filter( function(d) { return d.nodes; } ).call( addSumNodes );		// add sumTree nodes		
		nodeEnter.filter( function(d) { return d.sumTree; } ).call( addNormalNodes );	// add normlTree nodes

		// Transition nodes to their new position.
		const nodeUpdate = node.merge(nodeEnter).transition(transition)
			.attr("transform", d => `translate(${d.y},${d.x})`)
			.attr("fill-opacity", 1)
			.attr("stroke-opacity", 1);

		// Transition exiting nodes to the parent's new position.
		const nodeExit = node.exit().transition(transition).remove()
			.attr("transform", d => `translate(${source.y},${source.x})`)
			.attr("fill-opacity", 0)
			.attr("stroke-opacity", 0);

		// Update the links…
		const link = gLink.selectAll("path")
		  .data(links, d => d.target.id);

		// Enter any new links at the parent's previous position.
		const linkEnter = link.enter().append("path")
			.attr("d", d => {
			  const o = {x: source.x0, y: source.y0};
			  return diagonal({source: o, target: o});
			});

		// Transition links to their new position.
		link.merge(linkEnter).transition(transition)
			.attr("d", diagonal);	

		// Transition exiting nodes to the parent's new position.
		link.exit().transition(transition).remove()
			.attr("d", d => {
			  const o = {x: source.x, y: source.y};
			  return diagonal({source: o, target: o});
			});

		// Stash the old positions for transition.
		root.eachBefore(d => {
		  d.x0 = d.x;
		  d.y0 = d.y;
		});
}

// returns an array of viewBox coordinates, where each element denotes: [0]=x, [1]=y, [2]=width, [3]=height
function parseViewBox( viewBoxStr )
{
	return viewBoxStr.split(",");
}

function resizeViewBoxForPathToRoot( )
{
	let viewBoxValues = parseViewBox(d3.select("#svg").attr("viewBox"));
	let height = parseInt(d3.select("#pathToRootBackground").attr("height"));
	let yoffset = 30;
	newHeight = currentSumNode.x + height + yoffset - parseInt(viewBoxValues[1]); // currentSumNode.x is actually y coordinate on screen
	if ( currentSumNode.x + yoffset + height > (parseInt(viewBoxValues[3])+parseInt(viewBoxValues[1])))
		d3.select("#svg").attr("viewBox", viewBoxValues[0]+","+viewBoxValues[1]+","+viewBoxValues[2]+"," + Math.max(200, newHeight) );
}

// If {val} is null or undefined, return display "-". Otherwise return {val}.
function prettyPrintValueDisplay( val )
{
	if (!val) return "-";
	if (val == -1 ) return "-"; // for q3 or q1 that may be set to -1 by java ETL
	
	let valStr = val +"";
	let dotIndex = valStr.indexOf('.');
	if ( dotIndex == -1 ) // no decimal points
		return val.toLocaleString(); // add local-specific number segmentation character. i.e. , for US (1,000)); . for EU (1.000);

	if (val < 0.01)
		return val.toPrecision(2);
	else
		return valStr.substring(0, dotIndex + 3);// + ' ' + val;

}

// returns a set of children outliers indexed by their shared parent (using parent.data.id as identifier).
function computeOutlierSets( nodes )	
{
	let qualified = nodes.filter( node => qualifies(node) );
	
	let map = new Map();
	let i = 0;
	for (i = 0; i < qualified.length; i++)
	{
		let id = qualified[i].parent.data.id;
		let arr = map.get(id);
		if (!arr) arr = new Array(); // create new array if entry does not exist
		arr.push( qualified[i] );	 // add node to array
		map.set(id, arr);
	}
	let map2 = new Map([...map].sort((a,b) => b[1].length - a[1].length )); // sort map by array lengths
	return map2;
}

function getSumNodeRootName( sumNode )
{	
	let n = sumNode;
	let c = 0;
	while ( n.nodes ) // if it has nodes, then it is a sumNode
	{
		n = n.parent;
		c++;
	}
	return shortenName(n.data.name) + " [" + c + "]";
}

function makeVisibleElementsByClass( uiClass, isVisible )
{
	let set = document.getElementsByClassName(uiClass);
	// make set of elements invisible
	let oldClass = 'material-block';
	let newClass = 'immaterial';
	if (isVisible) // make set of elements visible
	{
		oldClass = "immaterial";
		newClass = 'material-block';
	}
	for (let i = 0; i < set.length; i++)
	{
		set[i].classList.remove(oldClass);
		set[i].classList.add(newClass);
	}
}

function mouseover(d) // d is mouseEvent. d.currentTarget is the svg obj
{
	if (isSumNode( d.currentTarget ))
	{	
		makeVisibleElementsByClass( 'treeNode',     false );
		makeVisibleElementsByClass( 'detail_graph', false );
		makeVisibleElementsByClass( 'modal_graph',  false );
		makeVisibleElementsByClass( 'sumNode',      true );
			
		let title = getSumNodeRootName(d.currentTarget.__data__);
		document.getElementById("detail_title").innerHTML = title;		
		document.getElementById("detail_sumNode_total_count").innerHTML   = "<span class=\"row_header\">Total Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.nodes.length + "</span>";
		document.getElementById("detail_sumNode_outlier_count").innerHTML = "<span class=\"row_header\">Outlier Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.qualified.length + "</span>";
		document.getElementById("detail_sumNode_higher_count").innerHTML  = "<div class=\"higherCountIcon\"></div> <span class=\"row_header\">Higher Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.higherNodes.length + "</span>";
		document.getElementById("detail_sumNode_lower_count").innerHTML   = "<div class=\"lowerCountIcon\"></div> <span class=\"row_header\">Lower Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.lowerNodes.length + "</span>";
				
		document.getElementById("modal_title").innerHTML  = title;
		document.getElementById("modal_sumNode_total_count").innerHTML   = "<span class=\"row_header\">Total Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.nodes.length + "</span>";
		document.getElementById("modal_sumNode_outlier_count").innerHTML = "<span class=\"row_header\">Outlier Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.qualified.length + "</span>";
		document.getElementById("modal_sumNode_higher_count").innerHTML  = "<div class=\"higherCountIcon\"></div> <span class=\"row_header\">Higher Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.higherNodes.length + "</span>";
		document.getElementById("modal_sumNode_lower_count").innerHTML   = "<div class=\"lowerCountIcon\"></div> <span class=\"row_header\">Lower Count:</span> <span class=\"row_value\">" + d.currentTarget.__data__.lowerNodes.length + "</span>";
	}
	else
		activateNormalNodesMouseoverBehavior(d);
	
	// make popup visible and set its position
	let popup = document.getElementById("modal_popup");
	let x = d.clientX + window.scrollX + 10;
	let y = d.clientY + window.scrollY - 20;
	
	if (( x + popup.getBoundingClientRect().width ) > window.innerWidth )
	{
		x = d.clientX - popup.getBoundingClientRect().width - 10;
	}
	if (( y + popup.getBoundingClientRect().height ) > window.innerHeight )
	{
		y = d.clientY - popup.getBoundingClientRect().height - 20;
	}
	popup.style.visibility = "visible";
	popup.style.left = x + "px";
	popup.style.top  = y + "px";
	/*
	popup.style.left = (d.clientX + window.scrollX + 10) + "px";
	popup.style.top  = (d.clientY + window.scrollY - 20) + "px";
	*/
	
	
		
	// use popup.getBoundingClientRect().width, popup.getBoundingClientRect().height
	// use window.innerWidth and window.innerHeight

}


function activateNormalNodesMouseoverBehavior(d)
{
	makeVisibleElementsByClass('sumNode',      false);	
	makeVisibleElementsByClass('treeNode',     true);
	makeVisibleElementsByClass('detail_graph', true);
	makeVisibleElementsByClass('modal_graph',  true);
	
	if (debugConfig.fullname_id == false)
	{
		document.getElementById('detail_id').classList.remove('material-block');
		document.getElementById('detail_id').classList.add('immaterial');
		document.getElementById('modal_id').classList.remove('material-block');
		document.getElementById('modal_id').classList.add('immaterial');
	}
	
	// reset percentage css classes for detailBox and modal popup
	document.getElementById("modal_percent").classList.remove("data_row_high");
	document.getElementById("modal_percent").classList.remove("data_row_low");
	document.getElementById("detail_percent").classList.remove("data_row_high");
	document.getElementById("detail_percent").classList.remove("data_row_low");

	// set data in detailedBox
	document.getElementById("detail_title").innerHTML = d.currentTarget.__data__.data.name;
	document.getElementById("detail_id").innerHTML = "<span class=\"row_header\">ID:</span> <span class=\"row_value\">" + d.currentTarget.__data__.data.id + "</span>";
	document.getElementById("detail_count").innerHTML = "<span class=\"row_header\">Patients/Total Patients:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.count ) + "&nbsp; / &nbsp;" + prettyPrintValueDisplay(denominatorFactsCount) + "</span>";
	
	document.getElementById("detail_percent").innerHTML = "<span class=\"row_header\">Percent:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.percent ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.percent )) + "</span>";
	document.getElementById("detail_mean").innerHTML = "<span class=\"row_header\">Mean Percent:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.mean ) +  getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.mean )) + "</span>";
	document.getElementById("detail_site_count").innerHTML = "<span class=\"row_header\">Sites/Total Sites</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.site_count ) + "/" + total_site_num + "</span>";
	document.getElementById("detail_stdv").innerHTML = "<span class=\"row_header\">Standard Deviation:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.stdv ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.stdv )) + "</span>";
	
	document.getElementById("detail_min").innerHTML = "<span class=\"row_header\">Minimum:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.min ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.min )) + "</span>";
	document.getElementById("detail_max").innerHTML = "<span class=\"row_header\">Maximum:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.max ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.max )) + "</span>";
	document.getElementById("detail_median").innerHTML = "<span class=\"row_header\">Median:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.median ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.median )) + "</span>";
	document.getElementById("detail_q1").innerHTML = "<span class=\"row_header\">1st Quartile:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q1 ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q1 )) + "</span>";
	document.getElementById("detail_q3").innerHTML = "<span class=\"row_header\">3rd Quartile:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q3 ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q3 )) + "</span>";
	document.getElementById("detail_box").style.visibility = "visible"; // make detail_box visible
		
	document.getElementById("modal_title").innerHTML = d.currentTarget.__data__.data.name;
	document.getElementById("modal_id").innerHTML = "<span class=\"row_header\">ID:</span> <span class=\"row_value\">" + d.currentTarget.__data__.data.id + "</span>";
	document.getElementById("modal_count").innerHTML = "<span class=\"row_header\">Patients/Total Patients:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.count ) + "&nbsp; / &nbsp;" + prettyPrintValueDisplay(denominatorFactsCount) + "</span>";
	
	// clear and redraw detail_graph_svg svg
	let svgID = "detail_graph_svg";	
	clearElementById( svgID );
	drawGraphSVG( svgID, d.currentTarget.__data__.data.data );

	// set data in popup
	document.getElementById("modal_percent").innerHTML = "<span class=\"row_header\">Percent:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.percent ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.percent )) + "</span>";
	document.getElementById("modal_mean").innerHTML = "<span class=\"row_header\">Mean Percent:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.mean ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.mean )) + "</span>";
	document.getElementById("modal_site_count").innerHTML = "<span class=\"row_header\">Sites/Total Sites:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.site_count ) + "/" + total_site_num + "</span>";
	document.getElementById("modal_stdv").innerHTML = "<span class=\"row_header\">Standard Deviation:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.stdv ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.stdv )) + "</span>";
	
	document.getElementById("modal_min").innerHTML = "<span class=\"row_header\">Minimum:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.min ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.min )) + "</span>";
	document.getElementById("modal_max").innerHTML = "<span class=\"row_header\">Maximum:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.max ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.max )) + "</span>";
	document.getElementById("modal_median").innerHTML = "<span class=\"row_header\">Median:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.median ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.median )) + "</span>";
	document.getElementById("modal_q1").innerHTML = "<span class=\"row_header\">1st Quartile:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q1 ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q1 )) + "</span>";
	document.getElementById("modal_q3").innerHTML = "<span class=\"row_header\">3rd Quartile:</span> <span class=\"row_value\">" + prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q3 ) + getUnit(prettyPrintValueDisplay( d.currentTarget.__data__.data.data.q3 )) + "</span>";
	
	// clear and redraw detail_graph_svg svg
	svgID = "modal_popup_svg";
	clearElementById( svgID );
	drawGraphSVG( svgID, d.currentTarget.__data__.data.data );
	
	// set appropriate css class if percent is significantly higher or lower than mean
	if (qualifies(d.currentTarget.__data__)) 
	{
		let c = getDataRowClass(d.currentTarget.__data__);
		if (c != null)
		{
			document.getElementById("modal_percent").classList.add(c);
			document.getElementById("detail_percent").classList.add(c);
		}
	}
}

function getUnit( val )
{
	return val=="-"?"":"%";
}

// removes all children of element with id
function clearElementById( id )
{
	let ele = document.getElementById( id );
	while(ele.firstChild)
		ele.removeChild(ele.firstChild);
}

// draws svg on svg identified by id. data has data.min, data.stdv, data.mean, etc.
function drawGraphSVG( id, data )
{
	// get width/height of the svg element
	let ele = document.getElementById(id);
	// get canvas width and height using getBoundingClientRect. If 0, then use the values set by css.
	let svg_width = (ele.getBoundingClientRect().width != 0)?ele.getBoundingClientRect().width:parseInt(getComputedStyle(ele).width);
	let svg_height = (ele.getBoundingClientRect().height != 0)?ele.getBoundingClientRect().height:parseInt(getComputedStyle(ele).height);
	let svg = d3.select('#'+id); // get svg for drawing.
	let offset = 4;
	
	let scaleX = 50;
	let boxX   = 70;
	// height used to compute for drawing positions. This is smaller than the real height (svg_height) to preserve borders on top/botom in svg.
	let height = svg_height - 2 * offset; // 156.0;
	if (data.site_count == null || data.site_count == 0 ) // no network values to display
	{
		drawNoNetworkStatsMessage( svg, 138 );
		if (data.percent == null ) // no site data
			drawNoSiteDataMessage( svg, 130 );
		else // display site data
		{
			let ceiling = data.percent + 0.2*data.percent;
			let floor   = Math.max(0, data.percent - 0.2*data.percent);
			drawBorders(svg, svg_width, svg_height);
			drawScale( svg, height, ceiling, floor, svg_height, scaleX, offset);// draw scale
			drawValuePoint( svg, data.percent, height, ceiling, floor, 100, offset );	 // draw percent
		}
	}
	else if (data.site_count < 3) // network has one or two counts. Cannot compute for quartiles or standard deviation
	{
		if (data.percent == null )
			drawNoSiteDataMessage( svg, 130 );
		
		let ceiling = Math.max( data.mean+0.2*data.mean, data.max, data.percent==null?data.max:data.percent); // highest value to display
		let ensureNonNegative = Math.max(0,data.mean-0.2*data.mean);
		let floor   = Math.min( ensureNonNegative, data.mean, data.percent==null?data.min:data.percent); // lowest value to display
		let tick =  height/(ceiling - floor); // how long does each pixel represent in svg
		
		drawBorders(svg, svg_width, svg_height);
		drawScale( svg, height, ceiling, floor, svg_height, scaleX, offset);// draw scale
		
		if (data.site_count != null && data.site_count != 0)
			drawValuePoint( svg, data.mean, height, ceiling, floor, 130, offset, true );	 // draw network's other percent value		
		if (data.percent != null )
			drawValuePoint( svg, data.percent, height, ceiling, floor, 100, offset );	 // draw percent
	}
	else
	{
		let ceiling = (data.percent === undefined)? Math.max(data.mean+2*data.stdv, data.max) : Math.max( data.mean+2*data.stdv, data.max, data.percent ); // highest value to display
		let ensureNonNegative = Math.max(0,data.mean-2*data.stdv);
		let floor   = (data.percent === undefined)? Math.min(ensureNonNegative, data.min) : Math.min( ensureNonNegative, data.min, data.percent ); // lowest value to display
		let tick =  height/(ceiling - floor); // how long does each pixel represent in svg

		drawBorders(svg, svg_width, svg_height);
		drawScale( svg, height, ceiling, floor, svg_height, scaleX, offset);  // draw scale
		//drawMeanAndSTDV( svg, data, height, ceiling, floor, 70, offset); // draw mean/stdv
		drawBoxPlot( svg, data, height, ceiling, floor, 70, offset );   // draw box plot
		if (data.percent != null )
			drawValuePoint( svg, data.percent, height, ceiling, floor, 70, offset );	 // draw percent
		else
			drawNoSiteDataMessage( svg, 130 );
	}
}

function drawNoSiteDataMessage( target_svg, x )
{
	target_svg.append("rect") 	// draw background
		.attr("x", x - 1)
		.attr("y", 22 -11)
		.attr("width", 50)
		.attr("height", 25)
		.attr("stroke-width", "0.5")
		.attr("stroke", "orange")
		.attr("fill", "#FEF6A7");	
	target_svg.append("text")	// draw text
		.attr("x", x)
		.attr("y", 22 )
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "Site has" );
	target_svg.append("text")
		.attr("x", x)
		.attr("y", 34 )
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "no counts." );
}

function drawNoNetworkStatsMessage( target_svg, x )
{	
	target_svg.append("rect") 	// draw background for text
		.attr("x", x - 1)
		.attr("y", 11 + 38)
		.attr("width", 43)
		.attr("height", 38)
		.attr("stroke-width", "0.5")
		.attr("stroke", "pink")
		.attr("fill", "#FEE9DF");
	target_svg.append("text")	// draw text
		.attr("x", 138)
		.attr("y", 22 + 38)
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "Network" );
	target_svg.append("text")
		.attr("x", 142)
		.attr("y", 34 + 38)
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "has no" );	
	target_svg.append("text")
		.attr("x", 147)
		.attr("y", 46 + 38)
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "stats." );	
}

function drawBorders(svg, svg_width, svg_height)
{
	// draw borders
	svg.append("line")
			.attr("x1", 0)
			.attr("y1", 0)
			.attr("x2", 0)
			.attr("y2", svg_height)
			.attr("stroke", "lightgray")
			.attr("stroke-width", 1);
	svg.append("line")
			.attr("x1", svg_width)
			.attr("y1", 0)
			.attr("x2", svg_width)
			.attr("y2", svg_height)
			.attr("stroke", "lightgray")
			.attr("stroke-width", 1);
	svg.append("line")
			.attr("x1", 0)
			.attr("y1", 0)
			.attr("x2", svg_width)
			.attr("y2", 0)
			.attr("stroke", "lightgray")
			.attr("stroke-width", 1);
	svg.append("line")
			.attr("x1", 0)
			.attr("y1", svg_height)
			.attr("x2", svg_width)
			.attr("y2", svg_height)
			.attr("stroke", "lightgray")
			.attr("stroke-width", 1);	
}

function drawScale( svg, height, ceiling, floor, svg_height, x, offset)
{
	let y = mapValueToGraphCoordinateY(ceiling, height, ceiling, floor, offset);
	let y2 = mapValueToGraphCoordinateY(floor, height, ceiling, floor, offset);
	
	// draw vertical line	
	svg.append("line")
			.attr("x1", x)
			.attr("y1", 0)
			.attr("x2", x)
			.attr("y2", svg_height)
			.attr("stroke", "gray")
			.attr("stroke-width", "0.5px");
			
	svg.append("line")
			.attr("x1", x-4)
			.attr("y1", y)
			.attr("x2", x+4)
			.attr("y2", y)
			.attr("stroke", "darkgray")
			.attr("stroke-width", "1px");
	svg.append("text")
			.attr("x", x-4)
			.attr("y", y+6 )
			.attr("color", "black")
			.attr("text-anchor", "end" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( truncateSigFig(ceiling.toPrecision(4),5)+"%" );
			
	svg.append("line")
			.attr("x1", x-4)
			.attr("y1", y2)
			.attr("x2", x+4)
			.attr("y2", y2)
			.attr("stroke", "darkgray")
			.attr("stroke-width", "1px");
	svg.append("text")
			.attr("x", x-4)
			.attr("y", y2+2 )
			.attr("color", "black")
			.attr("text-anchor", "end" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( truncateSigFig(floor.toPrecision(4),5)+"%" );
}
// charCount: number of characters remaining after truncation (including decimal point)
function truncateSigFig( value, charCount )
{
	value = value + ''; // change value to string
	let str = value.substring(0, charCount);
	if ( str == 0 ) return 0;
	if ( str == 100) return 100;
	return str;
}

function drawBoxPlot( svg, data, height, ceiling, floor, x, offset )
{
	// compute min/max y coordinate
	y = mapValueToGraphCoordinateY(data.min, height, ceiling, floor, offset);
	y2 = mapValueToGraphCoordinateY(data.max, height, ceiling, floor, offset);

	// draw range
	svg.append("line")
		.classed("meanGraphLines", true)
		.attr("x1", x)
		.attr("y1", y)
		.attr("x2", x)
		.attr("y2", y2);
			
	let q1y = mapValueToGraphCoordinateY(data.q1, height, ceiling, floor, offset);
	let medy = mapValueToGraphCoordinateY(data.median, height, ceiling, floor, offset);
	let q3y = mapValueToGraphCoordinateY(data.q3, height, ceiling, floor, offset);
	let boxWidth = 20;
	
	svg.append("rect")
		.attr("x", x - boxWidth/2.0)
		.attr("y", q3y)
		.attr("width", boxWidth)
		.attr("height", medy-q3y)
		.attr("stroke-width", "0.5px")
		.attr("stroke", "darkgrey")
		.attr("fill", "rgb(225,225,225)");
	svg.append("rect")
		.attr("x", x - boxWidth/2.0)
		.attr("y", medy)
		.attr("width", boxWidth)
		.attr("height", q1y-medy)
		.attr("stroke-width", "0.5px")
		.attr("stroke", "darkgrey")
		.attr("fill", "rgb(225,225,225)");

	// draw median	
	svg.append("line")
		.attr("x1", x-13)
		.attr("y1", medy)
		.attr("x2", x+13)
		.attr("y2", medy)
		//.attr("fill", "gray")
		.attr("stroke", "black")
		.attr("stroke-width", "0.5px")
		.attr("stroke-opacity", "1");
	svg.append("text")
		.attr("x", x+14)
		.attr("y", Math.min(medy+4, 155) ) 	// to avoid encroaching 'min' space
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( "median" );
		
	
	// draw min
	svg.append("circle")
			.attr("cx", x)
			.attr("cy", y)
			.attr("r", 1) 		
			.attr("fill", "black")
			.attr("stroke", "black")
			.attr("stroke-width", 1)
			.attr("stroke-opacity", 1)
			.attr("fill-opacity", 1);
	svg.append("text")
			.attr("x", x+6)
			//.attr("y", Math.min(164, Math.max(y+4, medy+11) ))		// to avoid text clash with 'median'
			.attr("y", Math.min(164, y+4) )		// to avoid going off-screen
			.attr("color", "black")
			.attr("text-anchor", "start" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( "min" );
			
	// draw max
	svg.append("circle")
			.attr("cx", x)
			.attr("cy", y2)
			.attr("r", 1) 		
			.attr("fill", "black")
			.attr("stroke", "black")
			.attr("stroke-width", 1)
			.attr("stroke-opacity", 1)
			.attr("fill-opacity", 1);	
	svg.append("text")
			.attr("x", x+6)
			.attr("y", Math.min(y2+4, medy-4) )      // to avoid text clash with 'median'
			.attr("color", "black")
			.attr("text-anchor", "start" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( "max" );
}

// draw specific value
function drawValuePoint( svg, percent, height, ceiling, floor, x, offset, isNetworkValue )
{
	// draw percent
	y = mapValueToGraphCoordinateY(percent, height, ceiling, floor, offset);
	if (!isNetworkValue) // display value as an X
	{
		svg.append("line")
				.classed("valueGraphLines", true)
				.attr("x1", x-offset)
				.attr("y1", y-offset)
				.attr("x2", x+offset)
				.attr("y2", y+offset);
		svg.append("line")
				.classed("valueGraphLines", true)
				.attr("x1", x-offset)
				.attr("y1", y+offset)
				.attr("x2", x+offset)
				.attr("y2", y-offset);
	}
	else // draw network's value as a +
	{
		svg.append("line")
				.classed("networkValueGraphLines", true)
				.attr("x1", x-offset)
				.attr("y1", y)
				.attr("x2", x+offset)
				.attr("y2", y);
		svg.append("line")
				.classed("networkValueGraphLines", true)
				.attr("x1", x)
				.attr("y1", y+offset)
				.attr("x2", x)
				.attr("y2", y-offset);
	}
}

function drawMeanAndSTDV( svg, data, height, ceiling, floor, x, offset)
{	
	let y = mapValueToGraphCoordinateY(data.mean+2*data.stdv, height, ceiling, floor, offset);
	let ensureNonNegative = Math.max(0,data.mean-2*data.stdv);
	let y2 = mapValueToGraphCoordinateY(ensureNonNegative, height, ceiling, floor, offset);
	
	// draw upper outlier range
	svg.append("rect")
		.attr("x", x-5)
		.attr("y", 0)
		.attr("width", 10)
		.attr("height", y)
		.attr("stroke-width", "0.5")
		.attr("stroke", higherOutlierColor)
		.attr("fill", higherOutlierColor);
	// draw lower outlier range
	svg.append("rect")
		.attr("x", x-5)
		.attr("y", y2)
		.attr("width", 10)
		.attr("height", 164-y2)
		.attr("stroke-width", "0.5")
		.attr("stroke", lowerOutlierColor)
		.attr("fill", lowerOutlierColor);
		
	// draw range
	svg.append("line")
			.classed("meanGraphLines", true)
			.attr("x1", x)
			.attr("y1", y)
			.attr("x2", x)
			.attr("y2", y2);
			
	// draw mean+2stdv
	svg.append("line")
			.classed("meanGraphLines", true)
			.attr("x1", x-5)
			.attr("y1", y)
			.attr("x2", x-5)
			.attr("y2", y);
	svg.append("text")
			.attr("x", x+6)
			.attr("y", y+4 )
			.attr("color", "black")
			.attr("text-anchor", "start" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( "+2\u03c3" ); //"+2σ"
			
	// draw mean-2stdv	
	svg.append("line")
			.classed("meanGraphLines", true)
			.attr("x1", x-5)
			.attr("y1", y2)
			.attr("x2", x+5)
			.attr("y2", y2);
	svg.append("text")
		.attr("x", x+6)
		.attr("y", y2+2 )
		.attr("color", "black")
		.attr("text-anchor", "start" )
		.attr("font-size", "11px")
		.attr("font-family", "sans-serif")
		.text( (ensureNonNegative==0)?"0":"-2\u03c3" ); //"0" or "-2σ"
			
	// draw mean		
	y = mapValueToGraphCoordinateY(data.mean, height, ceiling, floor, offset);
	svg.append("line")
			.classed("meanGraphLines", true)
			.attr("x1", x-10)
			.attr("y1", y)
			.attr("x2", x+10)
			.attr("y2", y);
	svg.append("text")
			.attr("x", x-12)
			.attr("y", y+4 )
			.attr("color", "black")
			.attr("text-anchor", "end" )
			.attr("font-size", "11px")
			.attr("font-family", "sans-serif")
			.text( "mean" );
}

function mapValueToGraphCoordinateY( value, height, ceiling, floor, offset)
{
	return height-((value-floor)/(ceiling-floor) * height) + offset;
	height-((data.percent-floor)/(ceiling-floor) * height) + 4;
}

function mouseout(d) 
{
	let popup = document.getElementById("modal_popup");
	popup.classList.remove("data_row_high");
	popup.classList.remove("data_row_low");
	popup.style.visibility = "hidden";
}

function clearPathToRoot()
{
	pathToRoot.html(null); // clears pathToRoot children.
}

function pathViewCloseIcon_mouseover(d)
{
	d3.selectAll(".pathView_closeIcon").classed("pathView_closeIcon", false).classed("pathView_closeIcon_on", true);
	d3.selectAll(".pathView_closeIconLine").classed("pathView_closeIconLine", false).classed("pathView_closeIconLine_on", true);
}

function pathViewCloseIcon_mouseout(d)
{
	d3.selectAll(".pathView_closeIcon_on").classed("pathView_closeIcon", true).classed("pathView_closeIcon_on", false);
	d3.selectAll(".pathView_closeIconLine_on").classed("pathView_closeIconLine", true).classed("pathView_closeIconLine_on", false);
}

function pathViewNavigateDown_mouseover(d)
{
	d3.selectAll(".pathView_navigateDown").classed("pathView_navigateDown", false).classed("pathView_navigateDown_on", true);
}

function pathViewNavigateDown_mouseout(d)
{
	d3.selectAll(".pathView_navigateDown_on").classed("pathView_navigateDown", true).classed("pathView_navigateDown_on", false);
}

function pathViewNavigateUp_mouseover(d)
{
	d3.selectAll(".pathView_navigateUp").classed("pathView_navigateUp", false).classed("pathView_navigateUp_on", true);
}

function pathViewNavigateUp_mouseout(d)
{
	d3.selectAll(".pathView_navigateUp_on").classed("pathView_navigateUp", true).classed("pathView_navigateUp_on", false);
}

function updatePathToRootBackground( outlierSetCount )
{
	d3.select("#pathToRootBackground").attr("height", 15 * (outlierSetCount+2)  );	
}

function clearPathDisplay()
{
	d3.selectAll("#pathToRoot .pathDisplay").remove();
}

function drawNextSet()
{
	clearPathDisplay();
	parentMapIndex = (parentMapIndex+1) % parentMap.size;
	drawPath();
}

function drawPrevSet()
{
	clearPathDisplay();
	parentMapIndex--;
	if (parentMapIndex<0)
		parentMapIndex = parentMap.size-1;
	drawPath();
}

function updateParentMapIndexDisplay()
{
	d3.select("#parentMapIndexDisplay").text( (parentMapIndex+1) + "/" + (parentMap.size) );
}


function drawPathToRootCurve(y1, x1, y2, x2)
{
	let data = {
		source: {
			y: y1,
			x: x1
		},
		target: {
			y: y2,
			x: x2
		}
	};
	
	d3.select('#pathToRoot').append("path")
	  .attr("d", diagonal(data))
	  .classed("pathDisplay", true)
	  .attr("stroke", "darkslateblue")
	  .attr("stroke-width", "0.5px")
	  .style("fill", "none");
}

function drawPath()
{
	let d = currentSumNode;
	let currIndex = 0;
	for ( const [key, value] of parentMap ) // iterate over key/value pairs of parentMap, incrementing currIndex
	{
		if ( currIndex == parentMapIndex )	// draw the user-selected path-to-root 
		{
			// build and draw path to root
			let parents = new Array();
			let parent = value[0].parent;
			//let lastParent = value[0];
			while ( parent )				// build ancestor chain (immediate parent is first-in, root is last-in)
			{
				parents.push(parent);
				parent = parent.parent;
			}

			// if only one node in set, extend line to it			
			let multiplier = parents.length-1;
			if ( value.length == 1 )
				multiplier = parents.length;
			if ( parents.length != 1 ) // only line if selected sumNode is at level 1 (children of root)
			{
				d3.select('#pathToRoot').append("line")
						.classed("pathDisplay", true)
						.attr("x1", 95)
						.attr("y1", d.x0 + 39)
						.attr("x2", 92 * (multiplier) + 5)
						.attr("y2", d.x0 + 39)
						.attr("stroke", "darkslateblue")
						.attr("stroke-width", 0.5)
						.attr("stroke-opacity", 1);
			}
			
			// draw line between immediate parents to every node in the set
			let i = 0;
			for (i = 0; i < parents.length; i++ )
			{
				let p = parents[i];
				if ( i == parents.length-1 ) // draw link from root to 1st parent
				{
					if (parents.length>1)	 // sumNode is not a direct child of root
						drawPathToRootCurve(getNodeRadius(root), 0, 100, d.x0 + 39);
					else					 // sumNode is a direct child of root
					{
						let j = 0;
						for (j=0;j<value.length;j++)
							drawPathToRootCurve(getNodeRadius(root), 0, d.y0 + 10, d.x0 + d.x0 + 15 * (j+2) + 9);
					}
					continue;
				}
				else if (i == 0 && value.length > 1)
				{
					let j = 0;
					for (j=0;j<value.length;j++)
						drawPathToRootCurve(d.y0 + 10 - 90, d.x0 + 39, d.y0 + 10, d.x0 + d.x0 + 15 * (j+2) + 9 - d.x);
				}
				//lastParent = parent;
			}
			// draw parent nodes after links
			for (i = 0; i < parents.length; i++ )
			{
				if (i == parents.length-1)
					continue;
				let p = parents[i];
				// draw parent nodes
				d3.select('#pathToRoot').append("circle")
					.classed("pathDisplay", true)
					.attr("cx", d.y0 + 10 - 90*(i+1))
					.attr("cy", d.x0 + 39)
					.attr("r", getNodeRadius(p)) 		// radius depending on whether node or any descendants are 'interesting'
					.attr("fill", getNodeFillColor(p))	// fill color depending on whether node is 'interesting'
					.attr("stroke", sumTreeHasCount(p) ? outlierStrokeColor : nonOutlierColor)	// stroke color depending on if subtree has 'interesting' nodes
					.attr("stroke-width", 1)
					.attr("stroke-opacity", 1)
					.attr("fill-opacity", 1)
					.on("mouseover", mouseover)			// mouseover behavior
					.on("mouseout", mouseout)			// mouseout behavior
					.datum( p );						// databind
				
				let name = shortenName(p.data.name);
				let offset = name.length * 5 / 2;
					
				d3.select('#pathToRoot').append("text")
					.classed("pathDisplay", true)
					.attr("x", d.y0 + 10 - 90*(i+1) + offset)
					.attr("y", d.x0 + 39 + 10 * Math.pow(-1, i%2) )
					.attr("text-anchor", "end" )
					.attr("font-size", "8px")
					.text( name );
				//lastParent = parent;
			}
			updatePathToRootBackground( value.length ); // update pathToRootBackground height
			resizeViewBoxForPathToRoot();				// resize viewBox
			
			// draw nodes in the set
			for ( i = 0; i < value.length; i++ )
			{
				let node = value[i];
				d3.select('#pathToRoot').append("circle")
					.classed("pathDisplay", true)
					.attr("cx", d.y0 + 10)
					.attr("cy", d.x0 + 15 * (i+2) + 9)
					.attr("r", getNodeRadius(node)) 	// radius depending on whether node or any descendants are 'interesting'
					.attr("fill", getNodeFillColor(node))							// fill color depending on whether node is 'interesting'
					.attr("stroke", sumTreeHasCount(node) ? outlierStrokeColor : nonOutlierColor)	// stroke color depending on if subtree has 'interesting' nodes
					.attr("stroke-width", 1)
					.attr("stroke-opacity", 1)
					.attr("fill-opacity", 1)
					.on("mouseover", mouseover)				// mouseover behavior
					.on("mouseout", mouseout)				// mouseout behavior
					.datum( value[i] );						// databind 
					
				d3.select('#pathToRoot').append("text")
					.classed("pathDisplay", true)
					.attr("x", d.y0 + 16)
					.attr("y", d.x0 + 15 * (i+2) + 11)
					.attr("text-anchor", "start" )
					.attr("font-size", "8px")
					.text(d => value[i].data.name );
			}

			updateParentMapIndexDisplay();
			return;
		}
		currIndex++;
	}	
}

// shorten name of a node
function shortenName( name )
{
	let shortName = name;
	if (name.length > 36 )
		shortName = name.substring(0, 15) + "..." + name.substring( name.length - 15 );
	return shortName;
}

function enableLoadingAnimation( flag, message )
{
	if (flag)
	{
		document.getElementById("on_loading_div").style.display = "block";
		if (message == null)
			message = "Loading...";
		document.getElementById("loading_text").textContent = message;
	}
	else
	{
		document.getElementById("on_loading_div").style.display = "none";
	}
}

function enableWidgets( flag )
{
	if (flag)
	{		
		let list = document.getElementsByClassName("controlButton");
		let index = 0;
		for (index = 0; index < list.length; ++index)
			list[index].style.display = "inline-block";
	}
	else
	{
		let list = document.getElementsByClassName("controlButton");
		let index = 0;
		for (index = 0; index < list.length; ++index)
			list[index].style.display = "none";
	}
}

// Crudely hide Help Buttons based on streeConfig. Could do better to auto-set positions of buttons.
function hideUnconfiguredHelpButtons()
{	
	if (!streeConfig.demoVideoLink)		// if demoVideoLink is NOT configured, hide viewVideoButton
		document.getElementById("viewVideoButton").style.display = "none";
	if (!streeConfig.documentationPath)	// if documentationPath is NOT configured, hide readDocButton	
		document.getElementById("readDocButton").style.display = "none";
	if (!streeConfig.tutorialAvailable)	// if tutorialAvailable is NOT configured or is set to FALSE, hide tutorialButton
		document.getElementById("tutorialButton").style.display = "none";
}

// load dictionary
function loadDictionary()
{
	enableWidgets( false );	
	enableLoadingAnimation( true, "Starting up..." );
	let url = streeConfig.dictionaryPath;
	if (debugConfig.console)
		console.log("dictionary URL to fetch = " + streeConfig.dictionaryPath );
	sTime = Date.now();
	JSZipUtils.getBinaryContent(url, function(err, file) 
	{
		if(err)
		{	
			alert("Error occurred downloading dictionary. Unable to launch DQ Explorer. Please try another time. [" + err + "]");
			enableLoadingAnimation( false );
			return;
		}
		
		sElapsed = Date.now()-sTime;
		if (debugConfig.console)
			console.log('[zipped dictionary] Downloading zipped dictionary file (6 MB) ' + sElapsed/1000.0 + " seconds");
		
		sTime = Date.now();
		var jsZip = new JSZip();
		jsZip.loadAsync(file).then(function (zip) 
		{
			Object.keys(zip.files).forEach(function (filename) 
			{
				sTime = Date.now();
				zip.files[filename].async('string').then(function (fileData) 
				{
					sElapsed = Date.now()-sTime;
					if (debugConfig.console)
						console.log('Unzipping Time: ' + sElapsed/1000.0 + " seconds");					
					sTime = Date.now();
					// fileData is a String representation of the dictionary file. Parse line-by-line:
					let lines = fileData.split("\n");
					if (debugConfig.console)
						console.log('Dictionary length : ' + lines.length );
					let i = 2; // start with the 3nd line (skip licensing statement and header row)
					// start parsing dictionay 
					setTimeout(()=>{
						parseLines(i, 3000, lines );
					},0);
				});
			});
		});
	});		
}

// parsing one chunk of dictionary (3000 lines). Leave 3 milliseconds before the next chunk so loading animation can run
function parseLines( startIndex, stopIndex, lines )
{
	let i = startIndex;
	for ( i = startIndex; i<stopIndex && i<lines.length; i++)
	{
		let splitLine = lines[i].replace("\r",'').split("\t");
		cfullname2intMap.set( splitLine[0], parseInt(splitLine[1]) );
	}
	
	if (i < lines.length)
	{	// start the next chunk
		setTimeout(()=>{
				parseLines(stopIndex, stopIndex+3000, lines );
			},3);
	}
	else
	{	// no more chunk: stop loading animation and enable buttons.
		sElapsed = Date.now()-sTime;
		if (debugConfig.console)
			console.log('[zipped dictionary] Building Map: ' + sElapsed/1000.0 + " seconds");
		enableLoadingAnimation( false );
		// after start up, enable control UI
		document.getElementById("file-name-display").style.display  = "block"; // enable filename display
		document.getElementById("fileChooserButton").style.display 	= "block"; // enable open file button
		
		document.getElementById("tutorialButton").style.display 	= "inline-block"; // enable open tutorial button
		document.getElementById('viewVideoButton').style.display	= "inline-block"; // enable view video button
		document.getElementById('readDocButton').style.display	= "inline-block"; // enable read Doc button
		hideUnconfiguredHelpButtons();

		// Show the main control tab by default
		document.getElementById('tab_main').style.display = "block";
		document.getElementById('mainTabLink').className += " active";
	}
}


// If 'streeConfig.demoVideoLink' is configured, opens the specified demo video URL
function viewDemoVideo()
{
	if (streeConfig.demoVideoLink)
		window.open( streeConfig.demoVideoLink, '_blank').focus();
}

// If 'streeConfig.documentationPath' is configured, opens the specified documentation URL
function showDocumentation()
{
	if (streeConfig.documentationPath)
		window.open( streeConfig.documentationPath, '_blank').focus();
}

function toggleTutorial()
{
	if (!streeConfig.tutorialAvailable) return;

	isTutorial = !isTutorial;	
	if (isTutorial) // start tutorial
	{
		// Starting tutorial resets visualization. Ask user to confirm 
		if ( confirm("Starting tutorial will reset your visualization. Proceed?") ) {} /* do nothing to proced */
		else { isTutorial = !isTutorial; return; } /* revert isTutorial and quit */
		
		resetVars(); // reset variables and clean up current viz
		resetTutorialStates();
		resetUI();	 // reset UI
		document.getElementById("tutorialButton").innerHTML = "End Tutorial";
		
		setTutorialState( 1 );
	}
	else // end tutorial, keeping existing file and vizualization
	{
		resetTutorialStates();
		document.getElementById("tutorialNext").innerHTML = "Next"; 		  // ensure button text is correct
		document.getElementById("tutorial_popup").style.display 	= "none"; // hide tutorial_popup
		document.getElementById("tutorialButton").innerHTML = "Start Tutorial";
	}
}

function tutorialNextClicked()
{
	if (tutorialState == 1) // user elects to use sample totalnum file. Read in the sample TSV.
	{
		fetchTSV(streeConfig.sample_totalnum);
		updateCurrentFilename( "sample totalnum file" );
	}
	else if (tutorialState == 7) // this is the last stage, exit tutorial when users click on this button, keep existing data for user
	{
		isTutorial = false;
		resetTutorialStates();
		document.getElementById("tutorialNext").innerHTML = "Next"; 		  // ensure button text is correct
		document.getElementById("tutorial_popup").style.display 	= "none"; // hide tutorial_popup
		document.getElementById("tutorialButton").innerHTML = "Start Tutorial";
	}
	else
		setTutorialState( tutorialState+1 );
}
function tutorialPreviousClicked()
{
	if (tutorialState <=1) return;
	setTutorialState( tutorialState-1 );
}

function setTutorialState( state )
{
	tutorialState = state;
	if ( tutorialState == 1 )
	{ // about: loading totalnum file
		// build tutorial text based on whether documentationPath is set
		let content = "<p>Click <b>Choose a Totalnum File</b> to load your file. Don't worry, your data stays within your browser. No information is transmitted anywhere.</p> <p>Don't have one handy? Click on <b>Next</b> to automatically load a synthetic totalnum file to continue with the tutorial.</p>";
		if (streeConfig.documentationPath)
			content = content + "<p>Read the <a href=\"" + streeConfig.documentationPath + "#fileformat\" target=\"_blank\">specific format</a> your totalnum file must conform to.</p>";

		document.getElementById("tutorial_content").innerHTML = content;
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
		
		let twidth = document.getElementById("tutorial_box").getClientRects()[0].width;
		
		let srect = document.getElementById("fileChooserButton").getClientRects()[0];
		let y = srect.top + srect.height + 15;
		let c = srect.x + srect.width/2;
		
		let x = Math.max(5, c - twidth/2);		
		document.getElementById("tutorial_popup").style.top  	= y + "px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= x + "px";
		document.getElementById("tutorial_popup").style.right 	= "unset";
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_up");
		// set arrow position
		arrow.style.left = 40 + "px"; //(twidth/2-9) + "px";
		arrow.style.top = "-22px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = "visible";
		document.getElementById("tutorialPrevious").style.visibility = "hidden";
	}
	else if ( tutorialState == 2 )
	{ // about: ontology selection
		document.getElementById("tutorial_content").innerHTML = "<p>Use the dropdown to <b>Select an ENACT ontology domain</b>. We will visualize the ontology tree to facilitate comparison between your data and ENACT network statistics.</p><p><b>Select a domain</b> to continue with the tutorial.</p>";
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
		
		let twidth = document.getElementById("tutorial_box").getClientRects()[0].width;
		
		let srect = document.getElementById("domain_selector").getClientRects()[0];
		let y = srect.top + srect.height + 5;
		let c = srect.x + srect.width/2;
		
		let x = Math.max(5, c - twidth/2);
		
		document.getElementById("tutorial_popup").style.top  	= y + "px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= x + "px";
		document.getElementById("tutorial_popup").style.right 	= "unset";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_up");
		// set arrow position
		arrow.style.left = 40 + "px"; //(twidth/2-9) + "px";
		arrow.style.top = "-22px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = tutorial2Satisfied?"visible":"hidden";
		document.getElementById("tutorialPrevious").style.visibility = "hidden"; 
	}
	else if ( tutorialState == 3 )
	{ // about: legend
		let content  = "<p>Ontology concepts are displayed as circles in a tree. The legend explains size and color encoding."; 
		let mid		 = "</p>";
		if (streeConfig.documentationPath)
			mid = " See the <a href=\"" + streeConfig.documentationPath + "#legend\" target=\"_blank\">fine print.</a></p>";
		let content2 = "<p>You can toggle the legend by clicking <b>" + document.getElementById("legend_activator").innerText + " </b> Try it! </p>";
		content = content + mid + content2;

		document.getElementById("tutorial_content").innerHTML = content;
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
		
		let t_box = document.getElementById("tutorial_box").getClientRects()[0];		
		let srect = document.getElementById("legend_box").getClientRects()[0];
		let y = Math.max(srect.y + srect.height/2 - t_box.height/2, 80);
		let x = srect.width + t_box.width +10;
		
		document.getElementById("tutorial_popup").style.top  	= y + "px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= "unset";
		document.getElementById("tutorial_popup").style.right 	= (srect.width + 24) + "px";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_right");
		// set arrow position
		arrow.style.left = (t_box.width-2) + "px";
		arrow.style.top = 10 + "px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = "visible";
		document.getElementById("tutorialPrevious").style.visibility = "visible";
	}
	else if ( tutorialState == 4)
	{ // about: stats graph
		document.getElementById("tutorial_content").innerHTML = "<p><b>Mouseover</b> a node to see how it compares with the ENACT network statistics. Try it!</p>  <p> The icon <img src=\"img/x.png\"></img> marks your site. It is displayed along with a boxplot that shows the network spread. </p> <p>If your site data is two standard deviations away from the mean, it is considered an outlier. Outliers are highlighted in colors specified in the Legend.</p>";
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
				
		document.getElementById("tutorial_popup").style.top  	= "180px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= "unset";
		document.getElementById("tutorial_popup").style.right 	= "200px";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_left");
		// set arrow position
		arrow.style.left = -22 + "px";
		arrow.style.top = 10 + "px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = "visible";
		document.getElementById("tutorialPrevious").style.visibility = "visible";
	}
	else if ( tutorialState == 5)
	{ // about: node expansion
		document.getElementById("tutorial_content").innerHTML = "<p>By default the visualization shows only the root node and its children. You can click any node to expand its children, if any.</p><p>Clicking node that is already expanded (like the root node) toggles between the node-link view and a <b>sumTree</b> view: a summary view of the subtree. </p> <p><b>Click on the root node</b> to reveal its sumTree to continue with the tutorial. </p>";
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
				
		document.getElementById("tutorial_popup").style.top  	= "180px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= "unset";
		document.getElementById("tutorial_popup").style.right 	= "200px";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_left");
		// set arrow position
		arrow.style.left = -22 + "px";
		arrow.style.top = 10 + "px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = tutorial5Satisfied?"visible":"hidden";
		document.getElementById("tutorialPrevious").style.visibility = "visible";
		document.getElementById("tutorialNext").innerHTML = "Next"; 		  // ensure button text is correct
	}
	else if ( tutorialState == 6)
	{ // about: sumtree
		document.getElementById("tutorial_content").innerHTML = "<p>This is the <b>sumTree</b> representation of the entire ontology tree. Every rectangular node (or <b>sumNode</b>) represents the proportion of nodes that are outliers at that level of the tree. Mousing over a sumNode reveals the detailed counts.</p><p>Clicking on a sumNode shows outliers grouped by their parents, enabling a more targeted exploration of outiers. Try it!</p></p>";
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		let twidth = document.getElementById("tutorial_box").getClientRects()[0].width;
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
				
		document.getElementById("tutorial_popup").style.top  	= "180px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= "180px";
		document.getElementById("tutorial_popup").style.right 	= "unset";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_up");
		// set arrow position
		arrow.style.left = (twidth/2-9) + "px"; //10 + "px";
		arrow.style.top = -22 + "px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = "visible";
		document.getElementById("tutorialPrevious").style.visibility = "visible";		
	}
	else if ( tutorialState == 7)
	{ // about: end of tutorial 
		let tutorialContent = "Click <b>End</b> to end this tutorial. You can load your own file by clicking <b>1. Choose a Totalnum File</b> or keep exploring this sample totalnum file.</p>";
		if (streeConfig.demoVideoLink) // Make video link available if 'streeConfig.demoVideoLink' is configured
			tutorialContent = tutorialContent + "<p>A detailed demo video is also <a href=\"" + streeConfig.demoVideoLink + "\" target=\"_blank\">availabe</a>.</p>";

		document.getElementById("tutorial_content").innerHTML = tutorialContent;
		let tutorial_popup = document.getElementById("tutorial_popup");
		tutorial_popup.style.display 	= "inline-block"; // show tutorial_popup
		tutorial_popup.style.opacity 	= 0; // set opacity to 0
		let twidth = document.getElementById("tutorial_box").getClientRects()[0].width;
		
		fadeIn(tutorial_popup, 1000, 1, "ease-out");
				
		document.getElementById("tutorial_popup").style.top  	= "180px";
		document.getElementById("tutorial_popup").style.bottom  = "unset";
		document.getElementById("tutorial_popup").style.left 	= "180px";
		document.getElementById("tutorial_popup").style.right 	= "unset";
		
		// set arrow class
		let arrow = document.getElementById("tutorial_arrow");
		arrow.classList.remove("tutorial_arrow_up", "tutorial_arrow_down", "tutorial_arrow_left", "tutorial_arrow_right");
		arrow.classList.add("tutorial_arrow_up");
		// set arrow position
		arrow.style.left = (twidth/2-9) + "px"; //10 + "px";
		arrow.style.top = -22 + "px";
		// set button visibility
		document.getElementById("tutorialNext").style.visibility = "visible";
		document.getElementById("tutorialPrevious").style.visibility = "visible";		
	}
	document.getElementById("tutorialNext").innerHTML = getNextButtonText( tutorialState ); // set next button text for the state
	document.getElementById("tutorial_header").innerHTML = tutorialState + "/7"; // update tutorial state display
}

function getNextButtonText( state )
{
	if (state == 7) return "End";
	else return "Next";
}

function initOutTutorialState( state )
{
	document.getElementById("tutorial_popup").style.display = "none";
}

// delay: delay in miliseconds
function completeOutTutorialState( state, delay )
{
	if (!delay)
		delay = 200; // default delay
	// increment to the next tutorial state
	setTimeout(()=>{ setTutorialState( state+1 )}, delay);
}

// DOM transitions
function fadeIn( ele, duration, iteration, easing )
{
   ele.animate({ opacity: [0, 1] }, { duration: duration, iterations: iteration, easing: easing })
   .onfinish = (e) => {
        e.target.effect.target.style.opacity = 1;
   };
}

function fadeOut( ele, duration, iteration, easing )
{
   ele.animate({ opacity: [1, 0] }, { duration: duration, iterations: iteration, easing: easing })
   .onfinish = (e) => {
        e.target.effect.target.style.opacity = 0;
   };
}
// Splitter Listeners
/*
 * Redraw table and legend only when user stops dragging.
 */
function splitterDragEnd()
{
	// Redraw the DataTable so headers are correctly drawn
	myTable.columns.adjust().draw(); 	
	if (isSVGSet) // update legend
		updateLegend();
}

function tableSplitterDragEnd()
{
	myTable.columns.adjust().draw();
}

// DataTables functions
function RowData( n ) // Row constructor
{
	this.node 	 = n;
	this.name    = function () { return this.node.data.name; };
	this.count   = function () { return this.node.data.data.count?this.node.data.data.count:0; };
	this.percent = function () { return this.node.data.data.percent? Number(prettyPrintValueDisplay(this.node.data.data.percent)):0; };
	this.gt2stdv 	= function () { return (Math.abs(this.node.data.data.percent-this.node.data.data.mean) >= this.node.data.data.stdv*2)?true:false; };
	this.gtMax 		= function () { return ((this.node.data.data.max)&&(this.node.data.data.percent > this.node.data.data.max))?true:false; };
	this.ltMin 		= function () { return ((this.node.data.data.min)&&(this.node.data.data.percent < this.node.data.data.min))?true:false; };
	this.depth		= function () { return this.node.depth; };
}

// given a node and an array. All descendant nodes (including 'node') are placed in the given array. e.g. Use root.data to get the entire tree data model
function makeNodeArray( node, arr )
{
	if ( node.data.data.count )					// skip nodes that have no count
	{	
		let row = new RowData(node);
		updateFilterSpec( row );		// update filterSpec
		arr.push( row );		
	}
	if (node._children == null ) return;
	node._children.forEach((ele) => {
		 makeNodeArray(ele, arr);
		 });
}
// update filterSpec with each given row
function updateFilterSpec( row )
{
	let i = 0; 
	for (i = 0; i < columnInfo.length; i++)
	{
		let cf = columnInfo[i];
		if (cf.type == 'number')
		{	
			if ( cf.filterSpec == null)
			{
				cf.filterSpec = {max: Number.NEGATIVE_INFINITY, min:Number.POSITIVE_INFINITY}; // create filterSpec if null
				cf.dataRange  = {max: Number.NEGATIVE_INFINITY, min:Number.POSITIVE_INFINITY}; // create dataRange
			}
			if ( getValueByCol(row, i) > cf.filterSpec.max ) 
			{
				cf.filterSpec.max = getValueByCol(row, i); // updated max
				cf.dataRange.max = getValueByCol(row, i);
			}
			if ( getValueByCol(row, i) < cf.filterSpec.min ) 
			{
				cf.filterSpec.min = getValueByCol(row, i); // update min
				cf.dataRange.min = getValueByCol(row, i);
			}
		}
		else if (cf.type == 'category')
		{
			if (cf.filterSpec == null) cf.filterSpec = new Set(); // create filterSpec if null
			{
				cf.filterSpec.add( getValueByCol(row, i) );
				cf.dataRange.add( getValueByCol(row, i) );
			}
		}
		else {} // other types (string, boolean) do not require filterSpec 
	}
}
function getValueByCol( row, colIndex )
{
	if (colIndex == 0 ) return row.name();
	else if (colIndex == 1 ) return row.count();
	else if (colIndex == 2 ) return row.percent();
	else if (colIndex == 3 ) return row.depth();
	else if (colIndex == 4 ) return row.gt2stdv();
	else if (colIndex == 5 ) return row.gtMax();
	else if (colIndex == 6 ) return row.ltMin();
	else
		console.log("Unanticipated colIndex = " + colIndex );
}

function resetFilterSpec() // reset filterSpec
{
	for (i = 0; i < columnInfo.length; i++)
	{
		let cf = columnInfo[i];
		if (cf.type == 'category')
			cf.filterSpec = new Set();
		else if (cf.type == 'boolean')
			cf.filterSpec = makeDefaultBooleanFilterSpec();
		else if (cf.type == 'string')
			cf.filterSpec = null;
		else if (cf.type == 'number')
		{
			cf.filterSpec.min = cf.dataRange.min;
			cf.filterSpec.max = cf.dataRange.max;
		}
	}
}

function fillTable()
{
	let arr = new Array();
	makeNodeArray( root, arr ); // a Row is created for each node and is added to arr. arr contains all Rows
	resetFilterSpec();
	tableData = arr;
	
	$('#myTable').DataTable().clear().draw();
    $('#myTable').DataTable().rows.add( tableData ); 			// Add new data
    $('#myTable').DataTable().columns.adjust().draw(); 	// Redraw the DataTable
	
	resetFilterUI();									// build filter UI
}

function clearFilters()
{
	resetFilterSpec();
	executeFilters();	
	resetFilterUI();	// rebuild filter UI to original state
}

/*
 * Building Table Filter UI
*/
function creatTitle( name )
{
	let $title = $("<div>", {"class": "filter_title"});
	$title.text(name+":");
	return $title;
	
}
function createTextInput( index, name )
{
	let $input = $("<input>").attr({ type: 'text', id: name+'_textInput', class:'textInput' });	
	$input.on('input', (event)=>
	{ 
		//console.log( $(event.target).val() );
		let val = $(event.target).val();
		if (val == '')
			columnInfo[index].filterSpec = null;
		else 
		{ 
			if (columnInfo[index].filterSpec == null )
				columnInfo[index].filterSpec = {};
			columnInfo[index].filterSpec.value = ($(event.target).val()).toLowerCase(); // always compare using lower case for consistency
		}
		executeFilters();
	});	
	return $input;
}
function createColumnFilterUI4String( index, name )
{
	let $div = $("<div>", {id: "filter_ui_"+name, "class": "filter_ui_div"});
	$div.append( creatTitle(name) );
	$div.append( createTextInput( index, name ) );
	return $div;
}

function createNumberInput( index, name )
{	
	let $inputDiv = $("<div>");
	let $minInputLabel = $("<label>").attr({class:'numberInputLabel'}).text("min:");
	let $inputMin = $("<input>").attr({ type: 'text', id: name+'_numberMinInput', class:'numberInput_min' });
	$inputMin.on('input', (event)=>
	{ 
		let val = $(event.target).val();
		columnInfo[index].filterSpec.min = (val=='')?null:val;
		executeFilters();
	});	
	let $minInputDiv = $("<div>");
	$minInputDiv.append($minInputLabel).append($inputMin);
	
	let $maxInputLabel = $("<label>").attr({class:'numberInputLabel'}).text("max:");
	let $inputMax = $("<input>").attr({ type: 'text', id: name+'_numberMaxInput', class:'numberInput_max' });
	$inputMax.on('input', (event)=>
	{ 
		let val = $(event.target).val();
		columnInfo[index].filterSpec.max = (val=='')?null:val;
		executeFilters();
	});	
	let $maxInputDiv = $("<div>");
	$maxInputDiv.append($maxInputLabel).append($inputMax);
	
	$inputDiv.append($minInputDiv);
	$inputDiv.append($maxInputDiv);
	return $inputDiv;
}

function createColumnFilterUI4Number(index, name)
{
	let $div = $("<div>", {id: "filter_ui_"+name, "class": "filter_ui_div"});
	$div.append( creatTitle(name) );
	$div.append( createNumberInput( index, name ) );
	return $div;
}

function createBooleanInput( index, name )
{	
	let $inputDiv = $("<div>");
	
	// TRUE checkbox
	let $inputTrue = $("<input>").attr({ type: 'checkbox', id: name+'_booleanTrueInput', class:'checkbox'}).prop('checked', true); // check the box by default
	$inputTrue.on('input', (event)=>
	{ 
		if (event.target.checked) // keep rows with 'true' value
		{ 
			columnInfo[index].filterSpec.add(true);
		}
		else // remove  rows with 'true' value
		{ 
			columnInfo[index].filterSpec.delete(true);
		}
		executeFilters();
	});	
	// TRUE checkbox label
	let $trueDiv = $("<div>");
	$trueDiv.append( $inputTrue );
	let $inputTrueLabel = $("<label>").attr({for:name+'_booleanTrueInput', class: "checkbox_label"}).text("true");
	$trueDiv.append( $inputTrueLabel );
	
	// FALSE checkbox
	let $falseDiv = $("<div>");
	let $inputFalse = $("<input>").attr({ type: 'checkbox', id: name+'_booleanFalseInput', class:'checkbox'}).prop('checked', true); // check the box by default
	$inputFalse.on('input', (event)=>
	{ 
		if (event.target.checked) // keep rows with 'false' value
		{ 
			columnInfo[index].filterSpec.add(false);
		}
		else // keep rows with 'false' value
		{ 
			columnInfo[index].filterSpec.delete(false);
		}
		executeFilters();
	});	
	// FALSE checkbox label
	$falseDiv.append( $inputFalse );
	$falseDiv.append( $('<label>').attr({for:name+'_booleanFalseInput', class: "checkbox_label"}).text("false"));
	
	$inputDiv.append($trueDiv);
	$inputDiv.append($falseDiv);
	return $inputDiv;
}

function createColumnFilterUI4Boolean( index, name )
{
	let $div = $("<div>", {id: "filter_ui_"+name, "class": "filter_ui_div"});
	$div.append( creatTitle(name) );
	$div.append( createBooleanInput( index, name ) );
	return $div;
}

function resetFilterUI()
{
	$('#table_control_filters').empty();
	let i =0;
	for (i = 0; i < columnInfo.length; i++)
	{
		let name = myTable.column(i).header().innerText;
		if ( columnInfo[i].type == 'string')
		{
			let $div = createColumnFilterUI4String(i, name);			
			$('#table_control_filters').append( $div );
		}
		else if ( columnInfo[i].type == 'number')
		{
			let $div = createColumnFilterUI4Number(i, name);
			$('#table_control_filters').append( $div );
		}
		else if ( columnInfo[i].type == 'boolean')
		{
			let $div = createColumnFilterUI4Boolean(i, name);
			$('#table_control_filters').append( $div );
		}
		else
		{
			console.log("Invalid datatype for filter = '" + columnInfo[i].type + "' no UI is built.");
		}
	}
}

/*
 * perform actual Filtering on table
 */
// default filterSpec for boolean data
function makeDefaultBooleanFilterSpec(){ return new Set().add(true).add(false); }

function filterBoolean( row, filterSpec, index ) // filter by Boolean columns
{
	if ( filterSpec.has(getValueByCol(row, index)) )  return true;
	return false;
}
function filterCategory( row, filterSpec, index ) // filter by Category columns
{
	if ( filterSpec.has(getValueByCol(row, index)) )  return true;
	return false;
}
function filterNumber( row, filterSpec, index )		// filter by Number columns
{
	let val = getValueByCol(row, index);
	if ( ( filterSpec.min == null || filterSpec.min <= val) && (filterSpec.max == null || val <= filterSpec.max) )  return true;
	return false;
}
function filterString( row, filterSpec, index )		// filter by Text columns
{
	let val = getValueByCol(row, index);
	if ( filterSpec == null || val.toLowerCase().includes( filterSpec.value ))  return true; // always compare lower case for consistency
	return false;
}

// main function to perform filtering. Should make it stoppable.
function executeFilters()
{
	let filteredData = new Array(); // keep rows that pass the filters
	let i = 0;
	for (i = 0; i < tableData.length; i++)
	{
		let row = tableData[i];
		let j = 0;		
		let accepted = true;
		for (j=0; j<columnInfo.length; j++)
		{
			if(columnInfo[j].filterSpec)
			{
				accepted = columnInfo[j].filterFunction( row, columnInfo[j].filterSpec, j );
				if (!accepted) break;
			}
		}
		if (accepted)
			filteredData.push(row);
	}	
	$('#myTable').DataTable().clear().draw();	
    $('#myTable').DataTable().rows.add( filteredData ); // Add filtered data
    $('#myTable').DataTable().columns.adjust().draw(); 	// Redraw the DataTable
}

function start()
{
	// execution starts here
	update( root );	
	document.getElementById("viz_panel").appendChild( svg.node() ); // attach main visualization to DOM
	//document.body.appendChild( svg.node() );
	updateLegend();
	isSVGSet = true;
	document.getElementById("legend_box").style.display = "block";
	document.getElementById("legend_activator").style.display = "block";
	
	// set up table
	fillTable();
}			
