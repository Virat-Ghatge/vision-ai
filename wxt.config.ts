import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OrbitAgent - Ultra-Low-Token Multi-LLM Chrome Agent',
    description: 'Autonomous Chrome browser agent with 4-layer token distillation, multi-LLM routing, and CDP hardware execution.',
    version: '0.1.0',
    permissions: [
      'sidePanel',
      'storage',
      'activeTab',
      'tabs',
      'scripting',
      'debugger',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Open OrbitAgent Sidepanel',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
