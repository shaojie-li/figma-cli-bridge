# Figma CLI Bridge

*A local CLI bridge for Figma Design*

Use Codex to work with editable frames, components and design tokens in a dedicated Figma Design file. Figma CLI Bridge runs on your computer. Install the Codex skill from GitHub or the release ZIP, then import the generated plugin manifest into Figma Desktop.

[Download the latest release](https://github.com/shaojie-li/figma-cli-bridge/releases/latest)

## Requirements

These instructions use macOS. You need Figma Desktop with permission to edit a Design file and run a development plugin, Codex with local skills, Python 3, Node.js 22 or later, and npm. The first installation needs internet access to download the locked npm dependencies.

## Install from GitHub with Codex

In Codex with access to GitHub and your local terminal, send this prompt:

> Install https://github.com/shaojie-li/figma-cli-bridge for me.

If Codex is already helping you install the bridge, you can send the repository URL by itself.

1. Use `$skill-installer` to install [`skills/figma-cli-bridge`](https://github.com/shaojie-li/figma-cli-bridge/tree/main/skills/figma-cli-bridge) from `main`. If the skill is already installed, run the next step to check the existing setup.
2. Run the installed bootstrap script locally. It verifies and extracts the bundled source, installs locked dependencies, starts the local service, and builds the Figma plugin.

   ```sh
   python3 "${CODEX_HOME:-$HOME/.codex}/skills/figma-cli-bridge/scripts/bootstrap.py" prepare
   ```

3. If the bootstrap reports `plugin_not_connected` or `manifest_import_required`, give the user the actual `manifest` path and the Figma Desktop import steps below. Once the plugin is running, continue with binding the Sandbox. Start a new chat to invoke the installed skill by name.

## Install from the release ZIP

1. Open the [latest release](https://github.com/shaojie-li/figma-cli-bridge/releases/latest) and download its `figma-cli-bridge-<version>.zip` asset. The attached `INSTALL.en.md` has the instructions for that version.
2. Extract it into your Codex skills directory. For a first installation, run the following commands in Terminal, adjusting the download path if necessary.

   ```sh
   skills_dir="${CODEX_HOME:-$HOME/.codex}/skills"
   mkdir -p "$skills_dir"
   unzip /path/to/downloaded-release.zip -d "$skills_dir"
   python3 "$skills_dir/figma-cli-bridge/scripts/bootstrap.py" prepare
   ```

3. Look for the `manifest` path in the output. On first use, `plugin_not_connected` is expected at this point. It means the local service is waiting for you to open the plugin.
4. In Figma Desktop, create an editable Design file named exactly **CLI Bridge · Sandbox**. Open it and select **Plugins → Development → Import plugin from manifest…**. Select the `dist/manifest.json` printed in step 3, then run **Figma CLI Bridge** from the Development menu.
5. Start a **new Codex chat** and enter the following prompt.

   > Use $figma-cli-bridge to check my local connection and bind my CLI Bridge · Sandbox file.

6. When the plugin shows **已就绪** (Ready), select a layer in the sandbox and ask Codex to report the selected layer's name. The result should match your selection. Leave the plugin running while you work. Use **暂停** (Pause) or close the plugin to disconnect.

## Design template

Start in an empty Sandbox and describe a page. The skill initializes four color collections, shared layout tokens and text styles. Choose Normal or Warm in Light or Dark. Select a generated frame and use the local plugin to switch palettes. Your prompt defines the content and interactions. Existing design systems can keep their own assets.

## Existing installations and pairing

If you already have the skill, back up any local edits before replacing its folder. Keep your existing bridge and its `.local` directory to preserve the file binding and job history. If setup reports `bridge_upgrade_required`, ask Codex to inspect the existing bridge and upgrade it to the matching version.

The release ZIP contains the skill and bridge source. Setup builds a plugin on your machine with your local pairing code. Keep the generated `dist/` and `.local/` directories private. If the plugin requests updated pairing, run `prepare` again and check its reported state. For manual pairing with a running service, run `node src/cli.mjs pair` from the reported `bridge` directory, then paste the code into the plugin's **设置** (Settings) → **本机配对码** (Local pairing code) field.

For help, [open an issue](https://github.com/shaojie-li/figma-cli-bridge/issues) with the reported state and your software versions. Omit pairing codes and private design content.

## Build from source

The desktop plugin lives in `plugin/`, the local service and CLI in `src/`, and the Codex skill in `skills/figma-cli-bridge/`. Run these commands from the repository root to test the source and build the installable ZIP.

```sh
npm ci
npm test
python3 scripts/install-global-skill.py --package
npm run test:zip
```

The packager writes `release/figma-cli-bridge-<version>.zip` and refreshes the bundled source and checksum under `skills/figma-cli-bridge/assets/`.

See [Contributing](CONTRIBUTING.md) to enable Git hooks and check commit messages.

## Publish a release

Every push to `main` runs tests and verifies installation of the ZIP. GitHub Actions compares `package.json` at the start and end of the push. An unchanged version runs CI only.

To release, explicitly increase the version in `package.json` and update the lockfile, plugin version, English installation guide and bundled Skill assets in the same PR. Git hooks validate the changes. Once the PR reaches `main` and verification passes, Actions creates the matching tag and publishes the verified ZIP and guide. A rerun reuses the same tag.
