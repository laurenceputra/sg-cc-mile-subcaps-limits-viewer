import { SYNC_CONFIG } from './config.js';

export function createSyncTab(syncManager, settings, THEME) {
  const container = document.createElement('div');
  container.id = 'cc-subcap-sync';
  container.style.cssText = 'display: none; padding: 24px;';

  const isEnabled = syncManager.isEnabled();
  const config = syncManager.config;

  if (!isEnabled) {
    container.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: ${THEME.text}">Sync Settings</h3>
      <p style="color: ${THEME.muted}; margin-bottom: 16px;">
        Enable sync to access your settings across devices.
      </p>
      <div style="background: ${THEME.accentSoft}; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
        <strong style="color: ${THEME.accentText}">Privacy First:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px; color: ${THEME.accentText};">
          <li>All data encrypted before leaving your browser</li>
          <li>Only settings and merchant mappings are synced</li>
          <li>Raw transactions stay local</li>
        </ul>
      </div>
      <button id="setup-sync-btn" style="
        padding: 12px 24px;
        background: ${THEME.accent};
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
      ">Setup Sync</button>
    `;

    const setupBtn = container.querySelector('#setup-sync-btn');
    setupBtn.addEventListener('click', () => {
      showSyncSetupDialog(syncManager, THEME);
    });
  } else {
    const lastSync = config.lastSync ? new Date(config.lastSync).toLocaleString() : 'Never';
    const shareMappingsText = config.shareMappings ? 'Yes (helping community)' : 'No (private)';

    container.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: ${THEME.text}">Sync Settings</h3>
      <div style="background: ${THEME.panel}; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <p style="margin: 0 0 8px 0;"><strong>Status:</strong> ☁️ Enabled</p>
        <p style="margin: 0 0 8px 0;"><strong>Device:</strong> ${config.deviceName}</p>
        <p style="margin: 0 0 8px 0;"><strong>Last Sync:</strong> ${lastSync}</p>
        <p style="margin: 0 0 8px 0;"><strong>Tier:</strong> ${config.tier}</p>
        <p style="margin: 0;"><strong>Share Mappings:</strong> ${shareMappingsText}</p>
      </div>
      <button id="sync-now-btn" style="
        padding: 12px 24px;
        background: ${THEME.accent};
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        margin-right: 8px;
      ">Sync Now</button>
      <button id="disable-sync-btn" style="
        padding: 12px 24px;
        background: ${THEME.warning};
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
      ">Disable Sync</button>
      <div id="sync-status" style="margin-top: 16px; padding: 12px; border-radius: 8px; display: none;"></div>
    `;

    container.querySelector('#sync-now-btn').addEventListener('click', async () => {
      const statusDiv = container.querySelector('#sync-status');
      statusDiv.style.display = 'block';
      statusDiv.style.background = THEME.accentSoft;
      statusDiv.style.color = THEME.accentText;
      statusDiv.textContent = 'Syncing...';

      const result = await syncManager.sync({ cards: settings.cards });

      if (result.success) {
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';
        statusDiv.textContent = '✓ Synced successfully!';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
      } else {
        statusDiv.style.background = THEME.warningSoft;
        statusDiv.style.color = THEME.warning;
        statusDiv.textContent = `❌ Sync failed: ${result.error}`;
      }
    });

    container.querySelector('#disable-sync-btn').addEventListener('click', () => {
      if (confirm('Are you sure you want to disable sync? Your local data will remain intact.')) {
        syncManager.disableSync();
        location.reload();
      }
    });
  }

  return container;
}

function showSyncSetupDialog(syncManager, THEME) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${THEME.overlay}; z-index: 100001;
    display: flex; align-items: center; justify-content: center;
  `;

  overlay.innerHTML = `
    <div style="
      background: white; padding: 32px; border-radius: 16px;
      max-width: 500px; width: 90%; box-shadow: ${THEME.shadow};
    ">
      <h3 style="margin: 0 0 16px 0;">Setup Sync</h3>
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Server URL</label>
      <input id="sync-server-url" type="url" placeholder="https://your-server.com" value="${SYNC_CONFIG.serverUrl}" style="
        width: 100%; padding: 12px; border: 1px solid ${THEME.border};
        border-radius: 8px; margin-bottom: 16px; box-sizing: border-box;
      "/>
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Email</label>
      <input id="sync-email" type="email" placeholder="your@email.com" style="
        width: 100%; padding: 12px; border: 1px solid ${THEME.border};
        border-radius: 8px; margin-bottom: 16px; box-sizing: border-box;
      "/>
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Passphrase</label>
      <input id="sync-passphrase" type="password" placeholder="Enter secure passphrase" style="
        width: 100%; padding: 12px; border: 1px solid ${THEME.border};
        border-radius: 8px; margin-bottom: 16px; box-sizing: border-box;
      "/>
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Device Name</label>
      <input id="sync-device" type="text" placeholder="My Laptop" style="
        width: 100%; padding: 12px; border: 1px solid ${THEME.border};
        border-radius: 8px; margin-bottom: 24px; box-sizing: border-box;
      "/>
      <div style="display: flex; gap: 8px;">
        <button id="sync-setup-save" style="
          flex: 1; padding: 12px; background: ${THEME.accent}; color: white;
          border: none; border-radius: 8px; font-weight: 500; cursor: pointer;
        ">Setup</button>
        <button id="sync-setup-cancel" style="
          flex: 1; padding: 12px; background: ${THEME.panel}; color: ${THEME.text};
          border: none; border-radius: 8px; font-weight: 500; cursor: pointer;
        ">Cancel</button>
      </div>
      <div id="sync-setup-status" style="margin-top: 16px; display: none;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#sync-setup-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('#sync-setup-save').addEventListener('click', async () => {
    const serverUrl = overlay.querySelector('#sync-server-url').value.trim();
    const email = overlay.querySelector('#sync-email').value;
    const passphrase = overlay.querySelector('#sync-passphrase').value;
    const deviceName = overlay.querySelector('#sync-device').value;
    const statusDiv = overlay.querySelector('#sync-setup-status');

    if (!serverUrl || !email || !passphrase || !deviceName) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = THEME.warningSoft;
      statusDiv.style.color = THEME.warning;
      statusDiv.style.padding = '12px';
      statusDiv.style.borderRadius = '8px';
      statusDiv.textContent = 'All fields are required';
      return;
    }

    // Validate server URL
    try {
      const url = new URL(serverUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Server URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = THEME.warningSoft;
      statusDiv.style.color = THEME.warning;
      statusDiv.style.padding = '12px';
      statusDiv.style.borderRadius = '8px';
      statusDiv.textContent = `Invalid server URL: ${error.message}`;
      return;
    }

    statusDiv.style.display = 'block';
    statusDiv.style.background = THEME.accentSoft;
    statusDiv.style.color = THEME.accentText;
    statusDiv.style.padding = '12px';
    statusDiv.style.borderRadius = '8px';
    statusDiv.textContent = 'Setting up sync...';

    const result = await syncManager.setupSync(email, passphrase, deviceName, serverUrl);

    if (result.success) {
      statusDiv.style.background = '#d1fae5';
      statusDiv.style.color = '#065f46';
      statusDiv.textContent = '✓ Sync setup complete! Reloading...';
      setTimeout(() => location.reload(), 1500);
    } else {
      statusDiv.style.background = THEME.warningSoft;
      statusDiv.style.color = THEME.warning;
      statusDiv.textContent = `❌ Setup failed: ${result.error}`;
    }
  });
}
