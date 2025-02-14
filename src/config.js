/*******************************************************************************
 * Copyright (c) 2023-2025 Massachusetts General Hospital 
 * All rights reserved. The ENACT Data Quality Explorer (this program) 
 * and the accompanying materials are made available under the terms 
 * of the accompanying Mozilla Public License, v. 2.0 
 * and the Healthcare Disclaimer: https://www.i2b2.org/software/i2b2_license.html
********************************************************************************/


let dqe_home = "https://myhost/dqe/";
let streeConfig = {
	"networkStatsPath": dqe_home + "data/network_stats/version10232/", 		 	   		    // parent path for network stats (one zip per domain)
	"dictionaryPath":   dqe_home + "data/dictionary/dictionary.zip", 	                    // where zipped dictionary file lives
	"sample_totalnum": dqe_home + "data/sample_totalnums/synthea_data.tsv",      	   		// sample totalnums file (synthea). Required if tutorialAvailable is set to 'true' 
	"documentationPath":dqe_home + "doc/documentation.html",						 	   	// OPTIONAL: path to documentation. 'readDocButton' is hidden if this value is not set.
	"demoVideoLink": 				  "https://youtu.be/O1qiLYkIhEs",						// OPTIONAL: URL to demo video. 'viewVideoButton' is hidden if this value is not set.
	"tutorialAvailable":			  true,													// OPTIONAL: Whether built-in tutorial is available. 'tutorialButton' is hidden if this value is not set.	

	"logoImageRelativePath": "img/ENACT_LogoFile_2023-02(002).webp",						// relative path to logo image
	"logoImageCaption": "Enact Logo",														// caption -- "alt" -- value for logo image
	"networkStatsFilenames": new Array("Ontology_01_Stats.zip",						        // array of network stats file names, one per domain
									   "Ontology_02_Stats.zip",
									   "Ontology_03_Stats.zip",
									   "Ontology_04_Stats.zip",
									   "Ontology_05_Stats.zip",
									   "Ontology_06_Stats.zip",
									   "Ontology_07_Stats.zip",
									   "Ontology_08_Stats.zip",
									   "Ontology_09_Stats.zip",
									   "Ontology_10_Stats.zip",
									   "Ontology_11_Stats.zip"),
	"ontologyDropdownList": new Array("None",												// array of domain ontology names in drop down. First must be "None".
									  "Ontology 01",
									  "Ontology 02",
									  "Ontology 03",
									  "Ontology 04",
									  "Ontology 05",
									  "Ontology 06",
									  "Ontology 07",
									  "Ontology 08",
									  "Ontology 09",
									  "Ontology 10",
									  "Ontology 11")
};

// update this after new versions of software or data upddate
let streeVersions = {
	"software":  {	"date": "2023-12-29",
					"id":	"beta"
				 },
	"data": 	 {  "date":"2023-09-01",
					"stats":{ "siteCount":10
							}
				 }
};


let debugConfig = {
	"console": false,		// print debug msg to console
	"fullname_id":false		// display fullname_id in detailboxes
};

let allPatientConcept = "\\denominator\\facts\\";	// concept to denote the total number of patients at a site