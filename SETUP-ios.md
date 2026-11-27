# T3 Code fork on iPhone and iPad with SideStore (once)

My Apple ID is a free one, so every signature lasts 7 days. Xcode used to sign the app on the
MacBook Air, which needed a fresh Xcode login every few days and let the app die when it lapsed.
Now nothing on the Macs signs:

1. The Air builds the app unsigned (`build-ios.sh`) whenever t3-worker pushes a new `main`
   (`install-laptop.md`), and uploads it to t3-worker (`publish-ios.sh`).
2. t3-worker serves it as a SideStore source through Tailscale Funnel (nix-fleet,
   `nix/modules/t3code-ios-source.nix`). It is public on an unguessable path: SideStore installs
   through its own VPN, and iOS then turns Tailscale off.
3. SideStore on each device installs the app with my Apple ID and renews the 7-day signature on
   the device. A computer is needed only to install SideStore.

Free Apple IDs allow 3 sideloaded apps per device, SideStore included, and 10 new app IDs a week.
Use the same Apple ID everywhere, and once SideStore manages it, sign nothing else with it in
Xcode: a new development certificate can revoke SideStore's, and its apps stop opening.

## A. MacBook Air (an agent can do this)

Ask me before deploying t3-worker.

1. Install the fork-tools scripts as in `install-laptop.md` section 1.2.
2. Upload key, without a passphrase (it may only replace the published files):
   `ssh-keygen -t ed25519 -N "" -C "t3code-ios-publish MacBook-Air-von-Jan" -f ~/.ssh/t3code-ios-publish`
3. In `~/code/jappyjan/nix-fleet`: pull, add the contents of `~/.ssh/t3code-ios-publish.pub` to
   `services.t3codeIosSource.uploadKeys` in `nix/hosts/t3-worker.nix`, commit, push, and deploy
   with `./scripts/deploy-server.sh t3-worker` (or let the 03:00 `fleet-update` pick it up).
   Apply this Mac too (`./scripts/apply.sh`), which installs iloader.
4. Write `~/code/t3dotgg/t3code-ios-builds/publish.conf`, with `<path>` and `<tailnet>` from
   `services.t3codeIosSource` in `nix/hosts/t3-worker.nix`:

   ```sh
   T3_IOS_SOURCE_URL=https://t3-worker.<tailnet>:8443/<path>
   T3_IOS_UPLOAD_HOST=jappy@t3-worker
   T3_IOS_UPLOAD_KEY=~/.ssh/t3code-ios-publish
   ```

5. In `~/code/t3dotgg/t3code` on a clean `main`: run `build-ios.sh`, then `publish-ios.sh` with the
   `.ipa` it printed. The last line says `Published build ...`.
6. Retire the Xcode setup: delete `devices.txt`, the `device-*` folders and `old-profiles` from
   `~/code/t3dotgg/t3code-ios-builds`, and `install-ios.sh` from the tools folder.
7. Tell me the source URL (`$T3_IOS_SOURCE_URL/source.json`) for part B.

## B. Each device (me)

What worked on the iPhone (Nov 2026; SideStore's docs lag behind its releases):

1. From the App Store, install **LocalDevVPN**, open it and connect. Be on Wi-Fi: SideStore
   installs and refreshes only over Wi-Fi. While it is connected, Tailscale is off.
2. Plug the device into the Air, unlock it, trust the Mac and open iloader. Sign in with the
   Apple ID and choose **Install SideStore (Nightly)**. The stable build (0.7.0-alpha) has no
   Pairing File Management and could not connect. iloader also places both pairing files. Each
   reinstall wipes SideStore's settings, so stay on one build.
3. On the device: Settings > General > VPN & Device Management > trust the developer app; turn
   on Developer Mode (Settings > Privacy & Security) if asked.
4. Before signing in, get the device connection working; sign-in needs it right after 2FA to
   read the device's UDID:
   - SideStore > Settings > Connection Config: **Use Local VPN** on.
   - Settings > Advanced > Pairing File Management: activate the **Remote Pairing** (RemoteRP)
     file and set it as preferred. The lockdown file needs an IPSec tunnel LocalDevVPN does not
     provide.
   - Force-quit and reopen SideStore. Settings > Health Check must be green: Active Protocol
     Remote Pairing, pairing file Verified, SideStore Ready. All lines "Unknown" means no
     pairing file is loaded.
5. Sign in. Since 2026-11-20 Apple answers 503 when the client calls itself `macOS;`
   (SideStore issue #1745), so first:
   - Settings > Anisette Servers: **JKcoxson Mac Server**, auto rotation off.
   - Settings > User Customizations: On-Device Anisette off, then **Reset adi.pb**.
   - Anisette Client Configuration > Remote Server Sync: **Fetch**, then **Save as Overrides**.
     Client Info must say `Mac OS X;`, e.g.
     `<MacBookPro13,3> <Mac OS X;26.6;25F84> <com.apple.AuthKit/1 (com.apple.akd/1.0)>`.
   - Force-quit, reopen, sign in. Never tap Reset to Defaults there, and decline revoking
     certificates after a failed sign-in.
6. Add the source: open `sidestore://source?url=<source URL>` in Safari, or Sources > + and
   paste the URL. Install **T3 Code Preview** from it.
7. If the old Xcode-installed app is still there next to the new one, pair the new one with my
   servers, then delete the old one.

## Living with it

- **Renewing**: SideStore renews only while LocalDevVPN is connected and the device is on
  Wi-Fi. iOS runs one VPN at a time, so while LocalDevVPN is on, Tailscale is off and T3 Code
  cannot reach my servers. Two Shortcuts automations (Time of Day, Run Immediately): 04:00
  Set VPN LocalDevVPN Connect, Wait 10 s, SideStore's Refresh All Apps; 04:15 Set VPN
  Tailscale Connect (separate, so a failed refresh still restores Tailscale). Otherwise, once a
  week: connect LocalDevVPN, open SideStore, tap the days counter on T3 Code, reconnect
  Tailscale. My Apps shows how many days the app has left.
- **New builds**: a new `main` shows up in SideStore as an update (My Apps). Updating also needs
  LocalDevVPN and Wi-Fi, and keeps the app's data.
- **Apple breaks sign-ins now and then** (Sept to Nov 2026 it did, repeatedly). Keep SideStore
  and iloader current. After an iOS update with VPN errors, reinstall SideStore with iloader.
