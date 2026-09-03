#!/usr/bin/env node
/**
 * Print the LAN IPv4 address a phone on the same Wi-Fi should use to reach
 * this machine's dev server.
 *
 * Exists because `ipconfig` on a development laptop routinely lists five or six
 * IPv4 addresses — Hyper-V, WSL, Docker, VirtualBox and a VPN all install
 * adapters — and picking the wrong one produces a dev server that is reachable
 * from the PC and from nothing else. Every candidate is printed, not just the
 * chosen one, so a wrong guess here is visible rather than silent.
 *
 * Nothing is written to disk and no address is ever committed: this reads the
 * live interface list at the moment it runs, which is also why it stays correct
 * after the router hands out a different lease.
 */

const os = require('os');

const DEV_SERVER_PORT = process.env.RCT_METRO_PORT || 8081;

/** Adapters that exist on the machine but are not the local network. */
const VIRTUAL = /vethernet|hyper-v|virtualbox|vmware|docker|wsl|loopback|tailscale|zerotier|radmin|tap-|tun|vpn|nordlynx|wireguard|utun|bluetooth/i;

/** Physical wireless first — on a laptop talking to a phone, this is the one. */
const WIRELESS = /wi-?fi|wlan|wireless/i;

function candidates() {
  const found = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const entry of addresses ?? []) {
      // Node <18.4 reported `family` as the string 'IPv4'; newer versions use
      // the number 4. Both shapes are accepted so this does not depend on the
      // developer's Node version.
      const isIPv4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isIPv4 || entry.internal) continue;

      // 169.254.x.x means DHCP never answered — the adapter is up but has no
      // network, which looks identical to a working one in `ipconfig`.
      if (entry.address.startsWith('169.254.')) continue;

      found.push({
        name,
        address: entry.address,
        virtual: VIRTUAL.test(name),
        wireless: WIRELESS.test(name),
      });
    }
  }

  return found.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
    if (a.wireless !== b.wireless) return a.wireless ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const found = candidates();

if (found.length === 0) {
  console.error('No external IPv4 address found. Is this machine on a network?');
  process.exit(1);
}

const best = found[0];

console.log('');
console.log(`  Dev server URL for a phone on this Wi-Fi:  http://${best.address}:${DEV_SERVER_PORT}`);
console.log(`  Adapter: ${best.name}`);
console.log('');
console.log('  All candidates:');
for (const entry of found) {
  const flags = [
    entry === best ? 'chosen' : null,
    entry.virtual ? 'virtual — probably not your Wi-Fi' : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`    ${entry.address.padEnd(16)} ${entry.name}${flags ? `  (${flags})` : ''}`);
}
console.log('');

if (best.virtual) {
  console.log('  Warning: every adapter looks virtual (VPN / Hyper-V / WSL / Docker).');
  console.log('  Disconnect the VPN, or pick the address matching your router\'s subnet.');
  console.log('');
}
