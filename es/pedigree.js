
import * as utils from './utils.js';
import * as pbuttons from './pbuttons.js';
import * as pedcache from './pedcache.js';
import * as io from './io.js';
import { addWidgets } from './widgets.js';
import { init_zoom } from './zoom.js';
import { addLabels } from './labels.js';
import { init_dragging } from './dragging.js';

function build(options) {
	let opts = $.extend({
		targetDiv: 'pedigree_edit',
		dataset: [{ "name": "m21", "display_name": "father", "sex": "M", "top_level": true },
		{ "name": "f21", "display_name": "mother", "sex": "F", "top_level": true },
		{ "name": "ch1", "display_name": "me", "sex": "F", "mother": "f21", "father": "m21", "proband": true }],
		width: 500,
		height: 800,
		symbol_size: 35,
		zoomSrc: ['wheel', 'button'],
		zoomIn: 1.0,
		zoomOut: 1.0,
		dragNode: true,
		showWidgets: true,
		diseases: [
			{ 'type': 'breast_cancer', 'pattern': 'dots' },
			{ 'type': 'ovarian_cancer', 'pattern': 'stripes' },
			{ 'type': 'pancreatic_cancer', 'pattern': 'dots' },
			{ 'type': 'prostate_cancer', 'pattern': 'crosshatch' }
		],
		labels: ['stillbirth', ['age', 'yob'], 'alleles',
			['brca1_gene_test', 'brca2_gene_test', 'palb2_gene_test', 'chek2_gene_test', 'atm_gene_test'],
			['rad51d_gene_test', 'rad51c_gene_test', 'brip1_gene_test', 'hoxb13_gene_test'],
			['er_bc_pathology', 'pr_bc_pathology', 'her2_bc_pathology', 'ck14_bc_pathology', 'ck56_bc_pathology']],
		keep_proband_on_reset: false,
		font_size: '.75em',
		font_family: 'Helvetica',
		font_weight: 700,
		background: "#FAFAFA",
		node_background: '#fdfdfd',
		validate: true,
		DEBUG: false
	}, options);

	// Adding SVG patterns for dots or other textures
	let svgDefs = `
	<defs>
		<pattern id="dots" patternUnits="userSpaceOnUse" width="10" height="10">
			<circle cx="2" cy="2" r="2" fill="black" />
		</pattern>
		<pattern id="stripes" patternUnits="userSpaceOnUse" width="4" height="4">
			<rect width="2" height="4" fill="black"></rect>
		</pattern>
		<pattern id="crosshatch" patternUnits="userSpaceOnUse" width="10" height="10">
			<path d="M0,0 L10,10 M10,0 L0,10" stroke="black" stroke-width="1" />
		</pattern>
	</defs>`;

	// Append SVG patterns to your target div
	$(`#${opts.targetDiv}`).append(`<svg width="0" height="0">${svgDefs}</svg>`);

	// Example rendering nodes
	for (let i = 0; i < opts.dataset.length; i++) {
		let person = opts.dataset[i];

		// Create each person's box (for simplicity, using a div here; you may need SVG or canvas)
		let $personBox = $('<div></div>')
			.addClass('person-box')
			.css({
				width: opts.symbol_size + 'px',
				height: opts.symbol_size + 'px',
				backgroundColor: opts.node_background, // default background
				border: '1px solid #000'
			});

		// Add pattern to the box based on the disease type
		for (let disease of opts.diseases) {
			if (person[disease.type]) { // If person has this disease
				// Apply the pattern as the background
				$personBox.css('background', `url(#${disease.pattern})`);
			}
		}

		// Append the box to the target div
		$(`#${opts.targetDiv}`).append($personBox);
	}

	// Initialize buttons and IO handling if not already initialized
	if ($("#fullscreen").length === 0) {
		pbuttons.addButtons(opts, rebuild, build);
		io.addIO(opts);
	}
}


function has_gender(sex) {
	return sex === "M" || sex === "F";
}

//adopted in/out brackets
function get_bracket(dx, dy, indent, opts) {
	return "M" + (dx + indent) + "," + dy +
		"L" + dx + " " + dy +
		"L" + dx + " " + (dy + (opts.symbol_size * 1.28)) +
		"L" + dx + " " + (dy + (opts.symbol_size * 1.28)) +
		"L" + (dx + indent) + "," + (dy + (opts.symbol_size * 1.28))
}

// check for crossing of partner lines
function check_ptr_links(opts, ptrLinkNodes) {
	for (let a = 0; a < ptrLinkNodes.length; a++) {
		let clash = check_ptr_link_clashes(opts, ptrLinkNodes[a]);
		if (clash)
			console.log("CLASH :: " + ptrLinkNodes[a].mother.data.name + " " + ptrLinkNodes[a].father.data.name, clash);
	}
}

export function check_ptr_link_clashes(opts, anode) {
	let root = utils.roots[opts.targetDiv];
	let flattenNodes = utils.flatten(root);
	let mother, father;
	if ('name' in anode) {
		anode = utils.getNodeByName(flattenNodes, anode.name);
		if (!('mother' in anode.data))
			return null;
		mother = utils.getNodeByName(flattenNodes, anode.data.mother);
		father = utils.getNodeByName(flattenNodes, anode.data.father);
	} else {
		mother = anode.mother;
		father = anode.father;
	}

	let x1 = (mother.x < father.x ? mother.x : father.x);
	let x2 = (mother.x < father.x ? father.x : mother.x);
	let dy = mother.y;

	// identify clashes with other nodes at the same depth
	let clash = $.map(flattenNodes, function (bnode, _i) {
		return !bnode.data.hidden &&
			bnode.data.name !== mother.data.name && bnode.data.name !== father.data.name &&
			bnode.y === dy && bnode.x > x1 && bnode.x < x2 ? bnode.x : null;
	});
	return clash.length > 0 ? clash : null;
}

// group top_level nodes by their partners
function group_top_level(dataset) {
	// let top_level = $.map(dataset, function(val, i){return 'top_level' in val && val.top_level ? val : null;});
	// calculate top_level nodes
	for (let i = 0; i < dataset.length; i++) {
		if (utils.getDepth(dataset, dataset[i].name) === 2)
			dataset[i].top_level = true;
	}

	let top_level = [];
	let top_level_seen = [];
	for (let i = 0; i < dataset.length; i++) {
		let node = dataset[i];
		if ('top_level' in node && $.inArray(node.name, top_level_seen) === -1) {
			top_level_seen.push(node.name);
			top_level.push(node);
			let ptrs = utils.get_partners(dataset, node);
			for (let j = 0; j < ptrs.length; j++) {
				if ($.inArray(ptrs[j], top_level_seen) === -1) {
					top_level_seen.push(ptrs[j]);
					top_level.push(utils.getNodeByName(dataset, ptrs[j]));
				}
			}
		}
	}

	let newdataset = $.map(dataset, function (val, _i) { return 'top_level' in val && val.top_level ? null : val; });
	for (let i = top_level.length; i > 0; --i)
		newdataset.unshift(top_level[i - 1]);
	return newdataset;
}

export function rebuild(opts) {
	$("#" + opts.targetDiv).empty();
	pedcache.init_cache(opts);
	try {
		build(opts);
	} catch (e) {
		console.error(e);
		throw e;
	}

	try {
		templates.update(opts);		// eslint-disable-line no-undef
	} catch (e) {
		// templates not declared
	}
}

$(document).on('rebuild', function (_e, opts) {
	rebuild(opts);
})

$(document).on('build', function (_e, opts) {
	build(opts);
})
