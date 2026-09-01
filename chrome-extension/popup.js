/**
 * TeleHire Popup Launcher
 */

document.addEventListener('DOMContentLoaded', async () => {
  const btnOpenSidepanel = document.getElementById('btn-open-sidepanel');
  const btnTriggerFill = document.getElementById('btn-trigger-fill');
  const planTag = document.getElementById('popup-plan-tag');

  chrome.storage.local.get(['userEmail', 'userLicense', 'plan'], (data) => {
    if (data.plan) {
      planTag.innerText = data.plan;
    }
  });

  // Open Side Panel
  btnOpenSidepanel.addEventListener('click', async () => {
    const window = await chrome.windows.getCurrent();
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: window.id });
    }
    window.close();
  });

  // Fill on Current Tab
  btnTriggerFill.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' }, () => {
        window.close();
      });
    }
  });
});
