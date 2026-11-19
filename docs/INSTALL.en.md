# Figma CLI Bridge

*A local CLI bridge for Figma Design*

Use Codex to work with editable frames, components and design tokens in a dedicated Figma Design file. Figma CLI Bridge runs on your computer. Install the Codex skill from GitHub or the release ZIP, then import the generated plugin manifest into Figma Desktop.

[Download Figma CLI Bridge 0.7.4](https://github.com/shaojie-li/figma-cli-bridge/releases/download/v0.7.4/figma-cli-bridge-0.7.4.zip) · [Release notes](https://github.com/shaojie-li/figma-cli-bridge/releases/tag/v0.7.4)

## Requirements

These instructions use macOS. You need Figma Desktop with permission to edit a Design file and run a development plugin, Codex with local skills, Python 3, Node.js 22 or later, and npm. The first installation needs internet access to download the locked npm dependencies.

## Install from GitHub with Codex

In Codex, enter this prompt:

> Use $skill-installer to install the skill at https://github.com/shaojie-li/figma-cli-bridge/tree/main/skills/figma-cli-bridge

Then start a new chat and ask: **Use $figma-cli-bridge to prepare my local Figma connection.** The installer copies the entire skill directory, including the version-matched bridge source archive and its SHA-256 checksum. Setup verifies and extracts the archive on first use, installs the npm dependencies, and reports the plugin manifest path. Continue from step 3 below to import the plugin in Figma Desktop.

## Install from the release ZIP

1. Download **figma-cli-bridge-0.7.4.zip** using the link above. This is the installable asset under **Releases**.
2. Extract it into your Codex skills directory. For a first installation, run the following commands in Terminal, adjusting the download path if necessary.

   ```sh
   skills_dir="${CODEX_HOME:-$HOME/.codex}/skills"
   mkdir -p "$skills_dir"
   unzip "$HOME/Downloads/figma-cli-bridge-0.7.4.zip" -d "$skills_dir"
   python3 "$skills_dir/figma-cli-bridge/scripts/bootstrap.py" prepare
   ```

3. Look for the `manifest` path in the output. On first use, `plugin_not_connected` is expected at this point. It means the local service is waiting for you to open the plugin.
4. In Figma Desktop, create an editable Design file named exactly **CLI Bridge · Sandbox**. Open it and select **Plugins → Development → Import plugin from manifest…**. Select the `dist/manifest.json` printed in step 3, then run **Figma CLI Bridge** from the Development menu.
5. Start a **new Codex chat** and enter the following prompt.

   > Use $figma-cli-bridge to check my local connection and bind my CLI Bridge · Sandbox file.

6. When the plugin shows **已就绪** (Ready), select a layer in the sandbox and ask Codex to report the selected layer's name. The result should match your selection. Leave the plugin running while you work. Use **暂停** (Pause) or close the plugin to disconnect.

## Existing installations and pairing

If you already have the skill, back up any local edits before replacing its folder. Keep your existing bridge and its `.local` directory to preserve the file binding and job history. If setup reports `bridge_upgrade_required`, ask Codex to inspect the existing bridge and upgrade it to the matching version.

The release ZIP contains the skill and bridge source. Setup builds a plugin on your machine with your local pairing code. Keep the generated `dist/` and `.local/` directories private. If the plugin requests updated pairing, run `prepare` again and check its reported state. For manual pairing with a running service, run `node src/cli.mjs pair` from the reported `bridge` directory, then paste the code into the plugin's **设置** (Settings) → **本机配对码** (Local pairing code) field.

For help, [open an issue](https://github.com/shaojie-li/figma-cli-bridge/issues) with the reported state and your software versions. Omit pairing codes and private design content.
