import { defineBackground } from 'wxt/sandbox';

export default defineBackground(() => {
  console.log('[OrbitAgent] Service worker initialized.');

  chrome.runtime.onInstalled.addListener(() => {
    console.log('[OrbitAgent] Extension installed.');
  });
});
