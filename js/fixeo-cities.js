/**
 * fixeo-cities.js — Single source of truth for Moroccan city list.
 * Loaded before quick-search-modal.js and services-premium.js.
 *
 * Consumers:
 *   - services-premium.js  → reads window.FIXEO_CITIES to build svc-city-dropdown
 *   - quick-search-modal.js → reads window.FIXEO_CITIES as fallback when SSB_DATA unavailable
 *
 * To add or remove cities: edit this file ONLY.
 * Keep values exactly title-cased to match artisan data city fields.
 */
(function (window) {
  'use strict';

  window.FIXEO_CITIES = [
    'Casablanca',
    'Rabat',
    'Marrakech',
    'Fès',
    'Agadir',
    'Tanger',
    'Meknès',
    'Oujda',
    'Kénitra',
    'Tétouan',
    'Safi',
    'El Jadida'
  ];

}(window));
