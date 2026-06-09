// js/state.js — общее состояние приложения
// Все модули импортируют отсюда — один источник правды

export let renderer   = null;
export let scene      = null;
export let camera     = null;
export let clock      = null;
export let xrSession  = null;
export let hitTestSource = null;
export let reticle    = null;
export let placedObject  = null;

export let isPlaced   = false;
export let autoRotate = false;
export let scaleVal   = 1;
export let touchStartX = 0;
export let lastYaw    = 0;

export let modelList        = [];
export let currentModelIdx  = 0;
export const modelCache     = {};

// Setters — модули вызывают их вместо прямого присвоения
export function setRenderer(v)      { renderer = v; }
export function setScene(v)         { scene = v; }
export function setCamera(v)        { camera = v; }
export function setClock(v)         { clock = v; }
export function setXrSession(v)     { xrSession = v; }
export function setHitTestSource(v) { hitTestSource = v; }
export function setReticle(v)       { reticle = v; }
export function setPlacedObject(v)  { placedObject = v; }
export function setIsPlaced(v)      { isPlaced = v; }
export function setAutoRotate(v)    { autoRotate = v; }
export function setScaleVal(v)      { scaleVal = v; }
export function setTouchStartX(v)   { touchStartX = v; }
export function setLastYaw(v)       { lastYaw = v; }
export function setModelList(v)     { modelList = v; }
export function setCurrentModelIdx(v) { currentModelIdx = v; }
