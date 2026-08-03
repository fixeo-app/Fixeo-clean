/**
 * fixeo-cities.js — Single source of truth for public canonical city list.
 * Version: fxc-v2
 *
 * Consumers:
 *   - services-premium.js     → reads window.FIXEO_CITIES to build svc-city-dropdown
 *   - quick-search-modal.js   → reads window.FIXEO_CITIES as fallback when SSB_DATA unavailable
 *   - fc3InitCity (inline)    → reads FIXEO_CITIES_MAP for VALID_CITIES validation
 *   - fxsit-city-extended.js  → reads FIXEO_CITIES_MAP to build the custom picker
 *
 * CANONICAL PUBLIC DISPLAY RULES (enforced by this file):
 *   - Values containing "?" are excluded.
 *   - "Unknown", "Ville à qualifier", blank values are excluded.
 *   - Combined city strings ("Fès/Meknès", "Agadir / Nador?") are excluded from display.
 *   - Duplicate variants are collapsed to the canonical label.
 *   - Internal qualification states are excluded.
 *   - Canonical labels use proper spelling and accents.
 *
 * DATA SAFETY:
 *   - The `aliases` field maps known dirty artisan city strings to a canonical city.
 *   - Aliases are used only at the PRESENTATION/FILTERING layer (matchCity in main.js
 *     already handles substring matching, so most aliases resolve automatically).
 *   - No Supabase row is modified by this file.
 *
 * To add or remove cities: edit this file ONLY.
 * Keep `value` exactly title-cased to match artisan data city fields.
 */
(function (window) {
  'use strict';

  /**
   * FIXEO_CITIES_MAP — full canonical city model.
   * Each entry:
   *   value    {string}   exact label used for artisan filtering (matches artisan.city via substring)
   *   label    {string}   public display label (proper spelling + accents)
   *   priority {boolean}  show in the compact priority chip row
   *   aliases  {string[]} known dirty / variant strings that map to this city (filtering only)
   */
  window.FIXEO_CITIES_MAP = [
    {
      value:    'Casablanca',
      label:    'Casablanca',
      priority: true,
      aliases:  ['casablanca', 'casa']
    },
    {
      value:    'Rabat',
      label:    'Rabat',
      priority: true,
      aliases:  ['rabat']
    },
    {
      value:    'Marrakech',
      label:    'Marrakech',
      priority: true,
      aliases:  ['marrakech', 'marrakesh']
    },
    {
      value:    'Fès',
      label:    'Fès',
      priority: true,
      aliases:  ['fes', 'fès', 'fez']
      /* NOTE: "Fès/Meknès" intentionally excluded from public display.
         matchCity in main.js uses substring .includes() so "Fès" still matches artisans
         whose city field contains "Fès/Meknès". No artisans lost. */
    },
    {
      value:    'Tanger',
      label:    'Tanger',
      priority: true,
      aliases:  ['tanger', 'tangier', 'tanja']
    },
    {
      value:    'Agadir',
      label:    'Agadir',
      priority: false,
      aliases:  ['agadir']
      /* NOTE: "Agadir / Nador?" excluded — ambiguous, contains "?". */
    },
    {
      value:    'Meknès',
      label:    'Meknès',
      priority: false,
      aliases:  ['meknes', 'meknès']
    },
    {
      value:    'Oujda',
      label:    'Oujda',
      priority: false,
      aliases:  ['oujda']
    },
    {
      value:    'Kénitra',
      label:    'Kénitra',
      priority: false,
      aliases:  ['kenitra', 'kénitra']
    },
    {
      value:    'Tétouan',
      label:    'Tétouan',
      priority: false,
      aliases:  ['tetouan', 'tétouan']
    },
    {
      value:    'Safi',
      label:    'Safi',
      priority: false,
      aliases:  ['safi']
    },
    {
      value:    'El Jadida',
      label:    'El Jadida',
      priority: false,
      aliases:  ['el jadida', 'eljadida']
      /* NOTE: "Salé El Jadida?" excluded — combined/ambiguous string. */
    }
  ];

  /**
   * FIXEO_CITIES — flat array of city value strings.
   * Backward-compatible with all existing consumers.
   * Derived from FIXEO_CITIES_MAP.
   */
  window.FIXEO_CITIES = window.FIXEO_CITIES_MAP.map(function (c) { return c.value; });

  /**
   * FIXEO_PRIORITY_CITIES — flat array of priority city values for compact chip row.
   * Marrakech swapped to position 5 to match current chip order preference.
   */
  window.FIXEO_PRIORITY_CITIES = window.FIXEO_CITIES_MAP
    .filter(function (c) { return c.priority; })
    .map(function (c) { return c.value; });

}(window));
