/**
 * Studies Filter Composable
 * 
 * Manages filtering and sorting of studies and groups based on search query.
 * Provides reactive filtered data for the StudiesPanel.
 */

import { formatPassageReference } from '$lib/utils/passageFormatting.js';

/**
 * Create a studies filter manager
 * 
 * @param {Function} getStudies - Function that returns all studies
 * @param {Function} getGroups - Function that returns all groups
 * @param {Function} getUngroupedStudies - Function that returns ungrouped studies
 * @param {Function} getSearchQuery - Function that returns current search query
 * @param {Function} [getUngroupedSeries] - Function that returns top-level series
 * @returns {Object} Filter state and computed values
 */
export function useStudiesFilter(getStudies, getGroups, getUngroupedStudies, getSearchQuery, getUngroupedSeries = () => []) {
	/**
	 * Check if a study matches the search query
	 */
	function studyMatchesQuery(study, query) {
		if (study.title.toLowerCase().includes(query)) return true;
		if (study.passages && study.passages.length > 0) {
			return study.passages.some(passage => 
				formatPassageReference(passage).toLowerCase().includes(query)
			);
		}
		return false;
	}

	/**
	 * Recursively filter a group and its subgroups
	 * Returns null if the group and all its children have no matches
	 */
	function filterGroupRecursive(group, query) {
		// Check if group name matches
		const groupNameMatches = group.name.toLowerCase().includes(query);
		
		// Filter studies
		const filteredStudies = group.studies.filter(study => studyMatchesQuery(study, query));
		
		// Recursively filter subgroups
		let filteredSubgroups = [];
		if (group.subgroups && group.subgroups.length > 0) {
			filteredSubgroups = group.subgroups
				.map(subgroup => filterGroupRecursive(subgroup, query))
				.filter(subgroup => subgroup !== null);
		}
		
		// If group name matches, include ALL studies and subgroups (no filtering)
		if (groupNameMatches) {
			return {
				...group,
				studies: [...group.studies].sort((a, b) => a.title.localeCompare(b.title)),
				subgroups: group.subgroups || [],
				matchedByName: true
			};
		}
		
		// If nothing matched in this group or its children, return null
		if (filteredStudies.length === 0 && filteredSubgroups.length === 0) {
			return null;
		}
		
		// Return group with filtered content
		filteredStudies.sort((a, b) => a.title.localeCompare(b.title));
		return {
			...group,
			studies: filteredStudies,
			subgroups: filteredSubgroups,
			matchedByName: false
		};
	}

	/**
	 * Check if a series matches the search query.
	 *
	 * A series matches on its own name OR on any part, so searching "Romans 8" finds the
	 * series through the part that covers it. When the series name itself matches, all parts
	 * are kept — mirroring the group rule above, where matching a folder shows its contents
	 * rather than an arbitrarily pruned subset.
	 *
	 * A series is never returned with zero parts: an empty series row can be neither read
	 * nor expanded, so it is dropped instead (same rule the server load applies).
	 */
	function filterSeries(series, query) {
		const nameMatches = series.name.toLowerCase().includes(query);

		if (nameMatches) {
			return { ...series, matchedByName: true };
		}

		const parts = (series.parts || []).filter((part) => studyMatchesQuery(part, query));
		if (parts.length === 0) return null;

		// Parts keep their stored seriesOrder — filtering must not reorder a sequence.
		return { ...series, parts, matchedByName: false };
	}

	/**
	 * Get filtered top-level series
	 */
	function getFilteredUngroupedSeries() {
		const seriesList = getUngroupedSeries();
		if (!seriesList || seriesList.length === 0) return [];

		const searchQuery = getSearchQuery();

		if (searchQuery.trim() === '') {
			return [...seriesList].sort((a, b) => a.name.localeCompare(b.name));
		}

		const query = searchQuery.toLowerCase();
		return seriesList
			.map((series) => filterSeries(series, query))
			.filter((series) => series !== null)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Get sorted studies
	 */
	function getSortedStudies() {
		const studies = getStudies();
		if (!studies || studies.length === 0) return [];
		
		const searchQuery = getSearchQuery();
		let filtered = studies;
		
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			filtered = studies.filter(study => studyMatchesQuery(study, query));
		}
		
		const sorted = [...filtered];
		sorted.sort((a, b) => a.title.localeCompare(b.title));
		return sorted;
	}

	/**
	 * Get filtered groups with filtered and alphabetized studies
	 */
	function getFilteredGroups() {
		const groups = getGroups();
		if (!groups || groups.length === 0) return [];
		
		const searchQuery = getSearchQuery();
		
		if (searchQuery.trim() === '') {
			return groups.map(group => ({
				...group,
				studies: [...group.studies].sort((a, b) => a.title.localeCompare(b.title))
			}));
		}

		const query = searchQuery.toLowerCase();
		
		// Filter groups recursively
		const filteredGroups = groups
			.map(group => filterGroupRecursive(group, query))
			.filter(group => group !== null);
		
		return filteredGroups;
	}

	/**
	 * Get filtered and alphabetized ungrouped studies
	 */
	function getFilteredUngroupedStudies() {
		const ungroupedStudies = getUngroupedStudies();
		if (!ungroupedStudies || ungroupedStudies.length === 0) return [];
		
		const searchQuery = getSearchQuery();
		let filtered = ungroupedStudies;
		
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			filtered = ungroupedStudies.filter(study => studyMatchesQuery(study, query));
		}
		
		return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
	}

	/**
	 * Get combined and sorted groups and ungrouped studies
	 */
	function getSortedGroupsAndStudies() {
		const filteredGroups = getFilteredGroups();
		const filteredUngroupedStudies = getFilteredUngroupedStudies();
		const filteredUngroupedSeries = getFilteredUngroupedSeries();
		const items = [];
		
		filteredGroups.forEach(group => {
			items.push({
				type: 'group',
				name: group.name,
				data: group
			});
		});

		// Series sort by name alongside groups and studies, so the Finder stays a single
		// alphabetical list rather than growing a third visually-segregated band.
		filteredUngroupedSeries.forEach(series => {
			items.push({
				type: 'series',
				name: series.name,
				data: series
			});
		});
		
		filteredUngroupedStudies.forEach(study => {
			items.push({
				type: 'study',
				name: study.title,
				data: study
			});
		});
		
		items.sort((a, b) => a.name.localeCompare(b.name));
		return items;
	}

	return {
		getSortedStudies,
		getFilteredGroups,
		getFilteredUngroupedStudies,
		getFilteredUngroupedSeries,
		getSortedGroupsAndStudies
	};
}
